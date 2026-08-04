import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { canHost, canManageCodes, getWorkspaceRole } from "@/lib/access";
import { query } from "@/lib/db";
import { CreateEventForm } from "@/components/create-event-form";
import { GenerateCodeForm } from "@/components/generate-code-form";

type WorkspaceRow = RowDataPacket & {
  id: string;
  discord_guild_id: string;
  name: string;
  description: string | null;
  timezone: string;
  bot_connected: number;
  user_in_guild: number;
};

type EventRow = RowDataPacket & {
  id: string;
  name: string;
  game_name: string | null;
  status: string;
  starts_at: Date | null;
  visibility: string;
};

export default async function WorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await requireSession();
  const { workspaceId } = await params;
  const role = await getWorkspaceRole(session.userId, workspaceId);

  const workspaces = await query<WorkspaceRow[]>(
    `SELECT w.id, w.discord_guild_id, w.name, w.description, w.timezone, w.bot_connected,
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

  const events = await query<EventRow[]>(
    `SELECT id, name, game_name, status, starts_at, visibility
     FROM events
     WHERE workspace_id = ?
       AND (? IS NOT NULL OR visibility IN ('SERVER', 'PUBLIC'))
     ORDER BY COALESCE(starts_at, '9999-12-31') ASC`,
    [workspaceId, role],
  );

  return (
    <div className="section-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">{role ?? "Discord server member"}</span>
          <h1>{workspace.name}</h1>
          <p>{workspace.description ?? "This server has not added a description yet."}</p>
        </div>
        <span className="badge">Bot {workspace.bot_connected ? "connected" : "optional / not connected"}</span>
      </section>

      <section className="panel section-stack">
        <div className="section-header">
          <div>
            <h2>Server events</h2>
            <p>Members see server-visible events. Staff and hosts can also see drafts and restricted events.</p>
          </div>
        </div>
        {events.length ? (
          <div className="event-grid">
            {events.map((event) => (
              <Link className="event-card" href={`/dashboard/events/${event.id}`} key={event.id}>
                <span className="card-kicker">{event.status.replaceAll("_", " ")}</span>
                <h3>{event.name}</h3>
                <p>{event.game_name ?? "Game not selected"}</p>
                <p>{event.starts_at ? new Date(event.starts_at).toLocaleString() : "Not scheduled"}</p>
                <span className="badge">{event.visibility}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">No events have been created for this server yet.</div>
        )}
      </section>

      {canHost(role) ? (
        <section className="panel section-stack">
          <div className="section-header">
            <div>
              <h2>Create an event</h2>
              <p>Approved hosts may need staff approval before their event can open signups.</p>
            </div>
          </div>
          <CreateEventForm workspaceId={workspaceId} />
        </section>
      ) : null}

      {canManageCodes(role) ? (
        <section className="panel section-stack">
          <div className="section-header">
            <div>
              <h2>Generate access codes</h2>
              <p>Choose permanent, temporary, one-time, or limited-use access by setting expiration and maximum uses.</p>
            </div>
          </div>
          <GenerateCodeForm workspaceId={workspaceId} events={events.map(({ id, name }) => ({ id, name }))} />
        </section>
      ) : null}
    </div>
  );
}
