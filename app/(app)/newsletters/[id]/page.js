import { Types, isValidObjectId } from "mongoose";
import { notFound } from "next/navigation";
import { Newspaper } from "lucide-react";
import AvatarNewsletter from "@/components/AvatarNewsletter";
import FormNewsletter from "@/components/FormNewsletter";
import HeaderPage from "@/components/HeaderPage";
import StateEmpty from "@/components/StateEmpty";
import { requireSession } from "@/lib/auth";
import { cleanupTotalsPipeline } from "@/lib/cleanup";
import { isSendingEnabled } from "@/lib/config";
import { connectDb } from "@/lib/db";
import { getVerifiedHostnames } from "@/lib/domains";
import { canEditNewsletterSender } from "@/lib/roles";
import { serialize } from "@/lib/serialize";
import Contact from "@/models/Contact";
import Newsletter from "@/models/Newsletter";

export const metadata = { title: "Newsletter" };

export default async function NewsletterPage({ params }) {
	const session = await requireSession();
	const canEditSender = canEditNewsletterSender(session.role);
	const { id } = await params;
	const isNew = id === "new";
	if (!isNew && !isValidObjectId(id)) notFound();
	if (isNew && !canEditSender) {
		return (
			<>
				<HeaderPage title="New newsletter" backHref="/newsletters" />
				<StateEmpty icon={Newspaper} title="Only an owner can create a newsletter" />
			</>
		);
	}

	await connectDb();
	const [newsletter, verifiedDomains, cleanupTotals] = await Promise.all([
		isNew ? null : Newsletter.findById(id).lean(),
		getVerifiedHostnames(),
		isNew ? null : getCleanupTotals(id),
	]);
	if (!isNew && !newsletter) notFound();

	return (
		<>
			<HeaderPage
				title={isNew ? "New newsletter" : newsletter.name}
				backHref="/newsletters"
				icon={newsletter && <AvatarNewsletter newsletter={newsletter} size={32} />}
			/>
			<FormNewsletter
				newsletter={newsletter ? serialize(newsletter) : null}
				verifiedDomains={verifiedDomains}
				canEditSender={canEditSender}
				isSendingEnabled={isSendingEnabled()}
				testEmail={process.env.ADMIN_EMAIL}
				cleanupTotals={cleanupTotals}
			/>
		</>
	);
}

async function getCleanupTotals(newsletterId) {
	const [totals] = await Contact.aggregate(cleanupTotalsPipeline(new Types.ObjectId(newsletterId)));
	return { waiting: totals?.waiting ?? 0, kept: totals?.kept ?? 0, dormant: totals?.dormant ?? 0 };
}
