"use client";

import { useState } from "react";

type InitialSettings = {
  dmRemindersEnabled: boolean;
  announcementsEnabled: boolean;
  temporaryMatchChannelsEnabled: boolean;
  roleSyncEnabled: boolean;
  announcementChannelId: string;
  matchCategoryId: string;
  competitorRoleId: string;
  championRoleId: string;
};

export function WorkspaceBotSettingsForm({ workspaceId, initial }: { workspaceId: string; initial: InitialSettings }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/bot/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dmRemindersEnabled: formData.get("dmRemindersEnabled") === "on",
          announcementsEnabled: formData.get("announcementsEnabled") === "on",
          temporaryMatchChannelsEnabled: formData.get("temporaryMatchChannelsEnabled") === "on",
          roleSyncEnabled: formData.get("roleSyncEnabled") === "on",
          announcementChannelId: formData.get("announcementChannelId"),
          matchCategoryId: formData.get("matchCategoryId"),
          competitorRoleId: formData.get("competitorRoleId"),
          championRoleId: formData.get("championRoleId"),
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Discord bot settings could not be saved.");
      setMessage("Discord bot settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Discord bot settings could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel section-stack" action={save}>
      <div className="section-header"><div><h2>Bot feature controls</h2><p>All advanced bot features remain opt-in per server. IDs are Discord snowflakes copied from Developer Mode.</p></div></div>
      <div className="settings-check-grid">
        <label className="checkbox-row"><input name="dmRemindersEnabled" type="checkbox" defaultChecked={initial.dmRemindersEnabled} />Allow opt-in member DM reminders</label>
        <label className="checkbox-row"><input name="announcementsEnabled" type="checkbox" defaultChecked={initial.announcementsEnabled} />Post event and tournament announcements</label>
        <label className="checkbox-row"><input name="temporaryMatchChannelsEnabled" type="checkbox" defaultChecked={initial.temporaryMatchChannelsEnabled} />Create temporary match channels</label>
        <label className="checkbox-row"><input name="roleSyncEnabled" type="checkbox" defaultChecked={initial.roleSyncEnabled} />Synchronize configured competition roles</label>
      </div>
      <div className="two-column">
        <div className="form-stack compact"><label htmlFor="bot-announcement-channel">Announcement channel ID</label><input id="bot-announcement-channel" name="announcementChannelId" inputMode="numeric" pattern="[0-9]*" maxLength={32} defaultValue={initial.announcementChannelId} placeholder="123456789012345678" /></div>
        <div className="form-stack compact"><label htmlFor="bot-match-category">Match channel category ID</label><input id="bot-match-category" name="matchCategoryId" inputMode="numeric" pattern="[0-9]*" maxLength={32} defaultValue={initial.matchCategoryId} placeholder="123456789012345678" /></div>
      </div>
      <div className="two-column">
        <div className="form-stack compact"><label htmlFor="bot-competitor-role">Competitor role ID</label><input id="bot-competitor-role" name="competitorRoleId" inputMode="numeric" pattern="[0-9]*" maxLength={32} defaultValue={initial.competitorRoleId} placeholder="123456789012345678" /></div>
        <div className="form-stack compact"><label htmlFor="bot-champion-role">Champion role ID</label><input id="bot-champion-role" name="championRoleId" inputMode="numeric" pattern="[0-9]*" maxLength={32} defaultValue={initial.championRoleId} placeholder="123456789012345678" /></div>
      </div>
      <p className="field-help">The bot will validate access when it actually uses a channel or role. Missing permissions should fail safely without breaking the event or tournament on the website.</p>
      <button className="button" disabled={busy}>{busy ? "Saving…" : "Save bot settings"}</button>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </form>
  );
}
