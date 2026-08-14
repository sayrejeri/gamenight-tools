import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";
import { verifyDiscordInteractionSignature } from "@/lib/discord-bot";

type DiscordInteraction = {
  type: number;
  guild_id?: string;
  data?: {
    name?: string;
    options?: Array<{ type: number; name: string }>;
  };
};

type WorkspaceRow = RowDataPacket & { id: string; name: string; discord_guild_id: string };
type CountRow = RowDataPacket & { total: number };
type EventRow = RowDataPacket & { id: string; name: string; status: string; starts_at: Date | null };

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

function appUrl(): string {
  return (process.env.APP_URL?.trim() || "https://gamenights.sayrejeri.com").replace(/\/$/, "");
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

  const workspaces = await query<WorkspaceRow[]>(
    `SELECT id, name, discord_guild_id FROM workspaces
     WHERE discord_guild_id = ? AND bot_connected = 1 AND profile_status = 'APPROVED'
     LIMIT 1`,
    [interaction.guild_id],
  );
  const workspace = workspaces[0];
  if (!workspace) return interactionMessage("This Discord server is not connected to an approved Game Night Tools server profile yet.");

  const subcommand = interaction.data.options?.[0]?.name ?? "status";
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
    if (!events.length) return interactionMessage(`**${workspace.name}** has no upcoming published events right now.\n${baseUrl}/dashboard/workspaces/${workspace.id}`);

    const lines = events.map((event) => {
      const when = event.starts_at ? `<t:${Math.floor(new Date(event.starts_at).getTime() / 1000)}:F>` : "Time TBA";
      return `• **${event.name}** — ${when} · ${event.status.replaceAll("_", " ").toLowerCase()}\n  ${baseUrl}/dashboard/events/${event.id}`;
    });
    return interactionMessage(`**Upcoming ${workspace.name} events**\n${lines.join("\n")}`);
  }

  const counts = await query<CountRow[]>(
    `SELECT COUNT(*) AS total FROM events
     WHERE workspace_id = ?
       AND status NOT IN ('DRAFT', 'AWAITING_APPROVAL', 'COMPLETED', 'CANCELLED')
       AND visibility IN ('SERVER', 'PUBLIC')`,
    [workspace.id],
  );
  const upcoming = Number(counts[0]?.total ?? 0);
  return interactionMessage(`✅ **${workspace.name}** is connected to the Game Night Tools bot beta.\nUpcoming published events: **${upcoming}**\n${baseUrl}/dashboard/workspaces/${workspace.id}`);
}
