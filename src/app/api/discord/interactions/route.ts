import { after, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";
import { verifyDiscordInteractionSignature } from "@/lib/discord-bot";
import { loadPlayerLeaderboard, loadTeamLeaderboard } from "@/lib/competitive-stats";

type DiscordOption = {
  type: number;
  name: string;
  value?: string | number | boolean;
  options?: DiscordOption[];
};
type DiscordInteraction = {
  type: number;
  application_id?: string;
  token?: string;
  guild_id?: string;
  data?: {
    name?: string;
    options?: DiscordOption[];
  };
};

type WorkspaceRow = RowDataPacket & { id: string; name: string; discord_guild_id: string };
type CountRow = RowDataPacket & { total: number };
type EventRow = RowDataPacket & { id: string; name: string; status: string; starts_at: Date | null };
type MatchRow = RowDataPacket & {
  id: string;
  event_id: string;
  event_name: string;
  round_number: number;
  match_number: number;
  status: string;
  scheduled_at: Date | null;
  a_name: string | null;
  b_name: string | null;
  c_name: string | null;
};
type BracketRow = RowDataPacket & { event_id: string; event_name: string; event_status: string; bracket_status: string; format: string };

function interactionMessage(content: string, ephemeral = true) {
  return NextResponse.json({
    type: 4,
    data: {
      content: content.slice(0, 1950),
      flags: ephemeral ? 64 : 0,
      allowed_mentions: { parse: [] },
    },
  });
}

function deferredEphemeralResponse() {
  return NextResponse.json({ type: 5, data: { flags: 64 } });
}

function appUrl(): string {
  return (process.env.APP_URL?.trim() || "https://gamenights.sayrejeri.com").replace(/\/$/, "");
}

function discordTime(value: Date | null) {
  return value ? `<t:${Math.floor(new Date(value).getTime() / 1000)}:F>` : "Time TBA";
}

async function buildCommandResponse(interaction: DiscordInteraction): Promise<string> {
  if (!interaction.guild_id) return "Game Night Tools server commands can only be used inside a Discord server.";

  const workspaces = await query<WorkspaceRow[]>(
    `SELECT id, name, discord_guild_id FROM workspaces
     WHERE discord_guild_id = ? AND bot_connected = 1 AND profile_status = 'APPROVED'
     LIMIT 1`,
    [interaction.guild_id],
  );
  const workspace = workspaces[0];
  if (!workspace) return "This Discord server is not connected to an approved Game Night Tools server profile yet.";

  const command = interaction.data?.options?.[0];
  const subcommand = command?.name ?? "status";
  const baseUrl = appUrl();

  if (subcommand === "events") {
    const events = await query<EventRow[]>(
      `SELECT id, name, status, starts_at FROM events
       WHERE workspace_id = ?
         AND status NOT IN ('DRAFT', 'AWAITING_APPROVAL', 'COMPLETED', 'CANCELLED')
         AND visibility IN ('SERVER', 'PUBLIC')
       ORDER BY COALESCE(starts_at, '9999-12-31') ASC
       LIMIT 5`,
      [workspace.id],
    );
    if (!events.length) return `**${workspace.name}** has no upcoming published events right now.\n${baseUrl}/dashboard/workspaces/${workspace.id}`;

    const lines = events.map((event) => `• **${event.name}** — ${discordTime(event.starts_at)} · ${event.status.replaceAll("_", " ").toLowerCase()}\n  ${baseUrl}/dashboard/events/${event.id}`);
    return `**Upcoming ${workspace.name} events**\n${lines.join("\n")}`;
  }

  if (subcommand === "matches") {
    const matches = await query<MatchRow[]>(
      `SELECT bm.id, e.id AS event_id, e.name AS event_name, bm.round_number, bm.match_number,
              bm.status, bm.scheduled_at,
              a.display_name AS a_name, b.display_name AS b_name, c.display_name AS c_name
       FROM bracket_matches bm
       INNER JOIN brackets br ON br.id = bm.bracket_id
       INNER JOIN events e ON e.id = br.event_id
       LEFT JOIN bracket_entries a ON a.id = bm.participant_a_entry_id
       LEFT JOIN bracket_entries b ON b.id = bm.participant_b_entry_id
       LEFT JOIN bracket_entries c ON c.id = bm.participant_c_entry_id
       WHERE e.workspace_id = ? AND e.visibility IN ('SERVER', 'PUBLIC')
         AND e.status IN ('SIGNUPS_CLOSED', 'CHECK_IN_OPEN', 'LIVE', 'POSTPONED')
         AND bm.status IN ('PENDING', 'READY', 'LIVE', 'AWAITING_CONFIRMATION', 'DISPUTED')
         AND (bm.participant_a_entry_id IS NOT NULL OR bm.participant_b_entry_id IS NOT NULL OR bm.participant_c_entry_id IS NOT NULL)
       ORDER BY FIELD(bm.status, 'LIVE', 'DISPUTED', 'AWAITING_CONFIRMATION', 'READY', 'PENDING'),
                COALESCE(bm.scheduled_at, '9999-12-31'), bm.round_number, bm.match_number
       LIMIT 5`,
      [workspace.id],
    );
    if (!matches.length) return `**${workspace.name}** has no active or scheduled tournament matches right now.`;
    const lines = matches.map((match) => {
      const players = [match.a_name, match.b_name, match.c_name].filter(Boolean).join(" vs ") || "Entrants TBA";
      const when = match.scheduled_at ? ` · ${discordTime(match.scheduled_at)}` : "";
      return `• **${match.event_name}** R${match.round_number} M${match.match_number} — ${players}\n  ${match.status.replaceAll("_", " ").toLowerCase()}${when}`;
    });
    return `**${workspace.name} tournament matches**\n${lines.join("\n")}`;
  }

  if (subcommand === "bracket") {
    const brackets = await query<BracketRow[]>(
      `SELECT e.id AS event_id, e.name AS event_name, e.status AS event_status, br.status AS bracket_status, br.format
       FROM brackets br INNER JOIN events e ON e.id = br.event_id
       WHERE e.workspace_id = ? AND e.visibility IN ('SERVER', 'PUBLIC')
         AND br.status IN ('GENERATED', 'LIVE', 'COMPLETED')
         AND e.status NOT IN ('DRAFT', 'AWAITING_APPROVAL', 'CANCELLED')
       ORDER BY FIELD(br.status, 'LIVE', 'GENERATED', 'COMPLETED'), COALESCE(br.completed_at, br.generated_at, br.updated_at) DESC
       LIMIT 1`,
      [workspace.id],
    );
    const bracket = brackets[0];
    if (!bracket) return `**${workspace.name}** does not have a generated competition to show right now.`;
    return `🏆 **${bracket.event_name}**\n${bracket.format.replaceAll("_", " ").toLowerCase()} · ${bracket.bracket_status.toLowerCase()}\n${baseUrl}/dashboard/events/${bracket.event_id}/bracket`;
  }

  if (subcommand === "leaderboard") {
    const typeOption = command?.options?.find((option) => option.name === "type")?.value;
    const leaderboardType = typeOption === "teams" ? "teams" : "players";
    if (leaderboardType === "teams") {
      const rows = (await loadTeamLeaderboard({ workspaceId: workspace.id, publicOnly: true })).slice(0, 5);
      if (!rows.length) return `**${workspace.name}** does not have enough public completed team competition history for a leaderboard yet.`;
      const lines = rows.map((row, index) => `${index + 1}. **${row.name}** — ${row.wins}-${row.losses} · ${row.championships} title${row.championships === 1 ? "" : "s"}`);
      return `**${workspace.name} public team leaderboard**\n${lines.join("\n")}\n${baseUrl}/dashboard/leaderboards?workspace=${encodeURIComponent(workspace.id)}&type=teams`;
    }
    const rows = (await loadPlayerLeaderboard({ workspaceId: workspace.id, publicOnly: true })).slice(0, 5);
    if (!rows.length) return `**${workspace.name}** does not have enough public completed player competition history for a leaderboard yet.`;
    const lines = rows.map((row, index) => `${index + 1}. **${row.displayName}** — ${row.wins}-${row.losses} · ${row.championships} title${row.championships === 1 ? "" : "s"}`);
    return `**${workspace.name} public player leaderboard**\n${lines.join("\n")}\n${baseUrl}/dashboard/leaderboards?workspace=${encodeURIComponent(workspace.id)}`;
  }

  const counts = await query<CountRow[]>(
    `SELECT COUNT(*) AS total FROM events
     WHERE workspace_id = ?
       AND status NOT IN ('DRAFT', 'AWAITING_APPROVAL', 'COMPLETED', 'CANCELLED')
       AND visibility IN ('SERVER', 'PUBLIC')`,
    [workspace.id],
  );
  const upcoming = Number(counts[0]?.total ?? 0);
  return `✅ **${workspace.name}** is connected to the Game Night Tools bot beta.\nUpcoming published events: **${upcoming}**\nCommands: \`/gnt events\`, \`/gnt matches\`, \`/gnt bracket\`, \`/gnt leaderboard\`\n${baseUrl}/dashboard/workspaces/${workspace.id}`;
}

async function editDeferredResponse(interaction: DiscordInteraction, content: string): Promise<void> {
  if (!interaction.application_id || !interaction.token) return;
  const response = await fetch(`https://discord.com/api/v10/webhooks/${encodeURIComponent(interaction.application_id)}/${encodeURIComponent(interaction.token)}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: content.slice(0, 1950), allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Discord deferred interaction response failed with status ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}.`);
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  if (!verifyDiscordInteractionSignature(rawBody, signature, timestamp)) {
    return NextResponse.json({ error: "Invalid Discord interaction signature." }, { status: 401 });
  }

  let interaction: DiscordInteraction;
  try { interaction = JSON.parse(rawBody) as DiscordInteraction; }
  catch { return NextResponse.json({ error: "Invalid interaction payload." }, { status: 400 }); }

  // Discord verifies interaction endpoints with a PING before accepting the URL.
  if (interaction.type === 1) return NextResponse.json({ type: 1 });
  if (interaction.type !== 2 || interaction.data?.name !== "gnt") return interactionMessage("That Game Night Tools command is not supported by this beta yet.");
  if (!interaction.guild_id) return interactionMessage("Game Night Tools server commands can only be used inside a Discord server.");
  if (!interaction.application_id || !interaction.token) return interactionMessage("Discord did not provide enough information to complete this command.");

  after(async () => {
    try {
      const content = await buildCommandResponse(interaction);
      await editDeferredResponse(interaction, content);
    } catch (error) {
      console.error("Discord command processing failed:", error);
      try {
        await editDeferredResponse(interaction, "Game Night Tools could not finish that command. Please try again in a moment.");
      } catch (editError) {
        console.error("Discord command error response failed:", editError);
      }
    }
  });

  return deferredEphemeralResponse();
}
