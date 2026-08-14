# Game Night Tools v1.0.0 — Deployment (Draft)

> This runbook is being maintained with draft PR #34. Do not use it for production until the v1.0 PR is marked ready, the final exact head is green, and the release artifact is generated from merged `main`.

## Release scope

v1.0.0 is the **Platform Polish & Discord Bot Beta** milestone.

Current scope includes:

- platform staff team-profile administration with granular permissions;
- Discord-style public profile badges, including earned competitive badges;
- optional per-workspace Discord bot installation/settings;
- opt-in user Discord DM reminder preferences;
- signed Discord HTTP slash-command endpoint;
- `/gnt status`, `events`, `matches`, `bracket`, and player/team `leaderboard` commands;
- Four Seasons background worker;
- durable Discord bot queue/retry/failure tracking;
- event/check-in/match/result-confirmation DMs;
- event, match-ready, match-result, and tournament-winner announcements;
- temporary private tournament match channels and cleanup;
- competitor and champion Discord role synchronization;
- worker heartbeat and queue-health UI;
- mobile/accessibility/profile polish.

## Database migration — required once

**Back up the production database first.**

Import exactly once after migration 010:

```text
database/011_v100_discord_bot_beta.sql
```

Do not rerun migrations `001` through `010`, and do not rerun `011` after it succeeds.

Migration 011 creates:

- `workspace_bot_settings`
- `user_discord_bot_preferences`
- `discord_bot_jobs`
- `discord_bot_workers`
- `discord_match_channels`

The v0.9.5 production schema expects 50 base tables after migration 010. Migration 011 adds five, so the current expected total after v1.0 migration is **55 base tables**.

Verification query:

```sql
SELECT COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_type = 'BASE TABLE';
```

Current expected result after migration 011:

```text
55
```

If later v1.0 development adds another migration/table, update this runbook before release.

## Website environment

Retain all existing production environment values and add/confirm:

```text
DISCORD_CLIENT_ID=<existing Game Night Tools Discord application ID>
DISCORD_BOT_TOKEN=<bot token>
DISCORD_PUBLIC_KEY=<Discord application public key>
BOT_WORKER_SECRET=<new long random secret shared only with Four Seasons worker>
```

Security rules:

- do not reuse `AUTH_SECRET` or `CODE_PEPPER` for `BOT_WORKER_SECRET`;
- never commit the Discord bot token;
- rotate the token immediately if exposed;
- Four Seasons does not need the website database password or OAuth client secret.

## Discord Developer Portal

Before bot testing, configure the Game Night Tools application interaction endpoint:

```text
https://gamenights.sayrejeri.com/api/discord/interactions
```

Confirm Discord accepts the endpoint PING/signature verification.

The optional bot uses the same Discord application/client ID as Game Night Tools OAuth unless the release plan is intentionally changed before v1.0.

## Four Seasons worker environment

Deploy the `bot-worker/` directory as the always-on worker.

Configure:

```text
GNT_APP_URL=https://gamenights.sayrejeri.com
BOT_WORKER_SECRET=<exactly matches website BOT_WORKER_SECRET>
DISCORD_BOT_TOKEN=<same bot token as website>
BOT_WORKER_ID=four-seasons-main
BOT_WORKER_VERSION=1.0.0-beta.1
BOT_POLL_SECONDS=10
BOT_SCHEDULE_SECONDS=60
```

Start command:

```text
npm start
```

Current worker requirements:

- Node.js 20.9+
- no npm runtime dependencies beyond Node itself
- outbound HTTPS access to Game Night Tools and Discord

Do not configure on Four Seasons:

```text
DATABASE_URL
AUTH_SECRET
DISCORD_CLIENT_SECRET
CODE_PEPPER
```

## Pre-merge release gate

1. Confirm PR #34 remains draft while development is incomplete.
2. Complete the focused checks in:

```text
docs/V100_TEST_PLAN.md
```

3. Confirm **PR regression checks** are green on the exact final branch head.
4. Confirm TypeScript typecheck succeeds.
5. Confirm production build succeeds.
6. Review all open PR comments/threads and resolve genuine release blockers.
7. Verify migration 011 on a backup/staging database.
8. Verify website operation with the bot disabled and Four Seasons stopped.
9. Verify a test Discord server with the bot enabled and Four Seasons running.
10. Only then mark PR #34 ready for review.

## Versioning before merge

Before final release, update version metadata to `1.0.0` only after feature scope is frozen and tests are passing.

Do not bump the version repeatedly while the draft branch is still under active development.

## After merge

Run the normal local release verification again from:

```text
main
```

Confirm final version metadata is `1.0.0`.

Create the final DirectAdmin deployment ZIP from merged `main`. Do not deploy a pre-merge draft branch ZIP as the production v1.0 artifact.

## Production deployment order

Recommended order:

1. Put a maintenance plan/rollback window in place.
2. Back up the current application files.
3. Back up the production database.
4. Stop the Four Seasons worker if it is already running from a test deployment.
5. Apply `database/011_v100_discord_bot_beta.sql` exactly once.
6. Verify the database base-table count is currently 55.
7. Upload/extract the verified merged-main website release.
8. Add/confirm website bot environment variables.
9. Restart the Game Night Tools Node application.
10. Verify the normal website without starting Four Seasons yet.
11. Configure/verify the Discord Interactions Endpoint URL.
12. Deploy the matching `bot-worker/` build to Four Seasons.
13. Configure Four Seasons environment values.
14. Start the worker.
15. Confirm Bot Settings reports the worker ONLINE within 90 seconds.
16. Install/check the bot in a test workspace before enabling automation in production workspaces.
17. Enable each workspace bot feature intentionally; all v1.0 bot automation defaults off.

## Website post-deploy smoke

Before enabling bot automation:

- Discord login works.
- Existing server/team/user profiles load.
- Existing events/brackets/Match Center/Series Desk load.
- Community chat and notifications load.
- Existing webhook-only servers remain unaffected.
- Staff Dashboard loads.
- Manage Server Profiles permission works independently of staff title.
- Manage Team Profiles permission works independently of staff title.
- Public profile badge strip renders and wraps correctly.
- Profile Settings exposes Discord DM preferences.
- Bot Settings loads for authorized workspace managers.

## Bot post-deploy smoke

Use a controlled Discord workspace first:

- Install bot.
- Check connection.
- Confirm slash commands register.
- Run `/gnt status`.
- Run `/gnt events`.
- Run `/gnt matches`.
- Run `/gnt bracket` when a bracket exists.
- Run player and team `/gnt leaderboard`.
- Confirm Four Seasons worker heartbeat is ONLINE.
- Confirm queue counts move as a test job processes.
- Opt one test user into DMs and verify a controlled reminder.
- Configure a test announcement channel and verify announcement delivery.
- Configure a test match category and verify private match-channel creation/cleanup.
- Configure test competitor/champion roles below the bot's highest role and verify add/remove behavior.

## Safe failure checks

Before broad rollout, deliberately test at least one permission failure:

- remove Send Messages from the bot for the test announcement channel; or
- place a synced role above the bot's highest Discord role.

Confirm:

- the Discord job fails visibly;
- the website event/bracket state remains correct;
- the worker does not crash permanently;
- no repeated spam loop occurs;
- failed job information appears in Bot Settings/queue state.

## Rollback

If the website must be rolled back after migration 011:

- stop the Four Seasons worker first so it stops claiming/scheduling jobs;
- do not blindly drop the new tables;
- do not rerun older migrations;
- restore the matching pre-deploy database backup if a full schema rollback is required.

If only the bot beta needs to be disabled while keeping the v1.0 website:

- disable workspace bot feature toggles;
- stop the Four Seasons worker;
- optionally remove the bot from Discord workspaces;
- leave website event/tournament data untouched.

Because the bot beta is optional, the website should remain usable with the worker stopped.
