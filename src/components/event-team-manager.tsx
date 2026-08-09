"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type RosterMember = { userId: string; name: string; role?: string };
type RegisteredTeam = {
  teamId: string;
  name: string;
  tag: string | null;
  logoUrl: string | null;
  captainUserId: string | null;
  roster: RosterMember[];
  canWithdraw: boolean;
};
type EligibleTeam = {
  teamId: string;
  name: string;
  tag: string | null;
  logoUrl: string | null;
  myRole: string | null;
  canRegister: boolean;
};
type TeamPayload = {
  canManage: boolean;
  eventStatus: string;
  maxTeams: number | null;
  registered: RegisteredTeam[];
  eligible: EligibleTeam[];
};

export function EventTeamManager({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [data, setData] = useState<TeamPayload | null>(null);
  const [message, setMessage] = useState("");
  const [busyTeam, setBusyTeam] = useState<string | null>(null);

  async function load() {
    const response = await fetch(`/api/events/${eventId}/teams`, { cache: "no-store" });
    const body = await response.json() as TeamPayload & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Team tournament information could not be loaded.");
    setData(body);
  }

  useEffect(() => { load().catch((error) => setMessage(error instanceof Error ? error.message : "Team tournament information could not be loaded.")); }, [eventId]);

  async function mutate(teamId: string, method: "POST" | "DELETE") {
    setBusyTeam(teamId); setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/teams`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Team registration could not be changed.");
      setMessage(method === "POST" ? "Team registered. Its current active roster was saved for this event." : "Team withdrawn from this tournament.");
      await load();
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Team registration could not be changed."); }
    finally { setBusyTeam(null); }
  }

  if (!data) return <section className="panel"><p className="muted">Loading tournament teams…</p>{message ? <p className="form-message">{message}</p> : null}</section>;
  const atLimit = Boolean(data.maxTeams && data.registered.length >= data.maxTeams);

  return (
    <div className="section-stack">
      <section className="panel section-stack">
        <div className="section-header">
          <div><h2>Registered teams</h2><p>{data.registered.length}{data.maxTeams ? ` / ${data.maxTeams}` : ""} teams are currently entered. Rosters are snapshotted at registration so the tournament does not change unexpectedly when a team profile changes.</p></div>
          <span className="badge">{data.eventStatus.replaceAll("_", " ")}</span>
        </div>
        {data.registered.length ? <div className="team-entry-grid">{data.registered.map((team) => (
          <article className="team-entry-card" key={team.teamId}>
            <div className="team-entry-heading">
              {team.logoUrl ? <img src={team.logoUrl} alt="" /> : <div className="team-logo-fallback">{team.tag?.slice(0, 2) ?? team.name.slice(0, 2)}</div>}
              <div><span className="card-kicker">{team.tag ? `[${team.tag}]` : "Tournament team"}</span><h3>{team.name}</h3></div>
            </div>
            <div className="team-roster-list">{team.roster.length ? team.roster.map((member) => <div key={`${team.teamId}-${member.userId}`}><strong>{member.name}</strong><span>{member.role?.replaceAll("_", " ") ?? "PLAYER"}</span></div>) : <span className="muted">No roster snapshot available.</span>}</div>
            {team.canWithdraw ? <button className="button button-secondary" type="button" disabled={busyTeam === team.teamId} onClick={() => mutate(team.teamId, "DELETE")}>{busyTeam === team.teamId ? "Working…" : "Withdraw team"}</button> : null}
          </article>
        ))}</div> : <div className="empty-state">No teams are registered yet.</div>}
      </section>

      <section className="panel section-stack">
        <div className="section-header"><div><h2>Register a team</h2><p>Team owners, managers, and captains can enter their approved teams while signups are open. Event staff can manage registrations before the tournament goes live.</p></div>{atLimit ? <span className="badge">Full</span> : null}</div>
        {data.eligible.length ? <div className="team-entry-grid">{data.eligible.map((team) => (
          <article className="team-entry-card compact" key={team.teamId}>
            <div className="team-entry-heading">{team.logoUrl ? <img src={team.logoUrl} alt="" /> : <div className="team-logo-fallback">{team.tag?.slice(0, 2) ?? team.name.slice(0, 2)}</div>}<div><span className="card-kicker">{team.myRole ? `Your role: ${team.myRole}` : "Available team"}</span><h3>{team.name}</h3></div></div>
            <button className="button" type="button" disabled={!team.canRegister || atLimit || busyTeam === team.teamId} onClick={() => mutate(team.teamId, "POST")}>{busyTeam === team.teamId ? "Registering…" : team.canRegister ? "Register team" : "Captain/manager required"}</button>
          </article>
        ))}</div> : <div className="empty-state">No additional approved teams are available for you to register.</div>}
      </section>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </div>
  );
}
