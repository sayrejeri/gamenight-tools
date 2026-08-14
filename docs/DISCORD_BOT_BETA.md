# Game Night Tools v1.0 — Discord Bot Beta Setup

The v1.0 bot beta is **optional per server workspace**. The website continues to work without the bot or Four Seasons worker.

## Architecture

Game Night Tools uses two cooperating pieces:

1. **Website/control plane**
   - owns the database and permission checks;
   - stores workspace bot settings and user DM opt-ins;
   - verifies bot installation and registers guild slash commands;
   - receives signed Discord HTTP interactions;
   - schedules durable bot jobs;
   - revalidates current settings/privacy/competition state immediately before a job is claimed;
   - tracks worker heartbeats, queue health, recent job activity, and temporary match-channel mappings.

2. **Four Seasons worker** in `bot-worker/`
   - runs continuously without database credentials;
   - authenticates to internal Game Night Tools APIs using `BOT_WORKER_SECRET`;
   - runs the reminder/automation scheduler;
   - claims jobs, one at a time by default;
   - sends DMs/announcements, creates/cleans temporary match channels, and synchronizes roles;
   - reports success/failure and created channel IDs back to the website;
   - reports ID/version/runtime metadata and a regular heartbeat.

Discord failures never decide a tournament result or block the website's event/bracket workflow.

## Database migration

Import exactly once after migration `010`:

```text
database/011_v100_discord_bot_beta.sql
```

It creates:

- `workspace_bot_settings`
- `user_discord_bot_preferences`
- `discord_bot_jobs`
- `discord_bot_workers`
- `discord_match_channels`

Bot jobs can reference a workspace, user, event, and bracket match. Match references prevent duplicate in-flight match-channel work and cascade safely if a match is removed.

## Website environment

```text
DISCORD_CLIENT_ID=<existing Discord application/client ID>
DISCORD_BOT_TOKEN=<bot token>
DISCORD_PUBLIC_KEY=<application public key>
BOT_WORKER_SECRET=<long unique shared worker secret>
```

Do not reuse `AUTH_SECRET` or `CODE_PEPPER` for `BOT_WORKER_SECRET`. Never commit the bot token.

## Discord Developer Portal

Using the same Discord application as Game Night Tools OAuth:

1. Enable/create the bot user.
2. Put the bot token in the website and Four Seasons worker environments.
3. Put the application public key in `DISCORD_PUBLIC_KEY`.
4. Set the Interactions Endpoint URL to:

```text
https://gamenights.sayrejeri.com/api/discord/interactions
```

5. Restart the website after environment changes.

The route verifies Discord's Ed25519 signature before processing an interaction.

## Four Seasons worker

Deploy `bot-worker/` as the always-on process.

```text
GNT_APP_URL=https://gamenights.sayrejeri.com
BOT_WORKER_SECRET=<must match website>
DISCORD_BOT_TOKEN=<same bot token>
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

The worker requires Node.js 20.9+ and currently has no npm runtime dependencies. It does **not** need `DATABASE_URL`, `AUTH_SECRET`, `CODE_PEPPER`, or the Discord OAuth client secret.

`BOT_CLAIM_LIMIT=1` is the recommended beta setting. It ensures each job gets its current settings/state revalidation immediately before execution rather than sitting in a claimed batch.

Website requests time out after 15 seconds and Discord requests after 20 seconds. Abandoned PROCESSING locks are recovered after two minutes.

## Worker health and queue controls

Every claim updates the worker heartbeat. Bot Settings treats a heartbeat from the last 90 seconds as online and shows:

- worker ID/version;
- last heartbeat;
- queued/processing count;
- failed count;
- recent job type/status/attempts/errors.

Workspace managers can:

- **Retry failed** jobs after fixing Discord permissions/settings;
- **Cancel queued** PENDING jobs.

Retries still pass the delivery-time safety checks. A stale reminder can therefore become CANCELLED instead of being delivered simply because somebody retried the failed queue.

## Delivery-time revalidation

A feature being enabled when a job was originally queued is not enough. Immediately before delivery, Game Night Tools checks the current state again.

Examples:

- user turned DMs off → queued DM is cancelled;
- server disabled announcements → queued announcement is cancelled;
- participant already checked in → queued check-in reminder is cancelled;
- match was rescheduled/completed → stale match reminder is cancelled;
- submitted result is no longer awaiting confirmation → result reminder is cancelled;
- event became private/cancelled → public/server announcement is cancelled;
- match is no longer READY/LIVE → pending channel creation is cancelled;
- role sync was disabled or the member is no longer eligible → role job is cancelled;
- competitor-role removal is cancelled if the member now has another active competition in that workspace.

Temporary-channel **cleanup** remains allowed even if new channel creation is later disabled.

## User DM preferences

Discord DMs default **off**. A member must enable the main Game Night Tools bot-DM setting in Profile Settings.

They can independently allow:

- event/signup reminders;
- check-in reminders;
- match reminders;
- result-confirmation reminders.

The scheduler currently queues event reminders roughly a day before an approved participant's event, check-in reminders after check-in opens, scheduled-match reminders roughly 20–40 minutes before the match, and result-confirmation reminders while a submitted result awaits the opponent.

## Announcements

When enabled with a configured announcement channel, the scheduler can queue:

- recently published SERVER/PUBLIC events;
- match-ready notifications;
- completed/forfeit match results;
- completed tournament winners.

Private/unlisted/staff-only event visibility is not promoted by the public/server announcement scheduler.

## Temporary match channels

When enabled with a configured category:

- READY/LIVE matches can receive a private text channel;
- `@everyone` is denied view access;
- the bot receives its own explicit member overwrite so it can still manage/post in the private channel;
- participating Discord users receive view/send/read-history access;
- team participation is resolved from the event's saved roster snapshot;
- the channel topic stores a `gnt-match:<match-id>` marker;
- before creating a channel, the worker looks for that marker and reuses the existing channel on a retry;
- `discord_match_channels` persists the successful mapping;
- another PENDING/PROCESSING create job for the same match blocks a second scheduler create;
- completed/forfeit matches and completed/cancelled competitions queue cleanup;
- a Discord 404 while deleting is treated as already-cleaned success;
- disabling new creation does not block cleanup of an existing channel.

The topic marker protects against a network/report failure after Discord already created the channel but before Game Night Tools recorded its ID.

## Role synchronization

### Competitor role

- approved direct participants in active events can receive the configured competitor role;
- registered team-entry members use the saved event roster snapshot;
- completed/cancelled events remove it only when the member has no other active competition in that workspace;
- postponed competitions count as active.

### Champion role

- direct-player champions can receive the configured champion role after bracket completion;
- team champions apply it to the saved event roster snapshot.

Role operations are idempotent Discord PUT/DELETE operations and are revalidated before delivery.

## Message idempotency

DMs, announcements, and temporary-channel intro messages send the queue job ID as a Discord message nonce with nonce enforcement enabled. If a Discord message succeeds but the worker loses the response/report path and retries shortly afterward, Discord can return the already-created message rather than creating another one.

Worker success reporting is separate from Discord execution. A Discord action that succeeded is not deliberately reclassified as a failed Discord action merely because reporting the success back to the website temporarily failed.

## Slash commands

Current commands:

```text
/gnt status
/gnt events
/gnt matches
/gnt bracket
/gnt leaderboard
```

- `/gnt status` — connection + upcoming public/server event count.
- `/gnt events` — up to five upcoming SERVER/PUBLIC events.
- `/gnt matches` — active/upcoming public/server competition matches.
- `/gnt bracket` — current/latest generated bracket link.
- `/gnt leaderboard` — public player rankings, optionally team rankings.

Valid guild commands use a **deferred ephemeral response**. Game Night Tools acknowledges Discord immediately, performs the database/leaderboard work after the HTTP response, then edits the original interaction response. This avoids command failures when a leaderboard/query takes longer than Discord's initial interaction-response window.

## Queue lifecycle and failure isolation

- New work starts `PENDING`.
- A claim revalidates current state, then moves allowed work to `PROCESSING` and increments attempts.
- Work that is no longer allowed becomes `CANCELLED` before delivery.
- Success becomes `SENT`.
- Retryable Discord/network failures return to `PENDING` after the retry delay.
- Permanent failures or five failed attempts become `FAILED`.
- PROCESSING locks older than **two minutes** are recovered.
- Worker website callbacks retry three times.
- The worker uses request timeouts so a dead connection does not hold a job indefinitely.

A failed DM, announcement, channel operation, or role operation never rolls back or blocks the corresponding website event/bracket action.

## CI and release testing

PR regression checks now include:

```text
node --check bot-worker/index.mjs
```

in addition to the existing smoke tests, TypeScript typecheck, and production build.

Use `docs/V100_TEST_PLAN.md` before moving draft PR #34 to ready-for-review status.
