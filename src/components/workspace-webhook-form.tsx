"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InfoTip } from "@/components/info-tip";

type Webhook = {
  id: string; label: string; urlHint: string; notificationTypes: string[]; usernameOverride: string | null;
  avatarUrl: string | null; isActive: boolean; lastSuccessAt: string | null; lastErrorMessage: string | null;
};
const notificationOptions = [
  ["EVENT_PUBLISHED", "Event published"], ["SIGNUPS_CLOSED", "Signups closed"], ["CHECK_IN_OPEN", "Check-in opened"],
  ["EVENT_LIVE", "Event started"], ["EVENT_COMPLETED", "Event completed"], ["EVENT_CANCELLED", "Event cancelled"],
  ["BRACKET_PUBLISHED", "Bracket published"], ["SUGGESTION_UPDATE", "Suggestion update"],
  ["COMMUNITY_ANNOUNCEMENT", "Community chat announcement"],
] as const;

function WebhookEditor({ workspaceId, webhook, busy, setBusy, setMessage }: {
  workspaceId: string; webhook: Webhook; busy: string | null; setBusy: (value: string | null) => void; setMessage: (value: string) => void;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(webhook.label);
  const [usernameOverride, setUsernameOverride] = useState(webhook.usernameOverride ?? "");
  const [avatarUrl, setAvatarUrl] = useState(webhook.avatarUrl ?? "");
  const [replacementUrl, setReplacementUrl] = useState("");
  const [isActive, setIsActive] = useState(webhook.isActive);
  const [types, setTypes] = useState<string[]>(webhook.notificationTypes);

  function toggleType(value: string) { setTypes((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]); }

  async function save() {
    setBusy(webhook.id); setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/webhooks`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: webhook.id, label, url: replacementUrl, usernameOverride, avatarUrl, notificationTypes: types, isActive }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Webhook could not be updated.");
      setReplacementUrl(""); setMessage(`${label} was updated.`); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Webhook could not be updated."); }
    finally { setBusy(null); }
  }

  async function test() {
    setBusy(webhook.id); setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/webhooks/${webhook.id}/test`, { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Webhook test failed.");
      setMessage(`Test message delivered through ${label}.`); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Webhook test failed."); }
    finally { setBusy(null); }
  }

  async function remove() {
    if (!window.confirm(`Delete the webhook connection "${label}"?`)) return;
    setBusy(webhook.id); setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/webhooks?webhookId=${encodeURIComponent(webhook.id)}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Webhook could not be deleted.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Webhook could not be deleted."); }
    finally { setBusy(null); }
  }

  return (
    <details className="access-editor-card webhook-editor-card">
      <summary><span className="list-icon">WH</span><span className="access-editor-summary"><strong>{webhook.label}</strong><small>{webhook.urlHint} · {webhook.isActive ? "active" : "disabled"}</small></span><span className="badge">{webhook.notificationTypes.length} alerts</span></summary>
      <div className="access-editor-body section-stack">
        <div className="two-column"><div className="form-stack compact"><label>Private label</label><input value={label} onChange={(event) => setLabel(event.target.value)} /></div><div className="form-stack compact"><label>Replace webhook URL <InfoTip text="Leave this blank to keep the encrypted webhook URL already saved. Paste a new Discord webhook URL only when you want to replace it." /></label><input type="url" value={replacementUrl} onChange={(event) => setReplacementUrl(event.target.value)} placeholder="Leave blank to keep current URL" /></div></div>
        <div className="two-column"><div className="form-stack compact"><label>Sender name</label><input value={usernameOverride} onChange={(event) => setUsernameOverride(event.target.value)} placeholder="Game Night Tools" /></div><div className="form-stack compact"><label>Sender avatar URL <InfoTip text="Use a publicly accessible image URL. The image host must allow Discord to load the image directly." /></label><input type="url" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." /></div></div>
        <label className="checkbox-row"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />Webhook enabled</label>
        <div className="settings-check-grid">{notificationOptions.map(([value, text]) => <label className="checkbox-row" key={value}><input type="checkbox" checked={types.includes(value)} onChange={() => toggleType(value)} />{text}</label>)}</div>
        {webhook.lastSuccessAt ? <small className="muted">Last success: {new Date(webhook.lastSuccessAt).toLocaleString()}</small> : null}
        {webhook.lastErrorMessage ? <p className="error-banner">Last error: {webhook.lastErrorMessage}</p> : null}
        <div className="button-row"><button className="button" type="button" onClick={save} disabled={busy === webhook.id}>{busy === webhook.id ? "Saving…" : "Save changes"}</button><button className="button button-secondary" type="button" onClick={test} disabled={busy === webhook.id}>Send test</button><button className="button button-danger" type="button" onClick={remove} disabled={busy === webhook.id}>Delete</button></div>
      </div>
    </details>
  );
}

export function WorkspaceWebhookForm({ workspaceId, webhooks }: { workspaceId: string; webhooks: Webhook[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function add(formData: FormData) {
    setBusy("new"); setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/webhooks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: formData.get("label"), url: formData.get("url"), usernameOverride: formData.get("usernameOverride"), avatarUrl: formData.get("avatarUrl"), notificationTypes: notificationOptions.filter(([value]) => formData.get(value) === "on").map(([value]) => value) }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Webhook could not be saved.");
      setMessage("Webhook saved securely. You can add another destination or edit this one at any time."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Webhook could not be saved."); }
    finally { setBusy(null); }
  }

  return (
    <div className="section-stack">
      {webhooks.length ? <div className="access-editor-list">{webhooks.map((webhook) => <WebhookEditor key={webhook.id} workspaceId={workspaceId} webhook={webhook} busy={busy} setBusy={setBusy} setMessage={setMessage} />)}</div> : <div className="empty-state">No Discord webhooks are connected yet.</div>}
      <form className="card form-stack" action={add}>
        <div><h3>Add another Discord webhook</h3><p className="muted">Each server can have multiple webhook destinations. The full URL is encrypted and is never displayed again.</p></div>
        <div className="two-column"><div className="form-stack compact"><label>Private label</label><input name="label" placeholder="Event announcements" required /></div><div className="form-stack compact"><label>Discord webhook URL <InfoTip text="In Discord, create a webhook for the channel and paste its full https://discord.com/api/webhooks/... URL here. Game Night Tools encrypts it before storage." /></label><input name="url" type="url" placeholder="https://discord.com/api/webhooks/..." required /></div></div>
        <div className="two-column"><div className="form-stack compact"><label>Sender name</label><input name="usernameOverride" placeholder="Game Night Tools" /></div><div className="form-stack compact"><label>Sender avatar URL</label><input name="avatarUrl" type="url" placeholder="https://..." /></div></div>
        <div className="settings-check-grid">{notificationOptions.map(([value, text]) => <label className="checkbox-row" key={value}><input name={value} type="checkbox" defaultChecked={value === "EVENT_PUBLISHED" || value === "EVENT_COMPLETED" || value === "BRACKET_PUBLISHED"} />{text}</label>)}</div>
        <button className="button" disabled={busy === "new"}>{busy === "new" ? "Saving…" : "Add webhook"}</button>
      </form>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </div>
  );
}
