"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { refreshDomain, removeDomain } from "@/app/(app)/domains/actions";
import { Button } from "@/components/ui/button";

export default function DomainActions({ hostname, canManage }) {
	const [isChecking, startCheck] = useTransition();
	const [isRemoving, startRemove] = useTransition();

	function check() {
		startCheck(async () => {
			const result = await refreshDomain(hostname);
			if (result?.error) toast.error(result.error);
			else toast.success("Checked SES and DNS");
		});
	}

	function remove() {
		if (!window.confirm(`Remove ${hostname} from Mailcheap? The SES identity is left as it is.`)) return;
		startRemove(async () => {
			const result = await removeDomain(hostname);
			if (result?.error) toast.error(result.error);
		});
	}

	return (
		<div className="flex items-center gap-2">
			<Button type="button" variant="outline" size="sm" onClick={check} disabled={isChecking}>
				{isChecking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
				Check DNS
			</Button>
			{canManage && (
				<Button type="button" variant="ghost" size="sm" onClick={remove} disabled={isRemoving}>
					Remove
				</Button>
			)}
		</div>
	);
}
