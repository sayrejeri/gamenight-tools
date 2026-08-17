# Game Night Tools v1.0 — Discord Bot Beta Setup

The v1.0 bot beta is **optional per server workspace**. The website continues to work without the bot or Four Seasons worker.

## Architecture

Game Night Tools uses two cooperating pieces:

1. **Website/control plane**
   - owns the database and permission checks;
   - stores workspace bot settings and user DM opt-ins;
   - verifies bot installation and registers guild slash commands;
   - validates configured Discord channels/categories/roles before managers enable automation;
   - receives signed Discord HTTP interactions;
   - schedules durable bot jobs;
   - revalidates current settings/privacy/competition state immediately before claim;
   - resolves current private-match-channel access when Four Seasons creates the channel;
   - tracks worker heartbeat, queue history, temporary match channels, and bot-managed role assignments.

2. **Four Seasons worker** in `bot-worker/`
   - runs continuously without database credentials;
   - authenticates to internal Game Night Tools APIs with `BOT_WORKER_SECRET`;
   - runs scheduling plus tracked-role reconciliation;
   - claims jobs one at a time by default;
   - sends DMs/announcements, manages temporary channels, and synchronizes exact Discord role IDs;
   - reports success/failure and created Discord resources back to the website.

Discord failures never decide tournament results or block the website's event/bracket workflow.

## Database migration

Import exactly once after migration `010`:

```text
database/011_v100_discord_bot_beta.sql
```

It currently creates **six** v1.0 tables:

- `workspace_bot_settings`
- `user_discord_bot_preferences`
- `discord_bot_jobs`
- `discord_bot_workers`
- `discord_match_channels`
- `discord_role_assignments`

Bot jobs can reference the exact bracket match and, for role work, the exact role kind/Discord role ID. `discord_role_assignments` records roles that Game Night Tools actually added so cleanup never has to guess which historical role to remove.

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

`BOT_CLAIM_LIMIT=1` is the recommended beta setting so each job gets current-state revalidation immediately before execution.

Website requests time out after 15 seconds, Discord requests after 20 seconds, and abandoned PROCESSING locks are recovered after two minutes.

## Discord configuration preflight

Bot Settings includes **Validate Discord configuration**. It uses the values currently typed into the form, so managers can test IDs before saving a bad configuration.

The validator checks:

- the bot can access the connected Discord guild;
- announcement channel ID belongs to that guild;
- announcement target is a normal text channel or announcement channel;
- the bot's **effective** channel permissions include View Channel, Send Messages, Embed Links, and Read Message History after Discord overwrites are applied;
- match-category ID belongs to the guild and is actually a category;
- the bot has View Channel and Manage Channels for that category;
- configured synchronized roles exist in the guild;
- `@everyone` cannot be used as a competition role;
- Discord/integration-managed roles are rejected;
- the bot has Manage Roles;
- synchronized roles are below the bot's highest role in Discord's hierarchy.

Role sync may intentionally use only a Competitor role or only a Champion role. A missing optional role is a warning rather than a failure; that half of role sync simply remains inactive.

The preflight is convenience, not the final security boundary. Jobs still revalidate current state at delivery time because Discord permissions/settings can change after validation.

## Worker health and queue controls

Every claim updates the worker heartbeat. Bot Settings shows:

- online/offline state;
- worker ID/version and last heartbeat;
- queued/processing count;
- failed count;
- active temporary match-channel count;
- active bot-managed role-assignment count;
- recent job type/status/attempts/errors.

Workspace managers can **Retry failed** or **Cancel queued** work. Retried jobs still pass delivery-time safety checks.

Manual cancellation keeps the job's dedupe key so the scheduler does not immediately recreate exactly what a manager intentionally cancelled. Automatic safety cancellation clears its dedupe key so a job can be scheduled again later if the server/user/state becomes valid again.

## Delivery-time revalidation

A feature being enabled when a job was originally queued is not enough. Immediately before delivery, Game Night Tools checks current state again.

Examples:

- user turned DMs off → queued DM is cancelled;
- server disabled announcements → queued announcement is cancelled;
- participant already checked in → check-in reminder is cancelled;
- match was rescheduled/completed → stale match reminder is cancelled;
- submitted result is no longer awaiting confirmation → confirmation DM is cancelled;
- event became private/cancelled → public/server announcement is cancelled;
- tournament winner announcement requires the bracket to still be completed;
- match no longer READY/LIVE → pending channel creation is cancelled;
- role ADD requires the same configured role ID that was bound when the job was queued and current eligibility.

Temporary-channel cleanup and tracked-role cleanup are allowed even after the corresponding creation/sync feature is disabled.

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
- the bot receives an explicit member overwrite so it can still manage/post there;
- direct participants and saved team-roster members get view/send/read-history access;
- the event's primary host gets access;
- accepted, unexpired co-hosts with FULL, BRACKET, or SCOREKEEPER permission get access;
- ANNOUNCEMENT_ONLY and VIEW_ONLY co-hosts do not receive private match-channel access;
- access is resolved from the website when Four Seasons actually creates the channel, not only when the job was originally queued;
- the topic stores `gnt-match:<match-id>`;
- retries look for that marker and reuse an already-created channel;
- `discord_match_channels` persists the mapping;
- another PENDING/PROCESSING create job for the same match blocks a second scheduler create;
- completed/forfeit matches and completed/cancelled competitions queue cleanup;
- Discord 404 during deletion is treated as already-cleaned success;
- disabling new creation does not block existing-channel cleanup.

## Role synchronization and reconciliation

Each successful role ADD is recorded in `discord_role_assignments` with:

- workspace;
- Game Night Tools user;
- role kind (`COMPETITOR` or `CHAMPION`);
- exact Discord role ID;
- source event;
- active/removed lifecycle timestamps.

### Competitor role

- approved direct participants in active events can receive the configured role;
- registered team-entry members use the saved event roster snapshot;
- an active assignment is removed only when the member no longer has another active competition in that workspace, role sync is disabled, or the configured competitor role ID changes;
- postponed competitions count as active.

### Champion role

- direct-player champions can receive the configured champion role after bracket completion;
- team champions use the saved event roster snapshot;
- tracked champion assignments are removed if the source event no longer has that champion, role sync is disabled, or the configured champion role changes.

### Exact-role cleanup

Once per scheduler interval, Four Seasons calls the role-reconciliation endpoint. It examines ACTIVE bot-managed assignments and queues REMOVE jobs against the **historical role ID actually assigned**, not the workspace's current role setting.

The reconciliation eligibility pass is batched into one correlated database read plus one batch queue insert instead of doing one or more database queries per tracked assignment.

Changing role A → role B can safely remove A while new ADD jobs target B. A role REMOVE remains valid even if role sync has already been disabled. Completed/cancelled role-job dedupe keys for the removed role are released so that same Discord role can be used again in a later event/config cycle.

Role operations use Discord's idempotent member-role PUT/DELETE endpoints and are revalidated before delivery.

## Message idempotency

DMs, announcements, and temporary-channel intro messages send a job-derived Discord nonce with nonce enforcement enabled. If Discord accepted a message but the worker temporarily lost its report path, a quick retry can reuse the existing Discord message instead of intentionally creating a second one.

Worker success reporting is separate from Discord execution. A successful Discord action is not deliberately reclassified as a Discord failure merely because reporting success back to the website temporarily failed.

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

Valid guild commands use a **deferred ephemeral response**. Game Night Tools acknowledges Discord immediately, performs database/leaderboard work after the HTTP response, then edits the original response.

## Queue lifecycle and failure isolation

- New work starts `PENDING`.
- Claim revalidates current state, then valid work becomes `PROCESSING`.
- No-longer-valid work becomes `CANCELLED` before delivery and releases its automatic dedupe key.
- Success becomes `SENT`.
- Retryable Discord/network failures return to `PENDING` after the retry delay.
- Permanent failures or five failed attempts become `FAILED`.
- PROCESSING locks older than two minutes are recovered.
- Website result callbacks retry three times.

A failed DM, announcement, channel, or role operation never rolls back the corresponding website event/bracket action.

## CI and release testing

The v1.0 PR regression workflow now includes:

```text
npm audit --omit=dev --audit-level=high
node --check bot-worker/index.mjs
npm run typecheck
npm run build
```

plus the existing competition/description smoke tests.

The runtime dependency audit is clean after upgrading Next.js from 16.2.12 to **16.3.1**. The repo currently has no committed npm lockfile, so CI intentionally continues to use `npm install`; introducing a lockfile should be handled as a separate reproducibility change rather than silently generated during the v1.0 release.

Use `docs/V100_TEST_PLAN.md` before moving draft PR #34 to ready-for-review status.
