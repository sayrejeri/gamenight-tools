# Game Night Tools v0.9.4 — Bracket & Event Polish

v0.9.4 is intentionally a small quality-of-life release focused on making brackets easier to read and keeping old events from cluttering the dashboard.

## Bracket result labels

- Once a real match has a winner, the winning entrant is labeled **Winner** and the other entrant is labeled **Loser**.
- Automatic BYE advancement is not treated as a played win/loss.
- The same result labeling is used in editable brackets, read-only brackets, three-player matches, and PNG exports where practical.

## Cleaner uneven brackets

- Single-elimination brackets keep their existing safe BYE advancement logic internally.
- Automatic one-sided BYE match cards are hidden from the visual bracket.
- Entrants who receive a BYE simply appear in the next real round.
- TBD future matches remain visible when they represent real upcoming matchups.

## Event cleanup

The Events dashboard adds four views:

- **Active** — current/upcoming events.
- **Past** — recently completed/cancelled events.
- **Archived** — older completed/cancelled events.
- **All** — every accessible event.

Old events are archived as a dashboard view only. Nothing is deleted and tournament history, brackets, results, statistics, audit history, and existing access rules remain intact.

The archive age can be adjusted from the Events page. This release intentionally uses derived archive views rather than a database migration.

## PNG export

- Existing bracket PNG export remains available from competition management.
- Read-only event brackets also expose a Download PNG action.
- Exported single-elimination brackets hide automatic BYE cards to match the on-site bracket.

## Database

- No database migration.
- Do not rerun migrations 001–009.
- Production remains at 48 base tables.
