export type EventDescriptionContext = {
  eventName?: string | null;
  eventStart?: string | Date | null;
  signupDeadline?: string | Date | null;
  checkInOpensAt?: string | Date | null;
  checkInDeadline?: string | Date | null;
  timezone?: string | null;
  game?: string | null;
  platform?: string | null;
  format?: string | null;
  entrantMode?: string | null;
  seedingMode?: string | null;
  status?: string | null;
  visibility?: string | null;
  host?: string | null;
  cohosts?: string[] | null;
  participants?: number | null;
  maxParticipants?: number | null;
  workspace?: string | null;
};

export type EventDescriptionVariable = {
  token: string;
  label: string;
  group: "Event" | "Schedule" | "People" | "Competition";
  description: string;
};

export const EVENT_DESCRIPTION_VARIABLES: readonly EventDescriptionVariable[] = [
  { token: "{{event.name}}", label: "Event name", group: "Event", description: "Current event name" },
  { token: "{{workspace}}", label: "Server / workspace", group: "Event", description: "Server hosting the event" },
  { token: "{{event.game}}", label: "Game", group: "Event", description: "Selected game" },
  { token: "{{event.platform}}", label: "Platform", group: "Event", description: "Selected platform" },
  { token: "{{event.timezone}}", label: "Official timezone", group: "Event", description: "Host/event timezone" },
  { token: "{{event.status}}", label: "Event status", group: "Event", description: "Current event lifecycle status" },
  { token: "{{event.visibility}}", label: "Visibility", group: "Event", description: "Current event visibility" },

  { token: "{{event.start}}", label: "Event start", group: "Schedule", description: "Viewer-localized event start time" },
  { token: "{{event.deadline}}", label: "Signup deadline", group: "Schedule", description: "Viewer-localized signup deadline" },
  { token: "{{event.checkin_open}}", label: "Check-in opens", group: "Schedule", description: "Viewer-localized check-in opening time" },
  { token: "{{event.checkin_deadline}}", label: "Check-in deadline", group: "Schedule", description: "Viewer-localized check-in deadline" },

  { token: "{{host}}", label: "Primary host", group: "People", description: "Current primary host display name" },
  { token: "{{cohosts}}", label: "Co-hosts", group: "People", description: "Accepted co-host display names" },
  { token: "{{participants}}", label: "Current entrants", group: "People", description: "Current approved players or registered teams" },
  { token: "{{max_participants}}", label: "Maximum entrants", group: "People", description: "Configured entrant cap or Unlimited" },

  { token: "{{event.format}}", label: "Tournament format", group: "Competition", description: "Single elimination, double elimination, round robin, etc." },
  { token: "{{event.entrant_mode}}", label: "Entrant type", group: "Competition", description: "Individual players or registered teams" },
  { token: "{{event.seeding}}", label: "Placement / seeding", group: "Competition", description: "Random or manual placement" },
] as const;

export const EVENT_DESCRIPTION_DATE_KEYS = new Set([
  "event.start",
  "event.deadline",
  "event.signup_deadline",
  "event.checkin_open",
  "event.checkin_deadline",
  "event.checkin_close",
]);

function underscoreRunBounds(text: string, index: number): { start: number; end: number } {
  let start = index;
  let end = index;
  while (start > 0 && text[start - 1] === "_") start -= 1;
  while (end < text.length && text[end] === "_") end += 1;
  return { start, end };
}

function codePointBefore(text: string, index: number): string | undefined {
  if (index <= 0) return undefined;
  const last = text.charCodeAt(index - 1);
  if (last >= 0xdc00 && last <= 0xdfff && index >= 2) {
    const first = text.charCodeAt(index - 2);
    if (first >= 0xd800 && first <= 0xdbff) return text.slice(index - 2, index);
  }
  return text[index - 1];
}

function codePointAt(text: string, index: number): string | undefined {
  if (index >= text.length) return undefined;
  const first = text.charCodeAt(index);
  if (first >= 0xd800 && first <= 0xdbff && index + 1 < text.length) {
    const last = text.charCodeAt(index + 1);
    if (last >= 0xdc00 && last <= 0xdfff) return text.slice(index, index + 2);
  }
  return text[index];
}

function isWordLike(value: string | undefined): boolean {
  return Boolean(value && /[\p{L}\p{N}\p{M}_]/u.test(value));
}

export function canOpenUnderscoreEmphasis(text: string, index: number): boolean {
  const { start, end } = underscoreRunBounds(text, index);
  const before = codePointBefore(text, start);
  const after = codePointAt(text, end);
  if (!after || /\s/u.test(after)) return false;
  return !isWordLike(before);
}

export function canCloseUnderscoreEmphasis(text: string, index: number): boolean {
  const { start, end } = underscoreRunBounds(text, index);
  const before = codePointBefore(text, start);
  const after = codePointAt(text, end);
  if (!before || /\s/u.test(before)) return false;
  return !isWordLike(after);
}

function cleanLabel(value: string | null | undefined, fallback = "Not set"): string {
  if (!value?.trim()) return fallback;
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatEventDescriptionDate(value: string | Date | null | undefined, timeZone?: string | null): string {
  if (!value) return "Not scheduled";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timeZone || undefined,
      timeZoneName: "short",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  }
}

export function resolveEventDescriptionValue(key: string, context: EventDescriptionContext): string | null {
  switch (key.trim().toLowerCase()) {
    case "event.name": return context.eventName?.trim() || "Untitled event";
    case "workspace": return context.workspace?.trim() || "Server";
    case "event.game": return context.game?.trim() || "Not selected";
    case "event.platform": return context.platform?.trim() || "Not selected";
    case "event.timezone": return context.timezone?.trim() || "Local time";
    case "event.status": return cleanLabel(context.status, "Draft");
    case "event.visibility": return cleanLabel(context.visibility, "Not set");
    case "event.start": return formatEventDescriptionDate(context.eventStart, context.timezone);
    case "event.deadline":
    case "event.signup_deadline": return formatEventDescriptionDate(context.signupDeadline, context.timezone);
    case "event.checkin_open": return formatEventDescriptionDate(context.checkInOpensAt, context.timezone);
    case "event.checkin_deadline":
    case "event.checkin_close": return formatEventDescriptionDate(context.checkInDeadline, context.timezone);
    case "host": return context.host?.trim() || "Host";
    case "cohosts": return context.cohosts?.filter(Boolean).join(", ") || "None";
    case "participants": return String(Math.max(0, Number(context.participants ?? 0) || 0));
    case "max_participants": {
      const maximum = Number(context.maxParticipants ?? 0);
      return maximum > 0 ? String(maximum) : "Unlimited";
    }
    case "event.format": return cleanLabel(context.format, "No tournament format");
    case "event.entrant_mode": {
      if (context.entrantMode === "TEAM") return "Registered teams";
      if (context.entrantMode === "PLAYER") return "Individual players";
      return cleanLabel(context.entrantMode, "Individual players");
    }
    case "event.seeding": return cleanLabel(context.seedingMode, "Not selected");
    default: return null;
  }
}

export function interpolateEventDescription(source: string, context: EventDescriptionContext): string {
  return source.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (full, key: string) => resolveEventDescriptionValue(key, context) ?? full);
}
