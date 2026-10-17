export const OWNER_ONLY = "Only an owner can do that";

export function isOwner(role) {
	return role === "owner";
}

export function isTeamRole(role) {
	return role === "owner" || role === "member";
}

export function canManageTeam(role) {
	return role === "owner";
}

export function canManageDomains(role) {
	return role === "owner";
}

export function canManageApiKeys(role) {
	return role === "owner";
}

export function canEditNewsletterSender(role) {
	return role === "owner";
}

export function canManageCampaigns(role) {
	return isTeamRole(role);
}

export function canManageContacts(role) {
	return isTeamRole(role);
}

export function canSend(role) {
	return isTeamRole(role);
}

export function roleChangeProblem({ targetIsOwner, nextRole, ownerCount }) {
	if (nextRole !== "owner" && nextRole !== "member") return "Unknown role";
	if (targetIsOwner && nextRole !== "owner" && ownerCount <= 1) return "Can't change the last owner's role";
	return null;
}

export function removalProblem({ targetIsOwner, ownerCount }) {
	if (targetIsOwner && ownerCount <= 1) return "Can't remove the last owner";
	return null;
}
