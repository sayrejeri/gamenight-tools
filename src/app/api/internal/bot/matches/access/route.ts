import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { query } from "@/lib/db";
import { isAuthorizedBotWorker } from "@/lib/bot-worker-auth";

const schema = z.object({ matchId: z.string().uuid() });

type MatchAccessRow = RowDataPacket & {
  event_id: string;
  host_user_id: string;
  user_a: string | null;
  user_b: string | null;
  user_c: string | null;
  team_a: string | null;
  team_b: string | null;
  team_c: string | null;
};
type RosterRow = RowDataPacket & { roster_json: string | null };
type CohostRow = RowDataPacket & { user_id: string };
type DiscordUserRow = RowDataPacket & { user_id: string; discord_id: string };

function rosterUserIds(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((member) => {
      if (!member || typeof member !== "object") return [];
      const userId = (member as { userId?: unknown }).userId;
      return typeof userId === "string" && userId ? [userId] : [];
    });
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  if (!isAuthorizedBotWorker(request)) return NextResponse.json({ error: "Unauthorized worker." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid match access request." }, { status: 400 });

  const matches = await query<MatchAccessRow[]>(
    `SELECT e.id AS event_id, CAST(e.primary_host_id AS CHAR) AS host_user_id,
            CAST(a.user_id AS CHAR) AS user_a, CAST(b.user_id AS CHAR) AS user_b, CAST(c.user_id AS CHAR) AS user_c,
            a.team_id AS team_a, b.team_id AS team_b, c.team_id AS team_c
     FROM bracket_matches bm
     INNER JOIN brackets br ON br.id = bm.bracket_id
     INNER JOIN events e ON e.id = br.event_id
     LEFT JOIN bracket_entries a ON a.id = bm.participant_a_entry_id
     LEFT JOIN bracket_entries b ON b.id = bm.participant_b_entry_id
     LEFT JOIN bracket_entries c ON c.id = bm.participant_c_entry_id
     WHERE bm.id = ? AND bm.status IN ('READY','LIVE') AND e.status = 'LIVE'
     LIMIT 1`,
    [parsed.data.matchId],
  );
  const match = matches[0];
  if (!match) return NextResponse.json({ error: "Match is no longer eligible for a private Discord channel." }, { status: 409 });

  const participantUserIds = new Set<string>([match.user_a, match.user_b, match.user_c].filter((value): value is string => Boolean(value)));
  const teamIds = [...new Set([match.team_a, match.team_b, match.team_c].filter((value): value is string => Boolean(value)))];
  if (teamIds.length) {
    const rosterRows = await query<RosterRow[]>(
      `SELECT roster_json FROM event_team_entries
       WHERE event_id = ? AND team_id IN (${teamIds.map(() => "?").join(",")}) AND status = 'REGISTERED'`,
      [match.event_id, ...teamIds],
    );
    for (const roster of rosterRows) rosterUserIds(roster.roster_json).forEach((userId) => participantUserIds.add(userId));
  }

  const cohosts = await query<CohostRow[]>(
    `SELECT CAST(invited_user_id AS CHAR) AS user_id
     FROM event_cohosts
     WHERE event_id = ? AND status = 'ACCEPTED' AND invited_user_id IS NOT NULL
       AND permission_level IN ('FULL','BRACKET','SCOREKEEPER')
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP(3))`,
    [match.event_id],
  );
  const staffUserIds = new Set<string>([match.host_user_id, ...cohosts.map((cohost) => cohost.user_id)].filter(Boolean));
  const allUserIds = [...new Set([...participantUserIds, ...staffUserIds])];
  if (!allUserIds.length) return NextResponse.json({ error: "No linked Game Night Tools users are eligible for this match channel." }, { status: 409 });

  const discordUsers = await query<DiscordUserRow[]>(
    `SELECT CAST(id AS CHAR) AS user_id, discord_id FROM users
     WHERE id IN (${allUserIds.map(() => "?").join(",")}) AND account_status = 'ACTIVE'`,
    allUserIds,
  );
  const discordByUser = new Map(discordUsers.map((user) => [user.user_id, user.discord_id]));
  const participantDiscordIds = [...new Set([...participantUserIds].map((userId) => discordByUser.get(userId)).filter((value): value is string => Boolean(value) && /^\d{15,25}$/.test(value)))];
  const staffDiscordIds = [...new Set([...staffUserIds].map((userId) => discordByUser.get(userId)).filter((value): value is string => Boolean(value) && /^\d{15,25}$/.test(value)))];

  return NextResponse.json({
    success: true,
    eventId: match.event_id,
    participantDiscordIds,
    staffDiscordIds,
    memberDiscordIds: [...new Set([...participantDiscordIds, ...staffDiscordIds])],
  });
}
