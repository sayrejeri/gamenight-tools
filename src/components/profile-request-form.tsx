"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { InfoTip } from "@/components/info-tip";

type Guild = { id: string; name: string; isOwner: boolean };
type Workspace = { id: string; name: string };
type RequestType = "SERVER" | "TEAM";
type RequestDraft = {
  name: string; slug: string; description: string; logoUrl: string; bannerUrl: string; mainPlatform: string; mainGame: string;
  discordGuildId: string; discordInviteUrl: string; robloxCommunityUrl: string; homeWorkspaceId: string; teamTag: string; region: string;
};
type RequestDrafts = Record<RequestType, RequestDraft>;

function createEmptyDraft(): RequestDraft {
  return { name: "", slug: "", description: "", logoUrl: "", bannerUrl: "", mainPlatform: "", mainGame: "", discordGuildId: "", discordInviteUrl: "", robloxCommunityUrl: "", homeWorkspaceId: "", teamTag: "", region: "" };
}
function createEmptyDrafts(): RequestDrafts { return { SERVER: createEmptyDraft(), TEAM: createEmptyDraft() }; }

export function ProfileRequestForm({ guilds, workspaces }: { guilds: Guild[]; workspaces: Workspace[] }) {
  const router = useRouter();
  const [type, setType] = useState<RequestType>("SERVER");
  const [drafts, setDrafts] = useState<RequestDrafts>(createEmptyDrafts);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const draft = drafts[type];

  function updateField<K extends keyof RequestDraft>(field: K, value: RequestDraft[K]) {
    setDrafts((current) => ({ ...current, [type]: { ...current[type], [field]: value } }));
  }
  function selectType(nextType: RequestType) { setType(nextType); setMessage(""); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/profile-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestType: type, ...draft }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Profile request could not be submitted.");
      setMessage("Profile request submitted for staff review.");
      setDrafts((current) => ({ ...current, [type]: createEmptyDraft() }));
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Profile request could not be submitted."); }
    finally { setBusy(false); }
  }

  const isRoblox = draft.mainPlatform.trim().toLowerCase() === "roblox";

  return (
    <form className="panel section-stack" onSubmit={submit}>
      <div className="segmented-control"><button type="button" className={type === "SERVER" ? "active" : ""} onClick={() => selectType("SERVER")}>Server profile</button><button type="button" className={type === "TEAM" ? "active" : ""} onClick={() => selectType("TEAM")}>Team profile</button></div>
      <p className="form-note">{type === "SERVER" ? "Required: server name and a Discord server you own or manage. Everything else, including the logo and banner, can be added later." : "Required: team name. The logo, banner, description, game, region, and server affiliation are optional and can be added later."}</p>

      <div className="two-column">
        <div className="form-stack compact"><label htmlFor="request-name">{type === "SERVER" ? "Server name" : "Team name"} <span aria-hidden="true">*</span></label><input id="request-name" name="name" minLength={3} maxLength={120} required value={draft.name} onChange={(event) => updateField("name", event.target.value)} /></div>
        {type === "TEAM" ? <div className="form-stack compact"><label htmlFor="request-slug">Profile URL <span className="optional-label">Optional</span> <InfoTip text="This becomes the public address for the team, such as /teams/blackthorne-saints. Use letters, numbers, and hyphens; leaving it blank creates one from the team name." /></label><input id="request-slug" name="slug" placeholder="blackthorne-saints" maxLength={80} value={draft.slug} onChange={(event) => updateField("slug", event.target.value)} /></div> : <div className="form-stack compact"><label htmlFor="request-guild">Discord server <span aria-hidden="true">*</span> <InfoTip text="Only servers Discord reports that you own or have Manage Server/Administrator permission for can be requested." /></label><select id="request-guild" name="discordGuildId" required value={draft.discordGuildId} onChange={(event) => updateField("discordGuildId", event.target.value)}><option value="" disabled>Select a server</option>{guilds.map((guild) => <option value={guild.id} key={guild.id}>{guild.name}{guild.isOwner ? " · Owner" : ""}</option>)}</select></div>}
      </div>

      {type === "TEAM" ? <div className="two-column"><div className="form-stack compact"><label htmlFor="team-tag">Team tag <span className="optional-label">Optional</span></label><input id="team-tag" name="teamTag" maxLength={16} placeholder="BTS" value={draft.teamTag} onChange={(event) => updateField("teamTag", event.target.value)} /></div><div className="form-stack compact"><label htmlFor="team-region">Region <span className="optional-label">Optional</span></label><input id="team-region" name="region" maxLength={80} placeholder="North America" value={draft.region} onChange={(event) => updateField("region", event.target.value)} /></div></div> : null}

      <div className="form-stack compact"><label htmlFor="request-description">Description <span className="optional-label">Optional</span></label><textarea id="request-description" name="description" rows={5} maxLength={5000} value={draft.description} onChange={(event) => updateField("description", event.target.value)} /></div>

      <div className="two-column">
        <div className="form-stack compact"><label htmlFor="request-platform">Main platform <span className="optional-label">Optional</span></label><input id="request-platform" name="mainPlatform" list="request-platforms" placeholder="Roblox" value={draft.mainPlatform} onChange={(event) => updateField("mainPlatform", event.target.value)} /><datalist id="request-platforms"><option value="Roblox" /><option value="Minecraft" /><option value="Steam" /><option value="Xbox" /><option value="PlayStation" /></datalist></div>
        <div className="form-stack compact"><label htmlFor="request-game">Main game <span className="optional-label">Optional</span> <InfoTip text={isRoblox ? "For Roblox you can enter the game name, numeric Place ID, or a roblox.com/games URL. Place IDs and game URLs are resolved to the canonical game title and saved separately from Universe IDs." : "Enter the game this profile mainly represents. Normal game names work for every platform."} /></label><input id="request-game" name="mainGame" placeholder={isRoblox ? "Villagism, Place ID, or Roblox game URL" : "Game name"} value={draft.mainGame} onChange={(event) => updateField("mainGame", event.target.value)} /></div>
      </div>

      <div className="two-column">
        <div className="form-stack compact"><label htmlFor="request-logo">Logo URL <span className="optional-label">Optional</span> <InfoTip text="A public direct image URL for the profile logo. Square/1:1 images work best. Hosts such as ImgBB, Postimages, Cloudinary, or a public GitHub-hosted image can work as long as the image is publicly accessible." /></label><input id="request-logo" name="logoUrl" type="url" placeholder="https://..." value={draft.logoUrl} onChange={(event) => updateField("logoUrl", event.target.value)} /><span className="field-help">You can add or change the logo after approval.</span></div>
        <div className="form-stack compact"><label htmlFor="request-banner">Banner URL <span className="optional-label">Optional</span> <InfoTip text="A public direct image URL used across the top/background of the profile. Wide images around 16:9 or wider work best." /></label><input id="request-banner" name="bannerUrl" type="url" placeholder="https://..." value={draft.bannerUrl} onChange={(event) => updateField("bannerUrl", event.target.value)} /><span className="field-help">You can add or change the banner after approval.</span></div>
      </div>

      {type === "SERVER" ? <div className="two-column"><div className="form-stack compact"><label htmlFor="request-discord">Discord invite <span className="optional-label">Optional</span></label><input id="request-discord" name="discordInviteUrl" type="url" placeholder="https://discord.gg/..." value={draft.discordInviteUrl} onChange={(event) => updateField("discordInviteUrl", event.target.value)} /></div><div className="form-stack compact"><label htmlFor="request-roblox">Roblox community <span className="optional-label">Optional</span></label><input id="request-roblox" name="robloxCommunityUrl" type="url" placeholder="https://www.roblox.com/communities/..." value={draft.robloxCommunityUrl} onChange={(event) => updateField("robloxCommunityUrl", event.target.value)} /></div></div> : <div className="form-stack compact"><label htmlFor="home-workspace">Affiliated server profile <span className="optional-label">Optional</span> <InfoTip text="Use this when the team officially belongs to an approved server/community profile. You need team-management permission for that server to create the affiliation." /></label><select id="home-workspace" name="homeWorkspaceId" value={draft.homeWorkspaceId} onChange={(event) => updateField("homeWorkspaceId", event.target.value)}><option value="">Independent team</option>{workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name}</option>)}</select></div>}

      <button className="button" type="submit" disabled={busy}>{busy ? "Submitting…" : `Request ${type === "SERVER" ? "server" : "team"} profile`}</button>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </form>
  );
}
