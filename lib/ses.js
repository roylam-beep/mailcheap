import "server-only";
import {
	CreateEmailIdentityCommand,
	GetAccountCommand,
	GetEmailIdentityCommand,
	ListEmailIdentitiesCommand,
	PutEmailIdentityMailFromAttributesCommand,
	SESv2Client,
	SendEmailCommand,
} from "@aws-sdk/client-sesv2";
import { isSendingEnabled } from "@/lib/config";
import { buildDnsRecords, mailFromHost, normalizeRegion } from "@/lib/dns-records";

export function getSesRegion() {
	return normalizeRegion(process.env.SES_REGION || process.env.AWS_REGION || "us-east-1");
}

const REGION = getSesRegion();
// The overview and the editor read the account and domains from here; the domains page asks fresh.
const CACHE_TTL_MS = 5 * 60_000;
// Reads only: a send that timed out could still have gone out, and the SDK would retry it.
const READ_TIMEOUT_MS = 5000;
const cache = new Map();
let client;

// Vercel reserves the AWS_* credential names; locally the default chain (~/.aws) is used.
function getCredentials() {
	const { SES_ACCESS_KEY_ID: accessKeyId, SES_SECRET_ACCESS_KEY: secretAccessKey } = process.env;
	return accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;
}

function getClient() {
	client ??= new SESv2Client({ region: REGION, credentials: getCredentials() });
	return client;
}

function read(command) {
	return getClient().send(command, { abortSignal: AbortSignal.timeout(READ_TIMEOUT_MS) });
}

// Callers that arrive while a load is running share it. Errors aren't kept.
async function cached(key, { fresh }, load) {
	const hit = cache.get(key);
	if (!fresh && hit && hit.expiresAt > Date.now()) return hit.promise;
	const entry = { promise: load(), expiresAt: Date.now() + CACHE_TTL_MS };
	cache.set(key, entry);
	const value = await entry.promise;
	if (value?.error && cache.get(key) === entry) cache.delete(key);
	return value;
}

export function getSesAccount({ fresh = false } = {}) {
	return cached("account", { fresh }, loadSesAccount);
}

export function listSesDomains({ fresh = false } = {}) {
	return cached("domains", { fresh }, loadSesDomains);
}

async function loadSesAccount() {
	try {
		const account = await read(new GetAccountCommand({}));
		return {
			productionAccess: Boolean(account.ProductionAccessEnabled),
			reviewStatus: account.Details?.ReviewDetails?.Status || null,
			sendingEnabled: Boolean(account.SendingEnabled),
			enforcementStatus: account.EnforcementStatus,
			max24HourSend: account.SendQuota?.Max24HourSend ?? 0,
			maxSendRate: account.SendQuota?.MaxSendRate ?? 0,
			sentLast24Hours: account.SendQuota?.SentLast24Hours ?? 0,
		};
	} catch (error) {
		return { error: error.message };
	}
}

function identityFields(_domain, identity) {
	return {
		verifiedForSending: Boolean(identity.VerifiedForSendingStatus),
		dkimStatus: identity.DkimAttributes?.Status || "NOT_STARTED",
		dkimTokens: identity.DkimAttributes?.Tokens || [],
		mailFromDomain: identity.MailFromAttributes?.MailFromDomain || "",
		mailFromStatus: identity.MailFromAttributes?.MailFromDomainStatus || "",
		sesError: "",
	};
}

function dnsRecords(domain, identity) {
	const fields = identityFields(domain, identity);
	const records = buildDnsRecords({
		hostname: domain,
		tokens: fields.dkimTokens,
		region: REGION,
		mailFromDomain: identity.MailFromAttributes?.MailFromDomain || null,
	});
	return [...records.dkim, ...records.spf, ...records.dmarc];
}

function credentialFailure(error) {
	const name = error?.name || "";
	return (
		name === "CredentialsProviderError" ||
		name === "InvalidClientTokenId" ||
		name === "UnrecognizedClientException" ||
		name === "SignatureDoesNotMatch" ||
		/could not load credentials|security token|credential/i.test(error?.message || "")
	);
}

async function listDomainNames() {
	const names = [];
	let nextToken;
	do {
		const page = await read(new ListEmailIdentitiesCommand({ PageSize: 100, NextToken: nextToken }));
		for (const identity of page.EmailIdentities || []) {
			if (identity.IdentityType === "DOMAIN" && identity.IdentityName) names.push(identity.IdentityName);
		}
		nextToken = page.NextToken;
	} while (nextToken && names.length < 500);
	return names;
}

async function loadSesDomains() {
	try {
		const names = await listDomainNames();
		return await Promise.all(
			names.map(async (domain) => {
				const identity = await read(new GetEmailIdentityCommand({ EmailIdentity: domain }));
				const fields = identityFields(domain, identity);
				return {
					domain,
					verified: fields.verifiedForSending,
					dkimStatus: fields.dkimStatus,
					dkimTokens: fields.dkimTokens,
					mailFromDomain: fields.mailFromDomain || null,
					mailFromStatus: fields.mailFromStatus,
					records: dnsRecords(domain, identity),
				};
			})
		);
	} catch (error) {
		return { error: error.message };
	}
}

// Easy DKIM (no Bring-Your-Own key) plus the custom MAIL FROM domain bounce.<hostname>.
export async function provisionSesDomain(hostname) {
	const mailFromDomain = mailFromHost(hostname);
	try {
		try {
			await read(new CreateEmailIdentityCommand({ EmailIdentity: hostname }));
		} catch (error) {
			if (error?.name !== "AlreadyExistsException") throw error;
		}
		let warning = null;
		try {
			await read(
				new PutEmailIdentityMailFromAttributesCommand({
					EmailIdentity: hostname,
					MailFromDomain: mailFromDomain,
					BehaviorOnMxFailure: "USE_DEFAULT_VALUE",
				})
			);
		} catch (error) {
			if (credentialFailure(error)) throw error;
			warning = error?.message || "Could not set the custom MAIL FROM domain";
		}
		const identity = await read(new GetEmailIdentityCommand({ EmailIdentity: hostname }));
		cache.delete("domains");
		return { ok: true, warning, fields: identityFields(hostname, identity) };
	} catch (error) {
		return {
			ok: false,
			unconfigured: credentialFailure(error),
			error: error?.message || "Could not create the SES identity",
		};
	}
}

export async function readSesIdentity(hostname) {
	try {
		const identity = await read(new GetEmailIdentityCommand({ EmailIdentity: hostname }));
		cache.delete("domains");
		return { ok: true, fields: identityFields(hostname, identity) };
	} catch (error) {
		return {
			ok: false,
			notFound: error?.name === "NotFoundException",
			unconfigured: credentialFailure(error),
			error: error?.message || "Could not read the SES identity",
		};
	}
}

export async function sendSesEmail({ from, to, replyTo, subject, html, text, headers = {}, tags = [] }) {
	if (!isSendingEnabled()) throw new Error("Sending is off (SENDING_ENABLED is not true)");

	const result = await getClient().send(
		new SendEmailCommand({
			FromEmailAddress: from,
			Destination: { ToAddresses: [to] },
			ReplyToAddresses: replyTo ? [replyTo] : undefined,
			ConfigurationSetName: process.env.SES_CONFIGURATION_SET || undefined,
			EmailTags: tags.map(({ name, value }) => ({ Name: name, Value: value })),
			Content: {
				Simple: {
					Subject: { Data: subject, Charset: "UTF-8" },
					Body: {
						Html: { Data: html, Charset: "UTF-8" },
						Text: { Data: text, Charset: "UTF-8" },
					},
					Headers: Object.entries(headers).map(([Name, Value]) => ({ Name, Value })),
				},
			},
		})
	);
	return { sesMessageId: result.MessageId };
}
