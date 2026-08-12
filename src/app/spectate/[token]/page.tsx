import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";
import { BracketViewer } from "@/components/bracket-viewer";
import { EventDescription } from "@/components/event-description";

type PublicEventRow = RowDataPacket & {
  event_id: string;
  name: string;
  description: string | null;
  game_name: string | null;
  platform_name: string | null;
  subgame_name: string | null;
  game_thumbnail_url: string | null;
  starts_at: Date | null;
  signup_deadline: Date | null;
  check_in_opens_at: Date | null;
  check_in_deadline: Date | null;
  timezone: string;
  event_status: string;
  visibility: string;
  bracket_format: string | null;
  bracket_entry_mode: "PLAYER" | "TEAM";
  bracket_seeding_mode: string | null;
  max_participants: number | null;
  bracket_status: string | null;
  settings_json: string | null;
  workspace_name: string;
  primary_host_name: string;
  cohost_names: string | null;
  entrant_count: number;
};

function iso(value: Date | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

async function loadSpectatorLink(token: string): Promise<PublicEventRow | null> {
  if (!/^[a-f0-9]{48}$/i.test(token)) return null;
  const rows = await query<PublicEventRow[]>(
    `SELECT e.id AS event_id, e.name, e.description, e.game_name, e.platform_name, e.subgame_name,
            e.game_thumbnail_url, e.starts_at, e.signup_deadline, e.check_in_opens_at, e.check_in_deadline,
            e.timezone, e.status AS event_status, e.visibility, e.bracket_format, e.bracket_entry_mode,
            e.bracket_seeding_mode, e.max_participants,
            b.status AS bracket_status, b.settings_json, w.name AS workspace_name,
            COALESCE(host.global_name, host.username) AS primary_host_name,
            (SELECT GROUP_CONCAT(COALESCE(cu.global_name, cu.username) ORDER BY ec.created_at SEPARATOR '|||')
             FROM event_cohosts ec INNER JOIN users cu ON cu.id = ec.invited_user_id
             WHERE ec.event_id = e.id AND ec.status = 'ACCEPTED') AS cohost_names,
            CASE WHEN e.bracket_entry_mode = 'TEAM'
              THEN (SELECT COUNT(*) FROM event_team_entries ete WHERE ete.event_id = e.id AND ete.status = 'REGISTERED')
              ELSE (SELECT COUNT(*) FROM event_participants ep WHERE ep.event_id = e.id AND ep.status = 'APPROVED')
            END AS entrant_count
     FROM event_public_share_links s
     INNER JOIN events e ON e.id = s.event_id
     INNER JOIN workspaces w ON w.id = e.workspace_id
     INNER JOIN users host ON host.id = e.primary_host_id
     LEFT JOIN brackets b ON b.event_id = e.id
     WHERE s.token = ? AND s.is_enabled = 1
       AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP(3))
     LIMIT 1`,
    [token],
  );
  return rows[0] ?? null;
}

function canShowCompetition(event: PublicEventRow): boolean {
  return ["LIVE", "COMPLETED"].includes(event.event_status)
    && ["LIVE", "COMPLETED"].includes(event.bracket_status ?? "")
    && Boolean(event.settings_json);
}

function unavailableCopy(event: PublicEventRow): { title: string; message: string } {
  if (event.event_status === "CANCELLED") {
    return {
      title: "Event cancelled",
      message: "This spectator view is no longer active because the event was cancelled.",
    };
  }
  if (event.event_status === "POSTPONED") {
    return {
      title: "Event postponed",
      message: "This tournament is postponed. The competition will appear here once the event goes live again.",
    };
  }
  if (["DRAFT", "AWAITING_APPROVAL", "SIGNUPS_OPEN", "SIGNUPS_CLOSED", "CHECK_IN_OPEN"].includes(event.event_status)
    || !["LIVE", "COMPLETED"].includes(event.bracket_status ?? "")) {
    return {
      title: "Tournament not live yet",
      message: "This spectator link is valid, but public competition results stay hidden until both the event and tournament are live.",
    };
  }
  return {
    title: "Spectator view unavailable",
    message: "This spectator link is valid, but the competition is not currently available for public viewing.",
  };
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const event = await loadSpectatorLink(token);
  if (!event) return { title: "Spectator link unavailable" };
  if (!canShowCompetition(event)) return { title: `${event.name} · Spectator View` };
  return {
    title: `${event.name} · Live Tournament`,
    description: `Follow the ${event.name} competition hosted by ${event.workspace_name}.`,
  };
}

export default async function SpectatorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const event = await loadSpectatorLink(token);
  if (!event) notFound();

  const gameName = event.subgame_name ?? event.game_name ?? event.platform_name ?? "Game Night";
  const publicReady = canShowCompetition(event);

  if (!publicReady) {
    const copy = unavailableCopy(event);
    return (
      <main className="public-spectator-shell">
        <header className="public-spectator-header">
          <Link className="brand-mark" href="/">Game Night Tools</Link>
          <span className="badge">Public spectator view</span>
        </header>
        <div className="public-spectator-content section-stack">
          <section className="panel section-stack">
            <span className="eyebrow">{event.workspace_name} · {gameName}</span>
            <h1>{copy.title}</h1>
            <p>{copy.message}</p>
            <div className="button-row">
              <span className="badge">Event: {event.event_status.replaceAll("_", " ")}</span>
              {event.bracket_status ? <span className="badge">Competition: {event.bracket_status.replaceAll("_", " ")}</span> : null}
            </div>
          </section>
        </div>
      </main>
    );
  }

  let state: unknown = null;
  try { state = JSON.parse(event.settings_json ?? "null"); } catch { state = null; }
  if (!state) notFound();

  const descriptionContext = {
    eventName: event.name,
    eventStart: iso(event.starts_at),
    signupDeadline: iso(event.signup_deadline),
    checkInOpensAt: iso(event.check_in_opens_at),
    checkInDeadline: iso(event.check_in_deadline),
    timezone: event.timezone,
    game: gameName,
    platform: event.platform_name,
    format: event.bracket_format,
    entrantMode: event.bracket_entry_mode,
    seedingMode: event.bracket_seeding_mode,
    status: event.event_status,
    visibility: event.visibility,
    host: event.primary_host_name,
    cohosts: event.cohost_names ? event.cohost_names.split("|||").filter(Boolean) : [],
    participants: Number(event.entrant_count ?? 0),
    maxParticipants: event.max_participants,
    workspace: event.workspace_name,
  };

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
            {event.description ? <EventDescription text={event.description} context={descriptionContext} className="spectator-event-description" /> : null}
            <div className="button-row">
              <span className="badge">{event.bracket_status?.replaceAll("_", " ")}</span>
              {event.starts_at ? <span className="badge">Started {new Date(event.starts_at).toLocaleString()}</span> : null}
            </div>
          </div>
        </section>
        <section className="panel section-stack">
          <div className="rule-callout"><strong>Spectator-only access</strong><p>This link shows the competition and confirmed public results only. Signups, staff tools, result proof, disputes, private notes, and account information are never exposed here.</p></div>
          <BracketViewer state={state} status={event.bracket_status ?? "LIVE"} />
        </section>
      </div>
    </main>
  );
}
