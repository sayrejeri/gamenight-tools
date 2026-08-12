"use client";

import { useRef } from "react";
import { EventDescription } from "@/components/event-description";
import {
  EVENT_DESCRIPTION_VARIABLES,
  type EventDescriptionContext,
} from "@/lib/event-description";

export function EventDescriptionEditor({
  id,
  value,
  onChange,
  context,
  rows = 8,
  maxLength = 5000,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  context: EventDescriptionContext;
  rows?: number;
  maxLength?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function commitValue(next: string): boolean {
    if (next.length > maxLength) return false;
    onChange(next);
    return true;
  }

  function replaceSelection(prefix: string, suffix = "", placeholder = "text") {
    const textarea = textareaRef.current;
    if (!textarea) {
      commitValue(`${value}${prefix}${placeholder}${suffix}`);
      return;
    }
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? start;
    const selected = value.slice(start, end) || placeholder;
    const next = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;
    if (!commitValue(next)) return;
    const selectionStart = start + prefix.length;
    const selectionEnd = selectionStart + selected.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function insertAtCursor(text: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      commitValue(`${value}${text}`);
      return;
    }
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? start;
    const next = `${value.slice(0, start)}${text}${value.slice(end)}`;
    if (!commitValue(next)) return;
    const cursor = start + text.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function applyBlockPrefix(prefix: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      const separator = value.length > 0 && !value.endsWith("\n") ? "\n" : "";
      commitValue(`${value}${separator}${prefix}`);
      return;
    }

    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? start;
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const effectiveEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
    const nextLineBreak = value.indexOf("\n", effectiveEnd);
    const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
    const block = value.slice(lineStart, lineEnd);
    const lines = block.split("\n");
    const formatted = lines.map((line) => `${prefix}${line}`).join("\n");
    const next = `${value.slice(0, lineStart)}${formatted}${value.slice(lineEnd)}`;
    if (!commitValue(next)) return;

    const addedBeforeStart = prefix.length;
    const selectedLineBreaks = value.slice(lineStart, end).split("\n").length;
    const addedBeforeEnd = prefix.length * selectedLineBreaks;
    const nextStart = start + addedBeforeStart;
    const nextEnd = end > start ? end + addedBeforeEnd : nextStart;

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextStart, nextEnd);
    });
  }

  const groups = ["Event", "Schedule", "People", "Competition"] as const;

  return (
    <div className="event-description-editor">
      <div className="event-description-toolbar" aria-label="Description formatting tools">
        <button type="button" title="Bold: **text**" onClick={() => replaceSelection("**", "**")}>B</button>
        <button type="button" title="Italic: *text*" onClick={() => replaceSelection("*", "*")}><em>I</em></button>
        <button type="button" title="Underline: __text__" onClick={() => replaceSelection("__", "__")}><u>U</u></button>
        <button type="button" title="Strikethrough: ~~text~~" onClick={() => replaceSelection("~~", "~~")}><s>S</s></button>
        <button type="button" title="Inline code: `text`" onClick={() => replaceSelection("`", "`")}><code>&lt;/&gt;</code></button>
        <button type="button" title="Heading" onClick={() => applyBlockPrefix("## ")}>H</button>
        <button type="button" title="Bullet list" onClick={() => applyBlockPrefix("- ")}>• List</button>
        <button type="button" title="Quote" onClick={() => applyBlockPrefix("> ")}>❯ Quote</button>
        <label className="event-description-variable-picker">
          <select aria-label="Insert dynamic event value" value="" onChange={(event) => { if (event.target.value) insertAtCursor(event.target.value); }}>
            <option value="">Insert value…</option>
            {groups.map((group) => (
              <optgroup label={group} key={group}>
                {EVENT_DESCRIPTION_VARIABLES.filter((item) => item.group === group).map((item) => (
                  <option value={item.token} key={item.token}>{item.label} · {item.token}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>

      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={"Use **bold**, *italic*, headings, lists, and values like {{event.start}} or {{event.format}}."}
      />
      <div className="field-help">Free formatting supports **bold**, *italic*, __underline__, ~~strike~~, `code`, #/##/### headings, lists, quotes, and safe dynamic event values. Dates automatically display in each viewer&apos;s local timezone.</div>

      <div className="event-description-preview">
        <div className="event-description-preview-heading"><strong>Live preview</strong><span className="badge">Viewer-local values</span></div>
        <EventDescription text={value} context={context} emptyText="Your formatted event description will preview here." />
      </div>
    </div>
  );
}
