import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { canHost, canManageCodes, getWorkspaceRole } from "@/lib/access";
import { query } from "@/lib/db";
import { CreateEventForm } from "@/components/create-event-form";
import { GenerateCodeForm } from "@/components/generate-code-form";
import { LocalDateTime } from "@/components/local-date-time";
import { WorkspaceProfileForm } from "@/components/workspace-profile-form";

type WorkspaceRow = RowDataPacket & {
  id: string;
  discord_guild_id: string;
  name: string;
  description: string | null;
  timezone: string;
  bot_connected: number;
  user_in_guild: number;
  discord_invite_url: string | null;
  main_game_category: string | null;
  roblox_community_url: string | null;
  roblox_community_name: string | null;
};

type EventRow = RowDataPacket & {
  id: string;
  name: string;
  game_name: string | null;
  platform_name: string | null;
  subgame_name: string | null;
  game_thumbnail_url: string | null;
  status: string;
  starts_at: Date | null;
  visibility: string;
};

type GameRow = RowDataPacket & {
  id: string;
  platform_name: string;
  game_name: string;
  game_url: string | null;
  external_id: string | null;
  universe_id: string | null;
  thumbnail_url: string | null;
  is_primary: number;
};

type TemplateRow = RowDataPacket & {
  id: string;
  name: string;
  configuration_json: string;
};

export default async function WorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await requireSession();
  const { workspaceId } = await params;
  const role = await getWorkspaceRole(session.userId, workspaceId);

  const workspaces = await query<WorkspaceRow[]>(
    `SELECT w.id, w.discord_guild_id, w.name, w.description, w.timezone, w.bot_connected,
            w.discord_invite_url, w.main_game_category, w.roblox_community_url,
            w.roblox_community_name,
            EXISTS(
              SELECT 1 FROM user_guilds ug
              WHERE ug.user_id = ? AND ug.guild_id = w.discord_guild_id
            ) AS user_in_guild
     FROM workspaces w WHERE w.id = ? LIMIT 1`,
    [session.userId, workspaceId],
  );
  const workspace = workspaces[0];
  if (!workspace) notFound();
  if (!role && !workspace.user_in_guild) notFound();

  const canSeeRestricted = canHost(role);
  const [events, games, templates] = await Promise.all([
    query<EventRow[]>(
      `SELECT id, name, game_name, platform_name, subgame_name, game_thumbnail_url,
              status, starts_at, visibility
       FROM events
       WHERE workspace_id = ?
         AND (? = 1 OR (
           status NOT IN ('DRAFT', 'AWAITING_APPROVAL')
           AND visibility IN ('SERVER', 'PUBLIC')
         ))
       ORDER BY COALESCE(starts_at, '9999-12-31') ASC`,
      [workspaceId, canSeeRestricted ? 1 : 0],
    ),
    query<GameRow[]>(
      `SELECT id, platform_name, game_name, game_url, external_id, universe_id,
              thumbnail_url, is_primary
       FROM workspace_games WHERE workspace_id = ?
       ORDER BY is_primary DESC, sort_order ASC, game_name ASC`,
      [workspaceId],
    ),
    canHost(role) ? query<TemplateRow[]>(
      `SELECT id, name, configuration_json
       FROM event_templates
       WHERE workspace_id = ? AND (is_shared = 1 OR created_by = ?)
       ORDER BY name ASC`,
      [workspaceId, session.userId],
    ) : Promise.resolve([] as TemplateRow[]),
  ]);

  const templateOptions = templates.flatMap((template) => {
    try {
      return [{ id: template.id, name: template.name, configuration: JSON.parse(template.configuration_json) }];
    } catch {
      return [];
    }
  });
  const canEditProfile = role === "OWNER" || role === "ADMIN";

  return (
    <div className="section-stack">
      <section className="workspace-hero">
        <div>
          <span className="eyebrow">{role ?? "Discord server member"}</span>
          <h1>{workspace.name}</h1>
          <p>{workspace.description ?? "This server has not added a description yet."}</p>
          <div className="button-row">
            {workspace.main_game_category ? <span className="badge">Main category: {workspace.main_game_category}</span> : null}
            <span className="badge">Bot {workspace.bot_connected ? "connected" : "optional / not connected"}</span>
          </div>
        </div>
        <div className="button-row">
          {workspace.discord_invite_url ? <a className="button" href={workspace.discord_invite_url} target="_blank" rel="noreferrer">Join Discord</a> : null}
          {workspace.roblox_community_url ? <a className="button button-secondary" href={workspace.roblox_community_url} target="_blank" rel="noreferrer">{workspace.roblox_community_name ? `View ${workspace.roblox_community_name}` : "View Roblox community"}</a> : null}
        </div>
      </section>

      {games.length ? (
        <section className="panel section-stack">
          <div className="section-header"><div><h2>Server games</h2><p>Hosts can reuse these games and imported thumbnails when creating events.</p></div></div>
          <div className="saved-game-grid">
            {games.map((game) => (
              <article className="saved-game-card" key={game.id}>
                {game.thumbnail_url ? <img src={game.thumbnail_url} alt="" /> : <div className="game-image-fallback">{game.platform_name}</div>}
                <div>
                  <span className="card-kicker">{game.platform_name}{game.is_primary ? " · PRIMARY" : ""}</span>
                  <h3>{game.game_name}</h3>
                  {game.game_url ? <a className="button button-secondary" href={game.game_url} target="_blank" rel="noreferrer">Open game</a> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel section-stack">
        <div className="section-header"><div><h2>Server events</h2><p>Members see published server events. Staff and hosts also see drafts and restricted events.</p></div></div>
        {events.length ? (
          <div className="event-grid">
            {events.map((event) => (
              <Link className="event-card event-card-media" href={`/dashboard/events/${event.id}`} key={event.id}>
                {event.game_thumbnail_url ? <img src={event.game_thumbnail_url} alt="" /> : null}
                <div>
                  <span className="card-kicker">{event.status.replaceAll("_", " ")}</span>
                  <h3>{event.name}</h3>
                  <p>{event.subgame_name ?? event.game_name ?? event.platform_name ?? "Game not selected"}</p>
                  <p><LocalDateTime value={event.starts_at ? new Date(event.starts_at).toISOString() : null} fallbackTimeZone={workspace.timezone} /></p>
                  <span className="badge">{event.visibility}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : <div className="empty-state">No events have been created for this server yet.</div>}
      </section>

      {canHost(role) ? (
        <section className="panel section-stack">
          <div className="section-header"><div><h2>Create an event</h2><p>Build a draft, preview it, then publish signups or submit it for staff approval.</p></div></div>
          <CreateEventForm workspaceId={workspaceId} defaultTimezone={workspace.timezone} templates={templateOptions} workspaceGames={games} />
        </section>
      ) : null}

      {canEditProfile ? (
        <section className="panel section-stack">
          <div className="section-header"><div><h2>Edit server profile</h2><p>Add your Discord invite, main game category, Roblox community, and reusable games.</p></div></div>
          <WorkspaceProfileForm
            workspaceId={workspaceId}
            initial={{
              description: workspace.description ?? "",
              timezone: workspace.timezone,
              discordInviteUrl: workspace.discord_invite_url ?? "",
              mainGameCategory: workspace.main_game_category ?? "",
              robloxCommunityName: workspace.roblox_community_name ?? "",
              robloxCommunityUrl: workspace.roblox_community_url ?? "",
            }}
            savedGames={games}
          />
        </section>
      ) : null}

      {canManageCodes(role) ? (
        <section className="panel section-stack">
          <div className="section-header"><div><h2>Generate access codes</h2><p>Choose permanent, temporary, one-time, or limited-use access by setting expiration and maximum uses.</p></div></div>
          <GenerateCodeForm workspaceId={workspaceId} events={events.map(({ id, name }) => ({ id, name }))} />
        </section>
      ) : null}
    </div>
  );
}
