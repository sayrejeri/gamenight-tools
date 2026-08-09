"use client";

import { useEffect, useState } from "react";

type LookupUser = { siteUsername: string | null; discordUsername: string; displayName: string };

export function UserLookupField({
  name,
  label = "User",
  placeholder = "Site username, Discord username, or Discord ID",
  required = true,
}: {
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState("");
  const [users, setUsers] = useState<LookupUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = value.trim().replace(/^@/, "");
    if (q.length < 2 || /^\d{15,25}$/.test(q)) {
      setUsers([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/users/lookup?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const body = await response.json() as { users?: LookupUser[] };
        if (response.ok) setUsers(body.users ?? []);
      } catch {
        if (!controller.signal.aborted) setUsers([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value]);

  return (
    <div className="form-stack compact cohost-user-picker">
      <label htmlFor={`lookup-${name}`}>{label}</label>
      <input id={`lookup-${name}`} name={name} value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} required={required} autoComplete="off" />
      {loading ? <small className="muted">Searching Game Night Tools users…</small> : null}
      {users.length ? (
        <div className="cohost-user-suggestions" role="listbox" aria-label="Matching Game Night Tools users">
          {users.map((user) => {
            const identifier = user.siteUsername ?? user.discordUsername;
            return (
              <button className="cohost-user-suggestion" type="button" role="option" key={`${user.discordUsername}-${user.siteUsername ?? "site"}`} onClick={() => { setValue(identifier); setUsers([]); }}>
                <strong>{user.displayName}</strong>
                <span>{user.siteUsername ? `@${user.siteUsername} · Discord @${user.discordUsername}` : `Discord @${user.discordUsername}`}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
