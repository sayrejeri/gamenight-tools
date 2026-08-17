"use client";

import { useState } from "react";

type Preferences = {
  dmRemindersEnabled: boolean;
  signupReminders: boolean;
  checkinReminders: boolean;
  matchReminders: boolean;
  resultReminders: boolean;
};

export function DiscordBotPreferencesForm({ initial }: { initial: Preferences }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/profile/discord-bot-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dmRemindersEnabled: formData.get("dmRemindersEnabled") === "on",
          signupReminders: formData.get("signupReminders") === "on",
          checkinReminders: formData.get("checkinReminders") === "on",
          matchReminders: formData.get("matchReminders") === "on",
          resultReminders: formData.get("resultReminders") === "on",
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Discord reminder preferences could not be saved.");
      setMessage("Discord reminder preferences saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Discord reminder preferences could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel section-stack" action={save}>
      <div className="section-header"><div><span className="card-kicker">v1.0 bot beta</span><h2>Discord DM reminders</h2><p>Direct messages are fully opt-in. Turning on the main switch allows only the reminder types you select below.</p></div></div>
      <label className="checkbox-row"><input name="dmRemindersEnabled" type="checkbox" defaultChecked={initial.dmRemindersEnabled} />Allow Game Night Tools bot DMs</label>
      <div className="settings-check-grid">
        <label className="checkbox-row"><input name="signupReminders" type="checkbox" defaultChecked={initial.signupReminders} />Signup and event reminders</label>
        <label className="checkbox-row"><input name="checkinReminders" type="checkbox" defaultChecked={initial.checkinReminders} />Check-in reminders</label>
        <label className="checkbox-row"><input name="matchReminders" type="checkbox" defaultChecked={initial.matchReminders} />Scheduled match and ready reminders</label>
        <label className="checkbox-row"><input name="resultReminders" type="checkbox" defaultChecked={initial.resultReminders} />Result confirmation reminders</label>
      </div>
      <p className="field-help">If Discord privacy settings block the bot, the website will keep working normally and the failed DM will be recorded instead of repeatedly spamming retries.</p>
      <button className="button" disabled={busy}>{busy ? "Saving…" : "Save Discord reminders"}</button>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </form>
  );
}
