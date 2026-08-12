# v0.9.3 Rich Event Descriptions — Test Plan

## Automated checks

Run the PR workflow **v0.9.3 description smoke** on the exact final branch head. It compiles `src/lib/event-description.ts` and runs `tests/v093-description-smoke.cjs`.

The smoke test covers:

- known variables
- schedule aliases
- unknown-token preservation
- tournament format / entrant / seeding labels
- host and co-host values
- current/max entrant values, including Unlimited
- unscheduled date fallback
- plain-text Markdown stripping for calendar-style output

Before merge, also run **Local release verification** on `feature/v0.9.3-rich-event-descriptions` and require TypeScript + production build success on the same exact head.

## Manual create-event checks

1. Open a server where the test account can host events.
2. Create a draft and verify the description editor shows formatting controls, Insert Value picker, and live preview.
3. Enter paragraphs separated by blank lines and verify preview spacing is preserved.
4. Test `**bold**`, `*italic*`, `_italic_`, `__underline__`, `~~strike~~`, inline code, headings, bullets, and quotes.
5. Insert `{{event.start}}`, `{{event.deadline}}`, `{{event.checkin_open}}`, `{{event.checkin_deadline}}`, `{{event.format}}`, `{{event.entrant_mode}}`, `{{event.seeding}}`, `{{workspace}}`, `{{host}}`, and `{{max_participants}}` from the picker.
6. Change schedule, timezone, format, entrant mode, placement, visibility, and max entrants and confirm the preview updates without manually changing the description.
7. Create the event and confirm the raw source was saved while the event page renders the formatted/resolved result.

## Manual edit checks

1. Open an existing editable event.
2. Confirm its raw description source is loaded into the rich editor.
3. Change only description formatting and save; competition state must not reset.
4. Change an allowed pre-live competition setting and verify existing competition-reset behavior remains unchanged.
5. Confirm a formerly-live/completed competition is still protected by the v0.9.1 integrity guards.

## Dynamic-value checks

Verify:

- `{{participants}}` counts approved individual entrants or registered team entries as appropriate.
- `{{max_participants}}` displays `Unlimited` when the configured cap is zero/unset.
- `{{cohosts}}` lists accepted co-host display names only and displays `None` when empty.
- Unknown tokens such as `{{future.value}}` remain visible and do not disappear.
- Currency text such as `$10,000` is unaffected because variables use `{{...}}` syntax.

## Timezone checks

1. Put `{{event.start}}` and deadline/check-in variables in a description.
2. View the event in two browser/system timezones and confirm web-rendered schedule values localize to the viewer.
3. Confirm the normal Event details time fields still localize correctly.
4. Download the ICS and confirm description schedule values resolve to readable plain text in the event's official timezone.

## Spectator checks

Using a valid spectator link:

- pre-live: still shows `Tournament not live yet` and does not expose competition/description details beyond the existing safe state
- POSTPONED: still shows the postponed state
- CANCELLED: still shows the cancelled state
- LIVE + LIVE bracket: rich description renders safely and variables resolve
- COMPLETED + COMPLETED bracket: rich description/results remain visible
- invalid/revoked/expired token: still 404

Verify no result proof, private notes, disputes, access codes, or private account identifiers appear through description variables.

## Security rendering checks

Put HTML/script-looking text in a description, for example `<img src=x onerror=alert(1)>` and `<script>alert(1)</script>`. It must render as inert text and never execute.

Test formatting with malformed/unclosed markers and confirm the page remains usable and the text remains visible.

## Calendar checks

Download an ICS from an authorized account and confirm:

- known variables resolve
- supported Markdown markers are stripped
- paragraph/list line breaks remain readable
- game URL and event URL remain included
- an unauthorized account still cannot download restricted event details

## Release gate

Do not merge until:

1. v0.9.3 description smoke succeeds on exact final head.
2. Local release verification succeeds on exact final head.
3. Manual review finds no unresolved release-blocking P1/P2-equivalent issue. If Codex review is available again, require a clean exact-head Codex review as well.
4. After merge, Local release verification succeeds again on `main`.

No SQL import is required for this release.
