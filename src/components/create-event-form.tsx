"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateEventForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");

    const startsAt = String(formData.get("startsAt") ?? "");
    const signupDeadline = String(formData.get("signupDeadline") ?? "");
    const maxParticipants = String(formData.get("maxParticipants") ?? "");

    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: formData.get("name"),
          gameName: formData.get("gameName") || null,
          description: formData.get("description") || null,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          signupDeadline: signupDeadline ? new Date(signupDeadline).toISOString() : null,
          maxParticipants: maxParticipants ? Number(maxParticipants) : null,
          visibility: formData.get("visibility"),
          joinCodeRequired: formData.get("joinCodeRequired") === "on",
          timezone: formData.get("timezone"),
        }),
      });
      const body = (await response.json()) as { error?: string; eventId?: string; status?: string };
      if (!response.ok) throw new Error(body.error ?? "The event could not be created.");

      setMessage(body.status === "AWAITING_APPROVAL" ? "Event submitted for staff approval." : "Event draft created.");
      router.push(`/dashboard/events/${body.eventId}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The event could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-stack" action={submit}>
      <label htmlFor="event-name">Event name</label>
      <input id="event-name" name="name" required maxLength={160} />

      <label htmlFor="game-name">Game</label>
      <input id="game-name" name="gameName" maxLength={160} />

      <label htmlFor="event-description">Description</label>
      <textarea id="event-description" name="description" rows={4} maxLength={5000} />

      <div className="two-column">
        <div className="form-stack compact">
          <label htmlFor="starts-at">Start time</label>
          <input id="starts-at" name="startsAt" type="datetime-local" />
        </div>
        <div className="form-stack compact">
          <label htmlFor="signup-deadline">Signup deadline</label>
          <input id="signup-deadline" name="signupDeadline" type="datetime-local" />
        </div>
      </div>

      <div className="two-column">
        <div className="form-stack compact">
          <label htmlFor="max-participants">Maximum participants</label>
          <input id="max-participants" name="maxParticipants" type="number" min={2} max={10000} />
        </div>
        <div className="form-stack compact">
          <label htmlFor="event-timezone">Timezone</label>
          <input id="event-timezone" name="timezone" defaultValue="America/Detroit" required />
        </div>
      </div>

      <label htmlFor="event-visibility">Visibility</label>
      <select id="event-visibility" name="visibility" defaultValue="SERVER">
        <option value="SERVER">Show to members of this Discord server</option>
        <option value="CODE_ONLY">Code only</option>
        <option value="UNLISTED">Unlisted link</option>
        <option value="PUBLIC">Public to all logged-in users</option>
        <option value="STAFF_ONLY">Staff only</option>
      </select>

      <label className="checkbox-row">
        <input name="joinCodeRequired" type="checkbox" defaultChecked />
        Require an event join code to sign up
      </label>

      <button className="button" type="submit" disabled={busy}>{busy ? "Creating…" : "Create event"}</button>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </form>
  );
}
