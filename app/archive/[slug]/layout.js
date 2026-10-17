import { Suspense } from "react";
import { notFound } from "next/navigation";
import FooterArchive from "@/components/FooterArchive";
import HeaderArchive from "@/components/HeaderArchive";
import ProviderSubscribe, { SubscribeDialog } from "@/components/ProviderSubscribe";
import { countReaders, getArchiveNewsletter } from "@/lib/archive-data";
import { getArchiveUrls } from "@/lib/archive-hosts";

export default async function ArchiveLayout({ children, params }) {
	const newsletter = await getArchiveNewsletter((await params).slug);
	if (!newsletter) notFound();

	const { index } = getArchiveUrls(newsletter);
	const pitch = {
		name: newsletter.name,
		slug: newsletter.slug,
		imageUrl: newsletter.imageUrl,
		description: newsletter.description,
	};

	return (
		<ProviderSubscribe newsletter={pitch}>
			<div className="flex min-h-dvh flex-col">
				<HeaderArchive newsletter={newsletter} indexHref={index} />
				<main className="flex-1">{children}</main>
				<FooterArchive newsletter={newsletter} indexHref={index} />
			</div>
			<Suspense fallback={null}>
				<ArchiveSubscribeDialog newsletter={pitch} newsletterId={newsletter._id.toString()} />
			</Suspense>
		</ProviderSubscribe>
	);
}

async function ArchiveSubscribeDialog({ newsletter, newsletterId }) {
	const readers = await countReaders(newsletterId);
	return <SubscribeDialog newsletter={newsletter} readers={readers} />;
}
