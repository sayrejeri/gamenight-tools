"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  bracketFormat: "SINGLE_ELIMINATION" | "THREE_PLAYER";
  bracketSeedingMode: "RANDOM" | "MANUAL";
  bracketAutoGenerate: boolean;
  bracketRequireCheckIn: boolean;
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
    bracketSeedingMode: "RANDOM",
    bracketAutoGenerate: false,
    bracketRequireCheckIn: false,
  };
}

export function CreateEventForm({
  workspaceId,
  defaultTimezone,
  templates,
  workspaceGames,
}: {
  workspaceId: string;
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
        game?: {
          placeId: string;
          universeId: string | null;
          name: string;
          gameUrl: string;
          thumbnailUrl: string | null;
        };
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
          <datalist id="platform-options">
            <option value="Roblox" />
            <option value="Minecraft" />
            <option value="Fortnite" />
            <option value="Steam" />
            <option value="Discord" />
            <option value="Other" />
          </datalist>
        </div>
        <div className="form-stack compact">
          <label htmlFor="subgame-name">Game inside the platform</label>
          <input id="subgame-name" value={fields.subgameName} onChange={(event) => setField("subgameName", event.target.value)} placeholder="Villagism" maxLength={191} />
        </div>
      </div>

      <label htmlFor="game-url">{isRoblox ? "Roblox experience link or Place ID" : "Game link"}</label>
      <div className="inline-form">
        <input id="game-url" value={fields.gameUrl} onChange={(event) => setField("gameUrl", event.target.value)} placeholder={isRoblox ? "https://www.roblox.com/games/..." : "https://..."} />
        {isRoblox ? (
          <button className="button button-secondary" type="button" disabled={importing || !fields.gameUrl.trim()} onClick={importRobloxGame}>
            {importing ? "Importing…" : "Import Roblox game"}
          </button>
        ) : null}
      </div>

      {fields.gameThumbnailUrl ? (
        <div className="game-preview">
          <img src={fields.gameThumbnailUrl} alt="" />
          <div><span className="card-kicker">{fields.platformName || "Game"}</span><strong>{fields.subgameName || "Imported game"}</strong><span className="muted">This artwork will appear on the event page.</span></div>
        </div>
      ) : null}

      <label htmlFor="event-description">Description</label>
      <textarea id="event-description" value={fields.description} onChange={(event) => setField("description", event.target.value)} rows={4} maxLength={5000} />

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
          <label htmlFor="max-participants">Maximum participants</label>
          <input id="max-participants" type="number" min={0} max={10000} value={fields.maxParticipants} onChange={(event) => setField("maxParticipants", event.target.value)} />
          <span className="field-help">Enter 0 or leave blank for unlimited.</span>
        </div>
        <div className="form-stack compact">
          <label htmlFor="event-timezone">Host timezone</label>
          <input id="event-timezone" value={fields.timezone} onChange={(event) => setField("timezone", event.target.value)} required />
          <span className="field-help">Viewers automatically see times in their local timezone.</span>
        </div>
      </div>

      <div className="two-column">
        <div className="form-stack compact">
          <label htmlFor="required-connection">Required game identity</label>
          <input id="required-connection" list="platform-options" value={fields.requiredConnectionType} onChange={(event) => setField("requiredConnectionType", event.target.value)} placeholder="Roblox" />
        </div>
        <div className="form-stack compact">
          <label htmlFor="event-visibility">Visibility</label>
          <select id="event-visibility" value={fields.visibility} onChange={(event) => setField("visibility", event.target.value)}>
            <option value="SERVER">Discord server members</option>
            <option value="CODE_ONLY">Code only</option>
            <option value="UNLISTED">Unlisted link</option>
            <option value="PUBLIC">All logged-in users</option>
            <option value="STAFF_ONLY">Staff only</option>
          </select>
        </div>
      </div>

      <label className="checkbox-row"><input type="checkbox" checked={fields.joinCodeRequired} onChange={(event) => setField("joinCodeRequired", event.target.checked)} />Require an event join code to sign up</label>

      <section className="subpanel form-stack">
        <label className="checkbox-row"><input type="checkbox" checked={fields.bracketEnabled} onChange={(event) => setField("bracketEnabled", event.target.checked)} />Use the built-in bracket tool</label>
        {fields.bracketEnabled ? (
          <>
            <div className="two-column">
              <div className="form-stack compact">
                <label htmlFor="bracket-format">Bracket format</label>
                <select id="bracket-format" value={fields.bracketFormat} onChange={(event) => setField("bracketFormat", event.target.value as EventFormFields["bracketFormat"])}>
                  <option value="SINGLE_ELIMINATION">Single elimination</option>
                  <option value="THREE_PLAYER">Three-player advancement</option>
                </select>
              </div>
              <div className="form-stack compact">
                <label htmlFor="bracket-placement">Initial placement</label>
                <select id="bracket-placement" value={fields.bracketSeedingMode} onChange={(event) => setField("bracketSeedingMode", event.target.value as EventFormFields["bracketSeedingMode"])}>
                  <option value="RANDOM">System places participants randomly</option>
                  <option value="MANUAL">Host places participants manually</option>
                </select>
              </div>
            </div>
            <label className="checkbox-row"><input type="checkbox" checked={fields.bracketAutoGenerate} disabled={fields.bracketSeedingMode === "MANUAL"} onChange={(event) => setField("bracketAutoGenerate", event.target.checked)} />Automatically build the bracket when signups close</label>
            <label className="checkbox-row"><input type="checkbox" checked={fields.bracketRequireCheckIn} onChange={(event) => setField("bracketRequireCheckIn", event.target.checked)} />Only include approved participants who checked in</label>
          </>
        ) : null}
      </section>

      <button className="button" type="button" disabled={busy || fields.name.trim().length < 2} onClick={submit}>{busy ? "Creating…" : "Create event draft"}</button>
      {message ? <p className="form-message" aria-live="polite">{message}</p> : null}
    </div>
  );
}
