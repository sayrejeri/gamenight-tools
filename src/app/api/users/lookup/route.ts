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

  const like = `%${q.replace(/[\\%_]/g, (value) => `\\${value}`)}%`;
  const rows = await query<UserLookupRow[]>(
    `SELECT site_username, username, global_name
     FROM users
     WHERE site_username LIKE ? ESCAPE '\\\\'
        OR username LIKE ? ESCAPE '\\\\'
        OR global_name LIKE ? ESCAPE '\\\\'
     ORDER BY
       CASE
         WHEN LOWER(site_username) = LOWER(?) THEN 0
         WHEN LOWER(username) = LOWER(?) THEN 1
         WHEN LOWER(global_name) = LOWER(?) THEN 2
         ELSE 3
       END,
       COALESCE(global_name, username) ASC
     LIMIT 8`,
    [like, like, like, q, q, q],
  );

  return NextResponse.json({
    users: rows.map((row) => ({
      siteUsername: row.site_username,
      discordUsername: row.username,
      displayName: row.global_name ?? row.username,
    })),
  });
}
