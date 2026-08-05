"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Notification = { id: string; title: string; message: string; category: string | null; action_url: string | null; is_read: number; created_at: string };

export function NotificationsList({ notifications }: { notifications: Notification[] }) {
  const router = useRouter(); const [busy, setBusy] = useState<string | null>(null);
  async function mark(id?: string) { setBusy(id ?? "all"); await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { id } : { all: true }) }); setBusy(null); router.refresh(); }
  return <div className="section-stack"><div className="button-row"><button className="button button-secondary" type="button" onClick={() => mark()} disabled={busy === "all"}>Mark all read</button></div>{notifications.length ? <div className="notification-list">{notifications.map((item) => { const content = <article className={`notification-card${item.is_read ? "" : " unread"}`}><div><span className="card-kicker">{item.category ?? "UPDATE"}</span><h3>{item.title}</h3><p>{item.message}</p><small>{new Date(item.created_at).toLocaleString()}</small></div>{!item.is_read ? <button className="button button-secondary" type="button" onClick={(event) => { event.preventDefault(); void mark(item.id); }} disabled={busy === item.id}>Mark read</button> : null}</article>; return item.action_url ? <Link href={item.action_url} key={item.id}>{content}</Link> : <div key={item.id}>{content}</div>; })}</div> : <div className="empty-state">You do not have any notifications yet.</div>}</div>;
}
