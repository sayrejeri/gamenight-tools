# Game Night Tools v0.9.1 deployment

## Database

No database migration is required for v0.9.1.

- Keep migrations 001–009 as already applied.
- Do not rerun any existing migration.
- Expected database count remains 48 base tables.

## Release gate

1. Automated review has no unresolved P1/P2 findings on the final hotfix head.
2. TypeScript and production build pass.
3. Run Local release verification on `hotfix/v0.9.1-security-integrity-hardening`.
4. Merge only after the branch verification is green.
5. Run Local release verification again on `main`.

Expected artifact:

`C:\GameNightToolsRelease\gamenight-tools-v0.9.1-directadmin.zip`

## DirectAdmin

1. Back up the current application files and database.
2. Upload the verified v0.9.1 DirectAdmin ZIP to the existing application directory.
3. Extract/overwrite the application files.
4. Do not import SQL.
5. Restart the Node application.
6. Run the smoke checks in `docs/V091_TEST_PLAN.md`.
