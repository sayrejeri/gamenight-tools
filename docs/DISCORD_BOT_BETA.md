# Game Night Tools v1.0 — Discord Bot Beta Setup

The v1.0 bot beta is **optional per server workspace**. The website continues to work without the bot.

## Architecture

Game Night Tools uses two cooperating pieces:

1. **The website/control plane**
   - owns the database and permission checks;
   - stores workspace bot settings and user DM opt-ins;
   - verifies Discord bot installation;
   - registers guild slash commands;
   - receives signed HTTP slash-command interactions;
   - schedules durable bot jobs;
   - tracks worker heartbeats, queue health, and temporary match-channel mappings.

2. **The Four Seasons bot worker** in `bot-worker/`
   - runs continuously without direct database credentials;
   - calls authenticated internal Game Night Tools APIs using `BOT_WORKER_SECRET`;
   - runs the reminder/automation scheduler;
   - claims queued jobs;
   - sends Discord DMs and announcements;
   - creates/cleans temporary match channels;
   - adds/removes configured Discord roles;
   - reports success, retryable failures, permanent failures, and created channel IDs back to the website;
   - reports its ID, version, Node version, platform, architecture, and regular heartbeat.

This keeps the website as the source of truth while using Four Seasons for reliable background delivery. Discord failures never decide a tournament result or block the website's core event workflow.

## Database migration

v1.0 bot settings, queue persistence, worker health, and match-channel tracking use:

```text
database/011_v100_discord_bot_beta.sql
```

Import it **once** after migration `010`.

It creates:

- `workspace_bot_settings`
- `user_discord_bot_preferences`
- `discord_bot_jobs`
- `discord_bot_workers`
- `discord_match_channels`

The queue includes dedupe keys, retries, stale-lock recovery, and final failed/sent states. The worker table stores first/last heartbeat, worker version, and lightweight runtime metadata. `discord_match_channels` keeps one persisted Discord-channel mapping per bracket match so creation and cleanup can be coordinated safely.

## Website environment values

Keep these server-side only:

```text
DISCORD_CLIENT_ID=<existing Discord application/client ID>
DISCORD_BOT_TOKEN=<bot token from the Discord Developer Portal>
DISCORD_PUBLIC_KEY=<application public key from the Discord Developer Portal>
BOT_WORKER_SECRET=<long random shared worker secret>
```

Use a unique `BOT_WORKER_SECRET`; do not reuse `AUTH_SECRET` or `CODE_PEPPER`.

`DISCORD_BOT_TOKEN` must never be committed to GitHub or pasted into a public ticket/log. Rotate it immediately if it is exposed.

## Discord Developer Portal

Using the same Discord application that already handles Game Night Tools OAuth:

1. Open the application's **Bot** section and create/enable the bot user if needed.
2. Copy/reset the bot token and place it in `DISCORD_BOT_TOKEN` on the website and Four Seasons worker.
3. Copy the application's public key into `DISCORD_PUBLIC_KEY` on the website.
4. Set the application's **Interactions Endpoint URL** to:

```text
https://gamenights.sayrejeri.com/api/discord/interactions
```

Discord sends a signed PING request to verify that endpoint. The endpoint rejects requests that do not have a valid Discord Ed25519 signature.

5. Restart the Game Night Tools Node application after changing environment variables.

## Four Seasons worker

Deploy only the `bot-worker/` directory as the bot process.

Environment values:

```text
GNT_APP_URL=https://gamenights.sayrejeri.com
BOT_WORKER_SECRET=<must match website>
DISCORD_BOT_TOKEN=<same bot token>
BOT_WORKER_ID=four-seasons-main
BOT_WORKER_VERSION=1.0.0-beta.1
BOT_POLL_SECONDS=10
BOT_SCHEDULE_SECONDS=60
```

Start command:

```text
npm start
```

The worker requires Node.js 20.9+ and has no npm runtime dependencies in the current beta.

The worker never needs `DATABASE_URL`, `AUTH_SECRET`, or the Discord OAuth client secret.

Every queue claim updates the worker heartbeat. The Bot Settings page treats a heartbeat from the last 90 seconds as online and shows worker ID/version plus workspace-specific queued/processing and failed job counts.

## Installing into a workspace

A user with **Manage Server Profile** permission can open the server profile and use the **Discord bot** card or open its dedicated Bot Settings page.

1. Select **Install Discord bot**.
2. Discord locks the invite to that workspace's Discord guild ID.
3. Approve the requested bot permissions.
4. Return to Game Night Tools.
5. Select **Check connection**.

The check confirms the bot can access the Discord guild, updates `workspaces.bot_connected`, writes an audit entry when connection state changes, and bulk-registers the current guild slash commands.

## Workspace feature settings

All advanced features default **off** per workspace:

- opt-in member DM reminders
- event/tournament announcements
- temporary match channels
- competition role sync

Servers can configure:

- announcement channel ID
- temporary-match category ID
- competitor role ID
- champion role ID

The worker validates Discord access at delivery time so removed permissions fail safely without changing event or tournament state.

## User DM preferences

Discord DMs are **off by default** for every user. A member must explicitly enable the main Game Night Tools bot DM toggle in Profile Settings.

After opting in, they can independently allow:

- event/signup reminders
- check-in reminders
- match reminders
- result-confirmation reminders

The scheduler queues:

- an event reminder roughly one day before an approved participant's event;
- a check-in DM after check-in opens for approved participants who have not checked in;
- a match DM for scheduled tournament matches roughly 20–40 minutes away;
- a result-confirmation DM while an opponent's submitted result is awaiting confirmation.

Jobs use dedupe keys so the one-minute scheduler does not repeatedly message the same person for the same trigger.

## Announcements

When workspace announcements are enabled and an announcement channel is configured, the scheduler can queue:

- recently published SERVER/PUBLIC event announcements;
- match-ready announcements;
- completed/forfeit match result announcements;
- completed tournament winner announcements.

Hidden/private event visibility is not promoted through the public/server announcement scheduler. Each trigger uses a stable dedupe key so repeated scheduler passes do not repeat the same announcement.

## Temporary match channels

When temporary match channels are enabled and a Discord category is configured:

- a READY/LIVE tournament match can receive a private text channel;
- `@everyone` is denied channel view access;
- participating Discord users receive view/send/read-history access;
- team-event participants are resolved from the event's saved team roster snapshot rather than the team's current live roster;
- the intro message identifies the event, round/match, entrants, and Match Center link;
- successful creation is persisted in `discord_match_channels`;
- an ACTIVE channel is reused rather than recreated on every scheduler pass;
- COMPLETED/FORFEIT matches and completed/cancelled competitions queue channel cleanup;
- Discord 404 during deletion is treated as already-cleaned success;
- disabling creation does not prevent cleanup of channels that already exist.

The current beta is intentionally match-focused: it does not mirror normal website chat into these Discord channels.

## Role synchronization

When role sync is enabled:

### Competitor role

- approved direct participants in active events receive the configured competitor role;
- registered team-entry members use the event roster snapshot;
- after a completed/cancelled event, the role is removed only if the member has no other active competition in the same workspace;
- postponed competitions count as active for removal protection.

### Champion role

- a direct-player champion receives the configured champion role after bracket completion;
- a team champion applies the role to the saved event roster snapshot.

Role operations are queued and deduplicated like the other bot jobs. A missing role, hierarchy problem, or removed Manage Roles permission becomes a bot-job failure instead of changing website tournament history.

## Beta commands

The current command group is:

```text
/gnt status
/gnt events
/gnt matches
/gnt bracket
/gnt leaderboard
```

- `/gnt status` confirms that the Discord guild is connected to its approved Game Night Tools workspace and shows the current number of upcoming published events.
- `/gnt events` shows up to five upcoming server/public events with Discord-local timestamps and Game Night Tools links.
- `/gnt matches` shows active/upcoming tournament matches for the connected workspace.
- `/gnt bracket` points directly to the current/latest generated bracket view.
- `/gnt leaderboard` shows public player rankings; its optional type argument can switch to public team rankings.

Leaderboard commands intentionally use public competition history only. Responses are ephemeral during the initial beta so commands do not spam community channels while the integration is being tested.

## Queue and failure behavior

The worker uses authenticated claim/report endpoints rather than database access.

- jobs start PENDING;
- a worker claim changes them to PROCESSING and increments attempts;
- successful jobs become SENT;
- retryable failures wait before returning to PENDING;
- permanent failures or five failed attempts become FAILED;
- PROCESSING locks older than ten minutes are recovered;
- queue state and worker heartbeat are visible from Bot Settings.

Discord delivery is deliberately isolated from bracket/event transactions. A failed DM, announcement, channel operation, or role operation does not undo or prevent the corresponding website action.

## Requested bot permissions

The beta install requests the permissions needed by the planned v1.0 feature set: viewing/sending messages, embeds/history, managing temporary match channels, and managing optional synced roles.

Individual features must fail safely when the bot's Discord role is too low or a server administrator removes a permission after installation.

## Release testing

Use `docs/V100_TEST_PLAN.md` before moving the draft PR to ready-for-review status.
