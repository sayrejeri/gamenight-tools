"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EventDescriptionEditor } from "@/components/event-description-editor";

type BracketFormat = "SINGLE_ELIMINATION" | "THREE_PLAYER" | "DOUBLE_ELIMINATION" | "ROUND_ROBIN" | "GROUPS_PLAYOFFS";

type InitialEvent = {
  name: string;
  description: string;
  platformName: string;
  subgameName: string;
  legacyGameName: string;
  gameUrl: string;
  gameExternalId: string;
  gameUniverseId: string;
  gameThumbnailUrl: string;
  requiredConnectionType: string;
  startsAt: string | null;
  signupDeadline: string | null;
  checkInOpensAt: string | null;
  checkInDeadline: string | null;
  maxParticipants: number | null;
  timezone: string;
  visibility: string;
  joinCodeRequired: boolean;
  bracketEnabled: boolean;
  bracketFormat: BracketFormat;
  bracketEntryMode: "PLAYER" | "TEAM";
  bracketSeedingMode: "RANDOM" | "MANUAL";
  bracketAutoGenerate: boolean;
  bracketRequireCheckIn: boolean;
  bracketGroupCount: number;
  bracketAdvancersPerGroup: number;
  bracketTiebreakMode: "HEAD_TO_HEAD_THEN_SEED" | "SEED";
};

type EditPreviewContext = {
  status: string;
  host: string;
  cohosts: string[];
  playerParticipants: number;
  teamParticipants: number;
  workspace: string;
};

type DateFields = { startsAt: string; signupDeadline: string; checkInOpensAt: string; checkInDeadline: string };

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function localIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function EditEventForm({ eventId, initial, preview }: { eventId: string; initial: InitialEvent; preview: EditPreviewContext }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [platformName, setPlatformName] = useState(initial.platformName);
  const [subgameName, setSubgameName] = useState(initial.subgameName);
  const [gameUrl, setGameUrl] = useState(initial.gameUrl);
  const [gameExternalId, setGameExternalId] = useState(initial.gameExternalId);
  const [gameUniverseId, setGameUniverseId] = useState(initial.gameUniverseId);
  const [gameThumbnailUrl, setGameThumbnailUrl] = useState(initial.gameThumbnailUrl);
  const [requiredConnectionType, setRequiredConnectionType] = useState(initial.requiredConnectionType);
  const [dates, setDates] = useState<DateFields>({ startsAt: "", signupDeadline: "", checkInOpensAt: "", checkInDeadline: "" });
  const [maxParticipants, setMaxParticipants] = useState(initial.maxParticipants === null ? "0" : String(initial.maxParticipants));
  const [timezone, setTimezone] = useState(initial.timezone);
  const [visibility, setVisibility] = useState(initial.visibility);
  const [joinCodeRequired, setJoinCodeRequired] = useState(initial.joinCodeRequired);
  const [bracketEnabled, setBracketEnabled] = useState(initial.bracketEnabled);
  const [bracketFormat, setBracketFormat] = useState(initial.bracketFormat);
  const [bracketEntryMode, setBracketEntryMode] = useState(initial.bracketEntryMode);
  const [bracketSeedingMode, setBracketSeedingMode] = useState(initial.bracketSeedingMode);
  const [bracketAutoGenerate, setBracketAutoGenerate] = useState(initial.bracketAutoGenerate);
  const [bracketRequireCheckIn, setBracketRequireCheckIn] = useState(initial.bracketRequireCheckIn);
  const [bracketGroupCount, setBracketGroupCount] = useState(initial.bracketGroupCount);
  const [bracketAdvancersPerGroup, setBracketAdvancersPerGroup] = useState(initial.bracketAdvancersPerGroup);
  const [bracketTiebreakMode, setBracketTiebreakMode] = useState(initial.bracketTiebreakMode);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDates({ startsAt: toLocalInput(initial.startsAt), signupDeadline: toLocalInput(initial.signupDeadline), checkInOpensAt: toLocalInput(initial.checkInOpensAt), checkInDeadline: toLocalInput(initial.checkInDeadline) });
  }, [initial.checkInDeadline, initial.checkInOpensAt, initial.signupDeadline, initial.startsAt]);

  function setDate(key: keyof DateFields, value: string) { setDates((current) => ({ ...current, [key]: value })); }

  async function importRobloxGame() {
    setImporting(true); setMessage("");
    try {
      const response = await fetch(`/api/roblox/game?value=${encodeURIComponent(gameUrl)}`);
      const body = await response.json() as { error?: string; game?: { placeId: string; universeId: string | null; name: string; gameUrl: string; thumbnailUrl: string | null } };
      if (!response.ok || !body.game) throw new Error(body.error ?? "Roblox game could not be imported.");
      setPlatformName("Roblox"); setSubgameName(body.game.name); setGameUrl(body.game.gameUrl); setGameExternalId(body.game.placeId); setGameUniverseId(body.game.universeId ?? ""); setGameThumbnailUrl(body.game.thumbnailUrl ?? ""); setRequiredConnectionType((current) => current || "Roblox");
      setMessage("Roblox game details and thumbnail refreshed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Roblox game could not be imported."); }
    finally { setImporting(false); }
  }

  async function save() {
    setBusy(true); setMessage("");
    const toIso = (value: string) => value ? new Date(value).toISOString() : null;
    const limit = maxParticipants.trim() === "" ? 0 : Number(maxParticipants);
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, description: description || null, platformName: platformName || null, subgameName: subgameName || null,
          gameUrl: gameUrl || null, gameExternalId: gameExternalId || null, gameUniverseId: gameUniverseId || null, gameThumbnailUrl: gameThumbnailUrl || null,
          requiredConnectionType: requiredConnectionType || null,
          startsAt: toIso(dates.startsAt), signupDeadline: toIso(dates.signupDeadline), checkInOpensAt: toIso(dates.checkInOpensAt), checkInDeadline: toIso(dates.checkInDeadline),
          maxParticipants: Number.isFinite(limit) ? limit : 0, timezone, visibility, joinCodeRequired,
          bracketEnabled, bracketFormat, bracketEntryMode, bracketSeedingMode, bracketAutoGenerate,
          bracketRequireCheckIn: bracketEntryMode === "PLAYER" && bracketRequireCheckIn,
          bracketGroupCount, bracketAdvancersPerGroup, bracketTiebreakMode,
        }),
      });
      const body = await response.json() as { error?: string; competitionReset?: boolean };
      if (!response.ok) throw new Error(body.error ?? "Event could not be saved.");
      setMessage(body.competitionReset ? "Event saved. Competition setup was reset because its format settings changed." : "Event changes saved.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Event could not be saved."); }
    finally { setBusy(false); }
  }

  const isRoblox = platformName.trim().toLowerCase() === "roblox";
  const usesStandings = bracketFormat === "ROUND_ROBIN" || bracketFormat === "GROUPS_PLAYOFFS";
  const maxPreview = Number(maxParticipants || 0);
  const descriptionContext = {
    eventName: name,
    eventStart: localIso(dates.startsAt),
    signupDeadline: localIso(dates.signupDeadline),
    checkInOpensAt: localIso(dates.checkInOpensAt),
    checkInDeadline: localIso(dates.checkInDeadline),
    timezone,
    game: subgameName || initial.legacyGameName || platformName,
    platform: platformName,
    format: bracketEnabled ? bracketFormat : null,
    entrantMode: bracketEntryMode,
    seedingMode: bracketEnabled ? bracketSeedingMode : null,
    status: preview.status,
    visibility,
    host: preview.host,
    cohosts: preview.cohosts,
    participants: bracketEntryMode === "TEAM" ? preview.teamParticipants : preview.playerParticipants,
    maxParticipants: Number.isFinite(maxPreview) ? maxPreview : 0,
    workspace: preview.workspace,
  };

  return (
    <div className="form-stack">
      <label htmlFor="edit-event-name">Event name</label><input id="edit-event-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required />
      <div className="two-column">
        <div className="form-stack compact"><label htmlFor="edit-platform">Main category / platform</label><input id="edit-platform" list="edit-platform-options" value={platformName} onChange={(event) => setPlatformName(event.target.value)} /><datalist id="edit-platform-options"><option value="Roblox" /><option value="Minecraft" /><option value="Fortnite" /><option value="Steam" /><option value="Other" /></datalist></div>
        <div className="form-stack compact"><label htmlFor="edit-subgame">Game inside the platform</label><input id="edit-subgame" value={subgameName} onChange={(event) => setSubgameName(event.target.value)} /></div>
      </div>
      <label htmlFor="edit-game-url">{isRoblox ? "Roblox game link or Place ID" : "Game link"}</label>
      <div className="inline-form"><input id="edit-game-url" value={gameUrl} onChange={(event) => setGameUrl(event.target.value)} />{isRoblox ? <button className="button button-secondary" type="button" disabled={importing || !gameUrl.trim()} onClick={importRobloxGame}>{importing ? "Importing…" : "Refresh from Roblox"}</button> : null}</div>
      {gameThumbnailUrl ? <div className="game-preview"><img src={gameThumbnailUrl} alt="" /><div><span className="card-kicker">{platformName}</span><strong>{subgameName}</strong><span className="muted">Current event artwork</span></div></div> : null}
      <label htmlFor="edit-description">Description</label><EventDescriptionEditor id="edit-description" rows={8} value={description} onChange={setDescription} context={descriptionContext} />
      <div className="two-column"><div className="form-stack compact"><label htmlFor="edit-start">Event start</label><input id="edit-start" type="datetime-local" value={dates.startsAt} onChange={(event) => setDate("startsAt", event.target.value)} /></div><div className="form-stack compact"><label htmlFor="edit-signup-deadline">Signup deadline</label><input id="edit-signup-deadline" type="datetime-local" value={dates.signupDeadline} onChange={(event) => setDate("signupDeadline", event.target.value)} /></div></div>
      <div className="two-column"><div className="form-stack compact"><label htmlFor="edit-checkin-open">Check-in opens</label><input id="edit-checkin-open" type="datetime-local" value={dates.checkInOpensAt} onChange={(event) => setDate("checkInOpensAt", event.target.value)} /></div><div className="form-stack compact"><label htmlFor="edit-checkin-deadline">Check-in deadline</label><input id="edit-checkin-deadline" type="datetime-local" value={dates.checkInDeadline} onChange={(event) => setDate("checkInDeadline", event.target.value)} /></div></div>
      <div className="two-column"><div className="form-stack compact"><label htmlFor="edit-limit">Maximum {bracketEnabled && bracketEntryMode === "TEAM" ? "teams" : "participants"}</label><input id="edit-limit" type="number" min={0} max={10000} value={maxParticipants} onChange={(event) => setMaxParticipants(event.target.value)} /><span className="field-help">0 or blank means unlimited.</span></div><div className="form-stack compact"><label htmlFor="edit-timezone">Host timezone</label><input id="edit-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} /></div></div>
      <div className="two-column"><div className="form-stack compact"><label htmlFor="edit-identity">Required game identity</label><input id="edit-identity" value={requiredConnectionType} onChange={(event) => setRequiredConnectionType(event.target.value)} /></div><div className="form-stack compact"><label htmlFor="edit-visibility">Visibility</label><select id="edit-visibility" value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="SERVER">Discord server members</option><option value="CODE_ONLY">Code only</option><option value="UNLISTED">Unlisted link</option><option value="PUBLIC">All logged-in users</option><option value="STAFF_ONLY">Staff only</option></select></div></div>
      <label className="checkbox-row"><input type="checkbox" checked={joinCodeRequired} onChange={(event) => setJoinCodeRequired(event.target.checked)} />Require an event join code</label>

      <section className="subpanel form-stack">
        <label className="checkbox-row"><input type="checkbox" checked={bracketEnabled} onChange={(event) => setBracketEnabled(event.target.checked)} />Use built-in tournament competition tools</label>
        {bracketEnabled ? <>
          <div className="two-column">
            <div className="form-stack compact"><label htmlFor="edit-bracket-format">Format</label><select id="edit-bracket-format" value={bracketFormat} onChange={(event) => setBracketFormat(event.target.value as BracketFormat)}><option value="SINGLE_ELIMINATION">Single elimination</option><option value="DOUBLE_ELIMINATION">Double elimination</option><option value="ROUND_ROBIN">Round robin</option><option value="GROUPS_PLAYOFFS">Groups → playoffs</option><option value="THREE_PLAYER">Three-player custom advancement</option></select></div>
            <div className="form-stack compact"><label htmlFor="edit-entry-mode">Entrants</label><select id="edit-entry-mode" value={bracketEntryMode} onChange={(event) => setBracketEntryMode(event.target.value as InitialEvent["bracketEntryMode"])}><option value="PLAYER">Individual players</option><option value="TEAM">Registered teams</option></select></div>
          </div>
          <div className="two-column">
            <div className="form-stack compact"><label htmlFor="edit-seeding">Placement</label><select id="edit-seeding" value={bracketSeedingMode} onChange={(event) => setBracketSeedingMode(event.target.value as InitialEvent["bracketSeedingMode"])}><option value="RANDOM">Random</option><option value="MANUAL">Manual</option></select></div>
            {usesStandings ? <div className="form-stack compact"><label htmlFor="edit-tiebreak">Standings tiebreak</label><select id="edit-tiebreak" value={bracketTiebreakMode} onChange={(event) => setBracketTiebreakMode(event.target.value as InitialEvent["bracketTiebreakMode"])}><option value="HEAD_TO_HEAD_THEN_SEED">Head-to-head, then seed</option><option value="SEED">Original seed/order</option></select></div> : null}
          </div>
          {bracketFormat === "GROUPS_PLAYOFFS" ? <div className="two-column"><div className="form-stack compact"><label htmlFor="edit-group-count">Groups</label><input id="edit-group-count" type="number" min={2} max={16} value={bracketGroupCount} onChange={(event) => setBracketGroupCount(Math.max(2, Math.min(16, Number(event.target.value) || 2)))} /></div><div className="form-stack compact"><label htmlFor="edit-group-advancers">Advance per group</label><input id="edit-group-advancers" type="number" min={1} max={8} value={bracketAdvancersPerGroup} onChange={(event) => setBracketAdvancersPerGroup(Math.max(1, Math.min(8, Number(event.target.value) || 1)))} /></div></div> : null}
          <label className="checkbox-row"><input type="checkbox" checked={bracketAutoGenerate} disabled={bracketSeedingMode === "MANUAL"} onChange={(event) => setBracketAutoGenerate(event.target.checked)} />Automatically generate when signups close</label>
          {bracketEntryMode === "PLAYER" ? <label className="checkbox-row"><input type="checkbox" checked={bracketRequireCheckIn} onChange={(event) => setBracketRequireCheckIn(event.target.checked)} />Only include checked-in participants</label> : <div className="rule-callout"><strong>Team tournament</strong><p>Changing to team entrants resets the current competition setup. Registered team rosters are managed from the event page.</p></div>}
        </> : null}
      </section>

      <div className="button-row"><button className="button" type="button" disabled={busy || name.trim().length < 2} onClick={save}>{busy ? "Saving…" : "Save changes"}</button></div>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </div>
  );
}