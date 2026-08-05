"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "PUBLISH" | "SUBMIT_APPROVAL" | "APPROVE" | "CLOSE_SIGNUPS" | "OPEN_CHECKIN" | "START" | "COMPLETE" | "POSTPONE" | "CANCEL" | "REOPEN_DRAFT";

const buttonsByStatus: Record<string, Array<{ action: Action; label: string; danger?: boolean }>> = {
  DRAFT: [
    { action: "PUBLISH", label: "Publish & open signups" },
    { action: "SUBMIT_APPROVAL", label: "Submit for approval" },
  ],
  AWAITING_APPROVAL: [
    { action: "APPROVE", label: "Approve & open signups" },
    { action: "POSTPONE", label: "Return to postponed" },
    { action: "CANCEL", label: "Cancel event", danger: true },
  ],
  SIGNUPS_OPEN: [
    { action: "CLOSE_SIGNUPS", label: "Close signups" },
    { action: "OPEN_CHECKIN", label: "Open check-in" },
    { action: "POSTPONE", label: "Postpone" },
    { action: "CANCEL", label: "Cancel", danger: true },
  ],
  SIGNUPS_CLOSED: [
    { action: "OPEN_CHECKIN", label: "Open check-in" },
    { action: "START", label: "Start event" },
    { action: "POSTPONE", label: "Postpone" },
    { action: "CANCEL", label: "Cancel", danger: true },
  ],
  CHECK_IN_OPEN: [
    { action: "START", label: "Start event" },
    { action: "POSTPONE", label: "Postpone" },
    { action: "CANCEL", label: "Cancel", danger: true },
  ],
  LIVE: [
    { action: "COMPLETE", label: "Complete event" },
    { action: "POSTPONE", label: "Postpone" },
    { action: "CANCEL", label: "Cancel", danger: true },
  ],
  POSTPONED: [{ action: "REOPEN_DRAFT", label: "Reopen as draft" }],
  CANCELLED: [{ action: "REOPEN_DRAFT", label: "Reopen as draft" }],
};

export function EventStatusControls({
  eventId,
  status,
  canApprove,
}: {
  eventId: string;
  status: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState("");
  const buttons = (buttonsByStatus[status] ?? []).filter((button) => button.action !== "APPROVE" || canApprove);

  async function run(action: Action) {
    if (["CANCEL", "POSTPONE", "COMPLETE"].includes(action) && !window.confirm("Are you sure you want to continue?")) return;
    setBusy(action);
    setMessage("");

    try {
      const response = await fetch(`/api/events/${eventId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json() as {
        error?: string;
        status?: string;
        bracketResult?: { generated?: boolean; participantCount?: number };
      };
      if (!response.ok) throw new Error(body.error ?? "Event status could not be changed.");

      const bracketMessage = body.bracketResult?.generated
        ? ` A bracket was generated with ${body.bracketResult.participantCount} participants.`
        : "";
      setMessage(`Event updated to ${body.status?.replaceAll("_", " ").toLowerCase()}.${bracketMessage}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Event status could not be changed.");
    } finally {
      setBusy(null);
    }
  }

  if (!buttons.length) return null;

  return (
    <div className="form-stack">
      <div className="button-row">
        {buttons.map((button) => (
          <button
            className={`button ${button.danger ? "button-danger" : button.action === "POSTPONE" || button.action === "REOPEN_DRAFT" ? "button-secondary" : ""}`}
            type="button"
            key={button.action}
            disabled={Boolean(busy)}
            onClick={() => run(button.action)}
          >
            {busy === button.action ? "Updating…" : button.label}
          </button>
        ))}
      </div>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </div>
  );
}
