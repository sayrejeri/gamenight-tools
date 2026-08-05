"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProfileSafetyActions({ userId, blocked }: { userId: string; blocked: boolean }) {
  const router = useRouter();
  const [isBlocked, setIsBlocked] = useState(blocked);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function toggleBlock() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(isBlocked ? `/api/profile/block?userId=${encodeURIComponent(userId)}` : "/api/profile/block", {
        method: isBlocked ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: isBlocked ? undefined : JSON.stringify({ userId }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Block setting could not be changed.");
      setIsBlocked(!isBlocked);
      setMessage(isBlocked ? "User unblocked." : "User blocked. Their profile and future messages will be hidden from you.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Block setting could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function report(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "USER",
          targetId: userId,
          reason: formData.get("reason"),
          details: formData.get("details"),
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Report could not be submitted.");
      setMessage("Report submitted to platform moderators.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Report could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="profile-safety-menu">
      <summary>Safety</summary>
      <div className="profile-safety-popover">
        <button className="button button-danger" type="button" onClick={toggleBlock} disabled={busy}>{isBlocked ? "Unblock user" : "Block user"}</button>
        <form className="form-stack compact" action={report}>
          <label htmlFor={`report-reason-${userId}`}>Report reason</label>
          <select id={`report-reason-${userId}`} name="reason" defaultValue="OTHER">
            <option value="SPAM">Spam</option>
            <option value="HARASSMENT">Harassment</option>
            <option value="IMPERSONATION">Impersonation</option>
            <option value="INAPPROPRIATE_CONTENT">Inappropriate content</option>
            <option value="CHEATING">Cheating</option>
            <option value="OTHER">Other</option>
          </select>
          <textarea name="details" rows={3} maxLength={2000} placeholder="Explain what happened." />
          <button className="button button-secondary" disabled={busy}>Submit report</button>
        </form>
        {message ? <span className="form-message">{message}</span> : null}
      </div>
    </details>
  );
}
