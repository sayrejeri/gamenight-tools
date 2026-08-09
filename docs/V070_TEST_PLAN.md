# v0.7.0 release test plan

## Migration and compatibility

- Start from a database with migrations 001–007 already applied.
- Import `database/008_expanded_competition_formats.sql` exactly once.
- Confirm existing v0.5/v0.6 single-elimination and three-player saved competitions still open.
- Confirm migration 008 expands the enums without changing existing bracket/event values.
- Do not rerun migrations 001–007.

## Single elimination / three-player regression

- Generate, save, publish, report, confirm, dispute, override, forfeit, reopen, and complete a normal single-elimination event.
- Confirm automatic byes still advance without counting as player wins.
- Complete the custom three-player A/B/C no-rematch flow through Match Center.
- Confirm stale setup tabs still receive a 409 instead of overwriting a newer result.

## Double elimination

- Test 4-, 8-, and at least one non-power-of-two entrant count.
- Confirm first-loss entrants route into the correct losers-bracket path.
- Confirm a second loss eliminates an entrant.
- Confirm the winners-bracket champion reaches the grand final undefeated.
- Confirm no reset match is required if the winners-bracket champion wins the first grand final.
- Confirm the reset match becomes active if the losers-bracket champion wins the first grand final.
- Confirm the reset winner becomes champion.
- Reopen an upstream result and confirm invalid downstream winners are cleared safely.

## Round robin

- Test even and odd entrant counts.
- Confirm every pair of entrants plays exactly once.
- Confirm bye/rest rounds do not create fake matches.
- Confirm standings update only from completed/forfeit results.
- Confirm equal-win ties use head-to-head then seed when configured.
- Confirm seed-only mode respects original entrant order.
- Confirm competition completion requires a resolved top standing.

## Groups → playoffs

- Generate multiple group counts and entrant totals.
- Confirm serpentine placement distributes original seeds across groups.
- Confirm each group runs round robin independently.
- Confirm playoff slots remain TBD until the relevant group is complete.
- Confirm the configured number of entrants advance from each group.
- Confirm playoff results advance through Match Center to one champion.
- Reopen a group result that changes a qualifier and confirm invalid playoff results are cleared.

## Team tournaments

- Create a team tournament and register approved teams as owner, manager, captain, and event staff.
- Confirm ordinary team members cannot register/withdraw a team unless their role allows it.
- Confirm the active roster is snapshotted at registration.
- Confirm later edits to the live team profile do not silently change event match authority.
- Confirm a snapshotted roster member can ready/start/report for that team when otherwise permitted.
- Confirm another member of the same team cannot confirm or dispute their team’s own submitted result.
- Confirm opposing roster members can confirm/dispute normally.
- Confirm a user snapshotted on both sides is blocked from player match actions until staff fixes the field.
- Confirm team tournaments do not accept individual SIGN_UP or CHECK_IN API actions.
- Confirm max-team limits are enforced transactionally.

## Anonymous spectator links

- Generate a spectator link as primary host, MANAGE_EVENTS, MANAGE_BRACKETS, FULL co-host, and BRACKET co-host where applicable.
- Confirm unauthorized users cannot create/revoke links.
- Confirm a generated token works without a logged-in session only when the competition is LIVE or COMPLETED.
- Confirm DRAFT/GENERATED competitions do not appear anonymously.
- Confirm disabled/regenerated tokens stop working.
- Confirm result proof URLs, report notes, dispute reasons/evidence, staff controls, account details, and private participant data are absent from anonymous output.
- Confirm all supported competition formats render on the public spectator page.

## Release verification

Run Local release verification on the exact final branch head:

`feature/v0.7.0-expanded-competition-formats`

It must pass TypeScript, production build, `.next/BUILD_ID`, package verification, and the migration-008 archive check before merge.
