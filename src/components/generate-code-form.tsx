"use client";

import { useState } from "react";

export function GenerateCodeForm({ workspaceId, events }: { workspaceId: string; events: { id: string; name: string }[] }) {
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<"STAFF" | "HOST" | "EVENT">("HOST");

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    setCode("");

    const maxUses = String(formData.get("maxUses") ?? "");
    const expiresAt = String(formData.get("expiresAt") ?? "");

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          grantRole: type === "STAFF" ? formData.get("grantRole") : type === "HOST" ? "HOST" : null,
          targetEventId: type === "EVENT" ? formData.get("targetEventId") : null,
          maxUses: maxUses ? Number(maxUses) : null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          note: formData.get("note") || null,
        }),
      });
      const body = (await response.json()) as { error?: string; code?: string; warning?: string };
      if (!response.ok) throw new Error(body.error ?? "The code could not be generated.");

      setCode(body.code ?? "");
      setMessage(body.warning ?? "Code created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The code could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-stack" action={submit}>
      <label htmlFor="code-type">Code type</label>
      <select id="code-type" value={type} onChange={(event) => setType(event.target.value as typeof type)}>
        <option value="HOST">Approved host code</option>
        <option value="STAFF">Staff code</option>
        <option value="EVENT">Event participant code</option>
      </select>

      {type === "STAFF" ? (
        <>
          <label htmlFor="grant-role">Role granted</label>
          <select id="grant-role" name="grantRole" defaultValue="STAFF">
            <option value="ADMIN">Admin</option>
            <option value="STAFF">Staff</option>
            <option value="REFEREE">Referee</option>
            <option value="VIEWER">Viewer</option>
          </select>
        </>
      ) : null}

      {type === "EVENT" ? (
        <>
          <label htmlFor="target-event">Event</label>
          <select id="target-event" name="targetEventId" required>
            <option value="">Select an event</option>
            {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
          </select>
        </>
      ) : null}

      <div className="two-column">
        <div className="form-stack compact">
          <label htmlFor="max-uses">Maximum uses</label>
          <input id="max-uses" name="maxUses" type="number" min={1} max={10000} placeholder="Unlimited" />
        </div>
        <div className="form-stack compact">
          <label htmlFor="expires-at">Expires</label>
          <input id="expires-at" name="expiresAt" type="datetime-local" />
        </div>
      </div>

      <label htmlFor="code-note">Private staff note</label>
      <input id="code-note" name="note" maxLength={255} placeholder="Example: One-time code for Alex" />

      <button className="button" type="submit" disabled={busy || (type === "EVENT" && events.length === 0)}>
        {busy ? "Generating…" : "Generate code"}
      </button>

      {code ? <div className="generated-code"><span>New code</span><strong>{code}</strong></div> : null}
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </form>
  );
}
