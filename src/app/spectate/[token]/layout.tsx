import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";

type AccessRow = RowDataPacket & { event_id: string };

export default async function SpectatorTokenLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}>) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/i.test(token)) notFound();

  // The layout validates only whether the share token itself is valid. The page
  // owns the event/bracket lifecycle rules so a valid link can safely render a
  // pre-live, postponed, or cancelled status without exposing competition data.
  const rows = await query<AccessRow[]>(
    `SELECT e.id AS event_id
     FROM event_public_share_links s
     INNER JOIN events e ON e.id = s.event_id
     WHERE s.token = ?
       AND s.is_enabled = 1
       AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP(3))
     LIMIT 1`,
    [token],
  );
  if (!rows[0]) notFound();

  return children;
}
