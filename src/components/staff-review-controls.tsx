"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function StaffReviewControls({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function review(formData: FormData) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/profile-requests/${requestId}/review`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: formData.get("decision"), reason: formData.get("reason"), verificationLevel: formData.get("verificationLevel") }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Request could not be reviewed.");
      setMessage("Request reviewed."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request could not be reviewed."); }
    finally { setBusy(false); }
  }

  return <form className="staff-review-form" action={review}><select name="decision" defaultValue="APPROVED"><option value="APPROVED">Approve</option><option value="CHANGES_REQUESTED">Request changes</option><option value="DENIED">Deny</option></select><select name="verificationLevel" defaultValue="APPROVED"><option value="APPROVED">Approved</option><option value="OWNERSHIP_VERIFIED">Ownership verified</option><option value="OFFICIAL">Official</option><option value="PARTNER">Partner</option></select><input name="reason" placeholder="Reason or notes" maxLength={1000} /><button className="button" disabled={busy}>{busy ? "Saving…" : "Apply decision"}</button>{message ? <span className="form-message">{message}</span> : null}</form>;
}
