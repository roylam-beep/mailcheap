import { rootDomain } from "./favicon.js";

const HOSTNAME =
	/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DKIM_TOKEN = /^[a-z0-9]{1,80}$/i;
const REGION = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;
const SPF_VALUE = "v=spf1 include:amazonses.com ~all";

export function normalizeHostname(value) {
	if (typeof value !== "string") return null;
	let host = value.trim().toLowerCase();
	if (!host || /\s/.test(host)) return null;
	if (host.includes("@")) return null;
	host = host.replace(/^https?:\/\//, "");
	host = host.split("/")[0]?.split("?")[0]?.split("#")[0] ?? "";
	if (host.includes("@")) return null;
	host = host.replace(/:\d+$/, "").replace(/\.$/, "");
	if (!host || host.includes("*") || host.includes("_")) return null;
	return HOSTNAME.test(host) ? host : null;
}

export function normalizeRegion(value) {
	const region = String(value || "us-east-1")
		.trim()
		.toLowerCase();
	return REGION.test(region) ? region : "us-east-1";
}

export function mailFromHost(hostname) {
	return `bounce.${hostname}`;
}

// Apex domains publish DMARC on themselves. A subdomain the user added publishes it on that hostname.
export function dmarcHost(hostname) {
	return `_dmarc.${hostname}`;
}

export function dmarcRegistrableHost(hostname) {
	const parent = rootDomain(hostname);
	return parent && parent !== hostname ? `_dmarc.${parent}` : null;
}

// p=none does not reject mail when the report mailbox is missing. Prefer a from-address this
// domain already sends with; otherwise use the dmarc@ local-part on the domain itself.
export function dmarcRua(hostname, fromEmails = []) {
	for (const email of fromEmails) {
		if (typeof email !== "string") continue;
		const [local, host] = email.trim().toLowerCase().split("@");
		if (local && host === hostname) return email.trim().toLowerCase();
	}
	return `dmarc@${hostname}`;
}

export function dmarcValue(hostname, ruaEmail) {
	const rua = typeof ruaEmail === "string" && ruaEmail.includes("@") ? ruaEmail : dmarcRua(hostname);
	return `v=DMARC1; p=none; rua=mailto:${rua}`;
}

export function buildDnsRecords({ hostname, tokens = [], region, mailFromDomain, ruaEmail } = {}) {
	const host = normalizeHostname(hostname);
	if (!host) return { dkim: [], spf: [], dmarc: [] };
	const sesRegion = normalizeRegion(region);
	const mailFrom = normalizeHostname(mailFromDomain) || mailFromHost(host);
	const dkim = [];
	for (const token of tokens) {
		if (typeof token !== "string" || !DKIM_TOKEN.test(token)) continue;
		dkim.push({
			group: "dkim",
			type: "CNAME",
			name: `${token}._domainkey.${host}`,
			value: `${token}.dkim.amazonses.com`,
		});
	}
	return {
		dkim,
		spf: [
			{
				group: "spf",
				type: "MX",
				name: mailFrom,
				value: `10 feedback-smtp.${sesRegion}.amazonses.com`,
			},
			{ group: "spf", type: "TXT", name: mailFrom, value: SPF_VALUE },
		],
		dmarc: [{ group: "dmarc", type: "TXT", name: dmarcHost(host), value: dmarcValue(host, ruaEmail) }],
	};
}

export function normalizeRecordValue(type, value) {
	const text = String(value ?? "")
		.trim()
		.replace(/\s+/g, " ")
		.replace(/\.$/, "");
	if (type === "MX") {
		const match = /^(\d+)\s+(\S+)$/.exec(text);
		if (!match) return text.toLowerCase();
		return `${Number(match[1])} ${match[2].replace(/\.$/, "").toLowerCase()}`;
	}
	return text.toLowerCase();
}

// answers.values is what public DNS returned. answers.error means the lookup itself failed.
export function matchDnsRecord(record, answers) {
	if (!answers || answers.error) return "error";
	const expected = normalizeRecordValue(record.type, record.value);
	const values = (answers.values || []).map((value) => normalizeRecordValue(record.type, value));
	return values.includes(expected) ? "found" : "missing";
}

export function emailHost(email) {
	if (typeof email !== "string") return null;
	const host = email.trim().toLowerCase().split("@")[1];
	return normalizeHostname(host || "");
}

// Live SES wins when the call worked. A failed call falls back to the last status we stored.
export function verifiedHostnames({ sesDomains, stored = [] } = {}) {
	if (Array.isArray(sesDomains)) {
		return sesDomains
			.map((domain) => (domain?.verified ? normalizeHostname(domain.domain) : null))
			.filter(Boolean);
	}
	return stored
		.map((domain) => (domain?.verifiedForSending ? normalizeHostname(domain.hostname) : null))
		.filter(Boolean);
}
