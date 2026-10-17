import { UsersRound } from "lucide-react";
import DialogInviteMember from "@/components/DialogInviteMember";
import FormChangePassword from "@/components/FormChangePassword";
import HeaderPage from "@/components/HeaderPage";
import StateEmpty from "@/components/StateEmpty";
import TeamMemberRow from "@/components/TeamMemberRow";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { requireSession } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { canManageTeam } from "@/lib/roles";
import User from "@/models/User";

export const metadata = { title: "Team" };

export default async function TeamPage() {
	const session = await requireSession();
	const canManage = canManageTeam(session.role);
	await connectDb();
	const members = await User.find().sort({ createdAt: 1 }).select("email name role createdAt").lean();

	return (
		<>
			<HeaderPage title="Team">
				{canManage && <DialogInviteMember />}
			</HeaderPage>

			<div className="flex flex-col gap-8">
				{members.length === 0 ? (
					<StateEmpty icon={UsersRound} title="No one on the team yet" />
				) : (
					<div className="overflow-hidden rounded-xl shadow-border animate-enter">
						<Table>
							<TableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead className="pl-4">Name</TableHead>
									<TableHead>Email</TableHead>
									<TableHead className="hidden sm:table-cell">Role</TableHead>
									<TableHead className="hidden md:table-cell">Joined</TableHead>
									{canManage && <TableHead className="pr-4 text-right">Access</TableHead>}
								</TableRow>
							</TableHeader>
							<TableBody>
								{members.map((member) => {
									const id = member._id.toString();
									return (
										<TableRow key={id}>
											<TableCell className="py-2.5 pl-4 font-medium">
												{member.name || "—"}
												{id === session.userId && (
													<span className="ml-2 text-xs font-normal text-muted-foreground">You</span>
												)}
											</TableCell>
											<TableCell className="text-muted-foreground">{member.email}</TableCell>
											<TableCell className="hidden capitalize sm:table-cell">{member.role}</TableCell>
											<TableCell className="hidden text-muted-foreground md:table-cell">
												{formatDate(member.createdAt)}
											</TableCell>
											{canManage && (
												<TableCell className="pr-4">
													<TeamMemberRow id={id} role={member.role} canManage />
												</TableCell>
											)}
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
				)}

				<section className="rounded-xl bg-card p-4 shadow-border">
					<h2 className="mb-1 text-sm font-medium">Your password</h2>
					<p className="mb-4 text-sm text-muted-foreground">
						Changing it signs out your other sessions. The password stored here is the one that signs you in.
					</p>
					<FormChangePassword />
				</section>
			</div>
		</>
	);
}
