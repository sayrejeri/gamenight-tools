import { Fragment, type ReactNode } from "react";
import { LocalDateTime } from "@/components/local-date-time";
import {
  EVENT_DESCRIPTION_DATE_KEYS,
  resolveEventDescriptionValue,
  type EventDescriptionContext,
} from "@/lib/event-description";

type InlineMatch = {
  index: number;
  full: string;
  inner: string;
  kind: "variable" | "code" | "boldItalic" | "bold" | "underline" | "strike" | "italic";
};

function earliestInlineMatch(text: string): InlineMatch | null {
  const patterns: Array<{ kind: InlineMatch["kind"]; regex: RegExp; innerGroup: number }> = [
    { kind: "variable", regex: /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/, innerGroup: 1 },
    { kind: "code", regex: /`([^`]+)`/, innerGroup: 1 },
    // Toolbar actions can naturally produce ***text*** when bold and italic are
    // applied to the same selection. Match that form before the individual rules.
    { kind: "boldItalic", regex: /\*\*\*([^*\n]+)\*\*\*/, innerGroup: 1 },
    { kind: "bold", regex: /\*\*([^*]+)\*\*/, innerGroup: 1 },
    { kind: "underline", regex: /__([^_]+)__/, innerGroup: 1 },
    { kind: "strike", regex: /~~([^~]+)~~/, innerGroup: 1 },
    { kind: "italic", regex: /\*([^*\n]+)\*/, innerGroup: 1 },
    { kind: "italic", regex: /_([^_\n]+)_/, innerGroup: 1 },
  ];

  let winner: InlineMatch | null = null;
  for (const pattern of patterns) {
    const match = pattern.regex.exec(text);
    if (!match || match.index == null) continue;
    const candidate: InlineMatch = {
      index: match.index,
      full: match[0],
      inner: match[pattern.innerGroup] ?? "",
      kind: pattern.kind,
    };
    if (!winner || candidate.index < winner.index) winner = candidate;
  }
  return winner;
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

function parseInline(text: string, context: EventDescriptionContext, prefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = text;
  let index = 0;

  while (remaining) {
    const match = earliestInlineMatch(remaining);
    if (!match) {
      nodes.push(<Fragment key={`${prefix}-text-${index}`}>{remaining}</Fragment>);
      break;
    }
    if (match.index > 0) nodes.push(<Fragment key={`${prefix}-lead-${index}`}>{remaining.slice(0, match.index)}</Fragment>);

    const key = `${prefix}-${match.kind}-${index}`;
    if (match.kind === "variable") nodes.push(variableNode(match.inner, context, key));
    else if (match.kind === "code") nodes.push(<code key={key}>{match.inner}</code>);
    else if (match.kind === "boldItalic") nodes.push(<strong key={key}><em>{parseInline(match.inner, context, `${key}-inner`)}</em></strong>);
    else if (match.kind === "bold") nodes.push(<strong key={key}>{parseInline(match.inner, context, `${key}-inner`)}</strong>);
    else if (match.kind === "underline") nodes.push(<u key={key}>{parseInline(match.inner, context, `${key}-inner`)}</u>);
    else if (match.kind === "strike") nodes.push(<s key={key}>{parseInline(match.inner, context, `${key}-inner`)}</s>);
    else nodes.push(<em key={key}>{parseInline(match.inner, context, `${key}-inner`)}</em>);

    remaining = remaining.slice(match.index + match.full.length);
    index += 1;
  }

  return nodes;
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
