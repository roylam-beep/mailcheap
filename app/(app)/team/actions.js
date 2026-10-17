"use server";

import { isValidObjectId } from "mongoose";
import { revalidatePath } from "next/cache";
import { requireSession, startSession } from "@/lib/auth";
import { MIN_ADMIN_PASSWORD_LENGTH } from "@/lib/config";
import { connectDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { OWNER_ONLY, canManageTeam, removalProblem, roleChangeProblem } from "@/lib/roles";
import { temporaryPassword } from "@/lib/users";
import { normalizeEmail } from "@/lib/validation";
import User from "@/models/User";

async function ownerGate() {
	const session = await requireSession();
	if (!canManageTeam(session.role)) return { error: OWNER_ONLY };
	return { session };
}

function readName(value) {
	if (typeof value !== "string") return "";
	return value.trim().slice(0, 80);
}

export async function inviteMember(_state, formData) {
	const gate = await ownerGate();
	if (gate.error) return gate;

	const email = typeof formData.get("email") === "string" ? normalizeEmail(formData.get("email")) : null;
	const name = readName(formData.get("name"));
	const role = formData.get("role");
	if (!email) return { error: "Email is invalid" };
	if (!name) return { error: "Name is required" };
	if (role !== "owner" && role !== "member") return { error: "Unknown role" };

	const password = temporaryPassword();
	await connectDb();
	try {
		await User.create({ email, name, role, passwordHash: await hashPassword(password) });
	} catch (error) {
		if (error?.code === 11000) return { error: "That email is already on the team" };
		throw error;
	}

	revalidatePath("/team");
	return { email, password };
}

export async function removeMember(id) {
	const gate = await ownerGate();
	if (gate.error) return gate;
	if (typeof id !== "string" || !isValidObjectId(id)) return { error: "Member not found" };

	await connectDb();
	const user = await User.findById(id).select("role").lean();
	if (!user) return { error: "Member not found" };
	const ownerCount = await User.countDocuments({ role: "owner" });
	const problem = removalProblem({ targetIsOwner: user.role === "owner", ownerCount });
	if (problem) return { error: problem };

	await User.deleteOne({ _id: id });
	revalidatePath("/team");
	return { ok: true };
}

export async function changeMemberRole(_state, formData) {
	const gate = await ownerGate();
	if (gate.error) return gate;
	const id = formData.get("id");
	const nextRole = formData.get("role");
	if (typeof id !== "string" || !isValidObjectId(id)) return { error: "Member not found" };
	if (nextRole !== "owner" && nextRole !== "member") return { error: "Unknown role" };

	await connectDb();
	const user = await User.findById(id).select("role").lean();
	if (!user) return { error: "Member not found" };
	const ownerCount = await User.countDocuments({ role: "owner" });
	const problem = roleChangeProblem({
		targetIsOwner: user.role === "owner",
		nextRole,
		ownerCount,
	});
	if (problem) return { error: problem };

	await User.updateOne({ _id: id }, { $set: { role: nextRole } });
	revalidatePath("/team");
	return { ok: true };
}

export async function changePassword(_state, formData) {
	const session = await requireSession();
	const current = formData.get("current");
	const next = formData.get("next");
	if (typeof current !== "string" || typeof next !== "string") return { error: "Wrong current password" };
	if (next.length < MIN_ADMIN_PASSWORD_LENGTH) {
		return { error: `Use at least ${MIN_ADMIN_PASSWORD_LENGTH} characters` };
	}

	await connectDb();
	const user = await User.findById(session.userId);
	if (!user) return { error: "Account not found" };
	if (!(await verifyPassword(current, user.passwordHash))) return { error: "Wrong current password" };

	user.passwordHash = await hashPassword(next);
	await user.save();
	await startSession(user);
	return { ok: true };
}
