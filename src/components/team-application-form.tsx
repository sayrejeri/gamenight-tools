"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TeamApplicationForm({ teamId, hasPending = false }: { teamId: string; hasPending?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function apply(formData: FormData) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/teams/${teamId}/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ desiredRole: formData.get("desiredRole"), message: formData.get("message") }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Application could not be submitted.");
      setMessage("Application submitted."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Application could not be submitted."); }
    finally { setBusy(false); }
  }
  async function withdraw() {
    setBusy(true); setMessage("");
    try { const response = await fetch(`/api/teams/${teamId}/apply`, { method: "DELETE" }); const body = await response.json() as { error?: string }; if (!response.ok) throw new Error(body.error ?? "Application could not be withdrawn."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Application could not be withdrawn."); }
    finally { setBusy(false); }
  }
  if (hasPending) return <div className="card form-stack"><strong>Application pending</strong><p className="muted">Team owners and managers can review your application.</p><button className="button button-danger" type="button" onClick={withdraw} disabled={busy}>Withdraw application</button>{message ? <p className="form-message">{message}</p> : null}</div>;
  return <form className="card form-stack" action={apply}><h3>Apply to join</h3><label htmlFor="desired-role">Preferred role</label><select id="desired-role" name="desiredRole" defaultValue="PLAYER"><option value="PLAYER">Player</option><option value="SUBSTITUTE">Substitute</option><option value="COACH">Coach</option><option value="MANAGER">Manager</option></select><label htmlFor="application-message">Message</label><textarea id="application-message" name="message" rows={4} maxLength={1000} placeholder="Experience, availability, and why you want to join." /><button className="button" disabled={busy}>{busy ? "Submitting…" : "Submit application"}</button>{message ? <p className="form-message">{message}</p> : null}</form>;
}
