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

type PlainInlineParseResult = { text: string; index: number; closed: boolean };

function plainDelimiterRunLength(text: string, index: number, delimiter: "*" | "_"): number {
  let length = 0;
  while (text[index + length] === delimiter) length += 1;
  return length;
}

function plainClosesAt(text: string, index: number, marker: string): boolean {
  if (marker === "*" || marker === "_") {
    const run = plainDelimiterRunLength(text, index, marker);
    return run === 1 || run >= 3;
  }
  return text.startsWith(marker, index);
}

function stripInlineMarkdownRange(text: string, start = 0, closeMarker?: string): PlainInlineParseResult {
  let output = "";
  let index = start;

  while (index < text.length) {
    if (closeMarker && plainClosesAt(text, index, closeMarker)) {
      return { text: output, index: index + closeMarker.length, closed: true };
    }

    if (text.startsWith("***", index)) {
      const innerItalic = stripInlineMarkdownRange(text, index + 3, "*");
      if (innerItalic.closed && text.startsWith("**", innerItalic.index)) {
        output += innerItalic.text;
        index = innerItalic.index + 2;
      } else {
        output += "***";
        index += 3;
      }
      continue;
    }

    if (text.startsWith("**", index)) {
      const inner = stripInlineMarkdownRange(text, index + 2, "**");
      if (inner.closed) {
        output += inner.text;
        index = inner.index;
      } else {
        output += "**";
        index += 2;
      }
      continue;
    }

    if (text[index] === "*") {
      const inner = stripInlineMarkdownRange(text, index + 1, "*");
      if (inner.closed) {
        output += inner.text;
        index = inner.index;
      } else {
        output += "*";
        index += 1;
      }
      continue;
    }

    if (text.startsWith("__", index)) {
      const inner = stripInlineMarkdownRange(text, index + 2, "__");
      if (inner.closed) {
        output += inner.text;
        index = inner.index;
      } else {
        output += "__";
        index += 2;
      }
      continue;
    }

    if (text[index] === "_") {
      const inner = stripInlineMarkdownRange(text, index + 1, "_");
      if (inner.closed) {
        output += inner.text;
        index = inner.index;
      } else {
        output += "_";
        index += 1;
      }
      continue;
    }

    if (text.startsWith("~~", index)) {
      const inner = stripInlineMarkdownRange(text, index + 2, "~~");
      if (inner.closed) {
        output += inner.text;
        index = inner.index;
      } else {
        output += "~~";
        index += 2;
      }
      continue;
    }

    output += text[index];
    index += 1;
  }

  return { text: output, index: text.length, closed: false };
}

function stripInlineMarkdown(text: string): string {
  return stripInlineMarkdownRange(text).text;
}

export function renderEventDescriptionPlainText(source: string, context: EventDescriptionContext): string {
  const protectedLiterals: string[] = [];
  const protectLiteral = (value: string): string => {
    const marker = `\uE000${protectedLiterals.length}\uE001`;
    protectedLiterals.push(value);
    return marker;
  };

  // Match the web renderer: inline-code contents are literal. Protect them before
  // resolving variables or stripping any other supported Markdown delimiters.
  const codeProtected = source.replace(/`([^`\n]+)`/g, (_full, inner: string) => protectLiteral(inner));
  const valueProtected = codeProtected.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (full, key: string) => {
    const resolved = resolveEventDescriptionValue(key, context);
    // Unknown variables are intentionally preserved on the web. Protect their full
    // source token too so underscores/asterisks inside the key are never mistaken
    // for Markdown while producing calendar/plain-text output.
    return protectLiteral(resolved == null ? full : resolved);
  });

  const blockStripped = valueProtected
    .split(/\r?\n/)
    .map((line) => line
      .replace(/^\s{0,3}#{1,3}\s+/, "")
      .replace(/^\s*>\s?/, "")
      .replace(/^\s*[-*•]\s+/, "• "))
    .join("\n");
  const stripped = stripInlineMarkdown(blockStripped);

  return stripped.replace(/\uE000(\d+)\uE001/g, (full, index: string) => protectedLiterals[Number(index)] ?? full);
}
