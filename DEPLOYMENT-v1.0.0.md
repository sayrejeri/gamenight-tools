# Game Night Tools v1.0.0 — Deployment (Draft)

> This runbook is maintained with draft PR #34. Do not use it for production until the PR is ready, the exact final head is green, and the release artifact is generated from merged `main`.

## Release scope

v1.0.0 is the **Platform Polish & Discord Bot Beta** milestone.

Current scope includes:

- granular platform staff server/team profile administration;
- Discord-style public profile and earned competitive badges;
- optional per-workspace Discord bot installation/settings;
- opt-in user Discord DM preferences;
- signed/deferred Discord HTTP slash commands;
- `/gnt status`, `events`, `matches`, `bracket`, and player/team `leaderboard`;
- Four Seasons background worker;
- durable bot queue with delivery-time state/privacy revalidation;
- retry/cancel queue controls and recent delivery history;
- event/check-in/match/result-confirmation DMs;
- event/match-ready/result/winner announcements;
- idempotent private tournament match channels and cleanup;
- exact-role competitor/champion Discord synchronization with tracked assignment reconciliation;
- worker heartbeat and queue-health UI;
- mobile/accessibility/navigation/profile polish.

## Database migration — required once

**Back up production first.** Import exactly once after migration 010:

```text
database/011_v100_discord_bot_beta.sql
```

Do not rerun migrations `001` through `010`, and do not rerun `011` after success.

Migration 011 currently creates **six** tables:

- `workspace_bot_settings`
- `user_discord_bot_preferences`
- `discord_bot_jobs`
- `discord_bot_workers`
- `discord_match_channels`
- `discord_role_assignments`

Discord jobs persist bracket-match references plus exact role kind/role IDs when applicable. Successful bot role assignments are persisted separately so cleanup can remove the historical Discord role actually assigned even after workspace settings change.

The v0.9.5 production schema expects 50 base tables after migration 010. Migration 011 currently adds six, so the expected total is **56 base tables**.

```sql
SELECT COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_type = 'BASE TABLE';
```

Current expected result:

```text
56
```

If later v1.0 development adds another migration/table, update this runbook before release.

## Website environment

Retain all existing production values and add/confirm:

```text
DISCORD_CLIENT_ID=<existing Game Night Tools Discord application ID>
DISCORD_BOT_TOKEN=<bot token>
DISCORD_PUBLIC_KEY=<Discord application public key>
BOT_WORKER_SECRET=<new long random secret shared only with Four Seasons>
```

Security rules:

- do not reuse `AUTH_SECRET` or `CODE_PEPPER` for `BOT_WORKER_SECRET`;
- never commit the Discord bot token;
- rotate an exposed token immediately;
- Four Seasons does not receive database/OAuth secrets.

## Discord Developer Portal

Configure:

```text
https://gamenights.sayrejeri.com/api/discord/interactions
```

as the application Interactions Endpoint URL and confirm Discord accepts the signed endpoint verification.

The command route returns an immediate deferred ephemeral acknowledgement for valid `/gnt` guild commands, then edits the original response after database/leaderboard work finishes.

## Four Seasons worker environment

Deploy `bot-worker/` as the always-on worker.

```text
GNT_APP_URL=https://gamenights.sayrejeri.com
BOT_WORKER_SECRET=<exactly matches website>
DISCORD_BOT_TOKEN=<same bot token as website>
BOT_WORKER_ID=four-seasons-main
BOT_WORKER_VERSION=1.0.0-beta.1
BOT_POLL_SECONDS=10
BOT_CLAIM_LIMIT=1
BOT_SCHEDULE_SECONDS=60
```

Start command:

```text
npm start
```

Current requirements:

- Node.js 20.9+
- no npm runtime dependencies beyond Node itself
- outbound HTTPS access to Game Night Tools and Discord

Do **not** configure:

```text
DATABASE_URL
AUTH_SECRET
DISCORD_CLIENT_SECRET
CODE_PEPPER
```

Keep `BOT_CLAIM_LIMIT=1` during beta so each job is revalidated immediately before execution.

Current worker resilience assumptions:

- website request timeout: 15 seconds;
- Discord request timeout: 20 seconds;
- worker result callback retries: 3;
- abandoned PROCESSING lock recovery: 2 minutes;
- five Discord job attempts maximum before FAILED;
- automation scheduler and tracked-role reconciliation run on the scheduler interval.

## Pre-merge release gate

1. Keep PR #34 draft while development is incomplete.
2. Complete `docs/V100_TEST_PLAN.md`.
3. Confirm **PR regression checks** green on the exact final head.
4. Confirm the workflow includes and passes `node --check bot-worker/index.mjs`.
5. Confirm TypeScript typecheck and production build succeed.
6. Review open PR comments/threads for genuine blockers.
7. Verify migration 011 on backup/staging data.
8. Verify website operation with the bot disabled and Four Seasons stopped.
9. Verify a controlled Discord server with the bot and Four Seasons enabled.
10. Only then mark PR #34 ready for review.

## Versioning before merge

Change version metadata to `1.0.0` only after scope is frozen and release checks are passing. Do not repeatedly bump the version while the draft branch is still moving.

## After merge

Re-run release verification from merged `main`, confirm final `1.0.0` metadata, and create the final DirectAdmin deployment ZIP from merged `main`. Do not deploy a draft-branch ZIP as the production v1.0 artifact.

## Production deployment order

1. Establish maintenance/rollback window.
2. Back up application files.
3. Back up production database.
4. Stop any test Four Seasons worker.
5. Apply `database/011_v100_discord_bot_beta.sql` exactly once.
6. Verify current expected table count: **56**.
7. Upload/extract verified merged-main website release.
8. Add/confirm website bot environment values.
9. Restart Game Night Tools.
10. Verify normal website operation **before** starting Four Seasons.
11. Configure/verify Discord Interactions Endpoint URL.
12. Deploy matching `bot-worker/` build to Four Seasons.
13. Configure Four Seasons environment, including `BOT_CLAIM_LIMIT=1`.
14. Start worker.
15. Confirm Bot Settings reports worker ONLINE within 90 seconds.
16. Install/check the bot in a controlled workspace.
17. Enable each bot feature intentionally; all advanced automation defaults off.

## Website post-deploy smoke

Before enabling automation:

- Discord login works.
- Existing user/team/server profiles load.
- Events/brackets/Match Center/Series Desk load.
- Community chat/notifications load.
- Existing webhook-only servers remain unaffected.
- Staff Dashboard loads.
- Manage Server Profiles and Manage Team Profiles work independently of staff title.
- Public badge strip renders/wraps correctly.
- Profile Settings exposes DM preferences.
- Bot Settings loads for authorized workspace managers.
- Recent bot-job history/Retry failed/Cancel queued controls render correctly.

## Discord/Four Seasons post-deploy smoke

Use a controlled Discord workspace first:

- install bot and Check connection;
- confirm slash commands register;
- run `/gnt status`, `events`, `matches`, `bracket`, and both leaderboard types;
- confirm command responses complete through deferred/edit-original handling;
- confirm Four Seasons heartbeat ONLINE;
- confirm queue counts move as a job processes;
- opt one test user into DMs and verify a controlled reminder;
- configure a test announcement channel and verify delivery;
- configure a test match category and verify private channel create/cleanup;
- verify bot itself can post inside the private match channel;
- configure competitor/champion roles below the bot's highest role and verify add/remove behavior;
- confirm successful ADD creates an ACTIVE `discord_role_assignments` record.

## Idempotency/recovery smoke

Before broad rollout:

1. Queue a test announcement or DM and interrupt the worker's website callback after Discord accepts the message. Confirm retry does not intentionally create a second message.
2. Create a test match channel, interrupt the success-report path, and retry. Confirm the worker finds the `gnt-match:<match-id>` topic and reuses it.
3. Confirm another PENDING/PROCESSING CREATE_MATCH_CHANNEL job is not scheduled for the same match.
4. Stop the worker with one job PROCESSING and confirm stale recovery happens after roughly two minutes.
5. Queue a reminder, disable the relevant user/server setting, then start the worker. Confirm the queued job becomes CANCELLED rather than delivered.
6. Confirm automatic cancellation releases the trigger dedupe key; re-enable the feature while the trigger is still valid and confirm fresh work can be queued.
7. Confirm manual **Cancel queued** retains its dedupe key and does not immediately recreate the manually cancelled trigger.
8. Retry a FAILED but now-stale job from Bot Settings. Confirm delivery-time validation cancels it.

## Exact-role reconciliation smoke

1. Assign competitor role A to a controlled participant and confirm an ACTIVE tracked assignment for A.
2. Change the workspace Competitor Role ID to B while the participant is still in an active event.
3. Confirm a distinct B ADD can queue and A cleanup can queue simultaneously because jobs persist exact role IDs.
4. Confirm Four Seasons adds B and removes historical A.
5. Confirm A's tracked assignment becomes REMOVED.
6. Change back to A later and confirm released completed-role dedupe does not permanently block reuse.
7. Disable role sync while a tracked role is ACTIVE and confirm reconciliation can still queue/remove that exact historical role.
8. Complete one event while the participant remains active in another event and confirm competitor role is retained.
9. End the final active competition and confirm tracked competitor role is removed.
10. Reopen/correct a completed bracket so a tracked champion is no longer champion and confirm champion-role cleanup is queued.

## Safe failure checks

Deliberately test at least one Discord permission failure, such as removing Send Messages from the announcement channel or moving a synced role above the bot.

Confirm:

- the job fails visibly;
- website event/bracket state remains correct;
- worker continues running;
- no repeated spam loop occurs;
- failed job information is visible in Bot Settings;
- after correcting the configuration, Retry failed can safely requeue the job.

## Rollback

If the whole website must roll back after migration 011:

- stop Four Seasons first;
- do not blindly drop new tables;
- do not rerun older migrations;
- restore the matching pre-deploy database backup if a full schema rollback is required.

If only the bot beta needs to be disabled:

- disable workspace bot feature toggles;
- let role/channel reconciliation clean bot-managed Discord state while the bot is still installed;
- then stop Four Seasons;
- optionally remove the bot from Discord workspaces;
- leave event/tournament data untouched.

Because the bot beta is optional, the website must remain usable with the worker stopped.
