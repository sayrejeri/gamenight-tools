# Game Night Tools v0.7.0 — Expanded Competition Formats

v0.7.0 expands Competitive Events beyond single elimination while keeping Match Center as the trusted live-result workflow.

## New competition formats

- Double elimination with winners bracket, losers bracket, grand final, and conditional reset match.
- Round robin with live standings.
- Groups → playoffs with configurable group count and qualifiers per group.
- Head-to-head-then-seed or original-seed standings tiebreaks.
- Existing single elimination and custom three-player no-rematch formats remain supported.

## Team tournaments

- Events can use individual players or registered Game Night Tools teams as entrants.
- Approved teams can be registered by the team owner, manager, captain, or event staff.
- The event snapshots the active team roster at registration time.
- Roster members can operate their team’s Match Center actions.
- A team cannot confirm or dispute its own submitted result through another roster member.
- Team tournaments skip individual player check-in.

## Match Center and persistence

- Match stage metadata distinguishes winners, losers, group, playoff, final, and main-bracket stages.
- Normalized match records continue using stable IDs where possible by following the saved source match identity.
- Confirmed Match Center results feed every supported format through the same saved competition state.
- Reopening an earlier result clears invalid downstream winner selections.
- Existing optimistic-concurrency protection remains in place for competition setup saves.

## Spectators and export

- Hosts can create or revoke a random anonymous spectator link.
- Anonymous links only serve LIVE or COMPLETED competitions.
- Staff controls, result proof, dispute evidence, private participant data, and draft competitions are not exposed.
- PNG export and the authenticated competition viewer support all v0.7 formats.

## Database

v0.7.0 requires `database/008_expanded_competition_formats.sql` exactly once after migration 007.

Do not rerun migrations 001–007.
