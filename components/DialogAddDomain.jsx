"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { addDomain } from "@/app/(app)/domains/actions";
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

export default function DialogAddDomain() {
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
					Add domain
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<FormDomain key={formKey} />
			</DialogContent>
		</Dialog>
	);
}

function FormDomain() {
	const [state, action, isPending] = useActionState(addDomain, null);

	if (state?.ok) {
		return (
			<>
				<DialogHeader>
					<DialogTitle>Domain saved</DialogTitle>
					<DialogDescription>
						{state.warning || "Copy the DKIM, SPF and DMARC records into DNS, then check them from this page."}
					</DialogDescription>
				</DialogHeader>
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
				<DialogTitle>Add a sending domain</DialogTitle>
				<DialogDescription>
					An apex or a subdomain, like example.com or mail.example.com. Mailcheap creates the SES identity when SES
					is connected.
				</DialogDescription>
			</DialogHeader>
			<div className="flex flex-col gap-3">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="domain-hostname">Domain</Label>
					<Input
						id="domain-hostname"
						name="hostname"
						required
						autoFocus
						autoComplete="off"
						placeholder="mail.example.com"
						className="font-mono"
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="domain-note">Note</Label>
					<Input id="domain-note" name="note" maxLength={200} placeholder="Optional" />
				</div>
			</div>
			{state?.error && <p className="text-sm text-destructive">{state.error}</p>}
			<DialogFooter>
				<Button type="submit" disabled={isPending} className="min-w-24">
					{isPending ? <Loader2 className="animate-spin" /> : "Add"}
				</Button>
			</DialogFooter>
		</form>
	);
}
