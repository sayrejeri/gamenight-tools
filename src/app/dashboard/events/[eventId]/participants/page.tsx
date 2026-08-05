import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { getDiscordAvatarUrl, requireSession } from "@/lib/auth";
import { canManageCodes, getWorkspaceRole } from "@/lib/access";
import { query } from "@/lib/db";
import { buildConnectionProfileUrl, formatConnectionType } from "@/lib/connections";
import { ParticipantStatusControl } from "@/components/participant-status-control";

type EventRow = RowDataPacket & { workspace_id: string; primary_host_id: string; name: string; max_participants: number | null };
type ParticipantRow = RowDataPacket & {
  user_id: string;
  status: string;
  checked_in_at: Date | null;
  joined_at: Date;
  game_identity_type: string | null;
  game_identity_value: string | null;
  discord_id: string;
  username: string;
  global_name: string | null;
  avatar_hash: string | null;
  connection_external_id: string | null;
  connection_profile_url: string | null;
  connection_avatar_url: string | null;
};

export default async function ParticipantsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession();
  const { eventId } = await params;
  const events = await query<EventRow[]>(
    `SELECT workspace_id, primary_host_id, name, max_participants FROM events WHERE id = ? LIMIT 1`,
    [eventId],
  );
  const event = events[0];
  if (!event) notFound();

  const role = await getWorkspaceRole(session.userId, event.workspace_id);
  const cohost = await query<(RowDataPacket & { permission_level: string })[]>(
    `SELECT permission_level FROM event_cohosts
     WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`,
    [eventId, session.userId],
  );
  const allowed = event.primary_host_id === session.userId || canManageCodes(role) || cohost[0]?.permission_level === "FULL";
  if (!allowed) notFound();

  const participants = await query<ParticipantRow[]>(
    `SELECT ep.user_id, ep.status, ep.checked_in_at, ep.joined_at,
            ep.game_identity_type, ep.game_identity_value,
            u.discord_id, u.username, u.global_name, u.avatar_hash,
            uc.external_id AS connection_external_id,
            uc.profile_url AS connection_profile_url,
            uc.avatar_url AS connection_avatar_url
     FROM event_participants ep
     INNER JOIN users u ON u.id = ep.user_id
     LEFT JOIN user_connections uc
       ON uc.user_id = ep.user_id
      AND LOWER(uc.connection_type) = LOWER(ep.game_identity_type)
      AND LOWER(uc.handle) = LOWER(ep.game_identity_value)
     WHERE ep.event_id = ?
     ORDER BY FIELD(ep.status, 'PENDING', 'APPROVED', 'WAITLISTED', 'NO_SHOW', 'DISQUALIFIED', 'REJECTED', 'WITHDRAWN'), ep.joined_at ASC`,
    [eventId],
  );
  const approved = participants.filter((item) => item.status === "APPROVED").length;

  return (
    <div className="section-stack">
      <section className="page-heading">
        <div><span className="eyebrow">Event signups</span><h1>Manage {event.name}</h1><p>Approve the final eligible list before generating or manually placing the bracket.</p></div>
        <Link className="button button-secondary" href={`/dashboard/events/${eventId}`}>Back to event</Link>
      </section>

      <section className="panel section-stack">
        <div className="button-row"><span className="badge">{participants.length} total records</span><span className="badge">{approved}{event.max_participants ? ` / ${event.max_participants}` : " approved · Unlimited"}</span></div>
        {participants.length ? (
          <div className="participant-management-list">
            {participants.map((item) => {
              const gameName = item.game_identity_value ?? item.global_name ?? item.username;
              const profileUrl = item.game_identity_type
                ? buildConnectionProfileUrl(item.game_identity_type, item.connection_external_id, item.game_identity_value ?? item.username, item.connection_profile_url)
                : null;
              const avatar = item.connection_avatar_url ?? getDiscordAvatarUrl(item.discord_id, item.avatar_hash);
              return (
                <article className="participant-management-row" key={item.user_id}>
                  <div className="identity-card">
                    {avatar ? (profileUrl ? <a href={profileUrl} target="_blank" rel="noreferrer"><img className="identity-avatar" src={avatar} alt="" /></a> : <img className="identity-avatar" src={avatar} alt="" />) : <div className="identity-avatar avatar-fallback">{gameName.slice(0, 1)}</div>}
                    <div>
                      {profileUrl ? <a className="identity-name text-link" href={profileUrl} target="_blank" rel="noreferrer">{gameName}</a> : <strong className="identity-name">{gameName}</strong>}
                      {item.game_identity_type ? <span>{formatConnectionType(item.game_identity_type)}</span> : null}
                      <span>Discord: @{item.username}</span>
                      <span>Joined {new Date(item.joined_at).toLocaleString()}</span>
                      {item.checked_in_at ? <span className="badge">Checked in</span> : null}
                    </div>
                  </div>
                  <ParticipantStatusControl eventId={eventId} userId={item.user_id} initialStatus={item.status} />
                </article>
              );
            })}
          </div>
        ) : <div className="empty-state">No signup records yet.</div>}
      </section>
    </div>
  );
}
