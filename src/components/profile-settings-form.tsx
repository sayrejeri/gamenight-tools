"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type InitialProfile = {
  siteUsername: string;
  bio: string;
  bannerUrl: string;
  mainPlatform: string;
  timezone: string;
  timeFormat: "AUTO" | "12H" | "24H";
  profileVisibility: "PUBLIC" | "MEMBERS" | "PRIVATE";
  showGameIdentities: boolean;
  showEventHistory: boolean;
  showTeams: boolean;
  showServers: boolean;
  discoverable: boolean;
  allowProfileMessages: boolean;
};

export function ProfileSettingsForm({ initial, onboarding = false }: { initial: InitialProfile; onboarding?: boolean }) {
  const router = useRouter();
  const [timezone, setTimezone] = useState(initial.timezone);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!timezone) setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Detroit");
  }, [timezone]);

  async function save(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/profile/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteUsername: formData.get("siteUsername"),
          bio: formData.get("bio"),
          bannerUrl: formData.get("bannerUrl"),
          mainPlatform: formData.get("mainPlatform"),
          timezone: formData.get("timezone"),
          timeFormat: formData.get("timeFormat"),
          profileVisibility: formData.get("profileVisibility"),
          showGameIdentities: formData.get("showGameIdentities") === "on",
          showEventHistory: formData.get("showEventHistory") === "on",
          showTeams: formData.get("showTeams") === "on",
          showServers: formData.get("showServers") === "on",
          discoverable: formData.get("discoverable") === "on",
          allowProfileMessages: formData.get("allowProfileMessages") === "on",
          onboardingCompleted: true,
        }),
      });
      const body = await response.json() as { error?: string; siteUsername?: string };
      if (!response.ok) throw new Error(body.error ?? "Profile settings could not be saved.");
      setMessage("Profile settings saved.");
      if (onboarding) router.push("/dashboard");
      else router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profile settings could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel section-stack" action={save}>
      <div className="section-header"><div><h2>{onboarding ? "Set up your site profile" : "Profile details"}</h2><p>Your Discord account stays connected, while your site username remains stable if your Discord username changes.</p></div></div>
      <div className="two-column">
        <div className="form-stack compact">
          <label htmlFor="site-username">Site username</label>
          <input id="site-username" name="siteUsername" defaultValue={initial.siteUsername} minLength={3} maxLength={40} pattern="[a-zA-Z0-9_-]+" required />
          <span className="field-help">Used in your public profile link.</span>
        </div>
        <div className="form-stack compact">
          <label htmlFor="main-platform">Main gaming platform</label>
          <input id="main-platform" name="mainPlatform" list="main-platforms" defaultValue={initial.mainPlatform} placeholder="Roblox" />
          <datalist id="main-platforms"><option value="Roblox" /><option value="Minecraft" /><option value="Steam" /><option value="Xbox" /><option value="PlayStation" /><option value="Epic Games" /></datalist>
        </div>
      </div>
      <div className="form-stack compact">
        <label htmlFor="profile-bio">Bio</label>
        <textarea id="profile-bio" name="bio" rows={4} maxLength={500} defaultValue={initial.bio} placeholder="Tell teams, hosts, and players a little about yourself." />
      </div>
      <div className="form-stack compact">
        <label htmlFor="profile-banner">Profile banner URL</label>
        <input id="profile-banner" name="bannerUrl" type="url" defaultValue={initial.bannerUrl} placeholder="https://..." />
      </div>
      <div className="two-column">
        <div className="form-stack compact">
          <label htmlFor="profile-timezone">Timezone</label>
          <input id="profile-timezone" name="timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="America/Detroit" />
        </div>
        <div className="form-stack compact">
          <label htmlFor="time-format">Time format</label>
          <select id="time-format" name="timeFormat" defaultValue={initial.timeFormat}><option value="AUTO">Automatic</option><option value="12H">12-hour</option><option value="24H">24-hour</option></select>
        </div>
      </div>
      <div className="form-stack compact">
        <label htmlFor="profile-visibility">Profile visibility</label>
        <select id="profile-visibility" name="profileVisibility" defaultValue={initial.profileVisibility}>
          <option value="PUBLIC">Public</option>
          <option value="MEMBERS">Signed-in members only</option>
          <option value="PRIVATE">Private</option>
        </select>
      </div>
      <div className="settings-check-grid">
        <label className="checkbox-row"><input name="showGameIdentities" type="checkbox" defaultChecked={initial.showGameIdentities} />Show game identities</label>
        <label className="checkbox-row"><input name="showEventHistory" type="checkbox" defaultChecked={initial.showEventHistory} />Show event history</label>
        <label className="checkbox-row"><input name="showTeams" type="checkbox" defaultChecked={initial.showTeams} />Show teams</label>
        <label className="checkbox-row"><input name="showServers" type="checkbox" defaultChecked={initial.showServers} />Show server memberships</label>
        <label className="checkbox-row"><input name="discoverable" type="checkbox" defaultChecked={initial.discoverable} />Allow search discovery</label>
        <label className="checkbox-row"><input name="allowProfileMessages" type="checkbox" defaultChecked={initial.allowProfileMessages} />Allow future profile messages</label>
      </div>
      <div className="button-row">
        <button className="button" type="submit" disabled={busy}>{busy ? "Saving…" : onboarding ? "Finish setup" : "Save profile"}</button>
        {onboarding ? <button className="button button-secondary" type="button" onClick={() => router.push("/dashboard")}>Skip for now</button> : null}
      </div>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </form>
  );
}
