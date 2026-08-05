"use client";

import { useState } from "react";

export function SaveEventTemplateButton({ eventId, defaultName }: { eventId: string; defaultName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${defaultName} template`);
  const [shared, setShared] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, shared }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Template could not be saved.");
      setMessage("Event template saved.");
      setOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Template could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-stack">
      <button className="button button-secondary" type="button" onClick={() => setOpen((current) => !current)}>
        {open ? "Close template form" : "Save as event template"}
      </button>
      {open ? (
        <div className="subpanel form-stack">
          <label htmlFor="template-name">Template name</label>
          <input id="template-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} />
          <label className="checkbox-row">
            <input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} />
            Share with approved hosts in this server
          </label>
          <button className="button" type="button" disabled={busy || name.trim().length < 2} onClick={save}>
            {busy ? "Saving…" : "Save template"}
          </button>
        </div>
      ) : null}
      {message ? <p className="form-message">{message}</p> : null}
    </div>
  );
}
