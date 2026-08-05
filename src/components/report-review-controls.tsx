"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReportReviewControls({ reportId, currentStatus }: { reportId: string; currentStatus: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function update(formData: FormData) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/reports/${reportId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: formData.get("status"), resolutionNote: formData.get("resolutionNote") }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Report could not be updated.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Report could not be updated."); }
    finally { setBusy(false); }
  }
  return <form className="staff-review-form" action={update}><select name="status" defaultValue={currentStatus === "OPEN" ? "UNDER_REVIEW" : currentStatus}><option value="UNDER_REVIEW">Under review</option><option value="RESOLVED">Resolved</option><option value="DISMISSED">Dismissed</option></select><input name="resolutionNote" placeholder="Resolution note" maxLength={1000} /><button className="button button-secondary" disabled={busy}>Update</button>{message ? <span className="form-message">{message}</span> : null}</form>;
}
