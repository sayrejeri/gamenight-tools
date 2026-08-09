"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const statuses = ["PENDING", "APPROVED", "WAITLISTED", "REJECTED", "NO_SHOW", "DISQUALIFIED"] as const;

export function ParticipantStatusControl({
  eventId,
  userId,
  initialStatus,
  initialNote = "",
}: {
  eventId: string;
  userId: string;
  initialStatus: string;
  initialNote?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [note, setNote] = useState(initialNote);
  const [savedNote, setSavedNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const changed = status !== initialStatus || note !== savedNote;

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/participants/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, staffNote: note }),
      });
      const body = await response.json() as { error?: string; status?: string; staffNote?: string | null; promotedWaitlistUser?: boolean };
      if (!response.ok) throw new Error(body.error ?? "Participant could not be updated.");
      const actualStatus = body.status ?? status;
      setStatus(actualStatus);
      setSavedNote(body.staffNote ?? "");
      setNote(body.staffNote ?? "");
      setMessage(body.promotedWaitlistUser ? "Saved · next waitlisted player was promoted." : actualStatus !== status ? `Saved as ${actualStatus.replaceAll("_", " ").toLowerCase()} because the event is full.` : "Saved");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Participant could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="participant-status-control participant-status-control-v041">
      <div className="two-column participant-control-row">
        <div className="form-stack compact">
          <label>Status</label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Participant status">
            {statuses.map((value) => <option value={value} key={value}>{value.replaceAll("_", " ")}</option>)}
          </select>
        </div>
        <div className="form-stack compact">
          <label>Private host note</label>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={2} placeholder="Only event staff can see this note." />
        </div>
      </div>
      <div className="button-row">
        <button className="button button-secondary" type="button" disabled={busy || !changed} onClick={save}>{busy ? "Saving…" : "Save participant"}</button>
        {message ? <span className="field-help">{message}</span> : null}
      </div>
    </div>
  );
}
