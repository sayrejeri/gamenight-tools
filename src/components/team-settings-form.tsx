"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type InitialTeam = { description: string; logoUrl: string; bannerUrl: string; mainPlatform: string; mainGame: string; region: string; recruitingStatus: "OPEN" | "INVITE_ONLY" | "CLOSED"; chatEnabled: boolean; suggestionsEnabled: boolean };

export function TeamSettingsForm({ teamId, initial }: { teamId: string; initial: InitialTeam }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function save(formData: FormData) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/teams/${teamId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: formData.get("description"), logoUrl: formData.get("logoUrl"), bannerUrl: formData.get("bannerUrl"), mainPlatform: formData.get("mainPlatform"), mainGame: formData.get("mainGame"), region: formData.get("region"), recruitingStatus: formData.get("recruitingStatus"), chatEnabled: formData.get("chatEnabled") === "on", suggestionsEnabled: formData.get("suggestionsEnabled") === "on" }) });
      const body = await response.json() as { error?: string }; if (!response.ok) throw new Error(body.error ?? "Team profile could not be saved."); setMessage("Team profile saved."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Team profile could not be saved."); }
    finally { setBusy(false); }
  }
  return <form className="panel section-stack" action={save}><div className="section-header"><div><h2>Manage team profile</h2><p>Update recruiting, branding, and which community features are enabled.</p></div></div><label htmlFor="team-description">Description</label><textarea id="team-description" name="description" rows={5} defaultValue={initial.description} maxLength={5000} /><div className="two-column"><div className="form-stack compact"><label htmlFor="team-logo">Logo URL</label><input id="team-logo" name="logoUrl" type="url" defaultValue={initial.logoUrl} /></div><div className="form-stack compact"><label htmlFor="team-banner">Banner URL</label><input id="team-banner" name="bannerUrl" type="url" defaultValue={initial.bannerUrl} /></div></div><div className="two-column"><div className="form-stack compact"><label htmlFor="team-platform">Main platform</label><input id="team-platform" name="mainPlatform" defaultValue={initial.mainPlatform} /></div><div className="form-stack compact"><label htmlFor="team-game">Main game</label><input id="team-game" name="mainGame" defaultValue={initial.mainGame} /></div></div><div className="two-column"><div className="form-stack compact"><label htmlFor="team-region">Region</label><input id="team-region" name="region" defaultValue={initial.region} /></div><div className="form-stack compact"><label htmlFor="team-recruiting">Recruiting</label><select id="team-recruiting" name="recruitingStatus" defaultValue={initial.recruitingStatus}><option value="OPEN">Open applications</option><option value="INVITE_ONLY">Invite only</option><option value="CLOSED">Closed</option></select></div></div><div className="settings-check-grid"><label className="checkbox-row"><input name="chatEnabled" type="checkbox" defaultChecked={initial.chatEnabled} />Enable team chat</label><label className="checkbox-row"><input name="suggestionsEnabled" type="checkbox" defaultChecked={initial.suggestionsEnabled} />Enable team suggestions</label></div><button className="button" disabled={busy}>{busy ? "Saving…" : "Save team"}</button>{message ? <p className="form-message">{message}</p> : null}</form>;
}
