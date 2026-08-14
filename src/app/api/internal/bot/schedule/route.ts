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

function appUrl() {
  return (process.env.APP_URL?.trim() || "https://gamenights.sayrejeri.com").replace(/\/$/, "");
}

function discordTimestamp(value: Date | null, style = "F") {
  return value ? `<t:${Math.floor(new Date(value).getTime() / 1000)}:${style}>` : "Time TBA";
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
        type: "DM_RESULT_REMINDER",
        dedupeKey: `result-confirm:${match.match_id}:${userId}`,
        payload: {
          content: `📋 A result was submitted for your **${match.event_name}** match and is waiting for confirmation.${match.confirmation_due_at ? `\nConfirm by ${discordTimestamp(match.confirmation_due_at)}` : ""}\n${baseUrl}/dashboard/events/${match.event_id}/series`,
        },
      });
      if (inserted) queued += 1;
    }
  }

  return NextResponse.json({ success: true, queued });
}
