-- Game Night Tools initial schema
-- Designed for MySQL 8+ and MariaDB 10.5+.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  discord_id VARCHAR(32) NOT NULL,
  username VARCHAR(100) NOT NULL,
  global_name VARCHAR(100) NULL,
  avatar_hash VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY users_discord_id_unique (discord_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_guilds (
  user_id BIGINT UNSIGNED NOT NULL,
  guild_id VARCHAR(32) NOT NULL,
  guild_name VARCHAR(120) NOT NULL,
  icon_hash VARCHAR(255) NULL,
  is_owner TINYINT(1) NOT NULL DEFAULT 0,
  permissions_value VARCHAR(32) NOT NULL DEFAULT '0',
  synced_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, guild_id),
  KEY user_guilds_guild_id_idx (guild_id),
  CONSTRAINT user_guilds_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_connections (
  id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  source ENUM('DISCORD', 'MANUAL') NOT NULL,
  connection_type VARCHAR(50) NOT NULL,
  external_id VARCHAR(191) NULL,
  handle VARCHAR(191) NOT NULL,
  display_name VARCHAR(191) NULL,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY user_connection_unique (user_id, source, connection_type, external_id),
  KEY user_connections_user_idx (user_id),
  CONSTRAINT user_connections_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE workspaces (
  id CHAR(36) NOT NULL,
  discord_guild_id VARCHAR(32) NOT NULL,
  name VARCHAR(120) NOT NULL,
  icon_url VARCHAR(500) NULL,
  banner_url VARCHAR(500) NULL,
  description TEXT NULL,
  timezone VARCHAR(100) NOT NULL DEFAULT 'America/Detroit',
  default_staff_approval_required TINYINT(1) NOT NULL DEFAULT 1,
  bot_connected TINYINT(1) NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY workspaces_guild_unique (discord_guild_id),
  CONSTRAINT workspaces_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE workspace_owner_claims (
  workspace_id CHAR(36) NOT NULL,
  discord_id VARCHAR(32) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (workspace_id, discord_id),
  CONSTRAINT workspace_owner_claims_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT workspace_owner_claims_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE workspace_members (
  workspace_id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('OWNER', 'ADMIN', 'STAFF', 'HOST', 'REFEREE', 'VIEWER') NOT NULL,
  status ENUM('ACTIVE', 'SUSPENDED', 'REMOVED') NOT NULL DEFAULT 'ACTIVE',
  approved_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (workspace_id, user_id),
  KEY workspace_members_user_idx (user_id),
  CONSTRAINT workspace_members_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT workspace_members_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT workspace_members_approved_by_fk FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE events (
  id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT NULL,
  game_name VARCHAR(160) NULL,
  status ENUM('DRAFT', 'AWAITING_APPROVAL', 'SIGNUPS_OPEN', 'CHECK_IN_OPEN', 'LIVE', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  visibility ENUM('SERVER', 'CODE_ONLY', 'UNLISTED', 'PUBLIC', 'STAFF_ONLY') NOT NULL DEFAULT 'SERVER',
  join_code_required TINYINT(1) NOT NULL DEFAULT 1,
  starts_at DATETIME(3) NULL,
  signup_deadline DATETIME(3) NULL,
  max_participants INT UNSIGNED NULL,
  timezone VARCHAR(100) NOT NULL DEFAULT 'America/Detroit',
  rules_json LONGTEXT NULL,
  staff_approval_required TINYINT(1) NOT NULL DEFAULT 1,
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME(3) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  primary_host_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY events_workspace_idx (workspace_id),
  KEY events_status_starts_idx (status, starts_at),
  CONSTRAINT events_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT events_approved_by_fk FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT events_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT events_primary_host_fk FOREIGN KEY (primary_host_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE event_cohosts (
  id CHAR(36) NOT NULL,
  event_id CHAR(36) NOT NULL,
  invited_user_id BIGINT UNSIGNED NULL,
  invited_discord_id VARCHAR(32) NOT NULL,
  permission_level ENUM('FULL', 'BRACKET', 'SIGNUPS', 'SCOREKEEPER', 'ANNOUNCEMENTS', 'VIEW_ONLY') NOT NULL DEFAULT 'FULL',
  status ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED') NOT NULL DEFAULT 'PENDING',
  invited_by BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NULL,
  responded_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY event_cohost_unique (event_id, invited_discord_id),
  KEY event_cohosts_invited_user_idx (invited_user_id),
  CONSTRAINT event_cohosts_event_fk FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT event_cohosts_invited_user_fk FOREIGN KEY (invited_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT event_cohosts_invited_by_fk FOREIGN KEY (invited_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invite_codes (
  id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  target_event_id CHAR(36) NULL,
  code_hash CHAR(64) NOT NULL,
  code_prefix VARCHAR(12) NOT NULL,
  code_type ENUM('STAFF', 'HOST', 'EVENT') NOT NULL,
  grant_role ENUM('ADMIN', 'STAFF', 'HOST', 'REFEREE', 'VIEWER') NULL,
  max_uses INT UNSIGNED NULL,
  use_count INT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME(3) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  note VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY invite_codes_hash_unique (code_hash),
  KEY invite_codes_workspace_idx (workspace_id),
  CONSTRAINT invite_codes_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT invite_codes_event_fk FOREIGN KEY (target_event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT invite_codes_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invite_code_redemptions (
  id CHAR(36) NOT NULL,
  invite_code_id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  redeemed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY invite_code_user_unique (invite_code_id, user_id),
  CONSTRAINT invite_code_redemptions_code_fk FOREIGN KEY (invite_code_id) REFERENCES invite_codes(id) ON DELETE CASCADE,
  CONSTRAINT invite_code_redemptions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE event_participants (
  event_id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN', 'NO_SHOW', 'DISQUALIFIED') NOT NULL DEFAULT 'PENDING',
  game_identity_type VARCHAR(50) NULL,
  game_identity_value VARCHAR(191) NULL,
  joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  checked_in_at DATETIME(3) NULL,
  PRIMARY KEY (event_id, user_id),
  KEY event_participants_user_idx (user_id),
  CONSTRAINT event_participants_event_fk FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT event_participants_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE brackets (
  id CHAR(36) NOT NULL,
  event_id CHAR(36) NOT NULL,
  format ENUM('SINGLE_ELIMINATION', 'THREE_PLAYER') NOT NULL DEFAULT 'SINGLE_ELIMINATION',
  status ENUM('DRAFT', 'GENERATED', 'LIVE', 'COMPLETED') NOT NULL DEFAULT 'DRAFT',
  seeding_mode ENUM('RANDOM', 'MANUAL') NOT NULL DEFAULT 'RANDOM',
  settings_json LONGTEXT NULL,
  generated_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY brackets_event_unique (event_id),
  CONSTRAINT brackets_event_fk FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE bracket_entries (
  id CHAR(36) NOT NULL,
  bracket_id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  display_name VARCHAR(191) NOT NULL,
  seed_number INT UNSIGNED NULL,
  slot_number INT UNSIGNED NOT NULL,
  status ENUM('ACTIVE', 'ELIMINATED', 'ADVANCED', 'WITHDRAWN', 'DISQUALIFIED') NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (id),
  UNIQUE KEY bracket_slot_unique (bracket_id, slot_number),
  CONSTRAINT bracket_entries_bracket_fk FOREIGN KEY (bracket_id) REFERENCES brackets(id) ON DELETE CASCADE,
  CONSTRAINT bracket_entries_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE bracket_matches (
  id CHAR(36) NOT NULL,
  bracket_id CHAR(36) NOT NULL,
  round_number INT UNSIGNED NOT NULL,
  match_number INT UNSIGNED NOT NULL,
  participant_a_entry_id CHAR(36) NULL,
  participant_b_entry_id CHAR(36) NULL,
  participant_c_entry_id CHAR(36) NULL,
  winner_entry_id CHAR(36) NULL,
  status ENUM('PENDING', 'READY', 'LIVE', 'AWAITING_CONFIRMATION', 'DISPUTED', 'COMPLETED', 'FORFEIT') NOT NULL DEFAULT 'PENDING',
  result_json LONGTEXT NULL,
  scheduled_at DATETIME(3) NULL,
  decided_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY bracket_match_unique (bracket_id, round_number, match_number),
  CONSTRAINT bracket_matches_bracket_fk FOREIGN KEY (bracket_id) REFERENCES brackets(id) ON DELETE CASCADE,
  CONSTRAINT bracket_matches_a_fk FOREIGN KEY (participant_a_entry_id) REFERENCES bracket_entries(id) ON DELETE SET NULL,
  CONSTRAINT bracket_matches_b_fk FOREIGN KEY (participant_b_entry_id) REFERENCES bracket_entries(id) ON DELETE SET NULL,
  CONSTRAINT bracket_matches_c_fk FOREIGN KEY (participant_c_entry_id) REFERENCES bracket_entries(id) ON DELETE SET NULL,
  CONSTRAINT bracket_matches_winner_fk FOREIGN KEY (winner_entry_id) REFERENCES bracket_entries(id) ON DELETE SET NULL,
  CONSTRAINT bracket_matches_decided_by_fk FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rule_acceptances (
  id CHAR(36) NOT NULL,
  event_id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  rules_version_hash CHAR(64) NOT NULL,
  accepted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY rule_acceptance_unique (event_id, user_id, rules_version_hash),
  CONSTRAINT rule_acceptances_event_fk FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT rule_acceptances_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  event_id CHAR(36) NULL,
  notification_type VARCHAR(60) NOT NULL,
  title VARCHAR(191) NOT NULL,
  message TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  read_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY notifications_user_read_idx (user_id, is_read, created_at),
  CONSTRAINT notifications_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT notifications_event_fk FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE event_reminder_preferences (
  event_id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  website_enabled TINYINT(1) NOT NULL DEFAULT 1,
  discord_dm_enabled TINYINT(1) NOT NULL DEFAULT 0,
  reminder_24h TINYINT(1) NOT NULL DEFAULT 1,
  reminder_1h TINYINT(1) NOT NULL DEFAULT 1,
  reminder_15m TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (event_id, user_id),
  CONSTRAINT event_reminders_event_fk FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT event_reminders_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NULL,
  event_id CHAR(36) NULL,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  action_name VARCHAR(100) NOT NULL,
  target_type VARCHAR(80) NULL,
  target_id VARCHAR(64) NULL,
  details_json LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY audit_logs_workspace_created_idx (workspace_id, created_at),
  KEY audit_logs_event_created_idx (event_id, created_at),
  CONSTRAINT audit_logs_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
  CONSTRAINT audit_logs_event_fk FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  CONSTRAINT audit_logs_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
