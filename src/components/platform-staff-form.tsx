"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InfoTip } from "@/components/info-tip";
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_PERMISSION_INFO,
  PLATFORM_ROLE_DEFAULTS,
  type PlatformPermission,
} from "@/lib/permission-catalog";

type StaffMember = {
  userId: string;
  name: string;
  role: string;
  displayLabel: string | null;
  status: string;
  expiresAt: string | null;
  suspendedReason: string | null;
  permissions: PlatformPermission[];
  lastChangedAt: string | null;
  lastChangedBy: string | null;
};

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoOrNull(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function StaffEditor({ member, allStaff, busy, onBusy, onMessage }: {
  member: StaffMember;
  allStaff: StaffMember[];
  busy: string | null;
  onBusy: (value: string | null) => void;
  onMessage: (value: string) => void;
}) {
  const router = useRouter();
  const [role, setRole] = useState(member.role);
  const [displayLabel, setDisplayLabel] = useState(member.displayLabel ?? "");
  const [status, setStatus] = useState(member.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE");
  const [expiresAt, setExpiresAt] = useState(toLocalInput(member.expiresAt));
  const [suspendedReason, setSuspendedReason] = useState(member.suspendedReason ?? "");
  const [permissions, setPermissions] = useState<PlatformPermission[]>(member.permissions);

  function changeRole(nextRole: string) {
    setRole(nextRole);
    setPermissions([...(PLATFORM_ROLE_DEFAULTS[nextRole] ?? [])] as PlatformPermission[]);
  }

  function togglePermission(permission: PlatformPermission) {
    setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
  }

  async function save() {
    onBusy(member.userId);
    onMessage("");
    try {
      const response = await fetch("/api/platform-staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.userId, role, displayLabel, status, permissions, expiresAt: toIsoOrNull(expiresAt), suspendedReason }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Staff access could not be updated.");
      onMessage(`${member.name}'s access was updated.`);
      router.refresh();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Staff access could not be updated.");
    } finally {
      onBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${member.name}'s platform staff access?`)) return;
    onBusy(member.userId);
    onMessage("");
    try {
      const response = await fetch(`/api/platform-staff?userId=${encodeURIComponent(member.userId)}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Staff access could not be removed.");
      router.refresh();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Staff access could not be removed.");
    } finally {
      onBusy(null);
    }
  }

  return (
    <details className="access-editor-card">
      <summary>
        <span className="list-icon">{member.name.slice(0, 2)}</span>
        <span className="access-editor-summary"><strong>{member.name}</strong><small>{member.displayLabel ?? member.role} · {member.status.toLowerCase()}</small></span>
        <span className="badge">{member.permissions.length} permissions</span>
      </summary>
      <div className="access-editor-body section-stack">
        <div className="three-column">
          <div className="form-stack compact">
            <label>Base role <InfoTip text="The base role provides default permissions. Individual permissions below can then be customized." /></label>
            <select value={role} onChange={(event) => changeRole(event.target.value)}>
              <option value="SUPPORT">Support</option><option value="MODERATOR">Moderator</option><option value="REVIEWER">Profile reviewer</option><option value="ADMIN">Admin</option><option value="OWNER">Owner</option>
            </select>
          </div>
          <div className="form-stack compact"><label>Visible label <InfoTip text="This is the title people see. It does not decide what the person can actually do." /></label><input value={displayLabel} onChange={(event) => setDisplayLabel(event.target.value)} placeholder="Moderator" /></div>
          <div className="form-stack compact"><label>Status</label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select></div>
        </div>

        <div className="two-column">
          <div className="form-stack compact"><label>Temporary access expires <InfoTip text="Leave blank for permanent access. Temporary staff access automatically stops working after this date and time." /></label><input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div>
          <div className="form-stack compact"><label>Suspension reason</label><input value={suspendedReason} onChange={(event) => setSuspendedReason(event.target.value)} disabled={status !== "SUSPENDED"} placeholder="Optional private reason" /></div>
        </div>

        {allStaff.length > 1 ? <div className="form-stack compact"><label>Copy permissions from</label><select defaultValue="" onChange={(event) => { const source = allStaff.find((item) => item.userId === event.target.value); if (source) setPermissions([...source.permissions]); event.target.value = ""; }}><option value="">Choose staff member…</option>{allStaff.filter((item) => item.userId !== member.userId).map((item) => <option key={item.userId} value={item.userId}>{item.name} · {item.displayLabel ?? item.role}</option>)}</select></div> : null}

        <div className="permission-grid">
          {PLATFORM_PERMISSIONS.map((permission) => {
            const info = PLATFORM_PERMISSION_INFO[permission];
            return <label className={`permission-option${info.risk ? " high-risk" : ""}`} key={permission}><input type="checkbox" checked={permissions.includes(permission)} onChange={() => togglePermission(permission)} /><span><strong>{info.label}{info.risk ? " · High risk" : ""}</strong><small>{info.description}</small></span></label>;
          })}
        </div>

        <p className="muted">Effective access preview: {permissions.length ? permissions.map((item) => PLATFORM_PERMISSION_INFO[item].label).join(" · ") : "No platform capabilities"}</p>
        {member.lastChangedAt ? <small className="muted">Last changed {new Date(member.lastChangedAt).toLocaleString()}{member.lastChangedBy ? ` by ${member.lastChangedBy}` : ""}</small> : null}
        <div className="button-row"><button className="button" type="button" onClick={save} disabled={busy === member.userId}>{busy === member.userId ? "Saving…" : "Save access"}</button><button className="button button-danger" type="button" onClick={remove} disabled={busy === member.userId}>Remove</button></div>
      </div>
    </details>
  );
}

export function PlatformStaffForm({ staff }: { staff: StaffMember[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function assign(formData: FormData) {
    setBusy("assign"); setMessage("");
    try {
      const role = String(formData.get("role") ?? "SUPPORT");
      const response = await fetch("/api/platform-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: formData.get("identifier"), role, displayLabel: formData.get("displayLabel"), expiresAt: toIsoOrNull(String(formData.get("expiresAt") ?? "")) }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Staff role could not be assigned.");
      setMessage("Staff access added. Open their entry to customize permissions.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Staff access could not be assigned."); }
    finally { setBusy(null); }
  }

  return (
    <div className="section-stack">
      <form className="card form-stack" action={assign}>
        <div className="section-header"><div><h3>Add platform staff</h3><p>Assign a safe base role first. High-level roles and custom permissions are protected server-side.</p></div></div>
        <div className="two-column"><div className="form-stack compact"><label>User</label><input name="identifier" placeholder="Site username, Discord username, or Discord ID" required /></div><div className="form-stack compact"><label>Base role</label><select name="role" defaultValue="SUPPORT"><option value="SUPPORT">Support</option><option value="MODERATOR">Moderator</option><option value="REVIEWER">Profile reviewer</option><option value="ADMIN">Admin</option><option value="OWNER">Owner</option></select></div></div>
        <div className="two-column"><div className="form-stack compact"><label>Visible label</label><input name="displayLabel" placeholder="Optional custom title" /></div><div className="form-stack compact"><label>Temporary access expires</label><input name="expiresAt" type="datetime-local" /></div></div>
        <button className="button" disabled={busy === "assign"}>{busy === "assign" ? "Adding…" : "Add staff access"}</button>
      </form>
      <div className="access-editor-list">{staff.map((member) => <StaffEditor key={member.userId} member={member} allStaff={staff} busy={busy} onBusy={setBusy} onMessage={setMessage} />)}</div>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </div>
  );
}
