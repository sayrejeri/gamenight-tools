"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [mainGameCategory, setMainGameCategory] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    const ownerDiscordIds = String(formData.get("ownerDiscordIds") ?? "")
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId: formData.get("guildId"),
          name: formData.get("name"),
          description: formData.get("description"),
          timezone: formData.get("timezone"),
          ownerDiscordIds,
          discordInviteUrl: formData.get("discordInviteUrl") || null,
          mainGameCategory: mainGameCategory || null,
          robloxCommunityName: formData.get("robloxCommunityName") || null,
          robloxCommunityUrl: formData.get("robloxCommunityUrl") || null,
        }),
      });
      const body = await response.json() as { error?: string; workspaceId?: string };
      if (!response.ok || !body.workspaceId) throw new Error(body.error ?? "The server profile could not be created.");
      router.push(`/dashboard/workspaces/${body.workspaceId}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The server profile could not be created.");
    } finally {
      setBusy(false);
    }
  }

  const isRoblox = mainGameCategory.trim().toLowerCase() === "roblox";

  return (
    <form className="form-stack" action={submit}>
      <label htmlFor="workspace-name">Server profile name</label>
      <input id="workspace-name" name="name" required minLength={2} maxLength={120} />

      <div className="two-column">
        <div className="form-stack compact">
          <label htmlFor="guild-id">Discord server ID</label>
          <input id="guild-id" name="guildId" required inputMode="numeric" pattern="[0-9]{15,25}" />
        </div>
        <div className="form-stack compact">
          <label htmlFor="discord-invite">Discord invite</label>
          <input id="discord-invite" name="discordInviteUrl" type="url" placeholder="https://discord.gg/..." />
        </div>
      </div>

      <label htmlFor="owner-ids">Owner Discord IDs</label>
      <textarea id="owner-ids" name="ownerDiscordIds" required rows={4} placeholder="One ID per line or separated by commas" />

      <div className="two-column">
        <div className="form-stack compact">
          <label htmlFor="workspace-timezone">Default timezone</label>
          <input id="workspace-timezone" name="timezone" defaultValue="America/Detroit" required />
        </div>
        <div className="form-stack compact">
          <label htmlFor="main-game-category">Main game category</label>
          <input id="main-game-category" name="mainGameCategory" list="main-game-options" value={mainGameCategory} onChange={(event) => setMainGameCategory(event.target.value)} placeholder="Roblox" />
          <datalist id="main-game-options"><option value="Roblox" /><option value="Minecraft" /><option value="Fortnite" /><option value="Steam" /><option value="Other" /></datalist>
        </div>
      </div>

      {isRoblox ? (
        <section className="subpanel form-stack">
          <h3>Roblox community</h3>
          <div className="two-column">
            <div className="form-stack compact"><label htmlFor="roblox-community-name">Community name</label><input id="roblox-community-name" name="robloxCommunityName" /></div>
            <div className="form-stack compact"><label htmlFor="roblox-community-url">Community link</label><input id="roblox-community-url" name="robloxCommunityUrl" type="url" placeholder="https://www.roblox.com/communities/..." /></div>
          </div>
          <span className="field-help">After creating the server profile, add primary and additional Roblox games from its edit section.</span>
        </section>
      ) : null}

      <label htmlFor="workspace-description">Description</label>
      <textarea id="workspace-description" name="description" rows={4} maxLength={2000} />

      <button className="button" type="submit" disabled={busy}>{busy ? "Creating…" : "Create server profile"}</button>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </form>
  );
}
