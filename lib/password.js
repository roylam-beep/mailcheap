import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const KEYLEN = 64;
const SALT_BYTES = 16;
// Node's default cost. Unique salt per password; the parameters travel with the hash.
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
	if (typeof password !== "string" || password.length === 0) throw new Error("Password is required");
	const salt = randomBytes(SALT_BYTES);
	const hash = await scrypt(password, salt, KEYLEN, PARAMS);
	return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password, stored) {
	const parts = typeof stored === "string" ? stored.split("$") : [];
	if (parts.length !== 6 || parts[0] !== "scrypt") return false;
	const N = Number(parts[1]);
	const r = Number(parts[2]);
	const p = Number(parts[3]);
	if (!Number.isInteger(N) || N < 2 || !Number.isInteger(r) || r < 1 || !Number.isInteger(p) || p < 1) return false;

	const salt = decode(parts[4]);
	const expected = decode(parts[5]);
	if (!salt || salt.length < 8 || !expected || expected.length < 16) return false;

	const actual = await scrypt(String(password ?? ""), salt, expected.length, {
		N,
		r,
		p,
		maxmem: 64 * 1024 * 1024,
	});
	if (actual.length !== expected.length) return false;
	return timingSafeEqual(actual, expected);
}

function decode(value) {
	try {
		return Buffer.from(value, "base64url");
	} catch {
		return null;
	}
}
