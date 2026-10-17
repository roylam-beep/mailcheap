import { SignJWT, base64url, jwtVerify } from "jose";
import { MIN_SESSION_SECRET_LENGTH } from "./config.js";

// __Host- cookies need HTTPS, which local dev doesn't have.
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-mailcheap_session" : "mailcheap_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const USER_ID = /^[a-f0-9]{24}$/i;

const encoder = new TextEncoder();
let cachedKey = null;

// Email links derive their keys from SESSION_SECRET with other infos, so signing everyone out never breaks them.
async function getKey() {
	const secret = process.env.SESSION_SECRET;
	if (!secret || secret.length < MIN_SESSION_SECRET_LENGTH) {
		throw new Error(`SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters`);
	}
	if (cachedKey?.secret !== secret) {
		const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveBits"]);
		const bits = await crypto.subtle.deriveBits(
			{ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: encoder.encode("mailcheap-session-v1") },
			material,
			256
		);
		cachedKey = { secret, key: new Uint8Array(bits) };
	}
	return cachedKey.key;
}

// Derived from that user's password hash, so changing their password signs out only their sessions.
export async function credentialVersion(passwordHash) {
	const key = await getKey();
	const hmacKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const signature = await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(`credential\n${passwordHash}`));
	return base64url.encode(new Uint8Array(signature).subarray(0, 16));
}

export async function signSessionToken({ userId, credentialVersion: version }) {
	const key = await getKey();
	if (typeof userId !== "string" || !USER_ID.test(userId) || typeof version !== "string" || version.length === 0) {
		throw new Error("Session user is invalid");
	}
	return new SignJWT({ sub: userId, v: version })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(`${SESSION_MAX_AGE}s`)
		.sign(key);
}

export async function verifySessionToken(token) {
	if (!token || typeof token !== "string") return null;
	try {
		const key = await getKey();
		const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
		if (typeof payload.sub !== "string" || !USER_ID.test(payload.sub)) return null;
		if (typeof payload.v !== "string" || payload.v.length === 0) return null;
		return { userId: payload.sub, v: payload.v };
	} catch {
		return null;
	}
}

export async function sessionMatchesUser(payload, passwordHash) {
	if (!payload || typeof passwordHash !== "string" || passwordHash.length === 0) return false;
	return payload.v === (await credentialVersion(passwordHash));
}
