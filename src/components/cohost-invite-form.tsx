"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CohostInviteForm({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/events/${eventId}/cohosts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discordId: formData.get("discordId"),
          permissionLevel: formData.get("permissionLevel"),
          expiresAt: null,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The co-host invitation could not be sent.");

      setMessage("Co-host invitation sent. They can accept it after logging in with Discord.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The co-host invitation could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-stack" action={submit}>
      <label htmlFor="cohost-discord-id">Co-host Discord ID</label>
      <input id="cohost-discord-id" name="discordId" required inputMode="numeric" pattern="[0-9]{15,25}" />

      <label htmlFor="cohost-permission">Permissions</label>
      <select id="cohost-permission" name="permissionLevel" defaultValue="FULL">
        <option value="FULL">Full co-host</option>
        <option value="BRACKET">Bracket manager</option>
        <option value="SIGNUPS">Signup manager</option>
        <option value="SCOREKEEPER">Scorekeeper</option>
        <option value="ANNOUNCEMENTS">Announcement manager</option>
        <option value="VIEW_ONLY">View only</option>
      </select>

      <button className="button" type="submit" disabled={busy}>{busy ? "Sending…" : "Invite co-host"}</button>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </form>
  );
}
