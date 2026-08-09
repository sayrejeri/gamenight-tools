import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";
import { BracketViewer } from "@/components/bracket-viewer";

type PublicEventRow = RowDataPacket & {
  event_id: string;
  name: string;
  description: string | null;
  game_name: string | null;
  platform_name: string | null;
  subgame_name: string | null;
  game_thumbnail_url: string | null;
  starts_at: Date | null;
  timezone: string;
  bracket_format: string | null;
  bracket_status: string | null;
  settings_json: string | null;
  workspace_name: string;
};

async function loadPublicEvent(token: string): Promise<PublicEventRow | null> {
  if (!/^[a-f0-9]{48}$/i.test(token)) return null;
  const rows = await query<PublicEventRow[]>(
    `SELECT e.id AS event_id, e.name, e.description, e.game_name, e.platform_name, e.subgame_name,
            e.game_thumbnail_url, e.starts_at, e.timezone, e.bracket_format,
            b.status AS bracket_status, b.settings_json, w.name AS workspace_name
     FROM event_public_share_links s
     INNER JOIN events e ON e.id = s.event_id
     INNER JOIN workspaces w ON w.id = e.workspace_id
     INNER JOIN brackets b ON b.event_id = e.id
     WHERE s.token = ? AND s.is_enabled = 1
       AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP(3))
       AND b.status IN ('LIVE', 'COMPLETED')
       AND e.status NOT IN ('CANCELLED', 'DRAFT', 'AWAITING_APPROVAL')
     LIMIT 1`,
    [token],
  );
  return rows[0] ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const event = await loadPublicEvent(token);
  if (!event) return { title: "Spectator link unavailable" };
  return {
    title: `${event.name} · Live Tournament`,
    description: `Follow the ${event.name} competition hosted by ${event.workspace_name}.`,
  };
}

export default async function SpectatorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const event = await loadPublicEvent(token);
  if (!event || !event.settings_json || !event.bracket_status) notFound();

  let state: unknown = null;
  try { state = JSON.parse(event.settings_json); } catch { state = null; }
  const gameName = event.subgame_name ?? event.game_name ?? event.platform_name ?? "Game Night";

  return (
    <main className="public-spectator-shell">
      <header className="public-spectator-header">
        <Link className="brand-mark" href="/">Game Night Tools</Link>
        <span className="badge">Public spectator view</span>
      </header>
      <div className="public-spectator-content section-stack">
        <section className="spectator-hero">
          {event.game_thumbnail_url ? <img src={event.game_thumbnail_url} alt="" /> : null}
          <div>
            <span className="eyebrow">{event.workspace_name} · {gameName}</span>
            <h1>{event.name}</h1>
            {event.description ? <p>{event.description}</p> : null}
            <div className="button-row">
              <span className="badge">{event.bracket_status.replaceAll("_", " ")}</span>
              {event.starts_at ? <span className="badge">Started {new Date(event.starts_at).toLocaleString()}</span> : null}
            </div>
          </div>
        </section>
        <section className="panel section-stack">
          <div className="rule-callout"><strong>Spectator-only access</strong><p>This link shows the competition and confirmed public results only. Signups, staff tools, result proof, disputes, private notes, and account information are never exposed here.</p></div>
          <BracketViewer state={state} status={event.bracket_status} />
        </section>
      </div>
    </main>
  );
}
