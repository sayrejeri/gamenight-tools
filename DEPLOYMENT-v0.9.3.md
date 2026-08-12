# Deploy Game Night Tools v0.9.3

## Database

**No database migration is included in v0.9.3.**

- Do not import or rerun migrations `001`–`009`.
- Production should remain at **48 base tables**.

## Before merge

1. Confirm PR #26 exact head is the commit that passed all release checks.
2. Require **v0.9.3 description smoke** to be green on that exact head.
3. Run **Local release verification** on branch `feature/v0.9.3-rich-event-descriptions` and require TypeScript + production build success.
4. Complete the v0.9.3 manual description/security test plan.
5. Resolve any release-blocking review findings before merging.

## Merge and verify main

After PR #26 is merged:

1. Run **Local release verification** again on `main`.
2. Confirm `VERSION` is `0.9.3`.
3. Confirm the generated artifact is:

`C:\GameNightToolsRelease\gamenight-tools-v0.9.3-directadmin.zip`

Do not deploy a branch artifact in place of the post-merge `main` artifact.

## DirectAdmin deployment

1. Back up the currently deployed application files according to the normal deployment procedure.
2. Upload `gamenight-tools-v0.9.3-directadmin.zip`.
3. Extract it over the application directory, replacing the previous application files.
4. Restart the Node application.
5. Do **not** import any SQL file.

## Post-deploy smoke checks

Verify:

- existing event descriptions still preserve paragraphs/blank lines
- create/edit description toolbar and live preview load
- bold/italic/underline/strike/code/headings/lists/quotes render correctly
- literal identifiers/URLs such as `game_mode_value` and `a_b_c` keep their underscores
- `{{event.start}}` and other schedule values localize in the browser
- tournament-format/host/co-host/entrant variables resolve
- `$10,000` and other normal currency text remains unchanged
- unknown variables remain visible
- HTML/script-looking description text stays inert
- spectator pre-live/postponed/cancelled/live behavior remains correct
- authorized calendar export contains only the event title and start time
- restricted calendar/event access remains protected
- untouched legacy-only game names are preserved, while an explicit clear stays cleared

## Rollback

If a release-blocking regression is found, restore the previous application files and restart the Node application. No database rollback is necessary because v0.9.3 changes no schema/data migration.
