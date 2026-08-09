# Game Night Tools v0.7.2 — Spectator pre-live hotfix

## What changed
- Valid spectator links no longer require a saved bracket row just to render their status page.
- Pre-live, postponed, and cancelled events can now show the intended spectator status page even before the tournament bracket has been generated/saved.
- LIVE/COMPLETED spectator competition data is still shown only when a real bracket exists with public-ready state.
- Invalid, revoked, or expired spectator tokens still return 404.

## Database
- No migration for v0.7.2.
- Do **not** rerun migrations 001–008.

## Release gate
1. Run Local release verification on `hotfix/v0.7.2-spectator-prelive`.
2. Merge only after branch verification passes.
3. Run Local release verification again on `main`.
4. Deploy `C:\GameNightToolsRelease\gamenight-tools-v0.7.2-directadmin.zip`.

## Smoke test
- Create a tournament-enabled event and generate a spectator link before saving/generating the bracket. The link should show `Tournament not live yet` instead of 404.
- Cancel the event and reload the same link. It should show `Event cancelled` instead of 404.
- Revoke the link. It should return 404.
