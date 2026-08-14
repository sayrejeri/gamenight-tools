import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { ProfileConnectionsForm } from "@/components/profile-connections-form";

type ConnectionRow = RowDataPacket & {
  id: string;
  source: "DISCORD" | "MANUAL";
  connection_type: string;
  external_id: string | null;
  handle: string;
  display_name: string | null;
  profile_url: string | null;
  avatar_url: string | null;
  is_verified: number;
  is_visible: number;
};
type UserRow = RowDataPacket & { site_username: string | null };

function safeReturnTo(value: string | undefined): string | null {
  if (!value) return null;
  if (value === "/dashboard" || value.startsWith("/dashboard/")) return value;
  return null;
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const session = await requireSession();
  const params = await searchParams;
  const returnTo = safeReturnTo(params.returnTo);
  const [connections, users] = await Promise.all([
    query<ConnectionRow[]>(
      `SELECT id, source, connection_type, external_id, handle, display_name,
              profile_url, avatar_url, is_verified, is_visible
       FROM user_connections
       WHERE user_id = ? AND NOT (source = 'DISCORD' AND is_visible < 0)
       ORDER BY source ASC, connection_type ASC`,
      [session.userId],
    ),
    query<UserRow[]>(`SELECT site_username FROM users WHERE id = ? LIMIT 1`, [session.userId]),
  ]);

  return (
    <div className="section-stack">
      <section className="page-heading">
        <div><span className="eyebrow">Your profile</span><h1>Game identities</h1><p>Discord-imported identities stay synced to Discord and can only be shown, hidden, or removed here. Manual identities remain fully editable.</p></div>
        <div className="button-row">
          {returnTo ? <Link className="button" href={returnTo}>Return to event</Link> : null}
          <Link className="button button-secondary" href="/dashboard/settings">Profile settings</Link>
          {users[0]?.site_username ? <Link className="button button-secondary" href={`/users/${users[0].site_username}`}>View public profile</Link> : null}
        </div>
      </section>
      <ProfileConnectionsForm connections={connections} returnTo={returnTo} />
    </div>
  );
}
