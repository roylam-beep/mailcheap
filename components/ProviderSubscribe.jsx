"use client";

import { createContext, use, useMemo, useState } from "react";
import PitchSubscribe from "@/components/PitchSubscribe";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { storeValue, subscribeSnoozedKey } from "@/lib/storage";

const SubscribeContext = createContext(null);

export function useSubscribe() {
	return use(SubscribeContext);
}

export default function ProviderSubscribe({ newsletter, children }) {
	const [openedBy, setOpenedBy] = useState(null);
	const value = useMemo(
		() => ({
			open: (source = "reader") => setOpenedBy(source),
			openedBy,
			dismiss() {
				setOpenedBy(null);
				storeValue(subscribeSnoozedKey(newsletter.slug), Date.now());
			},
		}),
		[openedBy, newsletter.slug]
	);

	return <SubscribeContext value={value}>{children}</SubscribeContext>;
}

// Rendered once the reader count resolves, so the archive shell doesn't wait on that query.
export function SubscribeDialog({ newsletter, readers }) {
	const { openedBy, dismiss } = useSubscribe();

	function onOpenChange(open) {
		if (open) return;
		dismiss();
	}

	// A popup that appears mid-read shouldn't throw the phone keyboard over the issue.
	function onOpenAutoFocus(event) {
		if (openedBy === "scroll" && window.matchMedia("(pointer: coarse)").matches) event.preventDefault();
	}

	return (
		<Dialog open={Boolean(openedBy)} onOpenChange={onOpenChange}>
			<DialogContent
				aria-describedby={undefined}
				onOpenAutoFocus={onOpenAutoFocus}
				className="p-8 pt-10 sm:max-w-md"
			>
				<PitchSubscribe newsletter={newsletter} readers={readers} titleAs={DialogTitle} />
			</DialogContent>
		</Dialog>
	);
}
