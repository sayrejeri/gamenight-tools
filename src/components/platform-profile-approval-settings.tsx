"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PlatformProfileApprovalSettings({ required }: { required: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(required);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/staff/profile-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverProfileApprovalRequired: value }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Approval policy could not be saved.");
      setMessage(value ? "New server profiles require platform approval." : "Eligible server profiles will be created immediately after ownership/Manage Server checks.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approval policy could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel section-stack">
      <div className="section-header"><div><span className="eyebrow">Platform Owner setting</span><h2>Server profile approval</h2><p>Choose whether new server profiles wait for a platform review after Discord ownership/Manage Server validation.</p></div><span className="badge">{value ? "Approval required" : "Automatic"}</span></div>
      <label className="checkbox-row"><input type="checkbox" checked={value} onChange={(event) => setValue(event.target.checked)} />Require platform approval for new server profiles</label>
      <p className="muted">Turning this off does not bypass Discord authorization. The requester must still own the Discord server or have Manage Server/Administrator permission.</p>
      <div className="button-row"><button className="button" type="button" disabled={busy || value === required} onClick={save}>{busy ? "Saving…" : "Save approval policy"}</button></div>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </section>
  );
}
