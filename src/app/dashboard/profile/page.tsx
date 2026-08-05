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

export default async function ProfilePage() {
  const session = await requireSession();
  const connections = await query<ConnectionRow[]>(
    `SELECT id, source, connection_type, external_id, handle, display_name,
            profile_url, avatar_url, is_verified, is_visible
     FROM user_connections WHERE user_id = ?
     ORDER BY source ASC, connection_type ASC`,
    [session.userId],
  );

  return (
    <div className="section-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Your profile</span>
          <h1>Game identities</h1>
          <p>Connections imported from Discord can be changed, hidden, or replaced with your preferred usernames.</p>
        </div>
      </section>
      <ProfileConnectionsForm connections={connections} />
    </div>
  );
}
