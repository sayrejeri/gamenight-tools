import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession, getDiscordAvatarUrl } from "@/lib/auth";
import { query } from "@/lib/db";
import { getWorkspacePermissionSnapshot } from "@/lib/permissions";
import { buildConnectionProfileUrl, formatConnectionType } from "@/lib/connections";
import { CohostInviteForm } from "@/components/cohost-invite-form";
import { EventStatusControls } from "@/components/event-status-controls";
import { EventSignupControls } from "@/components/event-signup-controls";
import { LocalDateTime } from "@/components/local-date-time";
import { SaveEventTemplateButton } from "@/components/save-event-template-button";

type EventRow = RowDataPacket & {
  id: string; workspace_id: string; workspace_name: string; name: string; description: string | null; game_name: string | null;
  platform_name: string | null; subgame_name: string | null; game_url: string | null; game_thumbnail_url: string | null;
  required_connection_type: string | null; status: string; visibility: string; join_code_required: number; starts_at: Date | null;
  signup_deadline: Date | null; check_in_opens_at: Date | null; check_in_deadline: Date | null; max_participants: number | null;
  timezone: string; primary_host_id: string; primary_host_name: string; primary_host_username: string; primary_host_discord_id: string;
  primary_host_avatar_hash: string | null; user_in_guild: number; bracket_enabled: number; bracket_format: string | null;
  bracket_seeding_mode: string | null; bracket_auto_generate: number; bracket_require_check_in: number;
};
type ConnectionRow = RowDataPacket & { id: string; connection_type: string; external_id: string | null; handle: string; display_name: string | null; profile_url: string | null; avatar_url: string | null };
type ParticipantRow = RowDataPacket & { user_id: string; status: string; checked_in_at: Date | null; game_identity_type: string | null; game_identity_value: string | null; discord_id: string; username: string; global_name: string | null; avatar_hash: string | null; connection_external_id: string | null; connection_profile_url: string | null; connection_avatar_url: string | null; connection_display_name: string | null };
type CohostRow = RowDataPacket & { id: string; invited_discord_id: string; permission_level: string; status: string; username: string | null; global_name: string | null };

function iso(value: Date | null): string | null { return value ? new Date(value).toISOString() : null; }

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession();
  const { eventId } = await params;
  const events = await query<EventRow[]>(
    `SELECT e.id, e.workspace_id, w.name AS workspace_name, e.name, e.description, e.game_name,
            e.platform_name, e.subgame_name, e.game_url, e.game_thumbnail_url,
            e.required_connection_type, e.status, e.visibility, e.join_code_required,
            e.starts_at, e.signup_deadline, e.check_in_opens_at, e.check_in_deadline,
            e.max_participants, e.timezone, e.primary_host_id,
            COALESCE(host.global_name, host.username) AS primary_host_name,
            host.username AS primary_host_username, host.discord_id AS primary_host_discord_id,
            host.avatar_hash AS primary_host_avatar_hash,
            e.bracket_enabled, e.bracket_format, e.bracket_seeding_mode,
            e.bracket_auto_generate, e.bracket_require_check_in,
            EXISTS(SELECT 1 FROM user_guilds ug WHERE ug.user_id = ? AND ug.guild_id = w.discord_guild_id) AS user_in_guild
     FROM events e INNER JOIN workspaces w ON w.id = e.workspace_id INNER JOIN users host ON host.id = e.primary_host_id
     WHERE e.id = ? LIMIT 1`, [session.userId, eventId],
  );
  const event = events[0];
  if (!event) notFound();

  const [workspaceAccess, cohostAccess, participantAccess] = await Promise.all([
    getWorkspacePermissionSnapshot(session.userId, event.workspace_id),
    query<(RowDataPacket & { permission_level: string })[]>(`SELECT permission_level FROM event_cohosts WHERE event_id = ? AND invited_user_id = ? AND status = 'ACCEPTED' LIMIT 1`, [eventId, session.userId]),
    query<(RowDataPacket & { status: string; checked_in_at: Date | null })[]>(`SELECT status, checked_in_at FROM event_participants WHERE event_id = ? AND user_id = ? LIMIT 1`, [eventId, session.userId]),
  ]);

  const isPrimaryHost = event.primary_host_id === session.userId;
  const eventPermissions = workspaceAccess.permissions;
  const hasEventWorkspaceAccess = ["HOST_EVENTS", "MANAGE_EVENTS", "APPROVE_EVENTS", "MANAGE_PARTICIPANTS", "MANAGE_BRACKETS"].some((permission) => eventPermissions.includes(permission as typeof eventPermissions[number]));
  const isEventManager = isPrimaryHost || hasEventWorkspaceAccess || Boolean(cohostAccess[0]);
  const restrictedStatus = event.status === "DRAFT" || event.status === "AWAITING_APPROVAL";
  const canView = restrictedStatus ? isEventManager : event.visibility === "PUBLIC" || event.visibility === "UNLISTED" || (event.visibility === "SERVER" && Boolean(event.user_in_guild)) || isEventManager || Boolean(participantAccess[0]);
  if (!canView) notFound();

  const connectionType = event.required_connection_type ?? event.platform_name;
  const [hostConnections, participants, cohosts, userConnections] = await Promise.all([
    connectionType ? query<ConnectionRow[]>(`SELECT id, connection_type, external_id, handle, display_name, profile_url, avatar_url FROM user_connections WHERE user_id = ? AND LOWER(connection_type) = LOWER(?) ORDER BY is_verified DESC, source ASC LIMIT 1`, [event.primary_host_id, connectionType]) : Promise.resolve([] as ConnectionRow[]),
    query<ParticipantRow[]>(
      `SELECT ep.user_id, ep.status, ep.checked_in_at, ep.game_identity_type, ep.game_identity_value,
              u.discord_id, u.username, u.global_name, u.avatar_hash,
              uc.external_id AS connection_external_id, uc.profile_url AS connection_profile_url,
              uc.avatar_url AS connection_avatar_url, uc.display_name AS connection_display_name
       FROM event_participants ep INNER JOIN users u ON u.id = ep.user_id
       LEFT JOIN user_connections uc ON uc.user_id = ep.user_id AND LOWER(uc.connection_type) = LOWER(ep.game_identity_type) AND LOWER(uc.handle) = LOWER(ep.game_identity_value)
       WHERE ep.event_id = ? AND ep.status NOT IN ('REJECTED', 'WITHDRAWN')
       ORDER BY FIELD(ep.status, 'APPROVED', 'PENDING', 'WAITLISTED', 'NO_SHOW', 'DISQUALIFIED'), ep.joined_at ASC`, [eventId],
    ),
    query<CohostRow[]>(`SELECT ec.id, ec.invited_discord_id, ec.permission_level, ec.status, u.username, u.global_name FROM event_cohosts ec LEFT JOIN users u ON u.id = ec.invited_user_id WHERE ec.event_id = ? ORDER BY ec.created_at DESC`, [eventId]),
    query<ConnectionRow[]>(`SELECT id, connection_type, external_id, handle, display_name, profile_url, avatar_url FROM user_connections WHERE user_id = ? AND is_visible = 1 ORDER BY connection_type, is_verified DESC`, [session.userId]),
  ]);

  const hostConnection = hostConnections[0] ?? null;
  const hostProfileUrl = hostConnection ? buildConnectionProfileUrl(hostConnection.connection_type, hostConnection.external_id, hostConnection.handle, hostConnection.profile_url) : null;
  const hostDiscordAvatar = getDiscordAvatarUrl(event.primary_host_discord_id, event.primary_host_avatar_hash);
  const canManageEvent = isPrimaryHost || eventPermissions.includes("MANAGE_EVENTS") || cohostAccess[0]?.permission_level === "FULL";
  const canApproveEvent = eventPermissions.includes("APPROVE_EVENTS");
  const canManageBracket = isPrimaryHost || eventPermissions.includes("MANAGE_BRACKETS") || ["FULL", "BRACKET"].includes(cohostAccess[0]?.permission_level ?? "");
  const participant = participantAccess[0] ?? null;
  const approvedCount = participants.filter((item) => item.status === "APPROVED").length;

  return (
    <div className="section-stack">
      <section className="event-hero">
        {event.game_thumbnail_url ? <img className="event-hero-image" src={event.game_thumbnail_url} alt="" /> : null}
        <div className="event-hero-content"><span className="eyebrow">{event.workspace_name}</span><h1>{event.name}</h1><p>{event.description ?? "No event description has been added yet."}</p><div className="button-row"><span className="badge">{event.status.replaceAll("_", " ")}</span>{event.platform_name ? <span className="badge">{event.platform_name}</span> : null}{event.subgame_name ? <span className="badge">{event.subgame_name}</span> : null}</div></div>
      </section>

      {canManageEvent ? <section className="panel section-stack"><div><h2>Event controls</h2><p className="muted">Publish the draft, open each event stage, or save this setup as a reusable template.</p></div><EventStatusControls eventId={eventId} status={event.status} canApprove={canApproveEvent} /><div className="button-row"><SaveEventTemplateButton eventId={eventId} defaultName={event.name} />{event.starts_at ? <a className="button button-secondary" href={`/api/events/${eventId}/calendar`}>Download calendar event</a> : null}</div></section> : null}

      <div className="dashboard-grid">
        <section className="panel"><h2>Event details</h2><div className="detail-list"><div><span>Platform</span><strong>{event.platform_name ?? "Not selected"}</strong></div><div><span>Game</span><strong>{event.subgame_name ?? event.game_name ?? "Not selected"}</strong></div><div><span>Starts in your time</span><strong><LocalDateTime value={iso(event.starts_at)} fallbackTimeZone={event.timezone} includeRelative /></strong></div><div><span>Signup deadline</span><strong><LocalDateTime value={iso(event.signup_deadline)} fallbackTimeZone={event.timezone} /></strong></div><div><span>Check-in opens</span><strong><LocalDateTime value={iso(event.check_in_opens_at)} fallbackTimeZone={event.timezone} /></strong></div><div><span>Check-in deadline</span><strong><LocalDateTime value={iso(event.check_in_deadline)} fallbackTimeZone={event.timezone} /></strong></div><div><span>Participants</span><strong>{approvedCount}{event.max_participants ? ` / ${event.max_participants}` : " · Unlimited"}</strong></div><div><span>Required identity</span><strong>{event.required_connection_type ? formatConnectionType(event.required_connection_type) : "None"}</strong></div><div><span>Visibility</span><strong>{event.visibility.replaceAll("_", " ")}</strong></div><div><span>Join code</span><strong>{event.join_code_required ? "Required" : "Not required"}</strong></div></div><div className="button-row detail-actions">{event.game_url ? <a className="button" href={event.game_url} target="_blank" rel="noreferrer">Open game</a> : null}{event.starts_at ? <a className="button button-secondary" href={`/api/events/${eventId}/calendar`}>Add to calendar</a> : null}</div></section>
        <section className="panel section-stack"><div><h2>Main host</h2><p className="muted">The game account is linked when the host has a matching visible identity.</p></div><div className="identity-card">{hostConnection?.avatar_url ? (hostProfileUrl ? <a href={hostProfileUrl} target="_blank" rel="noreferrer"><img className="identity-avatar" src={hostConnection.avatar_url} alt="" /></a> : <img className="identity-avatar" src={hostConnection.avatar_url} alt="" />) : hostDiscordAvatar ? <img className="identity-avatar" src={hostDiscordAvatar} alt="" /> : <div className="identity-avatar avatar-fallback">{event.primary_host_name.slice(0, 1)}</div>}<div>{hostConnection ? (hostProfileUrl ? <a className="identity-name text-link" href={hostProfileUrl} target="_blank" rel="noreferrer">{hostConnection.handle}</a> : <strong className="identity-name">{hostConnection.handle}</strong>) : <strong className="identity-name">{event.primary_host_name}</strong>}{hostConnection ? <span>{formatConnectionType(hostConnection.connection_type)}{hostConnection.display_name && hostConnection.display_name !== hostConnection.handle ? ` · ${hostConnection.display_name}` : ""}</span> : null}<span>Discord: @{event.primary_host_username}</span></div></div></section>
      </div>

      <section className="panel section-stack"><div><h2>Your event spot</h2><p className="muted">{canManageEvent ? "You can manage this event and still participate in it." : "Sign up with the game identity required by the host, then check in when it opens."}</p></div><EventSignupControls eventId={eventId} eventStatus={event.status} participantStatus={participant?.status ?? null} checkedIn={Boolean(participant?.checked_in_at)} joinCodeRequired={Boolean(event.join_code_required)} requiredConnectionType={event.required_connection_type} connections={userConnections} /></section>

      {event.bracket_enabled ? <section className="panel section-stack"><div><h2>Tournament bracket</h2><p className="muted">{event.bracket_format?.replaceAll("_", " ").toLowerCase()} · {event.bracket_seeding_mode?.toLowerCase()} placement{event.bracket_require_check_in ? " · checked-in participants only" : ""}</p></div><div className="workspace-card"><span className="card-kicker">{event.bracket_auto_generate ? "Automatic after signups" : "Host controlled"}</span><h3>{event.bracket_format === "THREE_PLAYER" ? "Three-player advancement" : "Single elimination"}</h3><p>Automatic byes, manual or random placement, shared drafts, winner advancement, and PNG export.</p></div>{canManageBracket ? <Link className="button" href={`/dashboard/tools/bracket?eventId=${eventId}`}>Open bracket manager</Link> : null}</section> : null}

      <section className="panel section-stack"><div className="section-header"><div><h2>Participants</h2><p>Game identity first, Discord identity underneath.</p></div><span className="badge">{participants.length} listed</span></div>{participants.length ? <div className="participant-card-grid">{participants.map((item) => { const gameName = item.game_identity_value ?? item.global_name ?? item.username; const gameProfile = item.game_identity_type ? buildConnectionProfileUrl(item.game_identity_type, item.connection_external_id, item.game_identity_value ?? item.username, item.connection_profile_url) : null; const avatar = item.connection_avatar_url ?? getDiscordAvatarUrl(item.discord_id, item.avatar_hash); return <article className="participant-card" key={item.user_id}>{avatar ? (gameProfile ? <a href={gameProfile} target="_blank" rel="noreferrer"><img className="identity-avatar" src={avatar} alt="" /></a> : <img className="identity-avatar" src={avatar} alt="" />) : <div className="identity-avatar avatar-fallback">{gameName.slice(0, 1)}</div>}<div>{gameProfile ? <a className="identity-name text-link" href={gameProfile} target="_blank" rel="noreferrer">{gameName}</a> : <strong className="identity-name">{gameName}</strong>}{item.game_identity_type ? <span>{formatConnectionType(item.game_identity_type)}</span> : null}<span>Discord: @{item.username}</span><div><span className="badge">{item.status.replaceAll("_", " ")}</span>{item.checked_in_at ? <span className="badge">Checked in</span> : null}</div></div></article>; })}</div> : <div className="empty-state">No participants have signed up yet.</div>}</section>

      <section className="panel section-stack"><div className="section-header"><div><h2>Co-hosts</h2><p>Invited users must accept before they can modify the event.</p></div></div>{cohosts.length ? <div className="event-grid">{cohosts.map((cohost) => <article className="event-card" key={cohost.id}><span className="card-kicker">{cohost.status}</span><h3>{cohost.global_name ?? cohost.username ?? cohost.invited_discord_id}</h3><p>{cohost.permission_level.replaceAll("_", " ")}</p></article>)}</div> : <div className="empty-state">No co-hosts have been invited.</div>}</section>

      {canManageEvent ? <section className="panel section-stack"><div className="section-header"><div><h2>Invite a co-host</h2><p>Search a Game Night Tools user by site username or Discord username, or enter a numeric Discord ID for someone who has not signed in yet.</p></div></div><CohostInviteForm eventId={eventId} /></section> : null}
    </div>
  );
}
