import type { RowDataPacket } from "mysql2";
import { requireSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { NotificationsList } from "@/components/notifications-list";

type NotificationRow = RowDataPacket & {
  id: string;
  title: string;
  message: string;
  category: string | null;
  action_url: string | null;
  is_read: number;
  created_at: Date;
  workspace_name: string | null;
};

function formatNotification(item: NotificationRow) {
  if (!item.workspace_name || item.category !== "SERVERS") return item;

  if (item.title === "Server access updated") {
    const role = item.message.match(/now\s+([a-z_]+)\.?$/i)?.[1]?.replaceAll("_", " ") ?? "updated";
    return {
      ...item,
      title: `${item.workspace_name} access updated`,
      message: role === "updated" ? `Your access for ${item.workspace_name} was updated.` : `Your role for ${item.workspace_name} is now ${role}.`,
    };
  }

  return item;
}

export default async function NotificationsPage() {
  const session = await requireSession();
  const notifications = await query<NotificationRow[]>(
    `SELECT n.id, n.title, n.message, n.category, n.action_url, n.is_read, n.created_at,
            w.name AS workspace_name
     FROM notifications n
     LEFT JOIN workspaces w
       ON n.category = 'SERVERS'
      AND n.action_url LIKE '/dashboard/workspaces/%'
      AND w.id = SUBSTRING_INDEX(n.action_url, '/', -1)
     WHERE n.user_id = ?
     ORDER BY n.created_at DESC LIMIT 200`,
    [session.userId],
  );

  return <div className="section-stack"><section className="page-heading"><div><span className="eyebrow">Updates and invitations</span><h1>Notifications</h1><p>Profile decisions, team applications, event reminders, waitlist promotions, staff updates, and future chat mentions appear here.</p></div></section><NotificationsList notifications={notifications.map((row) => { const item = formatNotification(row); return { id: item.id, title: item.title, message: item.message, category: item.category, action_url: item.action_url, is_read: item.is_read, created_at: new Date(item.created_at).toISOString() }; })} /></div>;
}
