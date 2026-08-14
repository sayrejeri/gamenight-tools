"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DiscordBotSetupCard({ workspaceId, configured, connected, installUrl }: { workspaceId: string; configured: boolean; connected: boolean; installUrl: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function checkConnection() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/bot/check`, { method: "POST" });
      const body = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error ?? "Bot connection could not be checked.");
      setMessage(body.message ?? "Bot connection checked.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bot connection could not be checked.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel section-stack">
      <div className="section-header">
        <div><span className="card-kicker">v1.0 Discord bot beta</span><h2>Discord bot</h2><p>Optional workspace integration for reminders, slash commands, tournament announcements, temporary match channels, and role sync.</p></div>
        <span className="badge">{connected ? "Connected" : configured ? "Not connected" : "Platform setup required"}</span>
      </div>
      {!configured ? <div className="rule-callout"><strong>Bot beta is not configured on this deployment.</strong><p>Platform setup needs DISCORD_BOT_TOKEN before servers can install and verify the bot.</p></div> : null}
      {configured && !connected && installUrl ? <p className="muted">Install the Game Night Tools bot into this server, approve the requested permissions, then return here and check the connection.</p> : null}
      {connected ? <p className="muted">The bot can currently access this Discord server. Individual beta features will remain opt-in as they are added during v1.0.</p> : null}
      <div className="button-row">
        {configured && installUrl ? <a className="button" href={installUrl} target="_blank" rel="noreferrer">{connected ? "Re-authorize bot" : "Install Discord bot"}</a> : null}
        {configured ? <button className="button button-secondary" type="button" onClick={checkConnection} disabled={busy}>{busy ? "Checking…" : "Check connection"}</button> : null}
      </div>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </section>
  );
}
