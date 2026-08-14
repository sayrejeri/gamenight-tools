"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type TeamProfile = {
  name: string;
  tag: string;
  description: string;
  logoUrl: string;
  bannerUrl: string;
  mainPlatform: string;
  mainGame: string;
  region: string;
  recruitingStatus: "OPEN" | "INVITE_ONLY" | "CLOSED";
  profileStatus: "PENDING" | "APPROVED" | "CHANGES_REQUESTED" | "DENIED" | "SUSPENDED" | "ARCHIVED";
  verificationLevel: "" | "APPROVED" | "OWNERSHIP_VERIFIED" | "OFFICIAL" | "PARTNER";
  chatEnabled: boolean;
  suggestionsEnabled: boolean;
};

export function PlatformTeamProfileForm({ teamId, initial }: { teamId: string; initial: TeamProfile }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/staff/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          tag: formData.get("tag"),
          description: formData.get("description"),
          logoUrl: formData.get("logoUrl"),
          bannerUrl: formData.get("bannerUrl"),
          mainPlatform: formData.get("mainPlatform"),
          mainGame: formData.get("mainGame"),
          region: formData.get("region"),
          recruitingStatus: formData.get("recruitingStatus"),
          profileStatus: formData.get("profileStatus"),
          verificationLevel: formData.get("verificationLevel") || null,
          chatEnabled: formData.get("chatEnabled") === "on",
          suggestionsEnabled: formData.get("suggestionsEnabled") === "on",
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Team profile could not be saved.");
      setMessage("Platform team settings saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Team profile could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel section-stack" action={save}>
      <div className="section-header">
        <div>
          <span className="card-kicker">Platform staff editor</span>
          <h2>Edit team profile</h2>
          <p>Platform Owners and Admins can correct profile data, visibility status, verification, recruiting, and community settings without joining the team.</p>
        </div>
      </div>

      <div className="two-column">
        <div className="form-stack compact"><label htmlFor="staff-team-name">Team name</label><input id="staff-team-name" name="name" required minLength={2} maxLength={120} defaultValue={initial.name} /></div>
        <div className="form-stack compact"><label htmlFor="staff-team-tag">Tag</label><input id="staff-team-tag" name="tag" maxLength={16} defaultValue={initial.tag} placeholder="BTS" /></div>
      </div>

      <div className="form-stack compact"><label htmlFor="staff-team-description">Description</label><textarea id="staff-team-description" name="description" rows={5} maxLength={5000} defaultValue={initial.description} /></div>

      <div className="two-column">
        <div className="form-stack compact"><label htmlFor="staff-team-logo">Logo URL</label><input id="staff-team-logo" name="logoUrl" type="url" defaultValue={initial.logoUrl} placeholder="https://..." /></div>
        <div className="form-stack compact"><label htmlFor="staff-team-banner">Banner URL</label><input id="staff-team-banner" name="bannerUrl" type="url" defaultValue={initial.bannerUrl} placeholder="https://..." /></div>
      </div>

      <div className="two-column">
        <div className="form-stack compact"><label htmlFor="staff-team-platform">Main platform</label><input id="staff-team-platform" name="mainPlatform" maxLength={80} defaultValue={initial.mainPlatform} /></div>
        <div className="form-stack compact"><label htmlFor="staff-team-game">Main game</label><input id="staff-team-game" name="mainGame" maxLength={191} defaultValue={initial.mainGame} /></div>
      </div>

      <div className="two-column">
        <div className="form-stack compact"><label htmlFor="staff-team-region">Region</label><input id="staff-team-region" name="region" maxLength={80} defaultValue={initial.region} /></div>
        <div className="form-stack compact"><label htmlFor="staff-team-recruiting">Recruiting</label><select id="staff-team-recruiting" name="recruitingStatus" defaultValue={initial.recruitingStatus}><option value="OPEN">Open applications</option><option value="INVITE_ONLY">Invite only</option><option value="CLOSED">Closed</option></select></div>
      </div>

      <div className="two-column">
        <div className="form-stack compact"><label htmlFor="staff-team-status">Profile status</label><select id="staff-team-status" name="profileStatus" defaultValue={initial.profileStatus}><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="CHANGES_REQUESTED">Changes requested</option><option value="DENIED">Denied</option><option value="SUSPENDED">Suspended</option><option value="ARCHIVED">Archived</option></select></div>
        <div className="form-stack compact"><label htmlFor="staff-team-verification">Verification</label><select id="staff-team-verification" name="verificationLevel" defaultValue={initial.verificationLevel}><option value="">None</option><option value="APPROVED">Approved</option><option value="OWNERSHIP_VERIFIED">Ownership verified</option><option value="OFFICIAL">Official</option><option value="PARTNER">Partner</option></select></div>
      </div>

      <div className="settings-check-grid">
        <label className="checkbox-row"><input name="chatEnabled" type="checkbox" defaultChecked={initial.chatEnabled} />Enable team chat</label>
        <label className="checkbox-row"><input name="suggestionsEnabled" type="checkbox" defaultChecked={initial.suggestionsEnabled} />Enable team suggestions</label>
      </div>

      <div className="button-row"><button className="button" disabled={busy}>{busy ? "Saving…" : "Save platform changes"}</button></div>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </form>
  );
}
