# Game Night Tools v0.4.0 deployment

v0.4.0 adds the first Community & Communication release: server and team chat, multiple channels, announcements, staff-only channels, replies, reactions, pins, mentions, unread tracking, message reports, moderation, slow mode, chat timeouts, and optional Discord webhook forwarding for server announcements.

## Database migration — required

This release requires `database/005_community_communication.sql`.

Import `database/005_community_communication.sql` exactly once after `database/004_access_control.sql` and before starting the v0.4.0 application code.

Do not re-import migrations 001, 002, 003, or 004.

Migration 005 creates the community channels/messages/reactions/read-tracking/timeout tables and creates General + Announcements channels for existing approved servers and teams. Future communities create those default channels automatically when chat is first opened.

## Included changes

- New Community dashboard area for server and team chats.
- Existing `chat_enabled` server/team settings now control the live website chat feature.
- Discord-backed server members can use normal server channels when chat is enabled.
- Active team roster members can use private team chat when enabled.
- General and Announcements channels are created by default.
- Community managers can create normal, announcement, and staff-only channels.
- Per-channel topic and slow mode controls.
- Server chat permissions integrate with v0.3.8 granular permissions:
  - Manage chat channels
  - Moderate messages
  - Timeout chat members
  - View staff channels
  - Post announcements
- Team chat uses active roster roles for communication access in v0.4.0.
- Send messages up to 4,000 characters.
- Replies, quick reactions, pinned messages, and author edits/deletes.
- Moderator message removal is soft-deleted and audited.
- Website message reports use the existing platform report system.
- Temporary chat timeouts from 1 minute through 7 days.
- Owners cannot be timed out from their own community.
- Unread channel counts and per-channel read tracking.
- `@siteusername` / Discord username mentions and direct replies create website notifications only when the target can access the exact channel.
- Announcement channels on server profiles can optionally forward posts through webhooks subscribed to `Community chat announcement`.
- Privacy Policy, Terms, Help walkthrough, metadata, and dashboard navigation updated for communication features.
- Chat currently refreshes on a short polling interval rather than requiring a separate WebSocket service, keeping deployment compatible with the existing DirectAdmin Node application.

## DirectAdmin update

1. Keep the current site online until `gamenight-tools-v0.4.0-directadmin.zip` has passed the final `main` Local release verification.
2. Stop the Game Night Tools Node.js application.
3. Upload and extract `gamenight-tools-v0.4.0-directadmin.zip` into `domains/gamenights.sayrejeri.com/app` and overwrite the application files.
4. Keep `.env.production.local` and `node_modules` untouched.
5. Confirm `VERSION` says `0.4.0`, a real `.next` directory exists, and `database/005_community_communication.sql` exists.
6. In phpMyAdmin, import `database/005_community_communication.sql` exactly once into the existing Game Night Tools database.
7. Restart the Node.js application.
8. Hard refresh the website and run the checklist below.

Do not run `npm install` or `next build` on DirectAdmin.

## Test checklist

- Dashboard and existing v0.3.9 features still load.
- Community appears in dashboard navigation.
- A server with chat enabled appears in Community for a Discord/server member.
- A team with chat enabled appears for an active roster member.
- General and Announcements channels exist.
- A normal member can send a message in General.
- A normal member cannot post in Announcements unless granted announcement access.
- Staff-only channels are hidden from users without staff-channel access.
- Create an additional channel, edit its topic/slow mode, and archive it.
- Send a reply and verify the recipient receives a Chat notification.
- Mention a valid site username and verify the recipient receives a Chat notification only when they can view that channel.
- Add and remove a reaction.
- Pin and unpin a message with moderation permission.
- Edit and delete your own message.
- Remove another member's message with message-moderation permission and confirm it appears in the audit log.
- Report a message and confirm the report appears for platform staff.
- Apply a short chat timeout and confirm the member can read but cannot send until the timeout expires or is removed.
- Confirm a community Owner cannot be timed out.
- Enable the `Community chat announcement` option on one server Discord webhook and post in the Announcements channel; confirm the Discord webhook receives it.
- Verify unread counts clear after opening a channel.
- Verify mobile chat/channel navigation remains usable.
