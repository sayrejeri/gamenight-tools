"use client";

import { useMemo, useState } from "react";
import { ParticipantStatusControl } from "@/components/participant-status-control";

type Participant = {
  userId: string;
  gameName: string;
  profileUrl: string | null;
  avatarUrl: string | null;
  identityLabel: string | null;
  discordUsername: string;
  joinedAt: string;
  checkedInAt: string | null;
  status: string;
  staffNote: string | null;
};

const filterOptions = ["ALL", "PENDING", "APPROVED", "WAITLISTED", "REJECTED", "WITHDRAWN", "NO_SHOW", "DISQUALIFIED", "CHECKED_IN"] as const;

export function EventParticipantManager({
  eventId,
  participants,
  maxParticipants,
}: {
  eventId: string;
  participants: Participant[];
  maxParticipants: number | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filterOptions)[number]>("ALL");
  const normalized = query.trim().toLowerCase();

  const visible = useMemo(() => participants.filter((participant) => {
    const matchesSearch = !normalized || [participant.gameName, participant.discordUsername, participant.identityLabel ?? "", participant.staffNote ?? ""]
      .some((value) => value.toLowerCase().includes(normalized));
    const matchesFilter = filter === "ALL"
      || (filter === "CHECKED_IN" ? Boolean(participant.checkedInAt) : participant.status === filter);
    return matchesSearch && matchesFilter;
  }), [participants, normalized, filter]);

  const approved = participants.filter((participant) => participant.status === "APPROVED").length;
  const pending = participants.filter((participant) => participant.status === "PENDING").length;
  const waitlisted = participants.filter((participant) => participant.status === "WAITLISTED").length;

  return (
    <div className="section-stack participant-manager-v041">
      <div className="participant-summary-grid">
        <article className="stat-card"><strong>{participants.length}</strong><span>Total records</span></article>
        <article className="stat-card"><strong>{approved}{maxParticipants ? ` / ${maxParticipants}` : ""}</strong><span>Approved</span></article>
        <article className="stat-card"><strong>{pending}</strong><span>Pending approval</span></article>
        <article className="stat-card"><strong>{waitlisted}</strong><span>Waitlisted</span></article>
      </div>

      <div className="participant-filter-bar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search game name, Discord username, identity, or staff note…" aria-label="Search participants" />
        <select value={filter} onChange={(event) => setFilter(event.target.value as (typeof filterOptions)[number])} aria-label="Filter participants">
          {filterOptions.map((value) => <option key={value} value={value}>{value === "ALL" ? "All participants" : value === "CHECKED_IN" ? "Checked in" : value.replaceAll("_", " ")}</option>)}
        </select>
        <span className="badge">{visible.length} shown</span>
      </div>

      {visible.length ? <div className="participant-management-list">{visible.map((participant) => (
        <article className="participant-management-row participant-management-row-v041" key={participant.userId}>
          <div className="identity-card">
            {participant.avatarUrl ? (participant.profileUrl ? <a href={participant.profileUrl} target="_blank" rel="noreferrer"><img className="identity-avatar" src={participant.avatarUrl} alt="" /></a> : <img className="identity-avatar" src={participant.avatarUrl} alt="" />) : <div className="identity-avatar avatar-fallback">{participant.gameName.slice(0, 1)}</div>}
            <div>
              {participant.profileUrl ? <a className="identity-name text-link" href={participant.profileUrl} target="_blank" rel="noreferrer">{participant.gameName}</a> : <strong className="identity-name">{participant.gameName}</strong>}
              {participant.identityLabel ? <span>{participant.identityLabel}</span> : null}
              <span>Discord: @{participant.discordUsername}</span>
              <span>Joined {new Date(participant.joinedAt).toLocaleString()}</span>
              <div className="button-row"><span className="badge">{participant.status.replaceAll("_", " ")}</span>{participant.checkedInAt ? <span className="badge">Checked in</span> : null}</div>
            </div>
          </div>
          <ParticipantStatusControl eventId={eventId} userId={participant.userId} initialStatus={participant.status} initialNote={participant.staffNote ?? ""} />
        </article>
      ))}</div> : <div className="empty-state">No participants match those filters.</div>}
    </div>
  );
}
