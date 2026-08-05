"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const statuses = ["PENDING", "APPROVED", "WAITLISTED", "REJECTED", "NO_SHOW", "DISQUALIFIED"] as const;

export function ParticipantStatusControl({
  eventId,
  userId,
  initialStatus,
}: {
  eventId: string;
  userId: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/participants/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Participant could not be updated.");
      setMessage("Saved");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Participant could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="participant-status-control">
      <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Participant status">
        {statuses.map((value) => <option value={value} key={value}>{value.replaceAll("_", " ")}</option>)}
      </select>
      <button className="button button-secondary" type="button" disabled={busy || status === initialStatus} onClick={save}>{busy ? "Saving…" : "Save"}</button>
      {message ? <span className="field-help">{message}</span> : null}
    </div>
  );
}
