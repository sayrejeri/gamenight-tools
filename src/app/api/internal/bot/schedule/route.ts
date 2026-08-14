import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";
import { isAuthorizedBotWorker } from "@/lib/bot-worker-auth";
import { enqueueDiscordBotJob } from "@/lib/bot-jobs";

type EventCandidate = RowDataPacket & {
  id: string;
  workspace_id: string;
  workspace_name: string;
  name: string;
  starts_at: Date | null;
  published_at: Date | null;
};
type ParticipantCandidate = RowDataPacket & {
  event_id: string;
  workspace_id: string;
  event_name: string;
  user_id: string;
  starts_at: Date | null;
  check_in_opens_at: Date | null;
  check_in_deadline: Date | null;
};
type MatchCandidate = RowDataPacket & {
  match_id: string;
  event_id: string;
  workspace_id: string;
  event_name: string;
  round_number: number;
  match_number: number;
  scheduled_at: Date | null;
  confirmation_due_at: Date | null;
  submitted_by: string | null;
  user_a: string | null;
  user_b: string | null;
  user_c: string | null;
};
type MatchAutomationRow = RowDataPacket & {
  match_id: string;
  event_id: string;
  workspace_id: string;
  event_name: string;
  round_number: number;
  match_number: number;
  status: string;
  updated_at: Date;
  completed_at: Date | null;
  winner_entry_id: string | null;
  winner_name: string | null;
  a_name: string | null;
  b_name: string | null;
  c_name: string | null;
  user_a: string | null;
  user_b: string | null;
  user_c: string | null;
  team_a: string | null;
  team_b: string | null;
  team_c: string | null;
};
type TeamRosterRow = RowDataPacket & { team_id: string; roster_json: string | null };
type UserDiscordRow = RowDataPacket & { id: string; discord_id: string };
type MatchChannelRow = RowDataPacket & { match_id: string; workspace_id: string; event_id: string; channel_id: string };
type DirectRoleRow = RowDataPacket & { event_id: string; workspace_id: string; user_id: string };
type TeamRoleRow = RowDataPacket & { event_id: string; workspace_id: string; team_id: string; roster_json: string | null };
type ChampionRow = RowDataPacket & { event_id: string; workspace_id: string; event_name: string; user_id: string | null; team_id: string | null; display_name: string };
type WinnerAnnouncementRow = RowDataPacket & { event_id: string; workspace_id: string; event_name: string; champions: string };

const ACTIVE_EVENT_STATUSES = ["SIGNUPS_OPEN", "SIGNUPS_CLOSED", "CHECK_IN_OPEN", "LIVE", "POSTPONED"] as const;

function appUrl() {
  return (process.env.APP_URL?.trim() || "https://gamenights.sayrejeri.com").replace(/\/$/, "");
}

function discordTimestamp(value: Date | null, style = "F") {
  return value ? `<t:${Math.floor(new Date(value).getTime() / 1000)}:${style}>` : "Time TBA";
}

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

async function loadDiscordIdsForUsers(userIds: string[]): Promise<string[]> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return [];
  const rows = await query<UserDiscordRow[]>(
    `SELECT CAST(id AS CHAR) AS id, discord_id FROM users
     WHERE id IN (${unique.map(() => "?").join(",")}) AND account_status = 'ACTIVE'`,
    unique,
  );
  return [...new Set(rows.map((row) => row.discord_id).filter((id) => /^\d{15,25}$/.test(id)))];
}

async function loadMatchDiscordIds(match: MatchAutomationRow): Promise<string[]> {
  const userIds = new Set([match.user_a, match.user_b, match.user_c].filter((value): value is string => Boolean(value)));
  const teamIds = [...new Set([match.team_a, match.team_b, match.team_c].filter((value): value is string => Boolean(value)))];
  if (teamIds.length) {
    const rosters = await query<TeamRosterRow[]>(
      `SELECT team_id, roster_json FROM event_team_entries
       WHERE event_id = ? AND team_id IN (${teamIds.map(() => "?").join(",")}) AND status = 'REGISTERED'`,
      [match.event_id, ...teamIds],
    );
    for (const roster of rosters) rosterUserIds(roster.roster_json).forEach((userId) => userIds.add(userId));
  }
  return loadDiscordIdsForUsers([...userIds]);
}

async function hasActiveCompetition(workspaceId: string, userId: string): Promise<boolean> {
  const rows = await query<RowDataPacket[]>(
    `SELECT e.id
     FROM events e
     WHERE e.workspace_id = ? AND e.status IN (${ACTIVE_EVENT_STATUSES.map(() => "?").join(",")})
       AND (
         EXISTS(SELECT 1 FROM event_participants ep WHERE ep.event_id = e.id AND ep.user_id = ? AND ep.status = 'APPROVED')
         OR EXISTS(
           SELECT 1 FROM event_team_entries ete
           WHERE ete.event_id = e.id AND ete.status = 'REGISTERED'
             AND JSON_SEARCH(ete.roster_json, 'one', ?, NULL, '$[*].userId') IS NOT NULL
         )
       )
     LIMIT 1`,
    [workspaceId, ...ACTIVE_EVENT_STATUSES, userId, userId],
  );
  return Boolean(rows[0]);
}

async function queueRole(input: { workspaceId: string; eventId: string; userId: string; roleKind: "COMPETITOR" | "CHAMPION"; action: "ADD" | "REMOVE"; dedupe: string }) {
  return enqueueDiscordBotJob({
    workspaceId: input.workspaceId,
    eventId: input.eventId,
    userId: input.userId,
    type: "SYNC_ROLE",
    dedupeKey: input.dedupe,
    payload: { roleKind: input.roleKind, action: input.action },
  });
}

export async function POST(request: Request) {
  if (!isAuthorizedBotWorker(request)) return NextResponse.json({ error: "Unauthorized worker." }, { status: 401 });
  const baseUrl = appUrl();
  let queued = 0;

  const publishedEvents = await query<EventCandidate[]>(
    `SELECT e.id, e.workspace_id, w.name AS workspace_name, e.name, e.starts_at, e.published_at
     FROM events e
     INNER JOIN workspaces w ON w.id = e.workspace_id
     INNER JOIN workspace_bot_settings wbs ON wbs.workspace_id = e.workspace_id
     WHERE w.bot_connected = 1 AND wbs.announcements_enabled = 1 AND wbs.announcement_channel_id IS NOT NULL
       AND e.visibility IN ('SERVER','PUBLIC')
       AND e.published_at IS NOT NULL AND e.published_at >= (CURRENT_TIMESTAMP(3) - INTERVAL 24 HOUR)
       AND e.status IN ('SIGNUPS_OPEN','SIGNUPS_CLOSED','CHECK_IN_OPEN','LIVE')`,
  );
  for (const event of publishedEvents) {
    const inserted = await enqueueDiscordBotJob({
      workspaceId: event.workspace_id,
      eventId: event.id,
      type: "ANNOUNCE_EVENT",
      dedupeKey: `event-published:${event.id}`,
      payload: {
        content: `🎮 **${event.name}** is open on Game Night Tools.\n${event.starts_at ? `Starts ${discordTimestamp(event.starts_at)}\n` : ""}${baseUrl}/dashboard/events/${event.id}`,
      },
    });
    if (inserted) queued += 1;
  }

  const eventReminders = await query<ParticipantCandidate[]>(
    `SELECT e.id AS event_id, e.workspace_id, e.name AS event_name, CAST(ep.user_id AS CHAR) AS user_id,
            e.starts_at, e.check_in_opens_at, e.check_in_deadline
     FROM events e
     INNER JOIN event_participants ep ON ep.event_id = e.id
     INNER JOIN workspaces w ON w.id = e.workspace_id
     WHERE w.bot_connected = 1 AND ep.status = 'APPROVED'
       AND e.status IN ('SIGNUPS_OPEN','SIGNUPS_CLOSED','CHECK_IN_OPEN')
       AND e.starts_at BETWEEN (CURRENT_TIMESTAMP(3) + INTERVAL 22 HOUR) AND (CURRENT_TIMESTAMP(3) + INTERVAL 26 HOUR)`,
  );
  for (const participant of eventReminders) {
    const inserted = await enqueueDiscordBotJob({
      workspaceId: participant.workspace_id,
      userId: participant.user_id,
      eventId: participant.event_id,
      type: "DM_SIGNUP_REMINDER",
      dedupeKey: `event-24h:${participant.event_id}:${participant.user_id}`,
      payload: {
        content: `🎮 **${participant.event_name}** starts in about a day.\nStarts ${discordTimestamp(participant.starts_at)}\n${baseUrl}/dashboard/events/${participant.event_id}`,
      },
    });
    if (inserted) queued += 1;
  }

  const checkinReminders = await query<ParticipantCandidate[]>(
    `SELECT e.id AS event_id, e.workspace_id, e.name AS event_name, CAST(ep.user_id AS CHAR) AS user_id,
            e.starts_at, e.check_in_opens_at, e.check_in_deadline
     FROM events e
     INNER JOIN event_participants ep ON ep.event_id = e.id
     INNER JOIN workspaces w ON w.id = e.workspace_id
     WHERE w.bot_connected = 1 AND e.status = 'CHECK_IN_OPEN'
       AND ep.status = 'APPROVED' AND ep.checked_in_at IS NULL
       AND e.check_in_opens_at IS NOT NULL
       AND e.check_in_opens_at >= (CURRENT_TIMESTAMP(3) - INTERVAL 2 HOUR)
       AND e.check_in_opens_at <= CURRENT_TIMESTAMP(3)`,
  );
  for (const participant of checkinReminders) {
    const inserted = await enqueueDiscordBotJob({
      workspaceId: participant.workspace_id,
      userId: participant.user_id,
      eventId: participant.event_id,
      type: "DM_CHECKIN_REMINDER",
      dedupeKey: `checkin-open:${participant.event_id}:${participant.user_id}`,
      payload: {
        content: `✅ Check-in is open for **${participant.event_name}**.${participant.check_in_deadline ? `\nDeadline ${discordTimestamp(participant.check_in_deadline)}` : ""}\n${baseUrl}/dashboard/events/${participant.event_id}`,
      },
    });
    if (inserted) queued += 1;
  }

  const matchReminders = await query<MatchCandidate[]>(
    `SELECT bm.id AS match_id, e.id AS event_id, e.workspace_id, e.name AS event_name,
            bm.round_number, bm.match_number, bm.scheduled_at, bm.confirmation_due_at,
            CAST(bm.submitted_by AS CHAR) AS submitted_by,
            CAST(a.user_id AS CHAR) AS user_a, CAST(b.user_id AS CHAR) AS user_b, CAST(c.user_id AS CHAR) AS user_c
     FROM bracket_matches bm
     INNER JOIN brackets br ON br.id = bm.bracket_id
     INNER JOIN events e ON e.id = br.event_id
     INNER JOIN workspaces w ON w.id = e.workspace_id
     LEFT JOIN bracket_entries a ON a.id = bm.participant_a_entry_id
     LEFT JOIN bracket_entries b ON b.id = bm.participant_b_entry_id
     LEFT JOIN bracket_entries c ON c.id = bm.participant_c_entry_id
     WHERE w.bot_connected = 1 AND bm.status IN ('PENDING','READY') AND bm.scheduled_at IS NOT NULL
       AND bm.scheduled_at BETWEEN (CURRENT_TIMESTAMP(3) + INTERVAL 20 MINUTE) AND (CURRENT_TIMESTAMP(3) + INTERVAL 40 MINUTE)`,
  );
  for (const match of matchReminders) {
    const participantIds = Array.from(new Set([match.user_a, match.user_b, match.user_c].filter((value): value is string => Boolean(value))));
    for (const userId of participantIds) {
      const inserted = await enqueueDiscordBotJob({
        workspaceId: match.workspace_id,
        userId,
        eventId: match.event_id,
        matchId: match.match_id,
        type: "DM_MATCH_REMINDER",
        dedupeKey: `match-reminder:${match.match_id}:${userId}`,
        payload: {
          content: `⚔️ Your **${match.event_name}** match is scheduled soon.\nRound ${match.round_number}, Match ${match.match_number} · ${discordTimestamp(match.scheduled_at)}\n${baseUrl}/dashboard/events/${match.event_id}/matches`,
        },
      });
      if (inserted) queued += 1;
    }
  }

  const resultReminders = await query<MatchCandidate[]>(
    `SELECT bm.id AS match_id, e.id AS event_id, e.workspace_id, e.name AS event_name,
            bm.round_number, bm.match_number, bm.scheduled_at, bm.confirmation_due_at,
            CAST(bm.submitted_by AS CHAR) AS submitted_by,
            CAST(a.user_id AS CHAR) AS user_a, CAST(b.user_id AS CHAR) AS user_b, CAST(c.user_id AS CHAR) AS user_c
     FROM bracket_matches bm
     INNER JOIN brackets br ON br.id = bm.bracket_id
     INNER JOIN events e ON e.id = br.event_id
     INNER JOIN workspaces w ON w.id = e.workspace_id
     LEFT JOIN bracket_entries a ON a.id = bm.participant_a_entry_id
     LEFT JOIN bracket_entries b ON b.id = bm.participant_b_entry_id
     LEFT JOIN bracket_entries c ON c.id = bm.participant_c_entry_id
     WHERE w.bot_connected = 1 AND bm.status = 'AWAITING_CONFIRMATION'
       AND bm.confirmation_due_at IS NOT NULL
       AND bm.confirmation_due_at BETWEEN CURRENT_TIMESTAMP(3) AND (CURRENT_TIMESTAMP(3) + INTERVAL 45 MINUTE)`,
  );
  for (const match of resultReminders) {
    const participantIds = Array.from(new Set([match.user_a, match.user_b, match.user_c].filter((value): value is string => Boolean(value) && value !== match.submitted_by)));
    for (const userId of participantIds) {
      const inserted = await enqueueDiscordBotJob({
        workspaceId: match.workspace_id,
        userId,
        eventId: match.event_id,
        matchId: match.match_id,
        type: "DM_RESULT_REMINDER",
        dedupeKey: `result-confirm:${match.match_id}:${userId}`,
        payload: {
          content: `📋 A result was submitted for your **${match.event_name}** match and is waiting for confirmation.${match.confirmation_due_at ? `\nConfirm by ${discordTimestamp(match.confirmation_due_at)}` : ""}\n${baseUrl}/dashboard/events/${match.event_id}/series`,
        },
      });
      if (inserted) queued += 1;
    }
  }

  const liveMatches = await query<MatchAutomationRow[]>(
    `SELECT bm.id AS match_id, e.id AS event_id, e.workspace_id, e.name AS event_name,
            bm.round_number, bm.match_number, bm.status, bm.updated_at, bm.completed_at,
            bm.winner_entry_id, win.display_name AS winner_name,
            a.display_name AS a_name, b.display_name AS b_name, c.display_name AS c_name,
            CAST(a.user_id AS CHAR) AS user_a, CAST(b.user_id AS CHAR) AS user_b, CAST(c.user_id AS CHAR) AS user_c,
            a.team_id AS team_a, b.team_id AS team_b, c.team_id AS team_c
     FROM bracket_matches bm
     INNER JOIN brackets br ON br.id = bm.bracket_id
     INNER JOIN events e ON e.id = br.event_id
     INNER JOIN workspaces w ON w.id = e.workspace_id
     INNER JOIN workspace_bot_settings wbs ON wbs.workspace_id = e.workspace_id
     LEFT JOIN bracket_entries a ON a.id = bm.participant_a_entry_id
     LEFT JOIN bracket_entries b ON b.id = bm.participant_b_entry_id
     LEFT JOIN bracket_entries c ON c.id = bm.participant_c_entry_id
     LEFT JOIN bracket_entries win ON win.id = bm.winner_entry_id
     WHERE w.bot_connected = 1 AND e.status = 'LIVE' AND bm.status IN ('READY','LIVE')
       AND wbs.temporary_match_channels_enabled = 1 AND wbs.match_category_id IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM discord_match_channels dmc WHERE dmc.match_id = bm.id AND dmc.status = 'ACTIVE')
       AND NOT EXISTS(
         SELECT 1 FROM discord_bot_jobs dbj
         WHERE dbj.match_id = bm.id AND dbj.job_type = 'CREATE_MATCH_CHANNEL' AND dbj.status IN ('PENDING','PROCESSING')
       )
     ORDER BY bm.updated_at ASC LIMIT 50`,
  );
  for (const match of liveMatches) {
    const participantDiscordIds = await loadMatchDiscordIds(match);
    if (!participantDiscordIds.length) continue;
    const entrants = [match.a_name, match.b_name, match.c_name].filter(Boolean).join(" vs ") || `Match ${match.match_number}`;
    const inserted = await enqueueDiscordBotJob({
      workspaceId: match.workspace_id,
      eventId: match.event_id,
      matchId: match.match_id,
      type: "CREATE_MATCH_CHANNEL",
      dedupeKey: `match-channel-create:${match.match_id}:${new Date(match.updated_at).getTime()}`,
      payload: {
        matchId: match.match_id,
        channelName: `r${match.round_number}-m${match.match_number}-${entrants}`,
        participantDiscordIds,
        content: `⚔️ **${match.event_name} — Round ${match.round_number}, Match ${match.match_number}**\n${entrants}\nUse this channel for match coordination. Match Center: ${baseUrl}/dashboard/events/${match.event_id}/matches`,
      },
    });
    if (inserted) queued += 1;
  }

  const activeMatchChannels = await query<MatchChannelRow[]>(
    `SELECT dmc.match_id, dmc.workspace_id, dmc.event_id, dmc.channel_id
     FROM discord_match_channels dmc
     INNER JOIN bracket_matches bm ON bm.id = dmc.match_id
     INNER JOIN brackets br ON br.id = bm.bracket_id
     INNER JOIN events e ON e.id = br.event_id
     WHERE dmc.status = 'ACTIVE'
       AND (bm.status IN ('COMPLETED','FORFEIT') OR br.status = 'COMPLETED' OR e.status IN ('COMPLETED','CANCELLED'))
     LIMIT 100`,
  );
  for (const channel of activeMatchChannels) {
    const inserted = await enqueueDiscordBotJob({
      workspaceId: channel.workspace_id,
      eventId: channel.event_id,
      matchId: channel.match_id,
      type: "DELETE_MATCH_CHANNEL",
      dedupeKey: `match-channel-delete:${channel.match_id}:${channel.channel_id}`,
      payload: { matchId: channel.match_id, channelId: channel.channel_id },
    });
    if (inserted) queued += 1;
  }

  const readyAnnouncements = await query<MatchAutomationRow[]>(
    `SELECT bm.id AS match_id, e.id AS event_id, e.workspace_id, e.name AS event_name,
            bm.round_number, bm.match_number, bm.status, bm.updated_at, bm.completed_at,
            bm.winner_entry_id, win.display_name AS winner_name,
            a.display_name AS a_name, b.display_name AS b_name, c.display_name AS c_name,
            CAST(a.user_id AS CHAR) AS user_a, CAST(b.user_id AS CHAR) AS user_b, CAST(c.user_id AS CHAR) AS user_c,
            a.team_id AS team_a, b.team_id AS team_b, c.team_id AS team_c
     FROM bracket_matches bm
     INNER JOIN brackets br ON br.id = bm.bracket_id
     INNER JOIN events e ON e.id = br.event_id
     INNER JOIN workspaces w ON w.id = e.workspace_id
     INNER JOIN workspace_bot_settings wbs ON wbs.workspace_id = e.workspace_id
     LEFT JOIN bracket_entries a ON a.id = bm.participant_a_entry_id
     LEFT JOIN bracket_entries b ON b.id = bm.participant_b_entry_id
     LEFT JOIN bracket_entries c ON c.id = bm.participant_c_entry_id
     LEFT JOIN bracket_entries win ON win.id = bm.winner_entry_id
     WHERE w.bot_connected = 1 AND wbs.announcements_enabled = 1 AND wbs.announcement_channel_id IS NOT NULL
       AND e.visibility IN ('SERVER','PUBLIC') AND e.status = 'LIVE' AND bm.status IN ('READY','LIVE')
     ORDER BY bm.updated_at ASC LIMIT 100`,
  );
  for (const match of readyAnnouncements) {
    const entrants = [match.a_name, match.b_name, match.c_name].filter(Boolean).join(" vs ") || "Entrants ready";
    const inserted = await enqueueDiscordBotJob({
      workspaceId: match.workspace_id,
      eventId: match.event_id,
      matchId: match.match_id,
      type: "ANNOUNCE_MATCH_READY",
      dedupeKey: `match-ready:${match.match_id}`,
      payload: { content: `⚔️ **Match ready — ${match.event_name}**\nRound ${match.round_number}, Match ${match.match_number}: ${entrants}\n${baseUrl}/dashboard/events/${match.event_id}/matches` },
    });
    if (inserted) queued += 1;
  }

  const completedMatches = await query<MatchAutomationRow[]>(
    `SELECT bm.id AS match_id, e.id AS event_id, e.workspace_id, e.name AS event_name,
            bm.round_number, bm.match_number, bm.status, bm.updated_at, bm.completed_at,
            bm.winner_entry_id, win.display_name AS winner_name,
            a.display_name AS a_name, b.display_name AS b_name, c.display_name AS c_name,
            CAST(a.user_id AS CHAR) AS user_a, CAST(b.user_id AS CHAR) AS user_b, CAST(c.user_id AS CHAR) AS user_c,
            a.team_id AS team_a, b.team_id AS team_b, c.team_id AS team_c
     FROM bracket_matches bm
     INNER JOIN brackets br ON br.id = bm.bracket_id
     INNER JOIN events e ON e.id = br.event_id
     INNER JOIN workspaces w ON w.id = e.workspace_id
     INNER JOIN workspace_bot_settings wbs ON wbs.workspace_id = e.workspace_id
     LEFT JOIN bracket_entries a ON a.id = bm.participant_a_entry_id
     LEFT JOIN bracket_entries b ON b.id = bm.participant_b_entry_id
     LEFT JOIN bracket_entries c ON c.id = bm.participant_c_entry_id
     LEFT JOIN bracket_entries win ON win.id = bm.winner_entry_id
     WHERE w.bot_connected = 1 AND wbs.announcements_enabled = 1 AND wbs.announcement_channel_id IS NOT NULL
       AND e.visibility IN ('SERVER','PUBLIC') AND bm.status IN ('COMPLETED','FORFEIT')
       AND bm.completed_at >= (CURRENT_TIMESTAMP(3) - INTERVAL 24 HOUR)
     ORDER BY bm.completed_at ASC LIMIT 100`,
  );
  for (const match of completedMatches) {
    if (!match.winner_entry_id || !match.winner_name) continue;
    const inserted = await enqueueDiscordBotJob({
      workspaceId: match.workspace_id,
      eventId: match.event_id,
      matchId: match.match_id,
      type: "ANNOUNCE_RESULT",
      dedupeKey: `match-result:${match.match_id}:${match.winner_entry_id}`,
      payload: { content: `✅ **${match.event_name} result**\nRound ${match.round_number}, Match ${match.match_number}: **${match.winner_name}** advances.\n${baseUrl}/dashboard/events/${match.event_id}/bracket` },
    });
    if (inserted) queued += 1;
  }

  const winnerAnnouncements = await query<WinnerAnnouncementRow[]>(
    `SELECT e.id AS event_id, e.workspace_id, e.name AS event_name,
            GROUP_CONCAT(DISTINCT COALESCE(t.name, u.global_name, u.username, be.display_name) ORDER BY COALESCE(t.name, u.global_name, u.username, be.display_name) SEPARATOR ', ') AS champions
     FROM bracket_entries be
     INNER JOIN brackets br ON br.id = be.bracket_id
     INNER JOIN events e ON e.id = br.event_id
     INNER JOIN workspaces w ON w.id = e.workspace_id
     INNER JOIN workspace_bot_settings wbs ON wbs.workspace_id = e.workspace_id
     LEFT JOIN users u ON u.id = be.user_id
     LEFT JOIN teams t ON t.id = be.team_id
     WHERE be.status = 'ADVANCED' AND br.status = 'COMPLETED'
       AND w.bot_connected = 1 AND wbs.announcements_enabled = 1 AND wbs.announcement_channel_id IS NOT NULL
       AND e.visibility IN ('SERVER','PUBLIC')
       AND br.completed_at >= (CURRENT_TIMESTAMP(3) - INTERVAL 24 HOUR)
     GROUP BY e.id, e.workspace_id, e.name`,
  );
  for (const winner of winnerAnnouncements) {
    if (!winner.champions) continue;
    const inserted = await enqueueDiscordBotJob({
      workspaceId: winner.workspace_id,
      eventId: winner.event_id,
      type: "ANNOUNCE_WINNER",
      dedupeKey: `tournament-winner:${winner.event_id}`,
      payload: { content: `🏆 **${winner.event_name} champion${winner.champions.includes(",") ? "s" : ""}: ${winner.champions}**\n${baseUrl}/dashboard/events/${winner.event_id}/bracket` },
    });
    if (inserted) queued += 1;
  }

  const directCompetitors = await query<DirectRoleRow[]>(
    `SELECT DISTINCT e.id AS event_id, e.workspace_id, CAST(ep.user_id AS CHAR) AS user_id
     FROM events e
     INNER JOIN event_participants ep ON ep.event_id = e.id
     INNER JOIN workspaces w ON w.id = e.workspace_id
     INNER JOIN workspace_bot_settings wbs ON wbs.workspace_id = e.workspace_id
     WHERE w.bot_connected = 1 AND wbs.role_sync_enabled = 1 AND wbs.competitor_role_id IS NOT NULL
       AND e.status IN (${ACTIVE_EVENT_STATUSES.map(() => "?").join(",")}) AND ep.status = 'APPROVED'`,
    [...ACTIVE_EVENT_STATUSES],
  );
  for (const participant of directCompetitors) {
    if (await queueRole({ workspaceId: participant.workspace_id, eventId: participant.event_id, userId: participant.user_id, roleKind: "COMPETITOR", action: "ADD", dedupe: `competitor-add:${participant.event_id}:${participant.user_id}` })) queued += 1;
  }

  const teamCompetitors = await query<TeamRoleRow[]>(
    `SELECT e.id AS event_id, e.workspace_id, ete.team_id, ete.roster_json
     FROM events e
     INNER JOIN event_team_entries ete ON ete.event_id = e.id
     INNER JOIN workspaces w ON w.id = e.workspace_id
     INNER JOIN workspace_bot_settings wbs ON wbs.workspace_id = e.workspace_id
     WHERE w.bot_connected = 1 AND wbs.role_sync_enabled = 1 AND wbs.competitor_role_id IS NOT NULL
       AND e.status IN (${ACTIVE_EVENT_STATUSES.map(() => "?").join(",")}) AND ete.status = 'REGISTERED'`,
    [...ACTIVE_EVENT_STATUSES],
  );
  for (const entry of teamCompetitors) {
    for (const userId of rosterUserIds(entry.roster_json)) {
      if (await queueRole({ workspaceId: entry.workspace_id, eventId: entry.event_id, userId, roleKind: "COMPETITOR", action: "ADD", dedupe: `competitor-add:${entry.event_id}:${userId}` })) queued += 1;
    }
  }

  const directFinished = await query<DirectRoleRow[]>(
    `SELECT DISTINCT e.id AS event_id, e.workspace_id, CAST(ep.user_id AS CHAR) AS user_id
     FROM events e
     INNER JOIN event_participants ep ON ep.event_id = e.id
     INNER JOIN workspaces w ON w.id = e.workspace_id
     INNER JOIN workspace_bot_settings wbs ON wbs.workspace_id = e.workspace_id
     WHERE w.bot_connected = 1 AND wbs.role_sync_enabled = 1 AND wbs.competitor_role_id IS NOT NULL
       AND e.status IN ('COMPLETED','CANCELLED') AND e.updated_at >= (CURRENT_TIMESTAMP(3) - INTERVAL 48 HOUR)
       AND ep.status NOT IN ('REJECTED','WITHDRAWN')`,
  );
  for (const participant of directFinished) {
    if (await hasActiveCompetition(participant.workspace_id, participant.user_id)) continue;
    if (await queueRole({ workspaceId: participant.workspace_id, eventId: participant.event_id, userId: participant.user_id, roleKind: "COMPETITOR", action: "REMOVE", dedupe: `competitor-remove:${participant.event_id}:${participant.user_id}` })) queued += 1;
  }

  const teamFinished = await query<TeamRoleRow[]>(
    `SELECT e.id AS event_id, e.workspace_id, ete.team_id, ete.roster_json
     FROM events e
     INNER JOIN event_team_entries ete ON ete.event_id = e.id
     INNER JOIN workspaces w ON w.id = e.workspace_id
     INNER JOIN workspace_bot_settings wbs ON wbs.workspace_id = e.workspace_id
     WHERE w.bot_connected = 1 AND wbs.role_sync_enabled = 1 AND wbs.competitor_role_id IS NOT NULL
       AND e.status IN ('COMPLETED','CANCELLED') AND e.updated_at >= (CURRENT_TIMESTAMP(3) - INTERVAL 48 HOUR)
       AND ete.status = 'REGISTERED'`,
  );
  for (const entry of teamFinished) {
    for (const userId of rosterUserIds(entry.roster_json)) {
      if (await hasActiveCompetition(entry.workspace_id, userId)) continue;
      if (await queueRole({ workspaceId: entry.workspace_id, eventId: entry.event_id, userId, roleKind: "COMPETITOR", action: "REMOVE", dedupe: `competitor-remove:${entry.event_id}:${userId}` })) queued += 1;
    }
  }

  const champions = await query<ChampionRow[]>(
    `SELECT e.id AS event_id, e.workspace_id, e.name AS event_name,
            CAST(be.user_id AS CHAR) AS user_id, be.team_id,
            COALESCE(t.name, u.global_name, u.username, be.display_name) AS display_name
     FROM bracket_entries be
     INNER JOIN brackets br ON br.id = be.bracket_id
     INNER JOIN events e ON e.id = br.event_id
     INNER JOIN workspaces w ON w.id = e.workspace_id
     INNER JOIN workspace_bot_settings wbs ON wbs.workspace_id = e.workspace_id
     LEFT JOIN users u ON u.id = be.user_id
     LEFT JOIN teams t ON t.id = be.team_id
     WHERE be.status = 'ADVANCED' AND br.status = 'COMPLETED'
       AND w.bot_connected = 1 AND wbs.role_sync_enabled = 1 AND wbs.champion_role_id IS NOT NULL
       AND br.completed_at >= (CURRENT_TIMESTAMP(3) - INTERVAL 48 HOUR)`,
  );
  for (const champion of champions) {
    const userIds = new Set<string>();
    if (champion.user_id) userIds.add(champion.user_id);
    if (champion.team_id) {
      const rosters = await query<TeamRosterRow[]>(
        `SELECT team_id, roster_json FROM event_team_entries WHERE event_id = ? AND team_id = ? AND status = 'REGISTERED' LIMIT 1`,
        [champion.event_id, champion.team_id],
      );
      rosterUserIds(rosters[0]?.roster_json ?? null).forEach((userId) => userIds.add(userId));
    }
    for (const userId of userIds) {
      if (await queueRole({ workspaceId: champion.workspace_id, eventId: champion.event_id, userId, roleKind: "CHAMPION", action: "ADD", dedupe: `champion-add:${champion.event_id}:${userId}` })) queued += 1;
    }
  }

  return NextResponse.json({ success: true, queued });
}
