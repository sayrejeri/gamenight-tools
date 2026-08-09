import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { getDiscordAvatarUrl, requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { hasWorkspacePermission } from "@/lib/permissions";
import { buildConnectionProfileUrl, formatConnectionType } from "@/lib/connections";
import { EventParticipantManager } from "@/components/event-participant-manager";

type EventRow = RowDataPacket & { workspace_id: string; primary_host_id: string; name: string; max_participants: number | null; signup_mode: string };
type ParticipantRow = RowDataPacket & { user_id: string; status: string; checked_in_at: Date | null; joined_at: Date; game_identity_type: string | null; game_identity_value: string | null; staff_note: string | null; discord_id: string; username: string; global_name: string | null; avatar_hash: string | null; connection_external_id: string | null; connection_profile_url: string | null; connection_avatar_url: string | null };

export default async function ParticipantsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession();
  const { eventId } = await params;
  const events = await query<EventRow[]>(`SELECT workspace_id, primary_host_id, name, max_participants, signup_mode FROM events WHERE id = ? LIMIT 1`, [eventId]);
  const event = events[0];
  if (!event) notFound();
  const cohost = await query<(RowDataPacket & { permission_level: string })[]>(`SELECT permission_level FROM event_cohosts WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`, [eventId, session.userId]);
  const allowed = event.primary_host_id === session.userId || await hasWorkspacePermission(session.userId, event.workspace_id, "MANAGE_PARTICIPANTS") || ["FULL", "SIGNUPS", "SCOREKEEPER"].includes(cohost[0]?.permission_level ?? "");
  if (!allowed) notFound();

  const participants = await query<ParticipantRow[]>(
    `SELECT ep.user_id, ep.status, ep.checked_in_at, ep.joined_at, ep.game_identity_type, ep.game_identity_value, ep.staff_note,
            u.discord_id, u.username, u.global_name, u.avatar_hash, uc.external_id AS connection_external_id,
            uc.profile_url AS connection_profile_url, uc.avatar_url AS connection_avatar_url
     FROM event_participants ep INNER JOIN users u ON u.id = ep.user_id
     LEFT JOIN user_connections uc ON uc.user_id = ep.user_id AND LOWER(uc.connection_type) = LOWER(ep.game_identity_type) AND LOWER(uc.handle) = LOWER(ep.game_identity_value)
     WHERE ep.event_id = ?
     ORDER BY FIELD(ep.status, 'PENDING', 'APPROVED', 'WAITLISTED', 'NO_SHOW', 'DISQUALIFIED', 'REJECTED', 'WITHDRAWN'), ep.joined_at ASC`, [eventId],
  );

  const managerParticipants = participants.map((item) => {
    const gameName = item.game_identity_value ?? item.global_name ?? item.username;
    const profileUrl = item.game_identity_type ? buildConnectionProfileUrl(item.game_identity_type, item.connection_external_id, item.game_identity_value ?? item.username, item.connection_profile_url) : null;
    return {
      userId: item.user_id,
      gameName,
      profileUrl,
      avatarUrl: item.connection_avatar_url ?? getDiscordAvatarUrl(item.discord_id, item.avatar_hash),
      identityLabel: item.game_identity_type ? formatConnectionType(item.game_identity_type) : null,
      discordUsername: item.username,
      joinedAt: new Date(item.joined_at).toISOString(),
      checkedInAt: item.checked_in_at ? new Date(item.checked_in_at).toISOString() : null,
      status: item.status,
      staffNote: item.staff_note,
    };
  });

  return (
    <div className="section-stack">
      <section className="page-heading"><div><span className="eyebrow">Event signups</span><h1>Manage {event.name}</h1><p>{event.signup_mode === "APPROVAL" ? "Signups wait for host approval. Review pending players, keep private notes, and manage the waitlist from here." : "Search the roster, manage statuses and waitlist order, and keep private notes before generating the bracket."}</p></div><Link className="button button-secondary" href={`/dashboard/events/${eventId}`}>Back to event</Link></section>
      <section className="panel section-stack">
        <EventParticipantManager eventId={eventId} participants={managerParticipants} maxParticipants={event.max_participants} />
      </section>
    </div>
  );
}
