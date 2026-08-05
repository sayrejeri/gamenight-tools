"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PlatformUserModeration({
  userId,
  currentStatus,
  compact = false,
}: {
  userId: string;
  currentStatus: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function moderate(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/platform-users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountStatus: formData.get("accountStatus"),
          clearBio: formData.get("clearBio") === "on",
          clearBanner: formData.get("clearBanner") === "on",
          hideProfile: formData.get("hideProfile") === "on",
          note: formData.get("note"),
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "User moderation action failed.");
      setMessage("User moderation settings updated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "User moderation action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className={`user-moderation-menu${compact ? " compact" : ""}`}>
      <summary className="button button-secondary">Moderate</summary>
      <form className="user-moderation-popover form-stack compact" action={moderate}>
        <h3>Moderate website profile</h3>
        <label htmlFor={`account-status-${userId}`}>Account status</label>
        <select id={`account-status-${userId}`} name="accountStatus" defaultValue={currentStatus}>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="BANNED">Banned</option>
        </select>
        <div className="settings-check-grid moderation-checks">
          <label className="checkbox-row"><input type="checkbox" name="clearBio" />Clear profile bio</label>
          <label className="checkbox-row"><input type="checkbox" name="clearBanner" />Clear profile banner</label>
          <label className="checkbox-row"><input type="checkbox" name="hideProfile" />Force profile private</label>
        </div>
        <label htmlFor={`moderation-note-${userId}`}>Internal note</label>
        <textarea id={`moderation-note-${userId}`} name="note" rows={3} maxLength={1000} placeholder="Reason for the action." />
        <button className="button button-danger" disabled={busy}>{busy ? "Saving…" : "Apply moderation"}</button>
        {message ? <span className="form-message">{message}</span> : null}
      </form>
    </details>
  );
}
