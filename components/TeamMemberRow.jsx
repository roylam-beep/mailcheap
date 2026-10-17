"use client";

import { useActionState, useEffect, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { changeMemberRole, removeMember } from "@/app/(app)/team/actions";
import { Button } from "@/components/ui/button";

export default function TeamMemberRow({ id, role, canManage }) {
	const [state, action, isPending] = useActionState(changeMemberRole, null);
	const [isRemoving, startRemove] = useTransition();

	useEffect(() => {
		if (state?.ok) toast.success("Role saved");
		if (state?.error) toast.error(state.error);
	}, [state]);

	function remove() {
		if (!window.confirm("Remove this person? They will be signed out.")) return;
		startRemove(async () => {
			const result = await removeMember(id);
			if (result?.error) toast.error(result.error);
		});
	}

	if (!canManage) return null;

	return (
		<form action={action} className="flex items-center justify-end gap-2">
			<input type="hidden" name="id" value={id} />
			<select
				name="role"
				defaultValue={role}
				aria-label="Role"
				className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				<option value="owner">Owner</option>
				<option value="member">Member</option>
			</select>
			<Button type="submit" variant="outline" size="sm" disabled={isPending}>
				{isPending ? <Loader2 className="animate-spin" /> : "Save"}
			</Button>
			<Button type="button" variant="ghost" size="sm" onClick={remove} disabled={isRemoving}>
				Remove
			</Button>
		</form>
	);
}
