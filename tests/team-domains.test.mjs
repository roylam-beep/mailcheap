import assert from "node:assert/strict";
import { test } from "node:test";
import { lookupDnsRecord } from "../lib/dns-lookup.js";
import {
	buildDnsRecords,
	dmarcHost,
	dmarcRegistrableHost,
	dmarcRua,
	emailHost,
	matchDnsRecord,
	normalizeHostname,
	verifiedHostnames,
} from "../lib/dns-records.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
	canEditNewsletterSender,
	canManageApiKeys,
	canManageCampaigns,
	canManageContacts,
	canManageDomains,
	canManageTeam,
	canSend,
	removalProblem,
	roleChangeProblem,
} from "../lib/roles.js";

test("hostnames are apex domains or subdomains, nothing else", () => {
	assert.equal(normalizeHostname("Mail.Example.com"), "mail.example.com");
	assert.equal(normalizeHostname("https://mail.example.com/path"), "mail.example.com");
	assert.equal(normalizeHostname("mail.example.com."), "mail.example.com");
	assert.equal(normalizeHostname("example.co.uk"), "example.co.uk");
	assert.equal(normalizeHostname("hi@mail.example.com"), null);
	assert.equal(normalizeHostname("localhost"), null);
	assert.equal(normalizeHostname("*.example.com"), null);
	assert.equal(normalizeHostname("_dmarc.example.com"), null);
	assert.equal(normalizeHostname("https://"), null);
	assert.equal(normalizeHostname({ $gt: "" }), null);
	assert.equal(normalizeHostname(""), null);
});

test("DKIM, SPF and DMARC records use the SES shapes", () => {
	const records = buildDnsRecords({
		hostname: "mail.example.com",
		tokens: ["abc123", "nope.token"],
		region: "us-east-1",
		ruaEmail: "hi@mail.example.com",
	});
	assert.deepEqual(records.dkim, [
		{
			group: "dkim",
			type: "CNAME",
			name: "abc123._domainkey.mail.example.com",
			value: "abc123.dkim.amazonses.com",
		},
	]);
	assert.deepEqual(records.spf, [
		{
			group: "spf",
			type: "MX",
			name: "bounce.mail.example.com",
			value: "10 feedback-smtp.us-east-1.amazonses.com",
		},
		{
			group: "spf",
			type: "TXT",
			name: "bounce.mail.example.com",
			value: "v=spf1 include:amazonses.com ~all",
		},
	]);
	assert.equal(dmarcHost("example.com"), "_dmarc.example.com");
	assert.equal(dmarcHost("mail.example.com"), "_dmarc.mail.example.com");
	assert.equal(dmarcRegistrableHost("mail.example.com"), "_dmarc.example.com");
	assert.equal(dmarcRegistrableHost("example.com"), null);
	assert.equal(dmarcRua("mail.example.com", ["other@example.com", "Hi@mail.example.com"]), "hi@mail.example.com");
	assert.equal(dmarcRua("mail.example.com", []), "dmarc@mail.example.com");
	assert.deepEqual(records.dmarc, [
		{
			group: "dmarc",
			type: "TXT",
			name: "_dmarc.mail.example.com",
			value: "v=DMARC1; p=none; rua=mailto:hi@mail.example.com",
		},
	]);
	assert.equal(emailHost("Hi@Mail.Example.com"), "mail.example.com");
});

test("published DNS matches ignoring case and a trailing dot", () => {
	const txt = { type: "TXT", name: "bounce.mail.example.com", value: "v=spf1 include:amazonses.com ~all" };
	const cname = { type: "CNAME", name: "abc._domainkey.mail.example.com", value: "abc.dkim.amazonses.com" };
	const mx = { type: "MX", name: "bounce.mail.example.com", value: "10 feedback-smtp.us-east-1.amazonses.com" };
	assert.equal(matchDnsRecord(txt, { values: ["V=SPF1  include:amazonses.com ~ALL"] }), "found");
	assert.equal(matchDnsRecord(txt, { values: ["v=spf1 include:example.com ~all"] }), "missing");
	assert.equal(matchDnsRecord(txt, { values: [] }), "missing");
	assert.equal(matchDnsRecord(cname, { values: ["abc.dkim.amazonses.com."] }), "found");
	assert.equal(matchDnsRecord(mx, { values: ["10 feedback-smtp.us-east-1.amazonses.com."] }), "found");
	assert.equal(matchDnsRecord(mx, { values: ["20 feedback-smtp.us-east-1.amazonses.com"] }), "missing");
	assert.equal(matchDnsRecord(txt, { error: "ETIMEOUT" }), "error");
});

test("a DNS lookup failure is a status", async () => {
	const record = { type: "TXT", name: "_dmarc.example.com", value: "v=DMARC1; p=none; rua=mailto:dmarc@example.com" };
	const timeout = {
		async resolveTxt() {
			throw Object.assign(new Error("timed out"), { code: "ETIMEOUT" });
		},
	};
	const absent = {
		async resolveTxt() {
			throw Object.assign(new Error("missing"), { code: "ENOTFOUND" });
		},
	};
	assert.equal(matchDnsRecord(record, await lookupDnsRecord(record, timeout)), "error");
	assert.equal(matchDnsRecord(record, await lookupDnsRecord(record, absent)), "missing");
});

test("verification prefers a live SES answer, then the stored one", () => {
	assert.deepEqual(
		verifiedHostnames({
			sesDomains: [{ domain: "Mail.Example.com", verified: true }, { domain: "other.example.com", verified: false }],
			stored: [{ hostname: "stored.example.com", verifiedForSending: true }],
		}),
		["mail.example.com"]
	);
	assert.deepEqual(
		verifiedHostnames({
			sesDomains: { error: "offline" },
			stored: [{ hostname: "mail.example.com", verifiedForSending: true }],
		}),
		["mail.example.com"]
	);
});

test("owners manage the install and members send with what already exists", () => {
	assert.equal(canManageTeam("owner"), true);
	assert.equal(canManageDomains("owner"), true);
	assert.equal(canManageApiKeys("owner"), true);
	assert.equal(canEditNewsletterSender("owner"), true);
	assert.equal(canManageTeam("member"), false);
	assert.equal(canManageDomains("member"), false);
	assert.equal(canManageApiKeys("member"), false);
	assert.equal(canEditNewsletterSender("member"), false);
	assert.equal(canManageCampaigns("member"), true);
	assert.equal(canManageContacts("member"), true);
	assert.equal(canSend("member"), true);
	assert.equal(canSend("guest"), false);
	assert.equal(removalProblem({ targetIsOwner: true, ownerCount: 1 }), "Can't remove the last owner");
	assert.equal(removalProblem({ targetIsOwner: true, ownerCount: 2 }), null);
	assert.equal(removalProblem({ targetIsOwner: false, ownerCount: 1 }), null);
	assert.equal(
		roleChangeProblem({ targetIsOwner: true, nextRole: "member", ownerCount: 1 }),
		"Can't change the last owner's role"
	);
	assert.equal(roleChangeProblem({ targetIsOwner: false, nextRole: "owner", ownerCount: 1 }), null);
	assert.equal(roleChangeProblem({ targetIsOwner: false, nextRole: "admin", ownerCount: 2 }), "Unknown role");
});

test("passwords are scrypt hashes with a unique salt", async () => {
	const first = await hashPassword("correct horse battery");
	const second = await hashPassword("correct horse battery");
	assert.notEqual(first, second);
	assert.equal(await verifyPassword("correct horse battery", first), true);
	assert.equal(await verifyPassword("wrong horse battery", first), false);
	assert.equal(await verifyPassword("correct horse battery", "scrypt$nope"), false);
	assert.equal(await verifyPassword("correct horse battery", { $gt: "" }), false);
});
