# Game Night Tools v1.0 — Discord Bot Beta Setup

The v1.0 bot beta is designed to remain **optional per server workspace**. The website continues to work without the bot.

## Architecture

The first beta uses Discord's HTTP/REST APIs instead of requiring a second always-on gateway process:

- the existing Discord application can also own the bot user;
- workspace managers install the bot only where they want it;
- Game Night Tools checks the installation with the bot token;
- guild slash commands are registered through Discord REST;
- Discord sends slash-command interactions to the Game Night Tools HTTPS endpoint;
- future reminders, announcements, temporary match channels, and role sync can reuse the same bot REST foundation.

## Required environment values

Keep these server-side only:

```text
DISCORD_CLIENT_ID=<existing Discord application/client ID>
DISCORD_BOT_TOKEN=<bot token from the Discord Developer Portal>
DISCORD_PUBLIC_KEY=<application public key from the Discord Developer Portal>
```

`DISCORD_BOT_TOKEN` must never be committed to GitHub or pasted into a public ticket/log. Rotate it immediately if it is exposed.

## Discord Developer Portal

Using the same Discord application that already handles Game Night Tools OAuth:

1. Open the application's **Bot** section and create/enable the bot user if needed.
2. Copy/reset the bot token and place it in `DISCORD_BOT_TOKEN` on the server.
3. Copy the application's public key into `DISCORD_PUBLIC_KEY`.
4. Set the application's **Interactions Endpoint URL** to:

```text
https://gamenights.sayrejeri.com/api/discord/interactions
```

Discord sends a signed PING request to verify that endpoint. The endpoint rejects requests that do not have a valid Discord Ed25519 signature.

5. Restart the Game Night Tools Node application after changing environment variables.

## Installing into a workspace

A user with **Manage Server Profile** permission can open the server profile in Game Night Tools and use the **Discord bot** card.

1. Select **Install Discord bot**.
2. Discord locks the invite to that workspace's Discord guild ID.
3. Approve the requested bot permissions.
4. Return to Game Night Tools.
5. Select **Check connection**.

The check confirms the bot can access the Discord guild, updates `workspaces.bot_connected`, writes an audit entry when connection state changes, and bulk-registers the current guild slash commands.

## Initial beta commands

The first command group is:

```text
/gnt status
/gnt events
```

- `/gnt status` confirms that the Discord guild is connected to its approved Game Night Tools workspace and shows the current number of upcoming published events.
- `/gnt events` shows up to five upcoming server/public events with Discord-local timestamps and Game Night Tools links.

Responses are ephemeral during the initial beta so commands do not spam community channels while the integration is being tested.

## Requested bot permissions

The beta install currently requests the permissions needed by the planned v1.0 feature set: viewing/sending messages, embeds/history, managing temporary match channels, and managing optional synced roles.

Individual features should still fail safely when the bot's Discord role is too low or a server administrator removes a permission after installation.

## No database migration for this first slice

The existing `workspaces.bot_connected` field is reused. A later v1.0 migration may be added when per-workspace bot feature toggles, channel mappings, role mappings, or DM preferences are persisted.
