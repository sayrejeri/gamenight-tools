"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SavedGame = {
  id: string;
  platform_name: string;
  game_name: string;
  game_url: string | null;
  external_id: string | null;
  universe_id: string | null;
  thumbnail_url: string | null;
  is_primary: number;
};

type EditableGame = {
  key: string;
  platformName: string;
  gameName: string;
  gameUrl: string;
  externalId: string;
  universeId: string;
  thumbnailUrl: string;
  primary: boolean;
};

export function WorkspaceProfileForm({
  workspaceId,
  initial,
  savedGames,
}: {
  workspaceId: string;
  initial: {
    description: string;
    timezone: string;
    iconUrl: string;
    bannerUrl: string;
    discordInviteUrl: string;
    mainGameCategory: string;
    robloxCommunityName: string;
    robloxCommunityUrl: string;
    chatEnabled: boolean;
    suggestionsEnabled: boolean;
  };
  savedGames: SavedGame[];
}) {
  const router = useRouter();
  const [description, setDescription] = useState(initial.description);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [iconUrl, setIconUrl] = useState(initial.iconUrl);
  const [bannerUrl, setBannerUrl] = useState(initial.bannerUrl);
  const [discordInviteUrl, setDiscordInviteUrl] = useState(initial.discordInviteUrl);
  const [mainGameCategory, setMainGameCategory] = useState(initial.mainGameCategory);
  const [robloxCommunityName, setRobloxCommunityName] = useState(initial.robloxCommunityName);
  const [robloxCommunityUrl, setRobloxCommunityUrl] = useState(initial.robloxCommunityUrl);
  const [chatEnabled, setChatEnabled] = useState(initial.chatEnabled);
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(initial.suggestionsEnabled);
  const [robloxLink, setRobloxLink] = useState("");
  const [games, setGames] = useState<EditableGame[]>(() => savedGames.map((game) => ({
    key: game.id,
    platformName: game.platform_name,
    gameName: game.game_name,
    gameUrl: game.game_url ?? "",
    externalId: game.external_id ?? "",
    universeId: game.universe_id ?? "",
    thumbnailUrl: game.thumbnail_url ?? "",
    primary: Boolean(game.is_primary),
  })));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);

  async function importRobloxGame() {
    setImporting(true);
    setMessage("");
    try {
      const response = await fetch(`/api/roblox/game?value=${encodeURIComponent(robloxLink)}`);
      const body = await response.json() as {
        error?: string;
        game?: { placeId: string; universeId: string | null; name: string; gameUrl: string; thumbnailUrl: string | null };
      };
      if (!response.ok || !body.game) throw new Error(body.error ?? "Roblox game could not be imported.");
      if (games.some((game) => game.externalId === body.game?.placeId)) throw new Error("That Roblox game is already saved to this server.");
      setGames((current) => [...current, {
        key: crypto.randomUUID(), platformName: "Roblox", gameName: body.game?.name ?? "Roblox experience",
        gameUrl: body.game?.gameUrl ?? robloxLink, externalId: body.game?.placeId ?? "",
        universeId: body.game?.universeId ?? "", thumbnailUrl: body.game?.thumbnailUrl ?? "", primary: current.length === 0,
      }]);
      setRobloxLink("");
      setMainGameCategory((current) => current || "Roblox");
      setBannerUrl((current) => current || body.game?.thumbnailUrl || "");
      setMessage("Roblox game imported. Save the server profile to keep it.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Roblox game could not be imported."); }
    finally { setImporting(false); }
  }

  function makePrimary(key: string) { setGames((current) => current.map((game) => ({ ...game, primary: game.key === key }))); }
  function removeGame(key: string) {
    setGames((current) => {
      const removed = current.find((game) => game.key === key);
      const next = current.filter((game) => game.key !== key);
      if (removed?.primary && next[0]) next[0] = { ...next[0], primary: true };
      return next;
    });
  }

  async function save() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/profile`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description, timezone, iconUrl: iconUrl || null, bannerUrl: bannerUrl || null,
          discordInviteUrl: discordInviteUrl || null, mainGameCategory: mainGameCategory || null,
          robloxCommunityName: robloxCommunityName || null, robloxCommunityUrl: robloxCommunityUrl || null,
          chatEnabled, suggestionsEnabled,
          games: games.map((game) => ({ platformName: game.platformName, gameName: game.gameName,
            gameUrl: game.gameUrl || null, externalId: game.externalId || null, universeId: game.universeId || null,
            thumbnailUrl: game.thumbnailUrl || null, primary: game.primary })),
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Server profile could not be saved.");
      setMessage("Server profile saved."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Server profile could not be saved."); }
    finally { setBusy(false); }
  }

  const isRoblox = mainGameCategory.trim().toLowerCase() === "roblox";

  return (
    <div className="form-stack">
      <div className="two-column"><div className="form-stack compact"><label htmlFor="server-main-game">Main game category</label><input id="server-main-game" list="server-game-categories" value={mainGameCategory} onChange={(event) => setMainGameCategory(event.target.value)} placeholder="Roblox" /><datalist id="server-game-categories"><option value="Roblox" /><option value="Minecraft" /><option value="Fortnite" /><option value="Steam" /><option value="Other" /></datalist></div><div className="form-stack compact"><label htmlFor="server-timezone">Default host timezone</label><input id="server-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} required /></div></div>
      <label htmlFor="server-description">Server description</label><textarea id="server-description" rows={4} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} />
      <div className="two-column"><div className="form-stack compact"><label htmlFor="server-icon">Server logo URL</label><input id="server-icon" type="url" value={iconUrl} onChange={(event) => setIconUrl(event.target.value)} placeholder="https://..." /></div><div className="form-stack compact"><label htmlFor="server-banner">Server banner URL</label><input id="server-banner" type="url" value={bannerUrl} onChange={(event) => setBannerUrl(event.target.value)} placeholder="https://..." /></div></div>
      <label htmlFor="server-discord-invite">Discord invite</label><input id="server-discord-invite" type="url" value={discordInviteUrl} onChange={(event) => setDiscordInviteUrl(event.target.value)} placeholder="https://discord.gg/..." />
      <div className="settings-check-grid"><label className="checkbox-row"><input type="checkbox" checked={chatEnabled} onChange={(event) => setChatEnabled(event.target.checked)} />Enable server chat when chat launches</label><label className="checkbox-row"><input type="checkbox" checked={suggestionsEnabled} onChange={(event) => setSuggestionsEnabled(event.target.checked)} />Enable server suggestion board</label></div>

      {isRoblox ? <section className="subpanel form-stack"><h3>Roblox community</h3><div className="two-column"><div className="form-stack compact"><label htmlFor="roblox-community-name">Community name</label><input id="roblox-community-name" value={robloxCommunityName} onChange={(event) => setRobloxCommunityName(event.target.value)} /></div><div className="form-stack compact"><label htmlFor="roblox-community-url">Community link</label><input id="roblox-community-url" type="url" value={robloxCommunityUrl} onChange={(event) => setRobloxCommunityUrl(event.target.value)} placeholder="https://www.roblox.com/communities/..." /></div></div><label htmlFor="workspace-roblox-game">Add a Roblox game</label><div className="inline-form"><input id="workspace-roblox-game" value={robloxLink} onChange={(event) => setRobloxLink(event.target.value)} placeholder="Roblox game link or Place ID" /><button className="button button-secondary" type="button" disabled={importing || !robloxLink.trim()} onClick={importRobloxGame}>{importing ? "Importing…" : "Import game"}</button></div></section> : null}

      {games.length ? <div className="saved-game-grid">{games.map((game) => <article className="saved-game-card" key={game.key}>{game.thumbnailUrl ? <img src={game.thumbnailUrl} alt="" /> : <div className="game-image-fallback">{game.platformName}</div>}<div><span className="card-kicker">{game.platformName}</span><h3>{game.gameName}</h3><div className="button-row"><button className={`button ${game.primary ? "" : "button-secondary"}`} type="button" onClick={() => makePrimary(game.key)}>{game.primary ? "Primary game" : "Make primary"}</button><button className="button button-danger" type="button" onClick={() => removeGame(game.key)}>Remove</button></div></div></article>)}</div> : null}
      <button className="button" type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save server profile"}</button>{message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </div>
  );
}
