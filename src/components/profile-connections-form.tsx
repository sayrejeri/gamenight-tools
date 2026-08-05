"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildConnectionProfileUrl, formatConnectionType } from "@/lib/connections";

type Connection = {
  id: string;
  source: "DISCORD" | "MANUAL";
  connection_type: string;
  external_id: string | null;
  handle: string;
  display_name: string | null;
  profile_url: string | null;
  avatar_url: string | null;
  is_verified: number;
  is_visible: number;
};

export function ProfileConnectionsForm({ connections }: { connections: Connection[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function save(connection: Connection, formData: FormData) {
    setBusyId(connection.id);
    setMessage("");
    try {
      const response = await fetch("/api/profile/connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: connection.id,
          handle: formData.get("handle"),
          displayName: formData.get("displayName") || null,
          visible: formData.get("visible") === "on",
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Connection could not be saved.");
      setMessage("Connection saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connection could not be saved.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    setMessage("");
    try {
      const response = await fetch(`/api/profile/connections?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Connection could not be removed.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connection could not be removed.");
    } finally {
      setBusyId(null);
    }
  }

  async function add(formData: FormData) {
    setBusyId("new");
    setMessage("");
    try {
      const response = await fetch("/api/profile/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionType: formData.get("connectionType"),
          handle: formData.get("handle"),
          displayName: formData.get("displayName") || null,
          visible: formData.get("visible") === "on",
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Connection could not be added.");
      setMessage("Connection added. Roblox identities automatically receive a linked avatar and profile when found.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connection could not be added.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="section-stack">
      {connections.length === 0 ? <p className="muted">No game identities have been imported or added yet.</p> : null}
      {connections.map((connection) => {
        const profileUrl = buildConnectionProfileUrl(connection.connection_type, connection.external_id, connection.handle, connection.profile_url);
        return (
          <form className="connection-row" key={connection.id} action={(formData) => save(connection, formData)}>
            <div className="identity-heading">
              {connection.avatar_url ? (
                profileUrl ? <a href={profileUrl} target="_blank" rel="noreferrer"><img className="game-avatar" src={connection.avatar_url} alt="" /></a> : <img className="game-avatar" src={connection.avatar_url} alt="" />
              ) : <div className="game-avatar avatar-fallback">{formatConnectionType(connection.connection_type).slice(0, 1)}</div>}
              <div>
                <strong>{formatConnectionType(connection.connection_type)}</strong>
                <span className="badge">{connection.source === "DISCORD" ? "Imported from Discord" : "Manual"}</span>
                {connection.is_verified ? <span className="badge">Resolved</span> : null}
                {profileUrl ? <div><a className="text-link" href={profileUrl} target="_blank" rel="noreferrer">Open linked profile</a></div> : null}
              </div>
            </div>

            <div className="two-column">
              <div className="form-stack compact">
                <label htmlFor={`handle-${connection.id}`}>Username or handle</label>
                <input id={`handle-${connection.id}`} name="handle" defaultValue={connection.handle} required />
              </div>
              <div className="form-stack compact">
                <label htmlFor={`display-${connection.id}`}>Preferred display name</label>
                <input id={`display-${connection.id}`} name="displayName" defaultValue={connection.display_name ?? ""} />
              </div>
            </div>

            <label className="checkbox-row"><input name="visible" type="checkbox" defaultChecked={Boolean(connection.is_visible)} />Visible to event hosts when needed</label>
            <div className="button-row">
              <button className="button" type="submit" disabled={busyId === connection.id}>Save</button>
              <button className="button button-danger" type="button" disabled={busyId === connection.id} onClick={() => remove(connection.id)}>Remove</button>
            </div>
          </form>
        );
      })}

      <form className="card form-stack" action={add}>
        <h3>Add another game identity</h3>
        <div className="two-column">
          <div className="form-stack compact">
            <label htmlFor="new-connection-type">Platform or game</label>
            <input id="new-connection-type" name="connectionType" list="connection-types" placeholder="Roblox" required />
            <datalist id="connection-types">
              <option value="Roblox" />
              <option value="Minecraft" />
              <option value="Steam" />
              <option value="Xbox" />
              <option value="PlayStation" />
              <option value="Epic Games" />
              <option value="Twitch" />
              <option value="GitHub" />
            </datalist>
          </div>
          <div className="form-stack compact">
            <label htmlFor="new-handle">Username or handle</label>
            <input id="new-handle" name="handle" required />
          </div>
        </div>
        <label htmlFor="new-display-name">Preferred display name</label>
        <input id="new-display-name" name="displayName" />
        <label className="checkbox-row"><input name="visible" type="checkbox" defaultChecked />Visible to event hosts when needed</label>
        <button className="button" type="submit" disabled={busyId === "new"}>{busyId === "new" ? "Adding…" : "Add connection"}</button>
      </form>

      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </div>
  );
}
