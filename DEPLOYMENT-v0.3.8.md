# Game Night Tools v0.3.8 deployment

v0.3.8 adds granular access control, editable staff permissions, a centralized Access Center, audit improvements, notification cleanup, editable multi-webhook support, Roblox main-game resolution, help tooltips, and desktop dashboard polish.

## Database migration — required

This release requires `database/004_access_control.sql`.

Import `database/004_access_control.sql` exactly once after `database/003_community_foundation.sql` and before starting the v0.3.8 application code.

Do not re-import migrations 001, 002, or 003.

## Included changes

- Separate visible staff labels from actual permissions.
- Platform and server staff can be edited without removing and re-adding them.
- Permission presets remain role-based, with individual grants/denials layered on top.
- Owner-controlled high-risk permissions protect Admin assignment, Owner management, full audit visibility, and permission editing.
- Staff cannot grant permissions they do not possess themselves.
- Final server Owner protection prevents accidental ownership lockout.
- Temporary staff access can expire automatically.
- Staff access can be suspended without deleting its configuration.
- Private server staff notes, permission copying, access previews, and last-change metadata.
- New Access Center explaining platform, server, and event co-host access.
- Basic and full audit levels with filters and security/permission/moderation severity.
- Read notifications can be individually deleted or cleared in bulk; unread notifications are protected from deletion.
- Multiple Discord webhooks per server can be added, edited, enabled/disabled, tested, replaced, and deleted independently.
- Webhook URL replacements remain encrypted and the stored secret URL is never redisplayed.
- Roblox main-game fields accept normal names, Place IDs, or Roblox game URLs. Place IDs/URLs are resolved when possible and Place/Universe IDs remain separate.
- Reusable information tooltips explain unclear fields.
- Desktop dashboard header alignment and access-management UI polish.
- Core event, bracket, participant, webhook, profile-review, code, and server-profile APIs now enforce granular permissions server-side.

## DirectAdmin update order

1. Keep the current site running until the release ZIP is ready.
2. Stop the Game Night Tools Node.js application.
3. Upload and extract `gamenight-tools-v0.3.8-directadmin.zip` into `domains/gamenights.sayrejeri.com/app`.
4. Keep `.env.production.local` and `node_modules` untouched.
5. Open phpMyAdmin and import `database/004_access_control.sql` exactly once into the existing Game Night Tools database.
6. Delete/replace the old `.next` folder with the `.next` folder from the release ZIP if the extractor did not already replace it cleanly.
7. Restart the Node.js application.
8. Hard refresh the website and test staff access before changing production staff permissions.

Do not run `npm install` or a Next.js build on DirectAdmin.

## Test checklist

- Existing Owners and Admins still have access after the migration.
- Open Platform Staff and edit an existing staff member without removing them.
- Confirm changing a visible label does not automatically change permissions.
- Confirm an Admin without `Assign Admin roles` cannot grant Admin.
- Add temporary server access and verify the expiration is displayed in Access Center.
- Suspend and restore a staff member.
- Verify the final Owner cannot be removed or demoted while no other Owner exists.
- Add at least two Discord webhooks to one server and test each independently.
- Edit a webhook label/events without replacing its secret URL.
- Disable a webhook and confirm it remains saved.
- Replace a webhook URL and send a test message.
- Read a notification, delete it, and confirm it disappears. Confirm unread notifications cannot be deleted first.
- Open the Audit Log and test server, staff, severity, action, and target filters.
- Confirm basic-audit viewers cannot see sensitive security entries.
- Submit a Roblox team main game using a Place ID or Roblox game URL and verify the canonical game title resolves.
- Check desktop header alignment and mobile navigation.
