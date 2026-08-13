# v0.9.4 Bracket & Event Polish — Test Plan

## Automated / build checks

- Run TypeScript typecheck and the production build on the exact final branch head.
- Run the existing competition regression smoke tests after bracket-model changes.
- Run Local release verification before merge and again on `main` after merge.

## Winner / loser labels

1. Generate a normal two-player match and select a winner.
2. Confirm the selected entrant shows **Winner** and the other entrant shows **Loser**.
3. Confirm the same labels appear on the read-only event bracket after the result is saved.
4. Verify three-player matches label the opposite entrant Loser once that listed match has a result.
5. Verify double-elimination, round-robin, and groups match cards label the non-winning participant Loser after a decided match.
6. Confirm a pending/TBD match does not label either entrant Loser.
7. Confirm an automatic BYE does not create a visible Winner/Loser result card.

## Uneven bracket display

Test single elimination with 3, 5, 6, 7, 9, and 10 entrants.

- Underlying advancement remains correct.
- No visual card shows `Player vs BYE`.
- Auto-advanced entrants appear in the correct next round.
- Real play-in/preliminary matches remain visible and selectable during setup.
- Later rounds still show TBD when they depend on unresolved real matches.
- Champion calculation remains unchanged.

## Events dashboard

1. Confirm **Active** is the default view.
2. Confirm DRAFT/AWAITING_APPROVAL/SIGNUPS/CHECK_IN/LIVE/POSTPONED events remain Active when the viewer is allowed to see them.
3. Confirm recently COMPLETED/CANCELLED events appear under Past.
4. Confirm older COMPLETED/CANCELLED events appear under Archived based on the selected archive age.
5. Confirm All includes active, recent past, and archived events.
6. Change the archive threshold and confirm events move between Past and Archived without changing the underlying event.
7. Verify no archive action deletes brackets, match history, stats, audit data, or spectator/event access.
8. Re-check existing event visibility/access rules in every filter.

## PNG export

- Export from competition management.
- Export from the read-only event bracket.
- Confirm the image downloads successfully.
- Confirm automatic BYE cards are omitted from single-elimination exports.
- Confirm decided real matches make winner/loser status clear.
- Confirm long entrant names still truncate safely.

## Release gate

Do not merge until the exact final head has:

1. TypeScript + production build green.
2. Competition regression smoke green.
3. No unresolved release-blocking P1/P2 findings.
4. Local release verification green.

After merge, run Local release verification on `main` and deploy the resulting v0.9.4 package.

No SQL import is required.
