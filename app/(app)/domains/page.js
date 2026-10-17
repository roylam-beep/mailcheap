import Link from "next/link";
import { ExternalLink, Globe, TriangleAlert } from "lucide-react";
import BadgeStatus from "@/components/BadgeStatus";
import ButtonCopy from "@/components/ButtonCopy";
import DialogAddDomain from "@/components/DialogAddDomain";
import DomainActions from "@/components/DomainActions";
import HeaderPage from "@/components/HeaderPage";
import ImageFavicon from "@/components/ImageFavicon";
import StateEmpty from "@/components/StateEmpty";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth";
import { loadDomains } from "@/lib/domains";
import { rootDomain } from "@/lib/favicon";
import { formatRelative } from "@/lib/format";
import { canManageDomains } from "@/lib/roles";

export const metadata = { title: "Domains" };

const GROUPS = [
	{ key: "dkim", title: "DKIM", detail: "CNAME records from SES Easy DKIM." },
	{ key: "spf", title: "SPF / MAIL FROM", detail: "MX and TXT on the custom MAIL FROM host, usually bounce.<domain>." },
	{
		key: "dmarc",
		title: "DMARC",
		detail: "TXT. p=none does not reject mail. rua receives aggregate reports.",
	},
];

export default async function DomainsPage() {
	const session = await requireSession();
	const canManage = canManageDomains(session.role);
	const { domains, sesError, region } = await loadDomains();

	return (
		<>
			<HeaderPage title="Domains">
				{canManage && <DialogAddDomain />}
				<Button asChild variant="outline">
					<a href="https://postmaster.google.com/v2/" target="_blank" rel="noreferrer">
						<ImageFavicon domain="postmaster.google.com" size={16} />
						Postmaster
						<ExternalLink data-icon="inline-end" className="opacity-60" />
					</a>
				</Button>
				<Button asChild variant="outline">
					<a
						href={`https://${region}.console.aws.amazon.com/ses/home?region=${region}#/identities`}
						target="_blank"
						rel="noreferrer"
					>
						<ImageFavicon domain="aws.amazon.com" size={16} />
						SES
						<ExternalLink data-icon="inline-end" className="opacity-60" />
					</a>
				</Button>
			</HeaderPage>

			{sesError && (
				<p className="mb-4 flex items-start gap-2 rounded-xl px-4 py-3 text-sm text-muted-foreground shadow-border">
					<TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
					<span>
						SES could not be read ({sesError}). Domains saved here still show the SPF and DMARC records. DKIM tokens
						appear after SES is connected.
					</span>
				</p>
			)}

			{domains.length === 0 ? (
				<StateEmpty icon={Globe} title="No sending domains yet">
					{canManage ? (
						<p className="max-w-md text-sm text-muted-foreground">
							Add each domain this company sends from. Mailcheap shows the DNS records and checks whether they are
							published.
						</p>
					) : (
						<p className="max-w-md text-sm text-muted-foreground">An owner can add a sending domain.</p>
					)}
				</StateEmpty>
			) : (
				<div className="flex flex-col gap-3">
					{domains.map((domain, index) => (
						<DomainCard key={domain.hostname} domain={domain} index={index} canManage={canManage} />
					))}
				</div>
			)}
		</>
	);
}

function DomainCard({ domain, index, canManage }) {
	return (
		<section
			style={{ "--stagger": index }}
			className="overflow-hidden rounded-xl bg-card shadow-border animate-enter"
		>
			<div className="flex flex-wrap items-center justify-between gap-3 p-4">
				<div className="flex min-w-0 items-center gap-3">
					<div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
						<ImageFavicon domain={rootDomain(domain.hostname)} size={20} />
					</div>
					<div className="min-w-0">
						<p className="truncate font-medium">{domain.hostname}</p>
						{domain.note && <p className="truncate text-sm text-muted-foreground">{domain.note}</p>}
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<StatusPill label="DKIM" status={domain.dkimStatus} />
					{domain.mailFromDomain && <StatusPill label="Return path" status={domain.mailFromStatus} />}
					<BadgeStatus status={domain.verified ? "verified" : "pending"} label={domain.verified ? "Verified" : "Pending"} />
					<DomainActions hostname={domain.hostname} canManage={canManage} />
				</div>
			</div>

			{(domain.newsletters.length > 0 || domain.sesError || domain.dkimPending || domain.lastCheckedAt) && (
				<div className="flex flex-col gap-2 border-t border-border/60 px-4 py-3 text-sm text-muted-foreground">
					{domain.newsletters.length > 0 && (
						<p>
							Sends from{" "}
							{domain.newsletters.map((newsletter, newsletterIndex) => (
								<span key={newsletter.id}>
									{newsletterIndex > 0 && ", "}
									<Link href={`/newsletters/${newsletter.id}`} className="text-foreground hover:underline">
										{newsletter.name}
									</Link>{" "}
									<span className="font-mono text-xs">{newsletter.fromEmail}</span>
								</span>
							))}
						</p>
					)}
					{domain.dkimPending && (
						<p>DKIM tokens appear after SES is connected. SPF and DMARC records below do not need them.</p>
					)}
					{domain.sesError && <p>{domain.sesError}</p>}
					{domain.lastCheckedAt && <p>DNS last checked {formatRelative(domain.lastCheckedAt)}</p>}
				</div>
			)}

			<div className="flex flex-col gap-4 border-t border-border/60 px-4 py-4">
				{GROUPS.map((group) => (
					<RecordGroup
						key={group.key}
						title={group.title}
						detail={group.detail}
						records={domain.records[group.key]}
						note={
							group.key === "dmarc" && domain.registrableDmarc
								? `This record is on ${domain.hostname} itself. ${domain.registrableDmarc} also covers it if you already publish DMARC on the parent domain.`
								: null
						}
					/>
				))}
			</div>
		</section>
	);
}

function RecordGroup({ title, detail, records, note }) {
	return (
		<div className="flex flex-col gap-2">
			<div>
				<h2 className="text-sm font-medium">{title}</h2>
				<p className="text-xs text-muted-foreground">{detail}</p>
			</div>
			{records.length === 0 ? (
				<p className="text-sm text-muted-foreground">No records yet.</p>
			) : (
				<div className="overflow-x-auto rounded-lg border border-border/60">
					<table className="w-full text-sm">
						<tbody className="divide-y divide-border/60">
							{records.map((record) => (
								<tr key={`${record.type}-${record.name}-${record.value}`}>
									<td className="w-16 py-2 pl-3 align-middle font-mono text-xs text-muted-foreground">
										{record.type}
									</td>
									<td className="max-w-0 py-2 pr-2 align-middle">
										<div className="flex items-center gap-1">
											<span className="truncate font-mono text-xs">{record.name}</span>
											<ButtonCopy value={record.name} label="Copy name" />
										</div>
									</td>
									<td className="max-w-0 py-2 pr-2 align-middle">
										<div className="flex items-center gap-1">
											<span className="truncate font-mono text-xs">{record.value}</span>
											<ButtonCopy value={record.value} label="Copy value" />
										</div>
									</td>
									<td className="w-28 py-2 pr-3 text-right align-middle">
										<RecordStatus status={record.status} />
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{note && <p className="text-xs text-muted-foreground">{note}</p>}
		</div>
	);
}

function RecordStatus({ status }) {
	if (status === "found") return <BadgeStatus status="verified" label="Found" />;
	if (status === "missing") return <BadgeStatus status="pending" label="Missing" />;
	if (status === "error") return <BadgeStatus status="failed" label="Lookup failed" />;
	return <BadgeStatus status="not_started" label="Not checked" />;
}

function StatusPill({ label, status }) {
	const key = String(status ?? "").toLowerCase();
	return (
		<BadgeStatus
			status={key}
			label={`${label} ${key === "success" ? "ok" : key.replaceAll("_", " ") || "missing"}`}
		/>
	);
}
