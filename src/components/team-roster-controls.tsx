"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TeamRosterControls({
  teamId,
  userId,
  currentRole,
  actorRole,
}: {
  teamId: string;
  userId: string;
  currentRole: string;
  actorRole: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function updateRole(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/teams/${teamId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: formData.get("role") }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Roster role could not be changed.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Roster role could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove this member from the team roster?")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/teams/${teamId}/members?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Roster member could not be removed.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Roster member could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  const canManage = currentRole !== "OWNER" && (actorRole === "OWNER" || currentRole !== "MANAGER");
  if (!canManage) return null;

  return (
    <form className="roster-controls" action={updateRole}>
      <select name="role" defaultValue={currentRole} disabled={busy}>
        <option value="PLAYER">Player</option>
        <option value="SUBSTITUTE">Substitute</option>
        <option value="CAPTAIN">Captain</option>
        <option value="COACH">Coach</option>
        {actorRole === "OWNER" ? <option value="MANAGER">Manager</option> : null}
      </select>
      <button className="button button-secondary" disabled={busy}>Save role</button>
      <button className="button button-danger" type="button" onClick={remove} disabled={busy}>Remove</button>
      {message ? <span className="form-message">{message}</span> : null}
    </form>
  );
}
