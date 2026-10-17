import "server-only";
import { checkDnsRecords } from "@/lib/dns-lookup";
import {
	buildDnsRecords,
	dmarcRegistrableHost,
	dmarcRua,
	emailHost,
	normalizeHostname,
	verifiedHostnames,
} from "@/lib/dns-records";
import { connectDb } from "@/lib/db";
import { getSesRegion, listSesDomains, provisionSesDomain, readSesIdentity } from "@/lib/ses";
import Domain from "@/models/Domain";
import Newsletter from "@/models/Newsletter";

const SES_UNCONFIGURED =
	"Saved. SES isn't connected, so DKIM tokens appear after it is. The SPF and DMARC records can be added now.";

export async function getVerifiedHostnames() {
	const sesDomains = await listSesDomains();
	if (Array.isArray(sesDomains)) return verifiedHostnames({ sesDomains });
	await connectDb();
	const stored = await Domain.find().select("hostname verifiedForSending").lean();
	return verifiedHostnames({ sesDomains, stored });
}

export async function loadDomains() {
	await connectDb();
	const sesDomains = await listSesDomains({ fresh: true });
	if (Array.isArray(sesDomains)) {
		for (const domain of sesDomains) {
			const hostname = normalizeHostname(domain.domain);
			if (!hostname) continue;
			await Domain.updateOne(
				{ hostname },
				{
					$set: {
						verifiedForSending: Boolean(domain.verified),
						dkimStatus: domain.dkimStatus || "NOT_STARTED",
						dkimTokens: Array.isArray(domain.dkimTokens) ? domain.dkimTokens : [],
						mailFromDomain: domain.mailFromDomain || "",
						mailFromStatus: domain.mailFromStatus || "",
						sesError: "",
					},
					$setOnInsert: { hostname },
				},
				{ upsert: true }
			);
		}
	}

	const [domains, newsletters] = await Promise.all([
		Domain.find().sort({ hostname: 1 }).lean(),
		Newsletter.find().select("name fromEmail").sort({ name: 1 }).lean(),
	]);
	const region = getSesRegion();

	return {
		region,
		sesError: Array.isArray(sesDomains) ? null : sesDomains?.error || "Could not reach SES",
		domains: domains.map((domain) => presentDomain(domain, newsletters, region)),
	};
}

export async function addSendingDomain({ hostname, note }) {
	const host = normalizeHostname(typeof hostname === "string" ? hostname : "");
	if (!host) return { error: "Enter a domain like mail.example.com" };
	const cleanNote = typeof note === "string" ? note.trim().slice(0, 200) : "";

	await connectDb();
	const provision = await provisionSesDomain(host);
	const fields = provision.ok
		? provision.fields
		: {
				verifiedForSending: false,
				dkimStatus: "NOT_STARTED",
				dkimTokens: [],
				mailFromDomain: "",
				mailFromStatus: "",
				sesError: provision.unconfigured ? "" : provision.error || "Could not create the SES identity",
			};

	try {
		await Domain.create({ hostname: host, note: cleanNote, ...fields });
	} catch (error) {
		if (error?.code === 11000) return { error: "This domain is already added" };
		throw error;
	}

	if (provision.ok) return { ok: true, warning: provision.warning || null };
	return { ok: true, warning: provision.unconfigured ? SES_UNCONFIGURED : fields.sesError };
}

export async function refreshSendingDomain(hostname) {
	const host = normalizeHostname(typeof hostname === "string" ? hostname : "");
	if (!host) return { error: "Domain not found" };

	await connectDb();
	const domain = await Domain.findOne({ hostname: host });
	if (!domain) return { error: "Domain not found" };

	const identity = await readSesIdentity(host);
	if (identity.ok) domain.set(identity.fields);
	else if (identity.notFound) {
		domain.verifiedForSending = false;
		domain.sesError = "This domain is not an SES identity yet";
	} else if (!identity.unconfigured) {
		domain.sesError = identity.error || "Could not read the SES identity";
	}

	const newsletters = await Newsletter.find().select("fromEmail").lean();
	const records = buildDnsRecords({
		hostname: host,
		tokens: domain.dkimTokens,
		region: getSesRegion(),
		mailFromDomain: domain.mailFromDomain,
		ruaEmail: dmarcRua(
			host,
			newsletters.map((newsletter) => newsletter.fromEmail)
		),
	});
	const checked = await checkDnsRecords([...records.dkim, ...records.spf, ...records.dmarc]);
	domain.checks = checked.map(({ type, name, status }) => ({ type, name, status }));
	domain.lastCheckedAt = new Date();
	await domain.save();
	return { ok: true };
}

export async function removeSendingDomain(hostname) {
	const host = normalizeHostname(typeof hostname === "string" ? hostname : "");
	if (!host) return { error: "Domain not found" };
	await connectDb();
	const { deletedCount } = await Domain.deleteOne({ hostname: host });
	if (!deletedCount) return { error: "Domain not found" };
	return { ok: true };
}

function presentDomain(domain, newsletters, region) {
	const senders = newsletters.filter((newsletter) => emailHost(newsletter.fromEmail) === domain.hostname);
	const records = buildDnsRecords({
		hostname: domain.hostname,
		tokens: domain.dkimTokens,
		region,
		mailFromDomain: domain.mailFromDomain,
		ruaEmail: dmarcRua(
			domain.hostname,
			senders.map((newsletter) => newsletter.fromEmail)
		),
	});
	const checks = new Map((domain.checks || []).map((check) => [`${check.type} ${check.name}`, check.status]));
	const withStatus = (record) => ({
		...record,
		status: checks.get(`${record.type} ${record.name}`) || "unchecked",
	});
	return {
		hostname: domain.hostname,
		note: domain.note || "",
		verified: Boolean(domain.verifiedForSending),
		dkimStatus: domain.dkimStatus || "NOT_STARTED",
		mailFromDomain: domain.mailFromDomain || "",
		mailFromStatus: domain.mailFromStatus || "",
		sesError: domain.sesError || "",
		lastCheckedAt: domain.lastCheckedAt ? domain.lastCheckedAt.toISOString() : null,
		registrableDmarc: dmarcRegistrableHost(domain.hostname),
		dkimPending: !domain.dkimTokens?.length,
		records: {
			dkim: records.dkim.map(withStatus),
			spf: records.spf.map(withStatus),
			dmarc: records.dmarc.map(withStatus),
		},
		newsletters: senders.map((newsletter) => ({
			id: newsletter._id.toString(),
			name: newsletter.name,
			fromEmail: newsletter.fromEmail,
		})),
	};
}
