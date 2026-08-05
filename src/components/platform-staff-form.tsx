"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PlatformStaffForm({ staff }: { staff: Array<{ userId: string; name: string; role: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function assign(formData: FormData) {
    setBusy("assign"); setMessage("");
    try {
      const response = await fetch("/api/platform-staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: formData.get("identifier"), role: formData.get("role") }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Staff role could not be updated.");
      setMessage("Staff role updated."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Staff role could not be updated."); }
    finally { setBusy(null); }
  }

  async function remove(userId: string) {
    if (!window.confirm("Remove this platform staff role?")) return;
    setBusy(userId); setMessage("");
    try {
      const response = await fetch(`/api/platform-staff?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Staff role could not be removed.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Staff role could not be removed."); }
    finally { setBusy(null); }
  }

  return <div className="section-stack"><form className="staff-control-row" action={assign}><input name="identifier" placeholder="Site username, Discord username, or Discord ID" required /><select name="role" defaultValue="SUPPORT"><option value="SUPPORT">Support</option><option value="MODERATOR">Moderator</option><option value="REVIEWER">Profile reviewer</option><option value="ADMIN">Admin</option><option value="OWNER">Owner</option></select><button className="button" disabled={busy === "assign"}>{busy === "assign" ? "Saving…" : "Assign role"}</button></form><div className="request-list">{staff.map((member) => <article className="list-card" key={member.userId}><span className="list-icon">{member.name.slice(0, 2)}</span><div><strong>{member.name}</strong><span>{member.role.toLowerCase()}</span></div><button className="button button-danger" type="button" disabled={busy === member.userId} onClick={() => remove(member.userId)}>Remove</button></article>)}</div>{message ? <p className="form-message">{message}</p> : null}</div>;
}
