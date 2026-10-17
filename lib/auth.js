import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connectDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { isTeamRole } from "@/lib/roles";
import {
	SESSION_COOKIE,
	SESSION_MAX_AGE,
	credentialVersion,
	sessionMatchesUser,
	signSessionToken,
	verifySessionToken,
} from "@/lib/session-token";
import User from "@/models/User";

// Browsers ignore a __Host- cookie, even an expired one, unless it's Secure with Path=/.
const COOKIE_OPTIONS = {
	httpOnly: true,
	secure: process.env.NODE_ENV === "production",
	sameSite: "lax",
	path: "/",
};

let placeholderHash;

function timingPlaceholder() {
	placeholderHash ??= hashPassword("mailcheap-timing-placeholder");
	return placeholderHash;
}

export async function authenticate(email, password) {
	const user =
		typeof email === "string" && email
			? await User.findOne({ email }).select("email name role passwordHash")
			: null;
	const passwordOk = await verifyPassword(String(password ?? ""), user?.passwordHash || (await timingPlaceholder()));
	if (!user || !passwordOk || !isTeamRole(user.role)) return null;
	return user;
}

export async function startSession(user) {
	const version = await credentialVersion(user.passwordHash);
	const token = await signSessionToken({ userId: String(user._id), credentialVersion: version });
	const store = await cookies();
	store.set(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE });
}

export async function endSession() {
	const store = await cookies();
	store.delete({ name: SESSION_COOKIE, ...COOKIE_OPTIONS });
}

async function readSession() {
	const store = await cookies();
	const payload = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
	if (!payload) return null;

	try {
		await connectDb();
	} catch {
		return null;
	}

	const user = await User.findById(payload.userId).select("email name role passwordHash").lean();
	if (!user || !isTeamRole(user.role)) return null;
	if (!(await sessionMatchesUser(payload, user.passwordHash))) return null;
	return {
		userId: String(user._id),
		email: user.email,
		name: user.name || "",
		role: user.role,
	};
}

// One lookup per request, shared by the layout, the page and its actions.
export const getSession = cache(readSession);

// Server actions run outside proxy.js matching rules, so they re-check the session themselves.
export async function requireSession() {
	const session = await getSession();
	if (!session) redirect("/login");
	return session;
}
