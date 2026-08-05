"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Member = {
  userId: string;
  displayName: string;
  siteUsername: string | null;
  discordId: string;
  role: string;
  status: string;
  avatarUrl: string | null;
};

type OwnerClaim = {
  discordId: string;
  createdAt: string;
  activeUserId: string | null;
};

export function WorkspaceMemberManager({
  workspaceId,
  actorRole,
  members,
  ownerClaims,
}: {
  workspaceId: string;
  actorRole: string;
  members: Member[];
  ownerClaims: OwnerClaim[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function add(formData: FormData) {
    setBusy("add");
    setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: formData.get("identifier"), role: formData.get("role") }),
      });
      const body = await response.json() as { error?: string; displayName?: string; pendingClaim?: boolean };
      if (!response.ok) throw new Error(body.error ?? "Server access could not be added.");
      setMessage(body.pendingClaim ? `Owner claim saved for Discord ID ${body.displayName}. It activates when that user signs in.` : `${body.displayName ?? "User"} was added to the server profile.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Server access could not be added.");
    } finally {
      setBusy(null);
    }
  }

  async function updateRole(userId: string, role: string) {
    setBusy(userId);
    setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Server role could not be updated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Server role could not be updated.");
    } finally {
      setBusy(null);
    }
  }

  async function removeMember(userId: string) {
    if (!window.confirm("Remove this user's server-profile access?")) return;
    setBusy(userId);
    setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Server access could not be removed.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Server access could not be removed.");
    } finally {
      setBusy(null);
    }
  }

  async function removeClaim(discordId: string) {
    if (!window.confirm(`Remove the pending owner claim for Discord ID ${discordId}?`)) return;
    setBusy(discordId);
    setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members?discordId=${encodeURIComponent(discordId)}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Owner claim could not be removed.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Owner claim could not be removed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="section-stack">
      <form className="workspace-member-add" action={add}>
        <div className="form-stack compact">
          <label htmlFor={`workspace-member-${workspaceId}`}>User or Discord ID</label>
          <input id={`workspace-member-${workspaceId}`} name="identifier" placeholder="Site username, Discord username, or numeric Discord ID" required />
          <span className="field-help">A numeric Discord ID can be saved as a pending owner claim before the person signs in.</span>
        </div>
        <div className="form-stack compact">
          <label htmlFor={`workspace-role-${workspaceId}`}>Server role</label>
          <select id={`workspace-role-${workspaceId}`} name="role" defaultValue="STAFF">
            {actorRole === "OWNER" ? <option value="OWNER">Owner</option> : null}
            <option value="ADMIN">Admin</option>
            <option value="STAFF">Staff</option>
            <option value="HOST">Host</option>
            <option value="REFEREE">Referee</option>
            <option value="VIEWER">Viewer</option>
          </select>
          <span className="field-help">Only owners can assign or remove another owner.</span>
        </div>
        <button className="button" disabled={busy === "add"}>{busy === "add" ? "Adding…" : "Add access"}</button>
      </form>

      <div className="workspace-member-list">
        {members.map((member) => {
          const protectedOwner = member.role === "OWNER" && actorRole !== "OWNER";
          return (
            <article className="workspace-member-card" key={member.userId}>
              {member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : <span className="list-icon">{member.displayName.slice(0, 2)}</span>}
              <div className="workspace-member-identity">
                <strong>{member.displayName}</strong>
                <span>{member.siteUsername ? `@${member.siteUsername} · ` : ""}Discord ID {member.discordId}</span>
                <small>{member.status.toLowerCase()}</small>
              </div>
              <select
                aria-label={`Role for ${member.displayName}`}
                value={member.role}
                disabled={busy === member.userId || protectedOwner}
                onChange={(event) => updateRole(member.userId, event.target.value)}
              >
                {actorRole === "OWNER" ? <option value="OWNER">Owner</option> : null}
                <option value="ADMIN">Admin</option>
                <option value="STAFF">Staff</option>
                <option value="HOST">Host</option>
                <option value="REFEREE">Referee</option>
                <option value="VIEWER">Viewer</option>
              </select>
              <button className="button button-danger" type="button" disabled={busy === member.userId || protectedOwner} onClick={() => removeMember(member.userId)}>Remove</button>
            </article>
          );
        })}
      </div>

      {ownerClaims.length ? (
        <div className="pending-owner-claims">
          <h3>Owner Discord IDs</h3>
          <p className="muted">These IDs permanently grant owner access. Claims without an active user will activate on that person's next Discord login.</p>
          {ownerClaims.map((claim) => (
            <article className="list-card" key={claim.discordId}>
              <span className="list-icon">ID</span>
              <div><strong>{claim.discordId}</strong><span>{claim.activeUserId ? "Connected to an active website user" : "Waiting for first website login"}</span><small>Added {new Date(claim.createdAt).toLocaleString()}</small></div>
              <button className="button button-danger" type="button" disabled={busy === claim.discordId || actorRole !== "OWNER"} onClick={() => removeClaim(claim.discordId)}>Remove claim</button>
            </article>
          ))}
        </div>
      ) : null}

      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </div>
  );
}
