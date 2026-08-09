# v0.6.0 — Tournament Operations

v0.6 turns competitive events into an active tournament workflow instead of a host-only bracket editor.

## Match Center

Players can mark ready, start their match once both sides are ready, report a winner/score, attach an optional screenshot or video proof URL, and confirm an opponent's result. Tournament staff can schedule matches, choose best-of series length, pause operations, resolve disputes, record forfeits/no-shows, override incorrect results with a required reason, and reopen results for correction.

## Bracket integration

Confirmed and staff-decided results update the saved visual bracket and normalized match tables together. The normalization layer now preserves entry and match IDs across bracket saves so schedules, reports, disputes, ready checks, and match history are not destroyed by ordinary bracket edits.

The same operations layer supports both single elimination and the custom three-player no-rematch format.

## Competitive history

Match Center includes event standings plus the signed-in player's career W/L record, current streak, championship count, and event head-to-head records. Automatic byes are excluded from competitive W/L standings.

## Communication and safety

Match actions are audited, important updates create website notifications, and workspaces can opt Discord webhooks into tournament match updates. Result disputes and staff overrides retain reasons/evidence links.

## Database

Migration `database/007_tournament_operations.sql` is required exactly once after migration 006.
