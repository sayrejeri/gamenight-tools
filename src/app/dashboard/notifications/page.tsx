import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { NotificationsList } from "@/components/notifications-list";

type NotificationRow = RowDataPacket & { id: string; title: string; message: string; category: string | null; action_url: string | null; is_read: number; created_at: Date };

export default async function NotificationsPage() {
  const session = await requireSession();
  const notifications = await query<NotificationRow[]>(
    `SELECT id, title, message, category, action_url, is_read, created_at
     FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`,
    [session.userId],
  );
  return <div className="section-stack"><section className="page-heading"><div><span className="eyebrow">Updates and invitations</span><h1>Notifications</h1><p>Profile decisions, team applications, event reminders, waitlist promotions, staff updates, and future chat mentions appear here.</p></div></section><NotificationsList notifications={notifications.map((item) => ({ ...item, created_at: new Date(item.created_at).toISOString() }))} /></div>;
}
