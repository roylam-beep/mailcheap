import { promises as dns } from "node:dns";
import { matchDnsRecord } from "./dns-records.js";

const LOOKUP_TIMEOUT_MS = 5000;
const MISSING = new Set(["ENOTFOUND", "ENODATA", "ENOTIMP", "ENOENT"]);

export async function lookupDnsRecord(record, resolver = dns) {
	try {
		const values = await withTimeout(readRecord(record, resolver));
		return { values };
	} catch (error) {
		const code = error?.code || "";
		if (MISSING.has(code)) return { values: [] };
		return { error: code || "lookup failed" };
	}
}

export async function checkDnsRecords(records, resolver = dns) {
	return Promise.all(
		records.map(async (record) => ({
			...record,
			status: matchDnsRecord(record, await lookupDnsRecord(record, resolver)),
		}))
	);
}

async function readRecord(record, resolver) {
	if (record.type === "TXT") {
		const rows = await resolver.resolveTxt(record.name);
		return rows.map((parts) => parts.join(""));
	}
	if (record.type === "CNAME") return resolver.resolveCname(record.name);
	if (record.type === "MX") {
		const rows = await resolver.resolveMx(record.name);
		return rows.map((row) => `${row.priority} ${row.exchange}`);
	}
	throw Object.assign(new Error("Unsupported record"), { code: "ENOTIMP" });
}

function withTimeout(promise) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(Object.assign(new Error("DNS lookup timed out"), { code: "ETIMEOUT" }));
		}, LOOKUP_TIMEOUT_MS);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}
