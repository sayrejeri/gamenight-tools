import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { readSession } from "@/lib/auth";
import { query } from "@/lib/db";

type UserLookupRow = RowDataPacket & {
  site_username: string | null;
  username: string;
  global_name: string | null;
};

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim().replace(/^@/, "") ?? "";
  if (q.length < 2) return NextResponse.json({ users: [] });

  // LOCATE treats %, _ and backslashes as literal text, unlike LIKE wildcard
  // patterns. Keep this generic lookup aligned with profile discovery privacy.
  const rows = await query<UserLookupRow[]>(
    `SELECT u.site_username, u.username, u.global_name
     FROM users u
     LEFT JOIN user_preferences up ON up.user_id = u.id
     WHERE u.account_status = 'ACTIVE'
       AND u.profile_visibility <> 'PRIVATE'
       AND COALESCE(up.discoverable, 1) = 1
       AND (
         LOCATE(LOWER(?), LOWER(COALESCE(u.site_username, ''))) > 0
         OR LOCATE(LOWER(?), LOWER(u.username)) > 0
         OR LOCATE(LOWER(?), LOWER(COALESCE(u.global_name, ''))) > 0
       )
     ORDER BY
       CASE
         WHEN LOWER(u.site_username) = LOWER(?) THEN 0
         WHEN LOWER(u.username) = LOWER(?) THEN 1
         WHEN LOWER(u.global_name) = LOWER(?) THEN 2
         ELSE 3
       END,
       COALESCE(u.global_name, u.username) ASC
     LIMIT 8`,
    [q, q, q, q, q, q],
  );

  return NextResponse.json({
    users: rows.map((row) => ({
      siteUsername: row.site_username,
      discordUsername: row.username,
      displayName: row.global_name ?? row.username,
    })),
  });
}
