"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Notification = { id: string; title: string; message: string; category: string | null; action_url: string | null; is_read: number; created_at: string };

export function NotificationsList({ notifications }: { notifications: Notification[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");
  const categories = useMemo(() => Array.from(new Set(notifications.map((item) => item.category ?? "UPDATE"))).sort(), [notifications]);
  const visible = filter === "ALL" ? notifications : notifications.filter((item) => (item.category ?? "UPDATE") === filter);

  async function mark(id?: string) {
    setBusy(id ?? "all");
    try { await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { id } : { all: true }) }); }
    finally { setBusy(null); router.refresh(); }
  }

  async function remove(id: string) {
    setBusy(`delete-${id}`);
    try {
      const response = await fetch("/api/notifications", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Notification could not be deleted.");
      router.refresh();
    } finally { setBusy(null); }
  }

  async function removeAllRead() {
    if (!window.confirm("Delete all read notifications?")) return;
    setBusy("delete-all");
    try { await fetch("/api/notifications", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allRead: true }) }); }
    finally { setBusy(null); router.refresh(); }
  }

  return (
    <div className="section-stack">
      <div className="notification-toolbar">
        <div className="button-row"><button className="button button-secondary" type="button" onClick={() => mark()} disabled={busy === "all"}>Mark all read</button><button className="button button-secondary" type="button" onClick={removeAllRead} disabled={busy === "delete-all"}>Delete all read</button></div>
        <select aria-label="Filter notifications" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">All notifications</option>{categories.map((category) => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}</select>
      </div>
      {visible.length ? <div className="notification-list">{visible.map((item) => (
        <article className={`notification-card${item.is_read ? "" : " unread"}`} key={item.id}>
          {item.action_url ? <Link className="notification-card-main" href={item.action_url}><span className="card-kicker">{item.category ?? "UPDATE"}</span><h3>{item.title}</h3><p>{item.message}</p><small>{new Date(item.created_at).toLocaleString()}</small></Link> : <div className="notification-card-main"><span className="card-kicker">{item.category ?? "UPDATE"}</span><h3>{item.title}</h3><p>{item.message}</p><small>{new Date(item.created_at).toLocaleString()}</small></div>}
          <div className="notification-actions">{!item.is_read ? <button className="button button-secondary" type="button" onClick={() => mark(item.id)} disabled={busy === item.id}>Mark read</button> : <button className="notification-trash" type="button" title="Delete notification" aria-label={`Delete ${item.title}`} onClick={() => remove(item.id)} disabled={busy === `delete-${item.id}`}>🗑</button>}</div>
        </article>
      ))}</div> : <div className="empty-state">{notifications.length ? "No notifications match this filter." : "You do not have any notifications yet."}</div>}
    </div>
  );
}
