"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { inviteMember } from "@/app/(app)/team/actions";
import ButtonCopy from "@/components/ButtonCopy";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function DialogInviteMember() {
	const [isOpen, setIsOpen] = useState(false);
	const [formKey, setFormKey] = useState(0);

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				setIsOpen(open);
				if (!open) setFormKey((key) => key + 1);
			}}
		>
			<DialogTrigger asChild>
				<Button>
					<Plus data-icon="inline-start" />
					Invite
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<FormInvite key={formKey} />
			</DialogContent>
		</Dialog>
	);
}

function FormInvite() {
	const [state, action, isPending] = useActionState(inviteMember, null);

	if (state?.password) {
		return (
			<>
				<DialogHeader>
					<DialogTitle>Temporary password</DialogTitle>
					<DialogDescription>
						Share it with {state.email} once. It is not shown again and no email is sent.
					</DialogDescription>
				</DialogHeader>
				<div className="flex items-center gap-1 rounded-lg bg-muted py-1 pr-1 pl-3">
					<code className="min-w-0 flex-1 truncate font-mono text-[13px]">{state.password}</code>
					<ButtonCopy value={state.password} label="Copy password" />
				</div>
				<DialogFooter>
					<DialogClose asChild>
						<Button>Done</Button>
					</DialogClose>
				</DialogFooter>
			</>
		);
	}

	return (
		<form action={action} className="flex flex-col gap-4">
			<DialogHeader>
				<DialogTitle>Invite someone</DialogTitle>
				<DialogDescription>They sign in with this email and the temporary password.</DialogDescription>
			</DialogHeader>
			<div className="flex flex-col gap-3">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="invite-name">Name</Label>
					<Input id="invite-name" name="name" required autoFocus maxLength={80} placeholder="Ada Lovelace" />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="invite-email">Email</Label>
					<Input id="invite-email" name="email" type="email" required autoComplete="off" placeholder="ada@example.com" />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="invite-role">Role</Label>
					<select
						id="invite-role"
						name="role"
						defaultValue="member"
						className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
					>
						<option value="member">Member</option>
						<option value="owner">Owner</option>
					</select>
				</div>
			</div>
			{state?.error && <p className="text-sm text-destructive">{state.error}</p>}
			<DialogFooter>
				<Button type="submit" disabled={isPending} className="min-w-20">
					{isPending ? <Loader2 className="animate-spin" /> : "Invite"}
				</Button>
			</DialogFooter>
		</form>
	);
}
