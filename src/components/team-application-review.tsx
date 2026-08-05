"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TeamApplicationReview({ teamId, applicationId, desiredRole }: { teamId: string; applicationId: string; desiredRole: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function review(formData: FormData) {
    setBusy(true); setMessage("");
    try { const response = await fetch(`/api/teams/${teamId}/applications/${applicationId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: formData.get("decision"), role: formData.get("role") }) }); const body = await response.json() as { error?: string }; if (!response.ok) throw new Error(body.error ?? "Application could not be reviewed."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Application could not be reviewed."); }
    finally { setBusy(false); }
  }
  return <form className="staff-review-form" action={review}><select name="decision" defaultValue="ACCEPTED"><option value="ACCEPTED">Accept</option><option value="DENIED">Deny</option></select><select name="role" defaultValue={desiredRole}><option value="PLAYER">Player</option><option value="SUBSTITUTE">Substitute</option><option value="CAPTAIN">Captain</option><option value="COACH">Coach</option><option value="MANAGER">Manager</option></select><button className="button button-secondary" disabled={busy}>Review</button>{message ? <span className="form-message">{message}</span> : null}</form>;
}
