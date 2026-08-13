"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export type IdentityAffiliation = {
  teamId: string;
  teamName: string;
  teamSlug: string;
  workspaceId: string;
  workspaceName: string;
  status: "PENDING" | "APPROVED" | "DENIED" | "REVOKED";
  initiatedBy: "TEAM" | "WORKSPACE";
};

export type IdentityOption = { id: string; name: string; slug?: string };

type ApiBody = { error?: string };

async function affiliationRequest(payload: { teamId: string; workspaceId: string; initiatedBy: "TEAM" | "WORKSPACE" }) {
  const response = await fetch("/api/team-affiliations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json() as ApiBody;
  if (!response.ok) throw new Error(body.error ?? "Affiliation request failed.");
}

async function affiliationDecision(payload: { teamId: string; workspaceId: string; decision: "APPROVE" | "DENY" | "REVOKE" }) {
  const response = await fetch("/api/team-affiliations", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json() as ApiBody;
  if (!response.ok) throw new Error(body.error ?? "Affiliation could not be updated.");
}

export function TeamPrivateServerCard({ teamId, teamName, url, canEdit }: { teamId: string; teamName: string; url: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(nextUrl: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/teams/${teamId}/private-server`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: nextUrl }),
      });
      const body = await response.json() as ApiBody;
      if (!response.ok) throw new Error(body.error ?? "Roblox private server link could not be saved.");
      setMessage(nextUrl ? "Private server link saved." : "Private server link cleared.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Roblox private server link could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void save(String(data.get("privateServerUrl") ?? ""));
  }

  return (
    <section className="card section-stack">
      <div className="section-header"><div><span className="card-kicker">Members only</span><h3>{teamName} private server</h3></div>{url ? <span className="badge">Configured</span> : <span className="badge">Not set</span>}</div>
      <p className="muted">This Roblox private-server invite is only loaded for accepted team members. It is never shown on public team/server pages.</p>
      {url ? <a className="button" href={url} target="_blank" rel="noreferrer">Join team private server</a> : <div className="empty-state">No private server link is configured.</div>}
      {canEdit ? <form className="form-stack compact" onSubmit={submit}><label htmlFor={`private-server-${teamId}`}>Roblox private server invite</label><input id={`private-server-${teamId}`} name="privateServerUrl" type="url" defaultValue={url ?? ""} placeholder="https://www.roblox.com/share?code=...&type=Server" /><span className="field-help">Owner, Manager, and Captain can update this link.</span><div className="button-row"><button className="button button-secondary" disabled={busy}>{busy ? "Saving…" : "Save link"}</button>{url ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => void save("")}>Clear link</button> : null}</div></form> : null}
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </section>
  );
}

export function TeamAffiliationManager({ teamId, canManage, affiliations, workspaceOptions }: { teamId: string; canManage: boolean; affiliations: IdentityAffiliation[]; workspaceOptions: IdentityOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const current = affiliations.filter((item) => item.status === "APPROVED" || item.status === "PENDING");
  const occupied = new Set(current.map((item) => item.workspaceId));
  const available = workspaceOptions.filter((workspace) => !occupied.has(workspace.id));

  async function request(workspaceId: string) {
    if (!workspaceId) return;
    setBusy(true); setMessage("");
    try { await affiliationRequest({ teamId, workspaceId, initiatedBy: "TEAM" }); setMessage("Server approval requested."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Server approval could not be requested."); }
    finally { setBusy(false); }
  }

  async function decide(workspaceId: string, decision: "APPROVE" | "DENY" | "REVOKE") {
    setBusy(true); setMessage("");
    try { await affiliationDecision({ teamId, workspaceId, decision }); setMessage(decision === "APPROVE" ? "Server invitation accepted." : decision === "DENY" ? "Server invitation declined." : "Server affiliation revoked."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Affiliation could not be updated."); }
    finally { setBusy(false); }
  }

  return (
    <section className="card section-stack">
      <div className="section-header"><div><span className="card-kicker">Server identity</span><h3>Approved servers</h3></div><span className="badge">{affiliations.filter((item) => item.status === "APPROVED").length} approved</span></div>
      {affiliations.some((item) => item.status === "APPROVED") ? <div className="request-list">{affiliations.filter((item) => item.status === "APPROVED").map((item) => <article className="list-card" key={item.workspaceId}><span className="list-icon">✓</span><div><strong>{item.workspaceName}</strong><span>Approved server affiliation</span></div>{canManage ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => void decide(item.workspaceId, "REVOKE")}>Revoke</button> : null}</article>)}</div> : <div className="empty-state">This team is not approved by a server yet.</div>}
      {canManage ? <>
        {affiliations.filter((item) => item.status === "PENDING").map((item) => item.initiatedBy === "WORKSPACE" ? <article className="review-card" key={`incoming-${item.workspaceId}`}><span className="card-kicker">Server invitation</span><h3>{item.workspaceName}</h3><p>This server wants to list the team as an approved affiliated team.</p><div className="button-row"><button className="button" type="button" disabled={busy} onClick={() => void decide(item.workspaceId, "APPROVE")}>Approve</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => void decide(item.workspaceId, "DENY")}>Deny</button></div></article> : <article className="list-card" key={`outgoing-${item.workspaceId}`}><span className="list-icon">…</span><div><strong>{item.workspaceName}</strong><span>Waiting for server approval</span></div></article>)}
        {available.length ? <form className="form-stack compact" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void request(String(data.get("workspaceId") ?? "")); }}><label htmlFor={`team-affiliation-${teamId}`}>Request another server</label><div className="button-row"><select id={`team-affiliation-${teamId}`} name="workspaceId" required defaultValue=""><option value="" disabled>Select an approved server</option>{available.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><button className="button button-secondary" disabled={busy}>Request approval</button></div></form> : null}
      </> : null}
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </section>
  );
}

export function WorkspaceTeamAffiliationManager({ workspaceId, workspaceName, affiliations, teamOptions }: { workspaceId: string; workspaceName: string; affiliations: IdentityAffiliation[]; teamOptions: IdentityOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const current = affiliations.filter((item) => item.status === "APPROVED" || item.status === "PENDING");
  const occupied = new Set(current.map((item) => item.teamId));
  const available = teamOptions.filter((team) => !occupied.has(team.id));

  async function invite(teamId: string) {
    if (!teamId) return;
    setBusy(true); setMessage("");
    try { await affiliationRequest({ teamId, workspaceId, initiatedBy: "WORKSPACE" }); setMessage("Team invitation sent."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Team invitation could not be sent."); }
    finally { setBusy(false); }
  }

  async function decide(teamId: string, decision: "APPROVE" | "DENY" | "REVOKE") {
    setBusy(true); setMessage("");
    try { await affiliationDecision({ teamId, workspaceId, decision }); setMessage(decision === "APPROVE" ? "Team approved for this server." : decision === "DENY" ? "Team request denied." : "Team affiliation revoked."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Affiliation could not be updated."); }
    finally { setBusy(false); }
  }

  return (
    <section className="card section-stack">
      <div className="section-header"><div><span className="card-kicker">{workspaceName}</span><h3>Server teams</h3></div><span className="badge">{affiliations.filter((item) => item.status === "APPROVED").length} approved</span></div>
      {affiliations.filter((item) => item.status === "APPROVED").map((item) => <article className="list-card" key={`approved-${item.teamId}`}><span className="list-icon">✓</span><div><Link href={`/teams/${item.teamSlug}`}><strong>{item.teamName}</strong></Link><span>Approved for this server</span></div><button className="button button-secondary" type="button" disabled={busy} onClick={() => void decide(item.teamId, "REVOKE")}>Revoke</button></article>)}
      {affiliations.filter((item) => item.status === "PENDING").map((item) => item.initiatedBy === "TEAM" ? <article className="review-card" key={`incoming-${item.teamId}`}><span className="card-kicker">Team request</span><h3>{item.teamName}</h3><p>This team wants approval to be affiliated with {workspaceName}.</p><div className="button-row"><button className="button" type="button" disabled={busy} onClick={() => void decide(item.teamId, "APPROVE")}>Approve</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => void decide(item.teamId, "DENY")}>Deny</button></div></article> : <article className="list-card" key={`outgoing-${item.teamId}`}><span className="list-icon">…</span><div><strong>{item.teamName}</strong><span>Waiting for team approval</span></div></article>)}
      {available.length ? <form className="form-stack compact" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void invite(String(data.get("teamId") ?? "")); }}><label htmlFor={`workspace-team-${workspaceId}`}>Invite an approved team</label><div className="button-row"><select id={`workspace-team-${workspaceId}`} name="teamId" required defaultValue=""><option value="" disabled>Select a team</option>{available.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select><button className="button button-secondary" disabled={busy}>Invite team</button></div></form> : null}
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </section>
  );
}
