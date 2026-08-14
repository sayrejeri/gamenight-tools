"use client";

import { useRef, useState } from "react";

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

type ValidationCheck = {
  key: string;
  label: string;
  status: "PASS" | "WARN" | "FAIL" | "SKIP";
  detail: string;
};

type BotSettingsPayload = {
  dmRemindersEnabled: boolean;
  announcementsEnabled: boolean;
  temporaryMatchChannelsEnabled: boolean;
  roleSyncEnabled: boolean;
  announcementChannelId: string;
  matchCategoryId: string;
  competitorRoleId: string;
  championRoleId: string;
};

function payloadFromForm(formData: FormData): BotSettingsPayload {
  return {
    dmRemindersEnabled: formData.get("dmRemindersEnabled") === "on",
    announcementsEnabled: formData.get("announcementsEnabled") === "on",
    temporaryMatchChannelsEnabled: formData.get("temporaryMatchChannelsEnabled") === "on",
    roleSyncEnabled: formData.get("roleSyncEnabled") === "on",
    announcementChannelId: String(formData.get("announcementChannelId") ?? "").trim(),
    matchCategoryId: String(formData.get("matchCategoryId") ?? "").trim(),
    competitorRoleId: String(formData.get("competitorRoleId") ?? "").trim(),
    championRoleId: String(formData.get("championRoleId") ?? "").trim(),
  };
}

export function WorkspaceBotSettingsForm({ workspaceId, initial }: { workspaceId: string; initial: InitialSettings }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState<"save" | "validate" | null>(null);
  const [message, setMessage] = useState("");
  const [validationChecks, setValidationChecks] = useState<ValidationCheck[]>([]);

  async function save(formData: FormData) {
    setBusy("save");
    setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/bot/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFromForm(formData)),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Discord bot settings could not be saved.");
      setMessage("Discord bot settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Discord bot settings could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function validateConfiguration() {
    if (!formRef.current) return;
    setBusy("validate");
    setMessage("");
    setValidationChecks([]);
    try {
      const payload = payloadFromForm(new FormData(formRef.current));
      const response = await fetch(`/api/workspaces/${workspaceId}/bot/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          announcementsEnabled: payload.announcementsEnabled,
          temporaryMatchChannelsEnabled: payload.temporaryMatchChannelsEnabled,
          roleSyncEnabled: payload.roleSyncEnabled,
          announcementChannelId: payload.announcementChannelId,
          matchCategoryId: payload.matchCategoryId,
          competitorRoleId: payload.competitorRoleId,
          championRoleId: payload.championRoleId,
        }),
      });
      const body = await response.json() as { error?: string; success?: boolean; checks?: ValidationCheck[]; failed?: number };
      if (!response.ok) throw new Error(body.error ?? "Discord configuration could not be validated.");
      const checks = Array.isArray(body.checks) ? body.checks : [];
      setValidationChecks(checks);
      setMessage(body.success ? "Discord configuration checks passed." : `${Number(body.failed ?? 0)} Discord configuration check${Number(body.failed ?? 0) === 1 ? "" : "s"} need attention.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Discord configuration could not be validated.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form ref={formRef} className="panel section-stack" action={save}>
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
      <p className="field-help">Use Validate Discord configuration before enabling automation. It checks the connected server, channel/category types, effective channel permissions, Manage Roles access, and role hierarchy. Delivery still revalidates current state later.</p>

      {validationChecks.length ? <div className="compact-list" aria-label="Discord configuration validation results">
        {validationChecks.map((check) => <article className="list-card" key={check.key}>
          <span className="list-icon" aria-hidden="true">{check.status === "PASS" ? "✓" : check.status === "FAIL" ? "!" : check.status === "WARN" ? "?" : "–"}</span>
          <div><strong>{check.label}</strong><span>{check.detail}</span></div>
          <span className="badge">{check.status}</span>
        </article>)}
      </div> : null}

      <div className="button-row">
        <button className="button" type="submit" disabled={busy !== null}>{busy === "save" ? "Saving…" : "Save bot settings"}</button>
        <button className="button button-secondary" type="button" disabled={busy !== null} onClick={validateConfiguration}>{busy === "validate" ? "Validating…" : "Validate Discord configuration"}</button>
      </div>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </form>
  );
}
