import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { getWorkspaceRole } from "@/lib/access";
import { query } from "@/lib/db";
import { getWorkspacePermissionSnapshot } from "@/lib/permissions";
import { getEffectivePermissions, parsePermissionOverrides, WORKSPACE_PERMISSIONS, WORKSPACE_ROLE_DEFAULTS, type WorkspacePermission } from "@/lib/permission-catalog";
import { CreateEventForm } from "@/components/create-event-form";
import { GenerateCodeForm } from "@/components/generate-code-form";
import { LocalDateTime } from "@/components/local-date-time";
import { WorkspaceProfileForm } from "@/components/workspace-profile-form";
import { WorkspaceWebhookForm } from "@/components/workspace-webhook-form";
import { WorkspaceMemberManager } from "@/components/workspace-member-manager";

type WorkspaceRow = RowDataPacket & {
  id: string; discord_guild_id: string; name: string; icon_url: string | null; banner_url: string | null;
  description: string | null; timezone: string; bot_connected: number; user_in_guild: number; member_role: string | null;
  discord_invite_url: string | null; main_game_category: string | null; roblox_community_url: string | null;
  roblox_community_name: string | null; profile_status: string; verification_level: string | null; chat_enabled: number; suggestions_enabled: number;
};
type EventRow = RowDataPacket & { id: string; name: string; game_name: string | null; platform_name: string | null; subgame_name: string | null; game_thumbnail_url: string | null; status: string; starts_at: Date | null; visibility: string };
type GameRow = RowDataPacket & { id: string; platform_name: string; game_name: string; game_url: string | null; external_id: string | null; universe_id: string | null; thumbnail_url: string | null; is_primary: number };
type TemplateRow = RowDataPacket & { id: string; name: string; configuration_json: string };
type WebhookRow = RowDataPacket & { id: string; label: string; url_hint: string; notification_types_json: string | null; username_override: string | null; avatar_url: string | null; is_active: number; last_success_at: Date | null; last_error_message: string | null };
type MemberRow = RowDataPacket & { user_id: string; role: string; display_label: string | null; permissions_json: string | null; status: string; expires_at: Date | null; notes: string | null; discord_id: string; discord_username: string; site_username: string | null; display_name: string; avatar_url: string | null; last_changed_at: Date | null; last_changed_by_name: string | null };
type OwnerClaimRow = RowDataPacket & { discord_id: string; created_at: Date; active_user_id: string | null };

function parseNotificationTypes(value: string | null): string[] {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; }
  catch { return []; }
}

function memberEffectivePermissions(member: MemberRow): WorkspacePermission[] {
  const defaults = [...(WORKSPACE_ROLE_DEFAULTS[member.role] ?? [])] as WorkspacePermission[];
  return getEffectivePermissions(defaults, parsePermissionOverrides(member.permissions_json, WORKSPACE_PERMISSIONS), WORKSPACE_PERMISSIONS);
}

export default async function WorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await requireSession();
  const { workspaceId } = await params;
  const [role, access] = await Promise.all([
    getWorkspaceRole(session.userId, workspaceId),
    getWorkspacePermissionSnapshot(session.userId, workspaceId),
  ]);

  const workspaces = await query<WorkspaceRow[]>(
    `SELECT w.id, w.discord_guild_id, w.name, w.icon_url, w.banner_url, w.description,
            w.timezone, w.bot_connected, w.discord_invite_url, w.main_game_category,
            w.roblox_community_url, w.roblox_community_name, w.profile_status,
            w.verification_level, w.chat_enabled, w.suggestions_enabled,
            (SELECT wm.role FROM workspace_members wm WHERE wm.workspace_id = w.id AND wm.user_id = ? AND wm.status = 'ACTIVE' LIMIT 1) AS member_role,
            EXISTS(SELECT 1 FROM user_guilds ug WHERE ug.user_id = ? AND ug.guild_id = w.discord_guild_id) AS user_in_guild
     FROM workspaces w WHERE w.id = ? LIMIT 1`,
    [session.userId, session.userId, workspaceId],
  );
  const workspace = workspaces[0];
  if (!workspace || workspace.profile_status === "SUSPENDED" || workspace.profile_status === "ARCHIVED") notFound();
  if (!role && !workspace.user_in_guild && !access.permissions.length) notFound();

  const canHostEvents = access.permissions.includes("HOST_EVENTS");
  const canManageEvents = access.permissions.includes("MANAGE_EVENTS");
  const canEditProfile = access.permissions.includes("MANAGE_SERVER_PROFILE");
  const canManageMembers = access.permissions.includes("MANAGE_MEMBERS");
  const canManageWebhooks = access.permissions.includes("MANAGE_WEBHOOKS");
  const canManageCodes = access.permissions.includes("MANAGE_CODES");
  const canSeeRestricted = canHostEvents || canManageEvents;
  const displayedRole = access.displayLabel ?? workspace.member_role ?? role ?? "DISCORD SERVER MEMBER";

  const [events, games, templates, webhooks, members, ownerClaims] = await Promise.all([
    query<EventRow[]>(
      `SELECT id, name, game_name, platform_name, subgame_name, game_thumbnail_url, status, starts_at, visibility
       FROM events WHERE workspace_id = ? AND (? = 1 OR (status NOT IN ('DRAFT', 'AWAITING_APPROVAL') AND visibility IN ('SERVER', 'PUBLIC')))
       ORDER BY COALESCE(starts_at, '9999-12-31') ASC`,
      [workspaceId, canSeeRestricted ? 1 : 0],
    ),
    query<GameRow[]>(
      `SELECT id, platform_name, game_name, game_url, external_id, universe_id, thumbnail_url, is_primary
       FROM workspace_games WHERE workspace_id = ? ORDER BY is_primary DESC, sort_order ASC, game_name ASC`,
      [workspaceId],
    ),
    canHostEvents ? query<TemplateRow[]>(
      `SELECT id, name, configuration_json FROM event_templates
       WHERE workspace_id = ? AND (is_shared = 1 OR created_by = ?) ORDER BY name ASC`,
      [workspaceId, session.userId],
    ) : Promise.resolve([] as TemplateRow[]),
    canManageWebhooks ? query<WebhookRow[]>(
      `SELECT id, label, url_hint, notification_types_json, username_override, avatar_url, is_active, last_success_at, last_error_message
       FROM workspace_webhooks WHERE workspace_id = ? ORDER BY created_at DESC`,
      [workspaceId],
    ) : Promise.resolve([] as WebhookRow[]),
    canManageMembers ? query<MemberRow[]>(
      `SELECT wm.user_id, wm.role, wm.display_label, wm.permissions_json, wm.status, wm.expires_at, wm.notes,
              u.discord_id, u.username AS discord_username, u.site_username, COALESCE(u.global_name, u.username) AS display_name,
              CASE WHEN u.avatar_hash IS NULL THEN NULL ELSE CONCAT('https://cdn.discordapp.com/avatars/', u.discord_id, '/', u.avatar_hash, '.png?size=128') END AS avatar_url,
              wm.last_changed_at, COALESCE(changer.site_username, changer.global_name, changer.username) AS last_changed_by_name
       FROM workspace_members wm
       INNER JOIN users u ON u.id = wm.user_id
       LEFT JOIN users changer ON changer.id = wm.last_changed_by
       WHERE wm.workspace_id = ? AND wm.status <> 'REMOVED'
       ORDER BY FIELD(wm.role, 'OWNER', 'ADMIN', 'STAFF', 'HOST', 'REFEREE', 'VIEWER'), display_name`,
      [workspaceId],
    ) : Promise.resolve([] as MemberRow[]),
    canManageMembers ? query<OwnerClaimRow[]>(
      `SELECT claim.discord_id, claim.created_at, CAST(u.id AS CHAR) AS active_user_id
       FROM workspace_owner_claims claim LEFT JOIN users u ON u.discord_id = claim.discord_id
       WHERE claim.workspace_id = ? ORDER BY claim.created_at ASC`,
      [workspaceId],
    ) : Promise.resolve([] as OwnerClaimRow[]),
  ]);

  const templateOptions = templates.flatMap((template) => {
    try { return [{ id: template.id, name: template.name, configuration: JSON.parse(template.configuration_json) }]; }
    catch { return []; }
  });

  return (
    <div className="section-stack">
      <section className="workspace-hero workspace-hero-banner" style={workspace.banner_url ? { backgroundImage: `linear-gradient(90deg, rgba(9,11,18,.95), rgba(9,11,18,.58)), url(${workspace.banner_url})` } : undefined}>
        <div className="organization-hero-main">
          {workspace.icon_url ? <img className="organization-hero-logo" src={workspace.icon_url} alt="" /> : <span className="organization-hero-logo organization-logo-fallback">{workspace.name.slice(0, 2)}</span>}
          <div><span className="eyebrow">{displayedRole}</span><h1>{workspace.name}</h1><p>{workspace.description ?? "This server has not added a description yet."}</p><div className="button-row">{workspace.main_game_category ? <span className="badge">Main game: {workspace.main_game_category}</span> : null}{workspace.verification_level ? <span className="badge">Verified: {workspace.verification_level.replaceAll("_", " ")}</span> : null}<span className="badge">Discord bot: optional</span><span className="badge">Discord webhooks: supported</span>{access.source ? <span className="badge">Access: {access.source.toLowerCase()}</span> : null}</div></div>
        </div>
        <div className="button-row">{workspace.discord_invite_url ? <a className="button" href={workspace.discord_invite_url} target="_blank" rel="noreferrer">Join Discord</a> : null}{workspace.roblox_community_url ? <a className="button button-secondary" href={workspace.roblox_community_url} target="_blank" rel="noreferrer">{workspace.roblox_community_name ? `View ${workspace.roblox_community_name}` : "View Roblox community"}</a> : null}</div>
      </section>

      {games.length ? <section className="panel section-stack"><div className="section-header"><div><h2>Server games</h2><p>Hosts can reuse these games and imported thumbnails when creating events.</p></div><span className="badge dashboard-count">{games.length} saved</span></div><div className="saved-game-grid">{games.map((game) => <article className="saved-game-card" key={game.id}>{game.thumbnail_url ? <img src={game.thumbnail_url} alt="" /> : <div className="game-image-fallback">{game.platform_name}</div>}<div><span className="card-kicker">{game.platform_name}{game.is_primary ? " · PRIMARY" : ""}</span><h3>{game.game_name}</h3>{game.game_url ? <a className="button button-secondary" href={game.game_url} target="_blank" rel="noreferrer">Open game</a> : null}</div></article>)}</div></section> : null}

      <section className="panel section-stack"><div className="section-header"><div><h2>Server events</h2><p>Members see published events. People with event permissions also see drafts and restricted events.</p></div><span className="badge dashboard-count">{events.length} events</span></div>{events.length ? <div className="event-grid">{events.map((event) => <Link className="event-card event-card-media" href={`/dashboard/events/${event.id}`} key={event.id}>{event.game_thumbnail_url ? <img src={event.game_thumbnail_url} alt="" /> : null}<div><span className="card-kicker">{event.status.replaceAll("_", " ")}</span><h3>{event.name}</h3><p>{event.subgame_name ?? event.game_name ?? event.platform_name ?? "Game not selected"}</p><p><LocalDateTime value={event.starts_at ? new Date(event.starts_at).toISOString() : null} fallbackTimeZone={workspace.timezone} /></p><span className="badge">{event.visibility}</span></div></Link>)}</div> : <div className="empty-state">No events have been created for this server yet.</div>}</section>

      {canHostEvents ? <section className="panel section-stack"><div className="section-header"><div><h2>Create an event</h2><p>Build a draft, preview it, then publish signups or submit it for approval.</p></div></div><CreateEventForm workspaceId={workspaceId} workspaceName={workspace.name} defaultTimezone={workspace.timezone} templates={templateOptions} workspaceGames={games} /></section> : null}

      {canEditProfile ? <section className="panel section-stack"><div className="section-header"><div><h2>Edit server profile</h2><p>Edit branding, links, games, and community settings according to your assigned permissions.</p></div></div><WorkspaceProfileForm workspaceId={workspaceId} initial={{ description: workspace.description ?? "", timezone: workspace.timezone, iconUrl: workspace.icon_url ?? "", bannerUrl: workspace.banner_url ?? "", discordInviteUrl: workspace.discord_invite_url ?? "", mainGameCategory: workspace.main_game_category ?? "", robloxCommunityName: workspace.roblox_community_name ?? "", robloxCommunityUrl: workspace.roblox_community_url ?? "", chatEnabled: Boolean(workspace.chat_enabled), suggestionsEnabled: Boolean(workspace.suggestions_enabled) }} savedGames={games} /></section> : null}

      {canManageMembers && role ? <section className="panel section-stack"><div className="section-header"><div><h2>Server access management</h2><p>Roles are labels and presets. Permissions below control what each person can actually do.</p></div><Link className="button button-secondary" href={`/dashboard/audit?workspace=${encodeURIComponent(workspaceId)}`}>Audit log</Link></div><WorkspaceMemberManager workspaceId={workspaceId} actorRole={role} members={members.map((member) => ({ userId: member.user_id, displayName: member.display_name, siteUsername: member.site_username, discordId: member.discord_id, discordUsername: member.discord_username, role: member.role, displayLabel: member.display_label, status: member.status, avatarUrl: member.avatar_url, expiresAt: member.expires_at ? new Date(member.expires_at).toISOString() : null, notes: member.notes, permissions: memberEffectivePermissions(member), lastChangedAt: member.last_changed_at ? new Date(member.last_changed_at).toISOString() : null, lastChangedBy: member.last_changed_by_name }))} ownerClaims={ownerClaims.map((claim) => ({ discordId: claim.discord_id, createdAt: new Date(claim.created_at).toISOString(), activeUserId: claim.active_user_id }))} /></section> : null}

      {canManageWebhooks ? <section className="panel section-stack"><div className="section-header"><div><h2>Discord webhooks</h2><p>Add multiple destinations and edit, disable, test, or replace each webhook independently.</p></div><span className="badge dashboard-count">{webhooks.length} connected</span></div><WorkspaceWebhookForm workspaceId={workspaceId} webhooks={webhooks.map((webhook) => ({ id: webhook.id, label: webhook.label, urlHint: webhook.url_hint, notificationTypes: parseNotificationTypes(webhook.notification_types_json), usernameOverride: webhook.username_override, avatarUrl: webhook.avatar_url, isActive: Boolean(webhook.is_active), lastSuccessAt: webhook.last_success_at ? new Date(webhook.last_success_at).toISOString() : null, lastErrorMessage: webhook.last_error_message }))} /></section> : null}

      {canManageCodes ? <section className="panel section-stack"><div className="section-header"><div><h2>Generate access codes</h2><p>Choose permanent, temporary, one-time, or limited-use access by setting expiration and maximum uses.</p></div></div><GenerateCodeForm workspaceId={workspaceId} events={events.map(({ id, name }) => ({ id, name }))} /></section> : null}
    </div>
  );
}
