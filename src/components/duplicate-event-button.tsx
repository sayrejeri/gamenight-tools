"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DuplicateEventButton({ eventId, eventName }: { eventId: string; eventName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function duplicate() {
    const name = window.prompt("Name the duplicated event", `${eventName} Copy`);
    if (name === null) return;
    if (name.trim().length < 2) return setMessage("Enter a name for the new event.");
    const keepSchedule = window.confirm("Keep the original event's dates and times?\n\nOK = keep schedule\nCancel = copy setup without dates");
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), keepSchedule }),
      });
      const body = await response.json() as { error?: string; eventId?: string };
      if (!response.ok || !body.eventId) throw new Error(body.error ?? "Event could not be duplicated.");
      router.push(`/dashboard/events/${body.eventId}/edit`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Event could not be duplicated."); }
    finally { setBusy(false); }
  }

  return <span className="duplicate-event-control"><button className="button button-secondary" type="button" disabled={busy} onClick={duplicate}>{busy ? "Duplicating…" : "Duplicate event"}</button>{message ? <span className="field-help">{message}</span> : null}</span>;
}
