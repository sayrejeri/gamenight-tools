# Game Night Tools v0.7.1 Deployment

v0.7.1 is a small hotfix for public spectator-link UX and notification delete icons.

## Included fixes

- Valid spectator links no longer fall through to the generic Next.js 404 merely because the tournament has not gone live yet, was postponed, or was cancelled.
- Public competition data is still only rendered when **both** the event and bracket are `LIVE` or `COMPLETED`.
- Cancelled/postponed/not-yet-live links show a safe public status message without exposing proof, disputes, staff controls, private notes, or participant account data.
- Notification delete actions use the full `🗑️` emoji presentation.

## Database

**No database migration is required for v0.7.1.**

Do not rerun migrations 001–008.

## Release verification

Run **Local release verification** for:

`hotfix/v0.7.1-spectator-notifications`

Expected artifact:

`C:\GameNightToolsRelease\gamenight-tools-v0.7.1-directadmin.zip`

After merging, run Local release verification again on `main` before uploading the final ZIP.
