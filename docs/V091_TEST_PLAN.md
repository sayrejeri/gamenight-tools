# v0.9.1 test plan

## Competitive privacy

- Public competitive profile shows PUBLIC competitive history only when logged out.
- Restricted CODE_ONLY, STAFF_ONLY, SERVER-only and non-public event details do not leak to an unauthorized viewer.
- A hidden/private opponent appears as a generic private opponent label.
- Blocked users do not appear on each other's player leaderboards.
- Suspended/banned users do not appear in player rankings.
- Manually changing `?workspace=` to an unavailable workspace cannot reveal that server's leaderboard.
- All available servers includes only servers available to the signed-in viewer.
- Recorded-match summary equals unique decided matches in the selected scope.
- Seasonal/server/game filters still return correct records.

## Spectator links

- Valid enabled/unexpired link before bracket generation shows a safe pre-live state.
- Valid cancelled link shows Event cancelled.
- Valid postponed link shows Event postponed.
- LIVE event + LIVE bracket renders spectator competition.
- Revoked, expired and malformed tokens 404.
- Pre-live/cancelled/postponed states expose no bracket results, reports, disputes, or proof.

## Event access

- PUBLIC and UNLISTED events allow eligible direct signup while signups are open.
- SERVER events reject signup from a non-member and allow a guild member.
- CODE_ONLY events require redeemed event access before signup.
- STAFF_ONLY events reject ordinary users.
- Calendar download follows the same event-view authorization.
- General event listings do not expose draft/awaiting-approval/restricted events to ordinary viewers.
- Public profile recent-event history does not expose restricted/unlisted events to unauthorized viewers.

## Tournament integrity

- Change competition entrant count/format before live and verify every normalized match has a distinct database ID.
- Generate a team tournament, then attempt register/withdraw/re-register after competition generation; mutation is blocked until competition is reset/regenerated appropriately.
- LIVE and COMPLETED competitions cannot be changed back to GENERATED through the status API.
- Reopen/correct an upstream completed match after a downstream report/dispute exists; old evidence remains stored as VOID/RESOLVED instead of being deleted.
- Single, three-player, double elimination, round robin, and groups/playoffs still advance normally.

## Access control

- Numeric Discord ID resolves the Discord account even if another account has a matching numeric site username.
- Ambiguous non-numeric identifiers are rejected rather than choosing an arbitrary user.
- Private/non-discoverable/inactive users do not appear in generic user lookup.
- Team MANAGER cannot approve an applicant as MANAGER; OWNER can.

## v0.8 regression

- Series submission requires event status LIVE as well as a LIVE bracket/match.
- Cancelled/postponed/draft event cannot accept a series result.
- Normal Match Center confirmation/dispute/override behavior remains unchanged.

## Release checks

- TypeScript passes.
- Production build passes.
- Local release verification passes on the exact hotfix head.
- No v0.9.1 SQL migration exists or is required.
- DirectAdmin ZIP is `C:\GameNightToolsRelease\gamenight-tools-v0.9.1-directadmin.zip`.
