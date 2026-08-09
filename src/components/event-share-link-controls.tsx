"use client";

import { useState } from "react";

type ShareState = { enabled: boolean; url: string; expiresAt: string | null } | null;

export function EventShareLinkControls({ eventId, initialShare }: { eventId: string; initialShare: ShareState }) {
  const [share, setShare] = useState<ShareState>(initialShare);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function generate() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/share-link`, { method: "POST" });
      const body = await response.json() as { error?: string; enabled?: boolean; url?: string };
      if (!response.ok || !body.url) throw new Error(body.error ?? "Spectator link could not be created.");
      setShare({ enabled: true, url: body.url, expiresAt: null });
      setMessage(share ? "A new spectator link replaced the old one." : "Spectator link created.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Spectator link could not be created."); }
    finally { setBusy(false); }
  }

  async function revoke() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/share-link`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Spectator link could not be disabled.");
      setShare((current) => current ? { ...current, enabled: false } : null);
      setMessage("Anonymous spectator access disabled.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Spectator link could not be disabled."); }
    finally { setBusy(false); }
  }

  async function copy() {
    if (!share?.url) return;
    try {
      const absolute = share.url.startsWith("/") ? `${window.location.origin}${share.url}` : share.url;
      await navigator.clipboard.writeText(absolute);
      setMessage("Spectator link copied.");
    } catch { setMessage("Copy failed. Select the link and copy it manually."); }
  }

  return (
    <section className="subpanel section-stack spectator-share-controls">
      <div className="section-header">
        <div><h3>Anonymous spectator link</h3><p className="muted">Anyone with this link can view the live or completed competition without signing in. Drafts, staff controls, reports, proof, disputes, and private participant data stay hidden.</p></div>
        <span className="badge">{share?.enabled ? "Enabled" : "Off"}</span>
      </div>
      {share?.enabled ? <div className="share-link-row"><input aria-label="Anonymous spectator link" readOnly value={share.url} /><button className="button button-secondary" type="button" onClick={copy}>Copy</button></div> : <div className="empty-state">No active anonymous spectator link.</div>}
      <div className="button-row">
        <button className="button" type="button" disabled={busy} onClick={generate}>{busy ? "Working…" : share ? "Generate new link" : "Create spectator link"}</button>
        {share?.enabled ? <button className="button button-secondary" type="button" disabled={busy} onClick={revoke}>Disable link</button> : null}
      </div>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </section>
  );
}
