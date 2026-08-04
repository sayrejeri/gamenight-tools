"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CohostResponseButtons({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function respond(decision: "ACCEPTED" | "DECLINED") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/cohost-invitations/${invitationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The invitation could not be updated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The invitation could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="button-row">
        <button className="button" type="button" disabled={busy} onClick={() => respond("ACCEPTED")}>Accept</button>
        <button className="button button-secondary" type="button" disabled={busy} onClick={() => respond("DECLINED")}>Decline</button>
      </div>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </div>
  );
}
