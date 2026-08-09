import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";

type AccessRow = RowDataPacket & { event_status: string };

export default async function SpectatorTokenLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}>) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/i.test(token)) notFound();

  const rows = await query<AccessRow[]>(
    `SELECT e.status AS event_status
     FROM event_public_share_links s
     INNER JOIN events e ON e.id = s.event_id
     INNER JOIN brackets b ON b.event_id = e.id
     WHERE s.token = ?
       AND s.is_enabled = 1
       AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP(3))
       AND e.status IN ('LIVE', 'COMPLETED')
       AND b.status IN ('LIVE', 'COMPLETED')
     LIMIT 1`,
    [token],
  );
  if (!rows[0]) notFound();

  return children;
}
