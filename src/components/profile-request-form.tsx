"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Guild = { id: string; name: string; isOwner: boolean };
type Workspace = { id: string; name: string };

export function ProfileRequestForm({ guilds, workspaces }: { guilds: Guild[]; workspaces: Workspace[] }) {
  const router = useRouter();
  const [type, setType] = useState<"SERVER" | "TEAM">("SERVER");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/profile-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: type,
          name: formData.get("name"), slug: formData.get("slug"), description: formData.get("description"),
          logoUrl: formData.get("logoUrl"), bannerUrl: formData.get("bannerUrl"),
          mainPlatform: formData.get("mainPlatform"), mainGame: formData.get("mainGame"),
          discordGuildId: formData.get("discordGuildId"), discordInviteUrl: formData.get("discordInviteUrl"),
          robloxCommunityUrl: formData.get("robloxCommunityUrl"), homeWorkspaceId: formData.get("homeWorkspaceId"),
          teamTag: formData.get("teamTag"), region: formData.get("region"),
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Profile request could not be submitted.");
      setMessage("Profile request submitted for staff review."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Profile request could not be submitted."); }
    finally { setBusy(false); }
  }

  return (
    <form className="panel section-stack" action={submit}>
      <div className="segmented-control"><button type="button" className={type === "SERVER" ? "active" : ""} onClick={() => setType("SERVER")}>Server profile</button><button type="button" className={type === "TEAM" ? "active" : ""} onClick={() => setType("TEAM")}>Team profile</button></div>
      <div className="two-column">
        <div className="form-stack compact"><label htmlFor="request-name">{type === "SERVER" ? "Server name" : "Team name"}</label><input id="request-name" name="name" minLength={3} maxLength={120} required /></div>
        {type === "TEAM" ? <div className="form-stack compact"><label htmlFor="request-slug">Profile URL</label><input id="request-slug" name="slug" placeholder="blackthorne-saints" maxLength={80} /></div> : <div className="form-stack compact"><label htmlFor="request-guild">Discord server</label><select id="request-guild" name="discordGuildId" required defaultValue=""><option value="" disabled>Select a server</option>{guilds.map((guild) => <option value={guild.id} key={guild.id}>{guild.name}{guild.isOwner ? " · Owner" : ""}</option>)}</select></div>}
      </div>
      {type === "TEAM" ? <div className="two-column"><div className="form-stack compact"><label htmlFor="team-tag">Team tag</label><input id="team-tag" name="teamTag" maxLength={16} placeholder="BTS" /></div><div className="form-stack compact"><label htmlFor="team-region">Region</label><input id="team-region" name="region" maxLength={80} placeholder="North America" /></div></div> : null}
      <div className="form-stack compact"><label htmlFor="request-description">Description</label><textarea id="request-description" name="description" rows={5} maxLength={5000} /></div>
      <div className="two-column"><div className="form-stack compact"><label htmlFor="request-platform">Main platform</label><input id="request-platform" name="mainPlatform" list="request-platforms" placeholder="Roblox" /><datalist id="request-platforms"><option value="Roblox" /><option value="Minecraft" /><option value="Steam" /><option value="Xbox" /><option value="PlayStation" /></datalist></div><div className="form-stack compact"><label htmlFor="request-game">Main game</label><input id="request-game" name="mainGame" placeholder="Villagism" /></div></div>
      <div className="two-column"><div className="form-stack compact"><label htmlFor="request-logo">Logo URL</label><input id="request-logo" name="logoUrl" type="url" placeholder="https://..." /></div><div className="form-stack compact"><label htmlFor="request-banner">Banner URL</label><input id="request-banner" name="bannerUrl" type="url" placeholder="https://..." /></div></div>
      {type === "SERVER" ? <div className="two-column"><div className="form-stack compact"><label htmlFor="request-discord">Discord invite</label><input id="request-discord" name="discordInviteUrl" type="url" placeholder="https://discord.gg/..." /></div><div className="form-stack compact"><label htmlFor="request-roblox">Roblox community</label><input id="request-roblox" name="robloxCommunityUrl" type="url" placeholder="https://www.roblox.com/communities/..." /></div></div> : <div className="form-stack compact"><label htmlFor="home-workspace">Affiliated server profile</label><select id="home-workspace" name="homeWorkspaceId" defaultValue=""><option value="">Independent team</option>{workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name}</option>)}</select></div>}
      <button className="button" type="submit" disabled={busy}>{busy ? "Submitting…" : `Request ${type === "SERVER" ? "server" : "team"} profile`}</button>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </form>
  );
}
