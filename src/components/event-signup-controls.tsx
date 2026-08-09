"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatConnectionType } from "@/lib/connections";

type ConnectionOption = { id: string; connection_type: string; handle: string; display_name: string | null };

export function EventSignupControls({
  eventId,
  eventStatus,
  participantStatus,
  participantSignupCompleted,
  checkedIn,
  joinCodeRequired,
  signupMode,
  requiredConnectionType,
  connections,
}: {
  eventId: string;
  eventStatus: string;
  participantStatus: string | null;
  participantSignupCompleted: boolean;
  checkedIn: boolean;
  joinCodeRequired: boolean;
  signupMode: "AUTO" | "APPROVAL";
  requiredConnectionType: string | null;
  connections: ConnectionOption[];
}) {
  const router = useRouter();
  const matchingConnections = requiredConnectionType
    ? connections.filter((connection) => connection.connection_type.toLowerCase() === requiredConnectionType.toLowerCase())
    : connections;
  const [connectionId, setConnectionId] = useState(matchingConnections[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const returnTo = `/dashboard/events/${eventId}`;

  useEffect(() => {
    let active = true;
    async function syncDeadline() {
      try {
        const response = await fetch(`/api/events/${eventId}/sync`, { method: "POST" });
        const body = await response.json() as { changed?: boolean };
        if (active && response.ok && body.changed) router.refresh();
      } catch {
        // A later poll or refresh can retry.
      }
    }
    void syncDeadline();
    const timer = window.setInterval(syncDeadline, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [eventId, router]);

  async function run(action: "SIGN_UP" | "CHECK_IN" | "WITHDRAW") {
    if (action === "WITHDRAW" && !window.confirm("Withdraw from this event?")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, connectionId: connectionId || null }),
      });
      const body = await response.json() as { error?: string; status?: string; checkedIn?: boolean; requiresApproval?: boolean };
      if (!response.ok) throw new Error(body.error ?? "Your event signup could not be updated.");
      setMessage(action === "CHECK_IN"
        ? "You are checked in."
        : action === "WITHDRAW"
          ? "You withdrew from the event."
          : body.status === "PENDING" || body.requiresApproval
            ? "Your signup was submitted and is waiting for host approval."
            : body.status === "WAITLISTED"
              ? "The event is full, so you were added to the waitlist."
              : "You are signed up.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your event signup could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  const pendingCompletion = participantStatus === "PENDING" && !participantSignupCompleted;
  const pendingApproval = participantStatus === "PENDING" && participantSignupCompleted && signupMode === "APPROVAL";
  const withdrawableParticipant = Boolean(participantStatus && !["WITHDRAWN", "REJECTED", "DISQUALIFIED"].includes(participantStatus));
  const canStartSignup = eventStatus === "SIGNUPS_OPEN" && (!withdrawableParticipant || pendingCompletion);
  const missingRequiredIdentity = Boolean(requiredConnectionType && !matchingConnections.length);

  return (
    <div className="form-stack">
      {requiredConnectionType ? (
        <div className="form-stack compact">
          <label htmlFor="signup-connection">{formatConnectionType(requiredConnectionType)} account used for this event</label>
          {matchingConnections.length ? (
            <select id="signup-connection" value={connectionId} onChange={(event) => setConnectionId(event.target.value)}>
              {matchingConnections.map((connection) => <option value={connection.id} key={connection.id}>{connection.display_name ?? connection.handle} (@{connection.handle})</option>)}
            </select>
          ) : (
            <div className="identity-required-card">
              <p><strong>You need a linked {formatConnectionType(requiredConnectionType)} account before you can join this event.</strong></p>
              <p className="muted">Add it manually on Game identities, or refresh your Discord connections if that account is already connected to Discord.</p>
              <div className="button-row">
                <Link className="button" href={`/dashboard/profile?returnTo=${encodeURIComponent(returnTo)}`}>Link account</Link>
                <a className="button button-secondary" href={`/api/auth/discord/login?returnTo=${encodeURIComponent(returnTo)}`}>Refresh from Discord</a>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {pendingCompletion ? <p className="muted">Your join code was accepted. Select the account you will use and complete your signup.</p> : null}
      {pendingApproval ? <div className="event-pending-approval"><span className="badge">Awaiting host approval</span><p className="muted">Your signup is complete. A host will approve, waitlist, or decline it.</p></div> : null}
      {canStartSignup ? (
        <button className="button" type="button" disabled={busy || missingRequiredIdentity} onClick={() => run("SIGN_UP")}>
          {busy ? "Updating…" : pendingCompletion ? "Complete signup" : joinCodeRequired ? "Complete signup after redeeming code" : signupMode === "APPROVAL" ? "Submit signup for approval" : "Sign up for event"}
        </button>
      ) : null}

      {eventStatus === "CHECK_IN_OPEN" && participantStatus === "APPROVED" && !checkedIn ? (
        <button className="button" type="button" disabled={busy} onClick={() => run("CHECK_IN")}>{busy ? "Checking in…" : "Check in now"}</button>
      ) : null}

      {withdrawableParticipant && !pendingCompletion ? (
        <div className="button-row">
          <span className="badge">Signup: {participantStatus?.replaceAll("_", " ")}</span>
          {checkedIn ? <span className="badge">Checked in</span> : null}
          <button className="button button-danger" type="button" disabled={busy} onClick={() => run("WITHDRAW")}>Withdraw</button>
        </div>
      ) : null}

      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </div>
  );
}
