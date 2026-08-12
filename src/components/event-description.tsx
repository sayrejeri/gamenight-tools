import { Fragment, type ReactNode } from "react";
import { LocalDateTime } from "@/components/local-date-time";
import {
  EVENT_DESCRIPTION_DATE_KEYS,
  canCloseUnderscoreEmphasis,
  canOpenUnderscoreEmphasis,
  resolveEventDescriptionValue,
  type EventDescriptionContext,
} from "@/lib/event-description";

type InlineParseResult = {
  nodes: ReactNode[];
  index: number;
  closed: boolean;
};

type InlineParseState = {
  remainingOperations: number;
  failedRanges: Set<string>;
};

function delimiterRunLength(text: string, index: number, delimiter: "*" | "_"): number {
  let length = 0;
  while (text[index + length] === delimiter) length += 1;
  return length;
}

function closesAt(text: string, index: number, marker: string): boolean {
  if (marker === "*") {
    const run = delimiterRunLength(text, index, marker);
    // A two-character run opens/closes bold rather than closing single-character
    // emphasis. Odd/longer runs can close the inner single marker first and leave
    // the remaining pair for its outer formatter.
    return run === 1 || run >= 3;
  }
  if (marker === "_") {
    const run = delimiterRunLength(text, index, marker);
    return (run === 1 || run >= 3) && canCloseUnderscoreEmphasis(text, index);
  }
  if (marker === "__") return text.startsWith(marker, index) && canCloseUnderscoreEmphasis(text, index);
  return text.startsWith(marker, index);
}

function variableNode(key: string, context: EventDescriptionContext, nodeKey: string): ReactNode {
  const normalized = key.trim().toLowerCase();
  if (EVENT_DESCRIPTION_DATE_KEYS.has(normalized)) {
    const value = normalized === "event.start"
      ? context.eventStart
      : normalized === "event.deadline" || normalized === "event.signup_deadline"
        ? context.signupDeadline
        : normalized === "event.checkin_open"
          ? context.checkInOpensAt
          : context.checkInDeadline;
    return <LocalDateTime key={nodeKey} value={value ?? null} fallbackTimeZone={context.timezone} />;
  }

  const resolved = resolveEventDescriptionValue(normalized, context);
  if (resolved == null) {
    return <span className="event-description-variable-unknown" title="Unknown event description variable" key={nodeKey}>{`{{${key}}}`}</span>;
  }
  return <Fragment key={nodeKey}>{resolved}</Fragment>;
}

function parseInlineRange(
  text: string,
  context: EventDescriptionContext,
  prefix: string,
  state: InlineParseState,
  start = 0,
  closeMarker?: string,
): InlineParseResult {
  const failureKey = closeMarker ? `${start}:${closeMarker}` : null;
  if (failureKey && state.failedRanges.has(failureKey)) {
    return { nodes: [], index: start, closed: false };
  }

  const nodes: ReactNode[] = [];
  let index = start;
  let plainStart = start;
  let part = 0;

  const flushPlain = (end: number) => {
    if (end <= plainStart) return;
    nodes.push(<Fragment key={`${prefix}-text-${part}`}>{text.slice(plainStart, end)}</Fragment>);
    part += 1;
  };

  const pushRawMarker = (marker: string) => {
    nodes.push(<Fragment key={`${prefix}-raw-${part}`}>{marker}</Fragment>);
    part += 1;
  };

  while (index < text.length) {
    // Malformed nested delimiters previously caused recursive rescans of the same
    // suffix and exponential work. Every line now shares a strict work budget and
    // remembers failed ranges, so hostile or accidental input degrades to literal
    // text instead of blocking the editor or a server render.
    if (state.remainingOperations <= 0) {
      if (failureKey) state.failedRanges.add(failureKey);
      if (!closeMarker) flushPlain(text.length);
      return { nodes, index: closeMarker ? start : text.length, closed: false };
    }
    state.remainingOperations -= 1;

    if (closeMarker && closesAt(text, index, closeMarker)) {
      flushPlain(index);
      return { nodes, index: index + closeMarker.length, closed: true };
    }

    if (text.startsWith("{{", index)) {
      const variable = /^\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/.exec(text.slice(index));
      if (variable) {
        flushPlain(index);
        nodes.push(variableNode(variable[1], context, `${prefix}-variable-${part}`));
        part += 1;
        index += variable[0].length;
        plainStart = index;
        continue;
      }
    }

    if (text[index] === "`") {
      const end = text.indexOf("`", index + 1);
      if (end > index + 1) {
        flushPlain(index);
        nodes.push(<code key={`${prefix}-code-${part}`}>{text.slice(index + 1, end)}</code>);
        part += 1;
        index = end + 1;
        plainStart = index;
        continue;
      }
    }

    if (text.startsWith("***", index)) {
      flushPlain(index);
      const innerItalic = parseInlineRange(text, context, `${prefix}-bold-italic-${part}`, state, index + 3, "*");
      if (innerItalic.closed && text.startsWith("**", innerItalic.index)) {
        nodes.push(<strong key={`${prefix}-bold-italic-${part}`}><em>{innerItalic.nodes}</em></strong>);
        part += 1;
        index = innerItalic.index + 2;
      } else {
        pushRawMarker("***");
        index += 3;
      }
      plainStart = index;
      continue;
    }

    if (text.startsWith("**", index)) {
      flushPlain(index);
      const inner = parseInlineRange(text, context, `${prefix}-bold-${part}`, state, index + 2, "**");
      if (inner.closed) {
        nodes.push(<strong key={`${prefix}-bold-${part}`}>{inner.nodes}</strong>);
        part += 1;
        index = inner.index;
      } else {
        pushRawMarker("**");
        index += 2;
      }
      plainStart = index;
      continue;
    }

    if (text[index] === "*") {
      flushPlain(index);
      const inner = parseInlineRange(text, context, `${prefix}-italic-${part}`, state, index + 1, "*");
      if (inner.closed) {
        nodes.push(<em key={`${prefix}-italic-${part}`}>{inner.nodes}</em>);
        part += 1;
        index = inner.index;
      } else {
        pushRawMarker("*");
        index += 1;
      }
      plainStart = index;
      continue;
    }

    if (text.startsWith("__", index) && canOpenUnderscoreEmphasis(text, index)) {
      flushPlain(index);
      const inner = parseInlineRange(text, context, `${prefix}-underline-${part}`, state, index + 2, "__");
      if (inner.closed) {
        nodes.push(<u key={`${prefix}-underline-${part}`}>{inner.nodes}</u>);
        part += 1;
        index = inner.index;
      } else {
        pushRawMarker("__");
        index += 2;
      }
      plainStart = index;
      continue;
    }

    if (text[index] === "_" && canOpenUnderscoreEmphasis(text, index)) {
      flushPlain(index);
      const inner = parseInlineRange(text, context, `${prefix}-italic-underscore-${part}`, state, index + 1, "_");
      if (inner.closed) {
        nodes.push(<em key={`${prefix}-italic-underscore-${part}`}>{inner.nodes}</em>);
        part += 1;
        index = inner.index;
      } else {
        pushRawMarker("_");
        index += 1;
      }
      plainStart = index;
      continue;
    }

    if (text.startsWith("~~", index)) {
      flushPlain(index);
      const inner = parseInlineRange(text, context, `${prefix}-strike-${part}`, state, index + 2, "~~");
      if (inner.closed) {
        nodes.push(<s key={`${prefix}-strike-${part}`}>{inner.nodes}</s>);
        part += 1;
        index = inner.index;
      } else {
        pushRawMarker("~~");
        index += 2;
      }
      plainStart = index;
      continue;
    }

    index += 1;
  }

  if (failureKey) state.failedRanges.add(failureKey);
  flushPlain(text.length);
  return { nodes, index: text.length, closed: false };
}

function parseInline(text: string, context: EventDescriptionContext, prefix: string): ReactNode[] {
  const state: InlineParseState = {
    remainingOperations: Math.max(1024, text.length * 24),
    failedRanges: new Set<string>(),
  };
  return parseInlineRange(text, context, prefix, state).nodes;
}

function inlineWithBreaks(text: string, context: EventDescriptionContext, prefix: string): ReactNode[] {
  return text.split("\n").flatMap((line, index) => [
    ...(index ? [<br key={`${prefix}-br-${index}`} />] : []),
    ...parseInline(line, context, `${prefix}-line-${index}`),
  ]);
}

export function EventDescription({
  text,
  context,
  className = "",
  emptyText = "No event description has been added yet.",
}: {
  text: string | null | undefined;
  context: EventDescriptionContext;
  className?: string;
  emptyText?: string;
}) {
  const source = text?.trim() ? text : emptyText;
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const content = parseInline(heading[2], context, `heading-${index}`);
      if (level === 1) blocks.push(<h2 key={`heading-${index}`}>{content}</h2>);
      else if (level === 2) blocks.push(<h3 key={`heading-${index}`}>{content}</h3>);
      else blocks.push(<h4 key={`heading-${index}`}>{content}</h4>);
      index += 1;
      continue;
    }

    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*•]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*•]\s+/, ""));
        index += 1;
      }
      blocks.push(<ul key={`list-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{parseInline(item, context, `list-${index}-${itemIndex}`)}</li>)}</ul>);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`}>{inlineWithBreaks(quoteLines.join("\n"), context, `quote-${index}`)}</blockquote>);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+/.test(lines[index]) && !/^\s*[-*•]\s+/.test(lines[index]) && !/^\s*>\s?/.test(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{inlineWithBreaks(paragraph.join("\n"), context, `paragraph-${index}`)}</p>);
  }

  return <div className={`event-rich-description ${className}`.trim()}>{blocks}</div>;
}
