import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getCommunityScopeAccess, type CommunityScopeType } from "@/lib/community-chat";
import { CommunityChatShell } from "@/components/community-chat-shell";

export default async function CommunityScopePage({
  params,
  searchParams,
}: {
  params: Promise<{ scopeType: string; scopeId: string }>;
  searchParams: Promise<{ channel?: string }>;
}) {
  const session = await requireSession();
  const { scopeType: rawScopeType, scopeId } = await params;
  const { channel } = await searchParams;
  const scopeType: CommunityScopeType | null = rawScopeType === "servers" ? "WORKSPACE" : rawScopeType === "teams" ? "TEAM" : null;
  if (!scopeType) notFound();

  const access = await getCommunityScopeAccess(session.userId, scopeType, scopeId);
  if (!access || (!access.canRead && !access.canManageChannels)) notFound();

  const backHref = scopeType === "WORKSPACE" ? `/dashboard/workspaces/${scopeId}` : access.slug ? `/teams/${access.slug}` : "/dashboard/teams";
  return (
    <div className="section-stack">
      <section className="page-heading community-chat-heading">
        <div><span className="eyebrow">{scopeType === "WORKSPACE" ? "Server communication" : "Team communication"}</span><h1>{access.name} chat</h1><p>{access.chatEnabled ? "Channels, announcements, replies, reactions, mentions, and moderated community conversation." : "Chat is currently disabled for this community."}</p></div>
        <div className="button-row"><Link className="button button-secondary" href="/dashboard/community">All community chats</Link><Link className="button button-secondary" href={backHref}>Back to {scopeType === "WORKSPACE" ? "server" : "team"}</Link></div>
      </section>
      <CommunityChatShell scopeType={scopeType} scopeId={scopeId} currentUserId={session.userId} initialChannelId={channel ?? null} />
    </div>
  );
}
