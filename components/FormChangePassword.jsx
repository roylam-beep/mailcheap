"use client";

import { useActionState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { changePassword } from "@/app/(app)/team/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function FormChangePassword() {
	const [state, action, isPending] = useActionState(changePassword, null);

	useEffect(() => {
		if (state?.ok) toast.success("Password changed");
		if (state?.error) toast.error(state.error);
	}, [state]);

	return (
		<form action={action} className="grid gap-3 sm:grid-cols-2">
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="current-password">Current password</Label>
				<Input id="current-password" name="current" type="password" autoComplete="current-password" required />
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="next-password">New password</Label>
				<Input
					id="next-password"
					name="next"
					type="password"
					autoComplete="new-password"
					required
					minLength={12}
				/>
			</div>
			<div className="sm:col-span-2">
				<Button type="submit" disabled={isPending} variant="outline">
					{isPending && <Loader2 className="animate-spin" />}
					Change password
				</Button>
			</div>
		</form>
	);
}
