"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function ProfileSafetyActions({ userId, blocked }: { userId: string; blocked: boolean }) {
  const router = useRouter();
  const menuRef = useRef<HTMLDetailsElement>(null);
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
      window.setTimeout(() => {
        if (menuRef.current) menuRef.current.open = false;
      }, 1200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Report could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profile-safety-actions">
      <details className="profile-safety-menu" ref={menuRef}>
        <summary className="button button-secondary">Report profile</summary>
        <div className="profile-safety-popover">
          <form className="form-stack compact" action={report}>
            <h3>Report this profile</h3>
            <p className="muted">Report inappropriate bios, banners, usernames, impersonation, harassment, or other content that platform staff should review.</p>
            <label htmlFor={`report-reason-${userId}`}>Reason</label>
            <select id={`report-reason-${userId}`} name="reason" defaultValue="INAPPROPRIATE_CONTENT">
              <option value="INAPPROPRIATE_CONTENT">Inappropriate profile content</option>
              <option value="IMPERSONATION">Impersonation</option>
              <option value="HARASSMENT">Harassment</option>
              <option value="SPAM">Spam</option>
              <option value="CHEATING">Cheating</option>
              <option value="OTHER">Other</option>
            </select>
            <textarea name="details" rows={4} maxLength={2000} placeholder="Explain what should be reviewed." required />
            <button className="button button-danger" disabled={busy}>{busy ? "Submitting…" : "Submit report"}</button>
          </form>
          {message ? <span className="form-message">{message}</span> : null}
        </div>
      </details>
      <button className="button button-secondary" type="button" onClick={toggleBlock} disabled={busy}>{isBlocked ? "Unblock user" : "Block user"}</button>
    </div>
  );
}
