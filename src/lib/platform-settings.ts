import type { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";

export const SERVER_PROFILE_APPROVAL_SETTING = "server_profile_approval_required";

type SettingRow = RowDataPacket & { setting_value: string };

export async function getBooleanPlatformSetting(key: string, defaultValue: boolean): Promise<boolean> {
  const rows = await query<SettingRow[]>(
    `SELECT setting_value FROM platform_settings WHERE setting_key = ? LIMIT 1`,
    [key],
  );
  const value = rows[0]?.setting_value;
  if (value == null) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export async function isServerProfileApprovalRequired(): Promise<boolean> {
  return getBooleanPlatformSetting(SERVER_PROFILE_APPROVAL_SETTING, true);
}
