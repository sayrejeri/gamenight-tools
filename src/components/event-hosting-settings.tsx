"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EventHostingSettings({ eventId, initialSignupMode }: { eventId: string; initialSignupMode: "AUTO" | "APPROVAL" }) {
  const router = useRouter();
  const [signupMode, setSignupMode] = useState(initialSignupMode);
  const [savedMode, setSavedMode] = useState(initialSignupMode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/hosting-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signupMode }),
      });
      const body = await response.json() as { error?: string; signupMode?: "AUTO" | "APPROVAL" };
      if (!response.ok) throw new Error(body.error ?? "Hosting settings could not be saved.");
      setSavedMode(body.signupMode ?? signupMode);
      setMessage("Signup settings saved. Existing signup statuses were not changed.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Hosting settings could not be saved."); }
    finally { setBusy(false); }
  }

  return (
    <div className="event-hosting-settings card form-stack">
      <div><span className="card-kicker">Signup workflow</span><h3>How should new signups be handled?</h3></div>
      <label className="radio-card"><input type="radio" name={`signup-mode-${eventId}`} checked={signupMode === "AUTO"} onChange={() => setSignupMode("AUTO")} /><span><strong>Automatic</strong><small>Players are approved immediately until the event is full, then new signups go to the waitlist.</small></span></label>
      <label className="radio-card"><input type="radio" name={`signup-mode-${eventId}`} checked={signupMode === "APPROVAL"} onChange={() => setSignupMode("APPROVAL")} /><span><strong>Host approval</strong><small>Every new signup stays pending until an authorized host approves, waitlists, or rejects it.</small></span></label>
      <div className="button-row"><button className="button button-secondary" type="button" disabled={busy || signupMode === savedMode} onClick={save}>{busy ? "Saving…" : "Save signup workflow"}</button>{message ? <span className="field-help">{message}</span> : null}</div>
    </div>
  );
}
