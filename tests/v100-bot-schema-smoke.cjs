const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(process.cwd(), "database", "011_v100_discord_bot_beta.sql");
const sql = fs.readFileSync(migrationPath, "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const expectedTables = [
  "workspace_bot_settings",
  "user_discord_bot_preferences",
  "discord_bot_jobs",
  "discord_bot_workers",
  "discord_match_channels",
  "discord_role_assignments",
];

const createdTables = [...sql.matchAll(/CREATE\s+TABLE\s+([a-z0-9_]+)/gi)].map((match) => match[1].toLowerCase());
assert(createdTables.length === expectedTables.length, `Migration 011 should create exactly ${expectedTables.length} tables; found ${createdTables.length}: ${createdTables.join(", ")}`);
for (const table of expectedTables) {
  assert(createdTables.includes(table), `Migration 011 is missing CREATE TABLE ${table}.`);
}

for (const requiredFragment of [
  "match_id CHAR(36) NULL",
  "role_kind ENUM('COMPETITOR','CHAMPION') NULL",
  "discord_role_id VARCHAR(32) NULL",
  "CONSTRAINT discord_bot_jobs_match_fk FOREIGN KEY (match_id) REFERENCES bracket_matches(id) ON DELETE CASCADE",
  "CREATE TABLE discord_match_channels",
  "CONSTRAINT discord_match_channels_match_fk FOREIGN KEY (match_id) REFERENCES bracket_matches(id) ON DELETE CASCADE",
  "CREATE TABLE discord_role_assignments",
  "role_kind ENUM('COMPETITOR','CHAMPION') NOT NULL",
  "role_id VARCHAR(32) NOT NULL",
  "status ENUM('ACTIVE','REMOVED') NOT NULL DEFAULT 'ACTIVE'",
  "PRIMARY KEY (workspace_id, user_id, role_kind, role_id)",
]) {
  assert(sql.includes(requiredFragment), `Migration 011 is missing required schema fragment: ${requiredFragment}`);
}

assert(!/DROP\s+TABLE/i.test(sql), "Migration 011 must not drop existing tables.");
assert(!/DROP\s+COLUMN/i.test(sql), "Migration 011 must not drop existing columns.");

console.log(`v1.0 bot schema smoke passed: ${expectedTables.length} expected tables and required match/role tracking are present.`);
