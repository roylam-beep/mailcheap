"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { notifyActivity } from "@/lib/alerts";
import { authenticate, startSession } from "@/lib/auth";
import { getConfigProblems } from "@/lib/config";
import { connectDb } from "@/lib/db";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { ensureOwner } from "@/lib/users";
import { normalizeEmail } from "@/lib/validation";

const ATTEMPTS_PER_IP = { name: "login-ip", limit: 10, window: "15 m" };

function safeNextPath(value) {
	return typeof value === "string" && /^\/(?!\/)[\w\-/]*$/.test(value) ? value : "/";
}

export async function login(_state, formData) {
	const problems = getConfigProblems();
	if (problems.length > 0) return { error: `Login is off until the server's settings are fixed. ${problems.join(" ")}` };

	if (await isRateLimited({ ...ATTEMPTS_PER_IP, key: getClientIp(await headers()) })) {
		return { error: "Too many attempts. Try again in 15 minutes." };
	}

	const rawEmail = formData.get("email");
	const rawPassword = formData.get("password");
	const email = typeof rawEmail === "string" ? normalizeEmail(rawEmail) : null;
	const password = typeof rawPassword === "string" ? rawPassword : "";

	try {
		await ensureOwner();
		await connectDb();
	} catch (error) {
		console.error("[login] Could not reach the database:", error);
		return { error: "Could not reach the database" };
	}

	const user = await authenticate(email, password);
	if (!user) {
		await new Promise((resolve) => setTimeout(resolve, 800));
		return { error: "Wrong email or password" };
	}

	await startSession(user);
	await notifyActivity(["New login"], { withUserAgent: true });
	redirect(safeNextPath(formData.get("next")));
}
