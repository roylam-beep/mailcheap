import crypto from "node:crypto";
import { MIN_ADMIN_PASSWORD_LENGTH } from "./config.js";
import { connectDb } from "./db.js";
import { hashPassword } from "./password.js";
import { normalizeEmail } from "./validation.js";
import User from "@/models/User";

let bootstrapped = false;

// The first request creates the owner from the env login. Later password changes live on the user.
export async function ensureOwner() {
	if (bootstrapped || !process.env.MONGODB_URI) return null;
	const email = normalizeEmail(process.env.ADMIN_EMAIL);
	const password = process.env.ADMIN_PASSWORD;
	if (!email || typeof password !== "string" || password.length < MIN_ADMIN_PASSWORD_LENGTH) return null;

	await connectDb();
	if ((await User.countDocuments()) > 0) {
		bootstrapped = true;
		return null;
	}

	try {
		const owner = await User.create({
			email,
			passwordHash: await hashPassword(password),
			name: "Owner",
			role: "owner",
		});
		bootstrapped = true;
		return owner;
	} catch (error) {
		if (error?.code === 11000) {
			bootstrapped = true;
			return null;
		}
		throw error;
	}
}

export function temporaryPassword() {
	return crypto.randomBytes(18).toString("base64url");
}
