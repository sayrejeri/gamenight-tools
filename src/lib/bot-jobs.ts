import { createHash, randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";

export type BotJobType =
  | "DM_SIGNUP_REMINDER"
  | "DM_CHECKIN_REMINDER"
  | "DM_MATCH_REMINDER"
  | "DM_RESULT_REMINDER"
  | "ANNOUNCE_EVENT"
  | "ANNOUNCE_MATCH_READY"
  | "ANNOUNCE_RESULT"
  | "ANNOUNCE_WINNER"
  | "CREATE_MATCH_CHANNEL"
  | "DELETE_MATCH_CHANNEL"
  | "SYNC_ROLE";

export type BotRoleKind = "COMPETITOR" | "CHAMPION";

type BotJobExecutor = Pick<PoolConnection, "execute" | "query">;

type WorkspaceBotGateRow = RowDataPacket & {
  bot_connected: number;
  dm_reminders_enabled: number;
  announcements_enabled: number;
  temporary_match_channels_enabled: number;
  role_sync_enabled: number;
  announcement_channel_id: string | null;
  match_category_id: string | null;
  competitor_role_id: string | null;
  champion_role_id: string | null;
};

type UserBotGateRow = RowDataPacket & {
  dm_reminders_enabled: number;
  signup_reminders: number;
  checkin_reminders: number;
  match_reminders: number;
  result_reminders: number;
};

function executorOrPool(executor?: BotJobExecutor): BotJobExecutor {
  return executor ?? getPool();
}

function workspaceToggleForJob(type: BotJobType): keyof WorkspaceBotGateRow | null {
  if (type.startsWith("DM_")) return "dm_reminders_enabled";
  if (type.startsWith("ANNOUNCE_")) return "announcements_enabled";
  if (type === "CREATE_MATCH_CHANNEL") return "temporary_match_channels_enabled";
  if (type === "DELETE_MATCH_CHANNEL" || type === "SYNC_ROLE") return null;
  return null;
}

function userToggleForJob(type: BotJobType): keyof UserBotGateRow | null {
  if (type === "DM_SIGNUP_REMINDER") return "signup_reminders";
  if (type === "DM_CHECKIN_REMINDER") return "checkin_reminders";
  if (type === "DM_MATCH_REMINDER") return "match_reminders";
  if (type === "DM_RESULT_REMINDER") return "result_reminders";
  return null;
}

function payloadField(payload: unknown, key: string): unknown {
  return payload && typeof payload === "object" && key in payload ? (payload as Record<string, unknown>)[key] : undefined;
}

function notificationPayloadVersion(type: BotJobType, payload: unknown): string | null {
  if (!type.startsWith("DM_") && !type.startsWith("ANNOUNCE_")) return null;
  if (payload === undefined) return null;
  const serialized = JSON.stringify(payload);
  return createHash("sha256").update(serialized).digest("hex").slice(0, 12);
}

function appendDedupeSuffix(base: string, suffix: string): string {
  return `${base.slice(0, Math.max(0, 191 - suffix.length))}${suffix}`;
}

export async function enqueueDiscordBotJob(input: {
  workspaceId?: string | null;
  userId?: string | null;
  eventId?: string | null;
  matchId?: string | null;
  roleKind?: BotRoleKind | null;
  roleId?: string | null;
  type: BotJobType;
  dedupeKey?: string | null;
  payload?: unknown;
  scheduledAt?: Date;
}, executor?: BotJobExecutor): Promise<boolean> {
  const target = executorOrPool(executor);
  let resolvedRoleKind: BotRoleKind | null = input.roleKind ?? null;
  let resolvedRoleId = input.roleId?.trim() || null;

  if (input.type === "SYNC_ROLE" && !resolvedRoleKind) {
    resolvedRoleKind = payloadField(input.payload, "roleKind") === "CHAMPION" ? "CHAMPION" : "COMPETITOR";
  }

  if (input.workspaceId) {
    const [workspaceRows] = await target.query<WorkspaceBotGateRow[]>(
      `SELECT w.bot_connected,
              COALESCE(wbs.dm_reminders_enabled, 0) AS dm_reminders_enabled,
              COALESCE(wbs.announcements_enabled, 0) AS announcements_enabled,
              COALESCE(wbs.temporary_match_channels_enabled, 0) AS temporary_match_channels_enabled,
              COALESCE(wbs.role_sync_enabled, 0) AS role_sync_enabled,
              wbs.announcement_channel_id, wbs.match_category_id,
              wbs.competitor_role_id, wbs.champion_role_id
       FROM workspaces w
       LEFT JOIN workspace_bot_settings wbs ON wbs.workspace_id = w.id
       WHERE w.id = ? LIMIT 1`,
      [input.workspaceId],
    );
    const workspace = workspaceRows[0];
    if (!workspace || !workspace.bot_connected) return false;
    const toggle = workspaceToggleForJob(input.type);
    if (toggle && !workspace[toggle]) return false;
    if (input.type.startsWith("ANNOUNCE_") && !workspace.announcement_channel_id) return false;
    if (input.type === "CREATE_MATCH_CHANNEL" && !workspace.match_category_id) return false;

    if (input.type === "SYNC_ROLE") {
      if (!input.userId || !resolvedRoleKind) return false;
      const action = payloadField(input.payload, "action") === "REMOVE" ? "REMOVE" : "ADD";
      const configuredRoleId = resolvedRoleKind === "CHAMPION" ? workspace.champion_role_id : workspace.competitor_role_id;
      if (action === "ADD") {
        if (!workspace.role_sync_enabled || !configuredRoleId) return false;
        resolvedRoleId = configuredRoleId;
      } else if (!resolvedRoleId) {
        if (!workspace.role_sync_enabled || !configuredRoleId) return false;
        resolvedRoleId = configuredRoleId;
      }
      if (!resolvedRoleId || !/^\d{15,25}$/.test(resolvedRoleId)) return false;
    }
  }

  if (input.type.startsWith("DM_")) {
    if (!input.userId) return false;
    const [preferenceRows] = await target.query<UserBotGateRow[]>(
      `SELECT dm_reminders_enabled, signup_reminders, checkin_reminders, match_reminders, result_reminders
       FROM user_discord_bot_preferences WHERE user_id = ? LIMIT 1`,
      [input.userId],
    );
    const preferences = preferenceRows[0];
    if (!preferences?.dm_reminders_enabled) return false;
    const toggle = userToggleForJob(input.type);
    if (toggle && !preferences[toggle]) return false;
  }

  let dedupeKey = input.dedupeKey?.slice(0, 191) ?? null;
  const payloadVersion = notificationPayloadVersion(input.type, input.payload);
  if (dedupeKey && payloadVersion) {
    dedupeKey = appendDedupeSuffix(dedupeKey, `:v${payloadVersion}`);
  }
  if (dedupeKey && input.type === "SYNC_ROLE" && resolvedRoleKind && resolvedRoleId) {
    dedupeKey = appendDedupeSuffix(dedupeKey, `:${resolvedRoleKind}:${resolvedRoleId}`);
  }

  const [result] = await target.execute(
    `INSERT IGNORE INTO discord_bot_jobs
      (id, workspace_id, user_id, event_id, match_id, role_kind, discord_role_id, job_type, dedupe_key, payload_json, scheduled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      input.workspaceId ?? null,
      input.userId ?? null,
      input.eventId ?? null,
      input.matchId ?? null,
      input.type === "SYNC_ROLE" ? resolvedRoleKind : null,
      input.type === "SYNC_ROLE" ? resolvedRoleId : null,
      input.type,
      dedupeKey,
      input.payload === undefined ? null : JSON.stringify(input.payload),
      input.scheduledAt ?? new Date(),
    ],
  );
  return Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

export async function cancelDiscordBotJobsByEvent(eventId: string, executor?: BotJobExecutor): Promise<void> {
  const target = executorOrPool(executor);
  await target.execute(
    `UPDATE discord_bot_jobs SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP(3), locked_at = NULL, locked_by = NULL
     WHERE event_id = ? AND status = 'PENDING'`,
    [eventId],
  );
}
