"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { addSendingDomain, refreshSendingDomain, removeSendingDomain } from "@/lib/domains";
import { OWNER_ONLY, canManageDomains } from "@/lib/roles";

function revalidate() {
	revalidatePath("/domains");
	revalidatePath("/");
}

export async function addDomain(_state, formData) {
	const session = await requireSession();
	if (!canManageDomains(session.role)) return { error: OWNER_ONLY };
	const result = await addSendingDomain({
		hostname: formData.get("hostname"),
		note: formData.get("note"),
	});
	if (result.ok) revalidate();
	return result;
}

export async function refreshDomain(hostname) {
	await requireSession();
	const result = await refreshSendingDomain(hostname);
	if (result.ok) revalidate();
	return result;
}

export async function removeDomain(hostname) {
	const session = await requireSession();
	if (!canManageDomains(session.role)) return { error: OWNER_ONLY };
	const result = await removeSendingDomain(hostname);
	if (result.ok) revalidate();
	return result;
}
