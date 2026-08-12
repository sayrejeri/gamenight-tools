"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EventDescriptionEditor } from "@/components/event-description-editor";

export type EventTemplateOption = {
  id: string;
  name: string;
  configuration: Partial<EventFormFields>;
};

export type WorkspaceGameOption = {
  id: string;
  platform_name: string;
  game_name: string;
  game_url: string | null;
  external_id: string | null;
  universe_id: string | null;
  thumbnail_url: string | null;
};

type BracketFormat = "SINGLE_ELIMINATION" | "THREE_PLAYER" | "DOUBLE_ELIMINATION" | "ROUND_ROBIN" | "GROUPS_PLAYOFFS";

type EventFormFields = {
  name: string;
  platformName: string;
  subgameName: string;
  gameUrl: string;
  gameExternalId: string;
  gameUniverseId: string;
  gameThumbnailUrl: string;
  requiredConnectionType: string;
  description: string;
  startsAt: string;
  signupDeadline: string;
  checkInOpensAt: string;
  checkInDeadline: string;
  maxParticipants: string;
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

function blankFields(timezone: string): EventFormFields {
  return {
    name: "",
    platformName: "",
    subgameName: "",
    gameUrl: "",
    gameExternalId: "",
    gameUniverseId: "",
    gameThumbnailUrl: "",
    requiredConnectionType: "",
    description: "",
    startsAt: "",
    signupDeadline: "",
    checkInOpensAt: "",
    checkInDeadline: "",
    maxParticipants: "0",
    timezone,
    visibility: "SERVER",
    joinCodeRequired: true,
    bracketEnabled: false,
    bracketFormat: "SINGLE_ELIMINATION",
    bracketEntryMode: "PLAYER",
    bracketSeedingMode: "RANDOM",
    bracketAutoGenerate: false,
    bracketRequireCheckIn: false,
    bracketGroupCount: 2,
    bracketAdvancersPerGroup: 1,
    bracketTiebreakMode: "HEAD_TO_HEAD_THEN_SEED",
  };
}

function localIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function CreateEventForm({
  workspaceId,
  workspaceName,
  defaultTimezone,
  templates,
  workspaceGames,
}: {
  workspaceId: string;
  workspaceName: string;
  defaultTimezone: string;
  templates: EventTemplateOption[];
  workspaceGames: WorkspaceGameOption[];
}) {
  const router = useRouter();
  const [fields, setFields] = useState<EventFormFields>(() => blankFields(defaultTimezone));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);

  const isRoblox = fields.platformName.trim().toLowerCase() === "roblox";
  const usesStandings = fields.bracketFormat === "ROUND_ROBIN" || fields.bracketFormat === "GROUPS_PLAYOFFS";

  function setField<K extends keyof EventFormFields>(key: K, value: EventFormFields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function applyTemplate(id: string) {
    const template = templates.find((item) => item.id === id);
    setFields({
      ...blankFields(defaultTimezone),
      ...(template?.configuration ?? {}),
      timezone: template?.configuration.timezone ?? defaultTimezone,
      startsAt: "",
      signupDeadline: "",
      checkInOpensAt: "",
      checkInDeadline: "",
    });
    setMessage(template ? `Loaded template: ${template.name}` : "");
  }

  function applyWorkspaceGame(id: string) {
    const game = workspaceGames.find((item) => item.id === id);
    if (!game) return;
    setFields((current) => ({
      ...current,
      platformName: game.platform_name,
      subgameName: game.game_name,
      gameUrl: game.game_url ?? "",
      gameExternalId: game.external_id ?? "",
      gameUniverseId: game.universe_id ?? "",
      gameThumbnailUrl: game.thumbnail_url ?? "",
      requiredConnectionType: current.requiredConnectionType || game.platform_name,
    }));
  }

  async function importRobloxGame() {
    setImporting(true);
    setMessage("");
    try {
      const response = await fetch(`/api/roblox/game?value=${encodeURIComponent(fields.gameUrl)}`);
      const body = await response.json() as {
        error?: string;
        game?: { placeId: string; universeId: string | null; name: string; gameUrl: string; thumbnailUrl: string | null };
      };
      if (!response.ok || !body.game) throw new Error(body.error ?? "Roblox game could not be imported.");
      setFields((current) => ({
        ...current,
        platformName: "Roblox",
        subgameName: body.game?.name ?? current.subgameName,
        gameUrl: body.game?.gameUrl ?? current.gameUrl,
        gameExternalId: body.game?.placeId ?? "",
        gameUniverseId: body.game?.universeId ?? "",
        gameThumbnailUrl: body.game?.thumbnailUrl ?? "",
        requiredConnectionType: current.requiredConnectionType || "Roblox",
      }));
      setMessage("Roblox game details and thumbnail imported.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Roblox game could not be imported.");
    } finally {
      setImporting(false);
    }
  }

  async function submit() {
    setBusy(true);
    setMessage("");
    const toIso = (value: string) => value ? new Date(value).toISOString() : null;
    const limit = fields.maxParticipants.trim() === "" ? 0 : Number(fields.maxParticipants);
    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          ...fields,
          startsAt: toIso(fields.startsAt),
          signupDeadline: toIso(fields.signupDeadline),
          checkInOpensAt: toIso(fields.checkInOpensAt),
          checkInDeadline: toIso(fields.checkInDeadline),
          maxParticipants: Number.isFinite(limit) ? limit : 0,
          gameUrl: fields.gameUrl || null,
          gameExternalId: fields.gameExternalId || null,
          gameUniverseId: fields.gameUniverseId || null,
          gameThumbnailUrl: fields.gameThumbnailUrl || null,
          requiredConnectionType: fields.requiredConnectionType || null,
          platformName: fields.platformName || null,
          subgameName: fields.subgameName || null,
          bracketRequireCheckIn: fields.bracketEntryMode === "PLAYER" && fields.bracketRequireCheckIn,
        }),
      });
      const body = await response.json() as { error?: string; eventId?: string };
      if (!response.ok || !body.eventId) throw new Error(body.error ?? "The event could not be created.");
      router.push(`/dashboard/events/${body.eventId}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The event could not be created.");
    } finally {
      setBusy(false);
    }
  }

  const maxPreview = Number(fields.maxParticipants || 0);
  const descriptionContext = {
    eventName: fields.name,
    eventStart: localIso(fields.startsAt),
    signupDeadline: localIso(fields.signupDeadline),
    checkInOpensAt: localIso(fields.checkInOpensAt),
    checkInDeadline: localIso(fields.checkInDeadline),
    timezone: fields.timezone,
    game: fields.subgameName || fields.platformName,
    platform: fields.platformName,
    format: fields.bracketEnabled ? fields.bracketFormat : null,
    entrantMode: fields.bracketEnabled ? fields.bracketEntryMode : null,
    seedingMode: fields.bracketEnabled ? fields.bracketSeedingMode : null,
    status: "DRAFT",
    visibility: fields.visibility,
    host: "You",
    cohosts: [],
    participants: 0,
    maxParticipants: Number.isFinite(maxPreview) ? maxPreview : 0,
    workspace: workspaceName,
  };

  return (
    <div className="form-stack">
      {templates.length ? (
        <div className="form-stack compact">
          <label htmlFor="event-template">Start from a template</label>
          <select id="event-template" defaultValue="" onChange={(event) => applyTemplate(event.target.value)}>
            <option value="">Blank event</option>
            {templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}
          </select>
        </div>
      ) : null}

      {workspaceGames.length ? (
        <div className="form-stack compact">
          <label htmlFor="saved-game">Use a game saved to this server</label>
          <select id="saved-game" defaultValue="" onChange={(event) => applyWorkspaceGame(event.target.value)}>
            <option value="">Choose a saved game</option>
            {workspaceGames.map((game) => <option value={game.id} key={game.id}>{game.platform_name} — {game.game_name}</option>)}
          </select>
        </div>
      ) : null}

      <label htmlFor="event-name">Event name</label>
      <input id="event-name" value={fields.name} onChange={(event) => setField("name", event.target.value)} required maxLength={160} />

      <div className="two-column">
        <div className="form-stack compact">
          <label htmlFor="platform-name">Main game category / platform</label>
          <input id="platform-name" list="platform-options" value={fields.platformName} onChange={(event) => setField("platformName", event.target.value)} placeholder="Roblox" maxLength={80} />
          <datalist id="platform-options"><option value="Roblox" /><option value="Minecraft" /><option value="Fortnite" /><option value="Steam" /><option value="Discord" /><option value="Other" /></datalist>
        </div>
        <div className="form-stack compact"><label htmlFor="subgame-name">Game inside the platform</label><input id="subgame-name" value={fields.subgameName} onChange={(event) => setField("subgameName", event.target.value)} placeholder="Villagism" maxLength={191} /></div>
      </div>

      <label htmlFor="game-url">{isRoblox ? "Roblox experience link or Place ID" : "Game link"}</label>
      <div className="inline-form">
        <input id="game-url" value={fields.gameUrl} onChange={(event) => setField("gameUrl", event.target.value)} placeholder={isRoblox ? "https://www.roblox.com/games/..." : "https://..."} />
        {isRoblox ? <button className="button button-secondary" type="button" disabled={importing || !fields.gameUrl.trim()} onClick={importRobloxGame}>{importing ? "Importing…" : "Import Roblox game"}</button> : null}
      </div>

      {fields.gameThumbnailUrl ? <div className="game-preview"><img src={fields.gameThumbnailUrl} alt="" /><div><span className="card-kicker">{fields.platformName || "Game"}</span><strong>{fields.subgameName || "Imported game"}</strong><span className="muted">This artwork will appear on the event page.</span></div></div> : null}

      <label htmlFor="event-description">Description</label>
      <EventDescriptionEditor id="event-description" value={fields.description} onChange={(value) => setField("description", value)} context={descriptionContext} rows={8} />

      <div className="two-column">
        <div className="form-stack compact"><label htmlFor="starts-at">Event start</label><input id="starts-at" type="datetime-local" value={fields.startsAt} onChange={(event) => setField("startsAt", event.target.value)} /></div>
        <div className="form-stack compact"><label htmlFor="signup-deadline">Signup deadline</label><input id="signup-deadline" type="datetime-local" value={fields.signupDeadline} onChange={(event) => setField("signupDeadline", event.target.value)} /></div>
      </div>
      <div className="two-column">
        <div className="form-stack compact"><label htmlFor="checkin-opens">Check-in opens</label><input id="checkin-opens" type="datetime-local" value={fields.checkInOpensAt} onChange={(event) => setField("checkInOpensAt", event.target.value)} /></div>
        <div className="form-stack compact"><label htmlFor="checkin-deadline">Check-in deadline</label><input id="checkin-deadline" type="datetime-local" value={fields.checkInDeadline} onChange={(event) => setField("checkInDeadline", event.target.value)} /></div>
      </div>

      <div className="two-column">
        <div className="form-stack compact">
          <label htmlFor="max-participants">Maximum {fields.bracketEnabled && fields.bracketEntryMode === "TEAM" ? "teams" : "participants"}</label>
          <input id="max-participants" type="number" min={0} max={10000} value={fields.maxParticipants} onChange={(event) => setField("maxParticipants", event.target.value)} />
          <span className="field-help">Enter 0 or leave blank for unlimited.</span>
        </div>
        <div className="form-stack compact"><label htmlFor="event-timezone">Host timezone</label><input id="event-timezone" value={fields.timezone} onChange={(event) => setField("timezone", event.target.value)} required /><span className="field-help">Viewers automatically see times in their local timezone.</span></div>
      </div>

      <div className="two-column">
        <div className="form-stack compact"><label htmlFor="required-connection">Required game identity</label><input id="required-connection" list="platform-options" value={fields.requiredConnectionType} onChange={(event) => setField("requiredConnectionType", event.target.value)} placeholder="Roblox" /></div>
        <div className="form-stack compact"><label htmlFor="event-visibility">Visibility</label><select id="event-visibility" value={fields.visibility} onChange={(event) => setField("visibility", event.target.value)}><option value="SERVER">Discord server members</option><option value="CODE_ONLY">Code only</option><option value="UNLISTED">Unlisted link</option><option value="PUBLIC">All logged-in users</option><option value="STAFF_ONLY">Staff only</option></select></div>
      </div>

      <label className="checkbox-row"><input type="checkbox" checked={fields.joinCodeRequired} onChange={(event) => setField("joinCodeRequired", event.target.checked)} />Require an event join code to sign up</label>

      <section className="subpanel form-stack">
        <label className="checkbox-row"><input type="checkbox" checked={fields.bracketEnabled} onChange={(event) => setField("bracketEnabled", event.target.checked)} />Use built-in tournament competition tools</label>
        {fields.bracketEnabled ? (
          <>
            <div className="two-column">
              <div className="form-stack compact">
                <label htmlFor="bracket-format">Competition format</label>
                <select id="bracket-format" value={fields.bracketFormat} onChange={(event) => setField("bracketFormat", event.target.value as BracketFormat)}>
                  <option value="SINGLE_ELIMINATION">Single elimination</option>
                  <option value="DOUBLE_ELIMINATION">Double elimination</option>
                  <option value="ROUND_ROBIN">Round robin</option>
                  <option value="GROUPS_PLAYOFFS">Groups → playoffs</option>
                  <option value="THREE_PLAYER">Three-player custom advancement</option>
                </select>
              </div>
              <div className="form-stack compact">
                <label htmlFor="bracket-entry-mode">Entrants</label>
                <select id="bracket-entry-mode" value={fields.bracketEntryMode} onChange={(event) => setField("bracketEntryMode", event.target.value as EventFormFields["bracketEntryMode"])}>
                  <option value="PLAYER">Individual players</option>
                  <option value="TEAM">Registered teams</option>
                </select>
              </div>
            </div>

            <div className="two-column">
              <div className="form-stack compact"><label htmlFor="bracket-placement">Initial placement</label><select id="bracket-placement" value={fields.bracketSeedingMode} onChange={(event) => setField("bracketSeedingMode", event.target.value as EventFormFields["bracketSeedingMode"])}><option value="RANDOM">System places entrants randomly</option><option value="MANUAL">Host controls seeding/order</option></select></div>
              {usesStandings ? <div className="form-stack compact"><label htmlFor="bracket-tiebreak">Standings tiebreak</label><select id="bracket-tiebreak" value={fields.bracketTiebreakMode} onChange={(event) => setField("bracketTiebreakMode", event.target.value as EventFormFields["bracketTiebreakMode"])}><option value="HEAD_TO_HEAD_THEN_SEED">Head-to-head, then seed</option><option value="SEED">Original seed/order</option></select></div> : <div className="rule-callout"><strong>{fields.bracketFormat === "DOUBLE_ELIMINATION" ? "Two-loss elimination" : fields.bracketFormat === "THREE_PLAYER" ? "Custom A/B/C rule" : "Direct elimination"}</strong><p>Match Center handles live results, confirmation, disputes, forfeits, and automatic advancement.</p></div>}
            </div>

            {fields.bracketFormat === "GROUPS_PLAYOFFS" ? (
              <div className="two-column">
                <div className="form-stack compact"><label htmlFor="group-count">Number of groups</label><input id="group-count" type="number" min={2} max={16} value={fields.bracketGroupCount} onChange={(event) => setField("bracketGroupCount", Math.max(2, Math.min(16, Number(event.target.value) || 2)))} /></div>
                <div className="form-stack compact"><label htmlFor="group-advancers">Advance from each group</label><input id="group-advancers" type="number" min={1} max={8} value={fields.bracketAdvancersPerGroup} onChange={(event) => setField("bracketAdvancersPerGroup", Math.max(1, Math.min(8, Number(event.target.value) || 1)))} /></div>
              </div>
            ) : null}

            {fields.bracketEntryMode === "TEAM" ? <div className="rule-callout"><strong>Team tournament</strong><p>Team owners, managers, and captains can register a team. The event snapshots the active roster so Match Center can show who belongs to each side.</p></div> : null}
            <label className="checkbox-row"><input type="checkbox" checked={fields.bracketAutoGenerate} disabled={fields.bracketSeedingMode === "MANUAL"} onChange={(event) => setField("bracketAutoGenerate", event.target.checked)} />Automatically build the competition when signups close</label>
            {fields.bracketEntryMode === "PLAYER" ? <label className="checkbox-row"><input type="checkbox" checked={fields.bracketRequireCheckIn} onChange={(event) => setField("bracketRequireCheckIn", event.target.checked)} />Only include approved participants who checked in</label> : null}
          </>
        ) : null}
      </section>

      <button className="button" type="button" disabled={busy || fields.name.trim().length < 2} onClick={submit}>{busy ? "Creating…" : "Create event draft"}</button>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </div>
  );
}
