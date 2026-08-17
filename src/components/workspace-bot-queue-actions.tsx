"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function WorkspaceBotQueueActions({ workspaceId, failedCount, pendingCount }: { workspaceId: string; failedCount: number; pendingCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"retry" | "cancel" | null>(null);
  const [message, setMessage] = useState("");

  async function run(action: "RETRY_FAILED" | "CANCEL_PENDING") {
    if (action === "CANCEL_PENDING" && !window.confirm("Cancel all currently queued Discord bot jobs for this server? Jobs already processing cannot be cancelled here.")) return;
    setBusy(action === "RETRY_FAILED" ? "retry" : "cancel");
    setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/bot/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json() as { error?: string; affected?: number };
      if (!response.ok) throw new Error(body.error ?? "Bot queue action failed.");
      const affected = Number(body.affected ?? 0);
      setMessage(action === "RETRY_FAILED" ? `${affected} failed job${affected === 1 ? "" : "s"} queued for retry.` : `${affected} queued job${affected === 1 ? "" : "s"} cancelled.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bot queue action failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="section-stack">
      <div className="button-row">
        <button className="button button-secondary" type="button" disabled={!failedCount || busy !== null} onClick={() => run("RETRY_FAILED")}>{busy === "retry" ? "Retrying…" : `Retry failed (${failedCount})`}</button>
        <button className="button button-secondary" type="button" disabled={!pendingCount || busy !== null} onClick={() => run("CANCEL_PENDING")}>{busy === "cancel" ? "Cancelling…" : `Cancel queued (${pendingCount})`}</button>
      </div>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
      <p className="field-help">Retries are revalidated against current server settings, user DM preferences, event state, match state, and role/channel eligibility before Four Seasons can deliver them.</p>
    </div>
  );
}
