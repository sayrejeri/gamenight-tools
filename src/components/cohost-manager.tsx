"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Cohost = {
  id: string;
  displayName: string;
  siteUsername: string | null;
  discordUsername: string | null;
  discordId: string;
  avatarUrl: string | null;
  permissionLevel: string;
  status: string;
  expiresAt: string | null;
};

const levels = [
  ["FULL", "Full access", "Manage the event, co-hosts, participants, bracket, and announcements."],
  ["BRACKET", "Bracket", "Manage bracket placement and results."],
  ["SIGNUPS", "Signups", "Manage participant signup statuses."],
  ["SCOREKEEPER", "Scorekeeper", "Manage participants and event scoring workflows."],
  ["ANNOUNCEMENTS", "Announcements", "Announcement-focused access without full event management."],
  ["VIEW_ONLY", "View only", "See restricted event information without changing it."],
] as const;

function localInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function CohostManager({ eventId, cohosts }: { eventId: string; cohosts: Cohost[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function save(cohost: Cohost, form: HTMLFormElement) {
    const data = new FormData(form);
    const rawExpiration = cohost.status === "PENDING" ? String(data.get("expiresAt") ?? "").trim() : "";
    setBusy(cohost.id); setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/cohosts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cohostId: cohost.id,
          permissionLevel: data.get("permissionLevel"),
          expiresAt: rawExpiration ? new Date(rawExpiration).toISOString() : null,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Co-host access could not be updated.");
      setMessage(`${cohost.displayName}'s access was updated.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Co-host access could not be updated."); }
    finally { setBusy(null); }
  }

  async function revoke(cohost: Cohost) {
    if (!window.confirm(`Remove ${cohost.displayName}'s co-host access?`)) return;
    setBusy(cohost.id); setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/cohosts?cohostId=${encodeURIComponent(cohost.id)}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Co-host access could not be removed.");
      setMessage(`${cohost.displayName}'s co-host access was removed.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Co-host access could not be removed."); }
    finally { setBusy(null); }
  }

  if (!cohosts.length) return <div className="empty-state">No co-hosts have been invited.</div>;

  return (
    <div className="section-stack cohost-manager-v041">
      <div className="access-editor-list">
        {cohosts.map((cohost) => {
          const active = !["REVOKED", "DECLINED", "EXPIRED"].includes(cohost.status);
          const pending = cohost.status === "PENDING";
          return <details className="access-editor-card" key={cohost.id}>
            <summary>
              {cohost.avatarUrl ? <img className="list-avatar" src={cohost.avatarUrl} alt="" /> : <span className="list-icon">{cohost.displayName.slice(0, 2)}</span>}
              <span className="access-editor-summary"><strong>{cohost.displayName}</strong><small>{cohost.siteUsername ? `@${cohost.siteUsername} · ` : ""}{cohost.discordUsername ? `Discord @${cohost.discordUsername}` : `Discord ID ${cohost.discordId}`}</small></span>
              <span className="badge">{cohost.status}</span>
              <span className="badge">{cohost.permissionLevel.replaceAll("_", " ")}</span>
            </summary>
            <form className="access-editor-body section-stack" onSubmit={(event) => { event.preventDefault(); void save(cohost, event.currentTarget); }}>
              <div className="two-column">
                <div className="form-stack compact"><label>Co-host role</label><select name="permissionLevel" defaultValue={cohost.permissionLevel} disabled={!active}>{levels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <div className="form-stack compact"><label>Invitation deadline</label><input name="expiresAt" type="datetime-local" defaultValue={pending ? localInputValue(cohost.expiresAt) : ""} disabled={!active || !pending} /><small className="muted">{pending ? "This controls how long the invitation can be accepted. Leave blank for no deadline." : "The invitation deadline no longer applies after the co-host accepts."}</small></div>
              </div>
              <div className="cohost-permission-guide">{levels.map(([value, label, description]) => <div key={value}><strong>{label}</strong><span>{description}</span></div>)}</div>
              <div className="button-row">
                {active ? <button className="button" disabled={busy === cohost.id}>{busy === cohost.id ? "Saving…" : "Save access"}</button> : null}
                {active ? <button className="button button-danger" type="button" disabled={busy === cohost.id} onClick={() => revoke(cohost)}>Revoke access</button> : null}
              </div>
            </form>
          </details>;
        })}
      </div>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </div>
  );
}
