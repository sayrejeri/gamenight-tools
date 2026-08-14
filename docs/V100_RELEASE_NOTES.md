# Game Night Tools v1.0.0 — Release Notes (Draft)

> Draft notes for PR #34. Keep this file marked draft until v1.0 scope is frozen, final version metadata is set to `1.0.0`, and the exact release head passes the full release gate.

## Platform polish

v1.0 is the first full platform-polish milestone after the competitive-event, tournament-operations, expanded-format, game-night-tools, and competitive-profile releases.

Highlights include:

- cleaner desktop/mobile dashboard navigation;
- mobile navigation feature parity for Leaderboards and Community;
- current-page mobile navigation state and reduced-motion handling;
- broader accessibility and narrow-screen wrapping improvements;
- public profile badge strip with keyboard/mobile-friendly descriptions;
- earned competitive badges surfaced directly on public profiles when privacy allows;
- expanded platform staff controls for registered server and team profiles;
- granular **Manage Server Profiles** and **Manage Team Profiles** access independent of staff title.

## Public profile badges

The compact badge strip can now surface trusted/derived account information such as:

- Game Night Tools platform staff role;
- verified/resolved game identity;
- approved team ownership;
- approved server ownership;
- Tournament Champion;
- Dynasty;
- On Fire;
- Tournament Veteran;
- Battle Tested;
- Reliable;
- Perfect Tournament.

Competitive badges remain derived from recorded tournament history rather than self-assigned profile decorations. Event-history privacy controls continue to apply.

## Optional Discord bot beta

v1.0 introduces the first optional Game Night Tools Discord bot integration.

The website remains fully usable without the bot. Installing the bot does not replace Game Night Tools, and advanced automation starts disabled per workspace.

Workspace managers can optionally enable:

- opt-in member Discord DM reminders;
- event/tournament announcements;
- private temporary match channels;
- competitor/champion role synchronization.

Users separately control whether they allow Game Night Tools bot DMs and which reminder categories they want.

## Discord commands

Connected servers can use:

```text
/gnt status
/gnt events
/gnt matches
/gnt bracket
/gnt leaderboard
```

Commands use deferred ephemeral responses so heavier leaderboard/database work can finish safely without depending on Discord's initial response window.

## Four Seasons background worker

Discord background automation runs through a separate Four Seasons worker rather than giving the bot host direct database credentials.

The worker:

- authenticates to the Game Night Tools website using a dedicated shared worker secret;
- schedules/claims durable bot jobs;
- defaults to one claimed job at a time for fresh delivery-state validation;
- reports heartbeat/version/runtime information;
- applies request timeouts and Discord rate-limit handling;
- retries website result callbacks;
- safely recovers abandoned processing locks;
- never receives the Game Night Tools database password, authentication secret, or Discord OAuth client secret.

## Safer reminder delivery

Queued Discord work is checked again immediately before delivery.

A reminder/announcement can be automatically cancelled if, for example:

- the member turned bot DMs off;
- the relevant reminder category was disabled;
- the workspace disabled the feature;
- the participant already checked in;
- the match was rescheduled/completed;
- a submitted result no longer awaits confirmation;
- event visibility/status changed;
- role/channel eligibility changed.

Discord delivery failures remain isolated from website competition state.

## Private tournament match channels

Optional match channels can be created for READY/LIVE tournament matches.

Access is limited to:

- direct match participants;
- saved team-event roster snapshot members;
- the event primary host;
- accepted, unexpired co-hosts with FULL, BRACKET, or SCOREKEEPER access;
- the Game Night Tools bot itself.

Announcement-only and view-only co-hosts do not receive private match-channel access.

Channel creation is idempotent: Game Night Tools persists the match/channel mapping and uses a hidden match-ID topic marker so a retry can reuse a channel Discord already created instead of producing duplicates.

## Bot-managed Discord roles

Optional role sync can manage:

- a Competitor role while a member is actively competing;
- a Champion role for recorded tournament champions.

Game Night Tools records the exact Discord role ID it successfully assigned. Reconciliation can therefore remove the historical bot-managed role safely when:

- role sync is disabled;
- the configured role ID changes;
- a competitor has no remaining active competition in the workspace;
- a bracket correction/reopen invalidates a previously recorded champion.

The cleanup does not guess from the current role setting.

## Bot configuration validation

Bot Settings includes a preflight validator for configured Discord targets.

It checks:

- connected guild access;
- channel/category membership and type;
- effective announcement-channel permissions after overwrites;
- Manage Channels access for the temporary-match category;
- synchronized role existence;
- managed-role restrictions;
- `@everyone` rejection;
- Manage Roles permission;
- Discord role hierarchy relative to the bot's highest role.

Partial role sync is supported: a server may intentionally configure only Competitor or only Champion role behavior.

## Bot operations and health

Workspace managers can see:

- Four Seasons worker online/offline state;
- worker version and last heartbeat;
- queued/processing/failed job counts;
- active bot-managed match-channel count;
- active bot-managed role-assignment count;
- recent bot job history and errors.

Managers can retry failed jobs after fixing configuration or manually cancel queued work. Retried work still passes current-state validation.

## Database

v1.0 migration:

```text
database/011_v100_discord_bot_beta.sql
```

Current migration 011 adds six tables:

```text
workspace_bot_settings
user_discord_bot_preferences
discord_bot_jobs
discord_bot_workers
discord_match_channels
discord_role_assignments
```

Current expected base-table count after migration 011: **56**.

Migration 011 must be imported exactly once after migration 010.

## Security and dependency hardening

The v1.0 pull-request gate now includes:

```text
npm audit --omit=dev --audit-level=high
node --check bot-worker/index.mjs
npm run typecheck
npm run build
```

alongside the existing competition/description smoke tests.

Next.js was upgraded from `16.2.12` to `16.3.1` during v1.0 development to clear the production dependency audit for the affected transitive runtime packages.

## Deployment/testing

Use:

```text
DEPLOYMENT-v1.0.0.md
docs/V100_TEST_PLAN.md
docs/DISCORD_BOT_BETA.md
```

for the final rollout/test gate.

The intended production order is website/database first, verify normal website operation without Four Seasons, then configure Discord/Four Seasons and enable bot automation intentionally per workspace.
