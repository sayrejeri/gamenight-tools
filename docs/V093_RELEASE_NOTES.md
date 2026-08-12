# Game Night Tools v0.9.3 — Rich Event Descriptions

v0.9.3 turns event descriptions from plain text into a safe, reusable rich-description system. The entire foundation in this release is free; premium themes, advanced cosmetic blocks, Host Premium, Server Premium, profile cosmetics, and premium bot ideas remain future work.

## Free formatting

Event descriptions support a deliberately limited Discord-style syntax without raw HTML:

- `**bold**`
- `*italic*` or `_italic_`
- `__underline__`
- `~~strikethrough~~`
- `` `inline code` ``
- `#`, `##`, and `###` headings
- `-` / `*` / `•` bullet lists
- `>` quotes
- normal paragraphs, blank lines, and manual line breaks

Descriptions are rendered as React elements. Raw HTML is never executed and `dangerouslySetInnerHTML` is not used.

## Dynamic event values

Hosts can insert safe `{{...}}` values that resolve from the current event instead of copying information into the description manually.

Supported values include:

- `{{event.name}}`
- `{{workspace}}`
- `{{event.game}}`
- `{{event.platform}}`
- `{{event.timezone}}`
- `{{event.status}}`
- `{{event.visibility}}`
- `{{event.start}}`
- `{{event.deadline}}` / `{{event.signup_deadline}}`
- `{{event.checkin_open}}`
- `{{event.checkin_deadline}}` / `{{event.checkin_close}}`
- `{{host}}`
- `{{cohosts}}`
- `{{participants}}`
- `{{max_participants}}`
- `{{event.format}}`
- `{{event.entrant_mode}}`
- `{{event.seeding}}`

Unknown values remain visibly unresolved rather than silently disappearing.

## Localized schedule values

Schedule variables on rendered web pages use the viewer's browser timezone automatically, with the event timezone as fallback.

## Description editor

Create/edit event forms include:

- formatting toolbar
- grouped Insert Value picker
- live formatted preview
- live preview of schedule/tournament values as event settings are edited

The stored description remains the raw source text in the existing event description field. Saved templates and cloned events therefore keep the tokens and automatically adapt to the new event's values.

## Event and spectator rendering

The normal event hero uses the rich renderer with current event/host/co-host/entrant/competition values. Public spectator pages use the same safe renderer only when the existing spectator lifecycle gates allow competition data to be shown.

No private notes, access codes, result proof, dispute evidence, or private account identifiers are available as description variables.

## Calendar exports

Calendar downloads are intentionally minimal. The ICS event includes the event title and start time only; descriptions, game links, event links, location/workspace text, and rich-description variables are not exported. Existing event-view authorization remains unchanged.

## Database

No database migration is included in v0.9.3.

- Do not rerun migrations `001`–`009`.
- Expected production database count remains **48 base tables**.
