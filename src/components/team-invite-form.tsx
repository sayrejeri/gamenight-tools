"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TeamInviteForm({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function invite(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: formData.get("identifier"), role: formData.get("role") }),
      });
      const body = await response.json() as { error?: string; invitedUser?: string };
      if (!response.ok) throw new Error(body.error ?? "Invitation could not be sent.");
      setMessage(`${body.invitedUser ?? "User"} was invited.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invitation could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="staff-control-row" action={invite}>
      <input name="identifier" placeholder="Site username, Discord username, or Discord ID" required />
      <select name="role" defaultValue="PLAYER">
        <option value="PLAYER">Player</option>
        <option value="SUBSTITUTE">Substitute</option>
        <option value="CAPTAIN">Captain</option>
        <option value="COACH">Coach</option>
        <option value="MANAGER">Manager</option>
      </select>
      <span className="field-help">The user must have signed into Game Night Tools at least once.</span>
      <button className="button" disabled={busy}>{busy ? "Inviting…" : "Invite member"}</button>
      {message ? <span className="form-message">{message}</span> : null}
    </form>
  );
}
