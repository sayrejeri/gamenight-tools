"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type LookupUser = {
  siteUsername: string | null;
  discordUsername: string;
  displayName: string;
};

export function CohostInviteForm({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [identity, setIdentity] = useState("");
  const [suggestions, setSuggestions] = useState<LookupUser[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const query = identity.trim();
    if (query.length < 2 || /^\d{15,25}$/.test(query)) {
      setSuggestions([]);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/users/lookup?q=${encodeURIComponent(query)}`);
        const body = await response.json() as { users?: LookupUser[] };
        if (active && response.ok) setSuggestions(body.users ?? []);
      } catch {
        if (active) setSuggestions([]);
      }
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [identity]);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/events/${eventId}/cohosts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identity: formData.get("identity"),
          permissionLevel: formData.get("permissionLevel"),
          expiresAt: null,
        }),
      });
      const body = (await response.json()) as { error?: string; invitedName?: string };
      if (!response.ok) throw new Error(body.error ?? "The co-host invitation could not be sent.");

      setMessage(`Co-host invitation sent${body.invitedName ? ` to ${body.invitedName}` : ""}.`);
      setIdentity("");
      setSuggestions([]);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The co-host invitation could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-stack" action={submit}>
      <div className="form-stack compact cohost-user-picker">
        <label htmlFor="cohost-identity">Co-host user</label>
        <input
          id="cohost-identity"
          name="identity"
          value={identity}
          onChange={(event) => setIdentity(event.target.value)}
          placeholder="Site username, Discord username, or Discord ID"
          autoComplete="off"
          required
        />
        <span className="field-help">Website users appear while you type. A numeric Discord ID also works for someone who has not signed in yet.</span>
        {suggestions.length ? (
          <div className="cohost-user-suggestions" role="listbox" aria-label="Matching website users">
            {suggestions.map((user) => {
              const value = user.siteUsername ?? user.discordUsername;
              return (
                <button
                  type="button"
                  className="cohost-user-suggestion"
                  key={`${user.discordUsername}-${user.siteUsername ?? "site"}`}
                  onClick={() => {
                    setIdentity(value);
                    setSuggestions([]);
                  }}
                >
                  <strong>{user.displayName}</strong>
                  <span>{user.siteUsername ? `@${user.siteUsername} · ` : ""}Discord @{user.discordUsername}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <label htmlFor="cohost-permission">Permissions</label>
      <select id="cohost-permission" name="permissionLevel" defaultValue="FULL">
        <option value="FULL">Full co-host</option>
        <option value="BRACKET">Bracket manager</option>
        <option value="SIGNUPS">Signup manager</option>
        <option value="SCOREKEEPER">Scorekeeper</option>
        <option value="ANNOUNCEMENTS">Announcement manager</option>
        <option value="VIEW_ONLY">View only</option>
      </select>

      <button className="button" type="submit" disabled={busy}>{busy ? "Sending…" : "Invite co-host"}</button>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </form>
  );
}
