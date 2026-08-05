"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TeamInvitationControls({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"ACCEPT" | "DECLINE" | null>(null);
  const [message, setMessage] = useState("");

  async function respond(action: "ACCEPT" | "DECLINE") {
    setBusy(action);
    setMessage("");
    try {
      const response = await fetch(`/api/teams/${teamId}/membership`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Invitation could not be updated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invitation could not be updated.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="form-stack compact">
      <div className="button-row">
        <button className="button" type="button" onClick={() => respond("ACCEPT")} disabled={Boolean(busy)}>{busy === "ACCEPT" ? "Accepting…" : "Accept"}</button>
        <button className="button button-danger" type="button" onClick={() => respond("DECLINE")} disabled={Boolean(busy)}>{busy === "DECLINE" ? "Declining…" : "Decline"}</button>
      </div>
      {message ? <span className="form-message">{message}</span> : null}
    </div>
  );
}
