"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InfoTip } from "@/components/info-tip";
import { UserLookupField } from "@/components/user-lookup-field";
import {
  WORKSPACE_PERMISSIONS,
  WORKSPACE_PERMISSION_INFO,
  WORKSPACE_ROLE_DEFAULTS,
  type WorkspacePermission,
} from "@/lib/permission-catalog";

type Member = {
  userId: string;
  displayName: string;
  siteUsername: string | null;
  discordId: string;
  role: string;
  displayLabel: string | null;
  status: string;
  avatarUrl: string | null;
  expiresAt: string | null;
  notes: string | null;
  permissions: WorkspacePermission[];
  lastChangedAt: string | null;
  lastChangedBy: string | null;
};

type OwnerClaim = { discordId: string; createdAt: string; activeUserId: string | null };

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function toIsoOrNull(value: string): string | null { return value ? new Date(value).toISOString() : null; }

function MemberEditor({ workspaceId, member, members, busy, setBusy, setMessage }: {
  workspaceId: string; member: Member; members: Member[]; busy: string | null;
  setBusy: (value: string | null) => void; setMessage: (value: string) => void;
}) {
  const router = useRouter();
  const [role, setRole] = useState(member.role);
  const [displayLabel, setDisplayLabel] = useState(member.displayLabel ?? "");
  const [status, setStatus] = useState(member.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE");
  const [expiresAt, setExpiresAt] = useState(toLocalInput(member.expiresAt));
  const [notes, setNotes] = useState(member.notes ?? "");
  const [permissions, setPermissions] = useState<WorkspacePermission[]>(member.permissions);

  function changeRole(value: string) { setRole(value); setPermissions([...(WORKSPACE_ROLE_DEFAULTS[value] ?? [])] as WorkspacePermission[]); }
  function toggle(permission: WorkspacePermission) { setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]); }

  async function save() {
    setBusy(member.userId); setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.userId, role, displayLabel, status, permissions, expiresAt: toIsoOrNull(expiresAt), notes }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Server access could not be updated.");
      setMessage(`${member.displayName}'s access was updated.`); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Server access could not be updated."); }
    finally { setBusy(null); }
  }

  async function remove() {
    if (!window.confirm(`Remove ${member.displayName}'s server-profile access?`)) return;
    setBusy(member.userId); setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members?userId=${encodeURIComponent(member.userId)}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Server access could not be removed.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Server access could not be removed."); }
    finally { setBusy(null); }
  }

  return (
    <details className="access-editor-card">
      <summary>
        {member.avatarUrl ? <img className="access-avatar" src={member.avatarUrl} alt="" /> : <span className="list-icon">{member.displayName.slice(0, 2)}</span>}
        <span className="access-editor-summary"><strong>{member.displayName}</strong><small>{member.siteUsername ? `@${member.siteUsername} · ` : ""}{member.displayLabel ?? member.role} · {member.status.toLowerCase()}</small></span>
        <span className="badge">{member.permissions.length} permissions</span>
      </summary>
      <div className="access-editor-body section-stack">
        <div className="three-column">
          <div className="form-stack compact"><label>Base role <InfoTip text="The role supplies default permissions. The visible title and actual permissions can be customized separately." /></label><select value={role} onChange={(event) => changeRole(event.target.value)}><option value="VIEWER">Viewer</option><option value="REFEREE">Referee</option><option value="HOST">Host</option><option value="STAFF">Staff</option><option value="ADMIN">Admin</option><option value="OWNER">Owner</option></select></div>
          <div className="form-stack compact"><label>Visible label <InfoTip text="This title can say Game Night Host, Senior Moderator, or anything appropriate without automatically granting more access." /></label><input value={displayLabel} onChange={(event) => setDisplayLabel(event.target.value)} placeholder="Game Night Host" /></div>
          <div className="form-stack compact"><label>Status</label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select></div>
        </div>
        <div className="two-column"><div className="form-stack compact"><label>Temporary access expires <InfoTip text="Leave blank for permanent access. Temporary access stops working automatically after this date and time." /></label><input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div><div className="form-stack compact"><label>Private staff note</label><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Tournament host for August" /></div></div>

        {members.length > 1 ? <div className="form-stack compact"><label>Copy permissions from</label><select defaultValue="" onChange={(event) => { const source = members.find((item) => item.userId === event.target.value); if (source) setPermissions([...source.permissions]); event.target.value = ""; }}><option value="">Choose member…</option>{members.filter((item) => item.userId !== member.userId).map((item) => <option key={item.userId} value={item.userId}>{item.displayName} · {item.displayLabel ?? item.role}</option>)}</select></div> : null}

        <div className="permission-grid">{WORKSPACE_PERMISSIONS.map((permission) => { const info = WORKSPACE_PERMISSION_INFO[permission]; return <label className={`permission-option${info.risk ? " high-risk" : ""}`} key={permission}><input type="checkbox" checked={permissions.includes(permission)} onChange={() => toggle(permission)} /><span><strong>{info.label}{info.risk ? " · High risk" : ""}</strong><small>{info.description}</small></span></label>; })}</div>
        <p className="muted">Effective access preview: {permissions.length ? permissions.map((item) => WORKSPACE_PERMISSION_INFO[item].label).join(" · ") : "No management capabilities"}</p>
        <small className="muted">Discord ID {member.discordId}{member.lastChangedAt ? ` · Last changed ${new Date(member.lastChangedAt).toLocaleString()}${member.lastChangedBy ? ` by ${member.lastChangedBy}` : ""}` : ""}</small>
        <div className="button-row"><button className="button" type="button" onClick={save} disabled={busy === member.userId}>{busy === member.userId ? "Saving…" : "Save access"}</button><button className="button button-danger" type="button" onClick={remove} disabled={busy === member.userId}>Remove</button></div>
      </div>
    </details>
  );
}

export function WorkspaceMemberManager({ workspaceId, members, ownerClaims }: { workspaceId: string; actorRole: string; members: Member[]; ownerClaims: OwnerClaim[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function add(formData: FormData) {
    setBusy("add"); setMessage("");
    try {
      const role = String(formData.get("role") ?? "STAFF");
      const response = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: formData.get("identifier"), role, displayLabel: formData.get("displayLabel"), expiresAt: toIsoOrNull(String(formData.get("expiresAt") ?? "")), notes: formData.get("notes") }),
      });
      const body = await response.json() as { error?: string; displayName?: string; pendingClaim?: boolean };
      if (!response.ok) throw new Error(body.error ?? "Server access could not be added.");
      setMessage(body.pendingClaim ? `Owner claim saved for Discord ID ${body.displayName}. It activates when that user signs in.` : `${body.displayName ?? "User"} was added. Open their entry to customize permissions.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Server access could not be added."); }
    finally { setBusy(null); }
  }

  async function removeClaim(discordId: string) {
    if (!window.confirm(`Remove the pending Owner claim for Discord ID ${discordId}?`)) return;
    setBusy(discordId); setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members?discordId=${encodeURIComponent(discordId)}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Owner claim could not be removed.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Owner claim could not be removed."); }
    finally { setBusy(null); }
  }

  return (
    <div className="section-stack">
      <form className="card form-stack" action={add}>
        <div className="section-header"><div><h3>Add server access</h3><p>Roles are presets. After adding a user, open their access card to customize individual capabilities.</p></div></div>
        <div className="two-column"><div><UserLookupField name="identifier" label="User or Discord ID" /><small className="muted">A numeric Discord ID can be saved before first login only for an Owner claim.</small></div><div className="form-stack compact"><label>Base role</label><select name="role" defaultValue="STAFF"><option value="VIEWER">Viewer</option><option value="REFEREE">Referee</option><option value="HOST">Host</option><option value="STAFF">Staff</option><option value="ADMIN">Admin</option><option value="OWNER">Owner</option></select></div></div>
        <div className="three-column"><div className="form-stack compact"><label>Visible label</label><input name="displayLabel" placeholder="Optional custom title" /></div><div className="form-stack compact"><label>Temporary access expires</label><input name="expiresAt" type="datetime-local" /></div><div className="form-stack compact"><label>Private note</label><input name="notes" placeholder="Optional" /></div></div>
        <button className="button" disabled={busy === "add"}>{busy === "add" ? "Adding…" : "Add access"}</button>
      </form>

      <div className="access-editor-list">{members.map((member) => <MemberEditor key={member.userId} workspaceId={workspaceId} member={member} members={members} busy={busy} setBusy={setBusy} setMessage={setMessage} />)}</div>

      {ownerClaims.length ? <div className="pending-owner-claims"><h3>Owner Discord IDs</h3><p className="muted">Owner claims survive before a person's first login. The last Owner cannot be removed until another Owner exists.</p>{ownerClaims.map((claim) => <article className="list-card" key={claim.discordId}><span className="list-icon">ID</span><div><strong>{claim.discordId}</strong><span>{claim.activeUserId ? "Connected to an active website user" : "Waiting for first website login"}</span><small>Added {new Date(claim.createdAt).toLocaleString()}</small></div><button className="button button-danger" type="button" disabled={busy === claim.discordId} onClick={() => removeClaim(claim.discordId)}>Remove claim</button></article>)}</div> : null}
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </div>
  );
}
