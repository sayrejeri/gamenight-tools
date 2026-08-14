-- Game Night Tools v1.0 Discord bot beta
-- Import once after database/010_team_server_identity.sql.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE workspace_bot_settings (
  workspace_id CHAR(36) NOT NULL,
  dm_reminders_enabled TINYINT(1) NOT NULL DEFAULT 0,
  announcements_enabled TINYINT(1) NOT NULL DEFAULT 0,
  temporary_match_channels_enabled TINYINT(1) NOT NULL DEFAULT 0,
  role_sync_enabled TINYINT(1) NOT NULL DEFAULT 0,
  announcement_channel_id VARCHAR(32) NULL,
  match_category_id VARCHAR(32) NULL,
  competitor_role_id VARCHAR(32) NULL,
  champion_role_id VARCHAR(32) NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (workspace_id),
  CONSTRAINT workspace_bot_settings_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT workspace_bot_settings_user_fk FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_discord_bot_preferences (
  user_id BIGINT UNSIGNED NOT NULL,
  dm_reminders_enabled TINYINT(1) NOT NULL DEFAULT 0,
  signup_reminders TINYINT(1) NOT NULL DEFAULT 1,
  checkin_reminders TINYINT(1) NOT NULL DEFAULT 1,
  match_reminders TINYINT(1) NOT NULL DEFAULT 1,
  result_reminders TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  CONSTRAINT user_discord_bot_preferences_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE discord_bot_jobs (
  id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NULL,
  user_id BIGINT UNSIGNED NULL,
  event_id CHAR(36) NULL,
  job_type ENUM('DM_SIGNUP_REMINDER','DM_CHECKIN_REMINDER','DM_MATCH_REMINDER','DM_RESULT_REMINDER','ANNOUNCE_EVENT','ANNOUNCE_MATCH_READY','ANNOUNCE_RESULT','ANNOUNCE_WINNER','CREATE_MATCH_CHANNEL','DELETE_MATCH_CHANNEL','SYNC_ROLE') NOT NULL,
  dedupe_key VARCHAR(191) NULL,
  payload_json LONGTEXT NULL,
  scheduled_at DATETIME(3) NOT NULL,
  status ENUM('PENDING','PROCESSING','SENT','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  locked_at DATETIME(3) NULL,
  locked_by VARCHAR(120) NULL,
  completed_at DATETIME(3) NULL,
  last_error VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY discord_bot_jobs_dedupe_unique (dedupe_key),
  KEY discord_bot_jobs_due_idx (status, scheduled_at),
  KEY discord_bot_jobs_workspace_idx (workspace_id, created_at),
  KEY discord_bot_jobs_user_idx (user_id, created_at),
  CONSTRAINT discord_bot_jobs_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT discord_bot_jobs_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT discord_bot_jobs_event_fk FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE discord_bot_workers (
  worker_id VARCHAR(120) NOT NULL,
  version VARCHAR(40) NULL,
  metadata_json LONGTEXT NULL,
  first_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (worker_id),
  KEY discord_bot_workers_seen_idx (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE discord_match_channels (
  match_id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  event_id CHAR(36) NOT NULL,
  channel_id VARCHAR(32) NOT NULL,
  status ENUM('ACTIVE','DELETED') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (match_id),
  UNIQUE KEY discord_match_channels_channel_unique (channel_id),
  KEY discord_match_channels_workspace_idx (workspace_id, status, created_at),
  KEY discord_match_channels_event_idx (event_id, status),
  CONSTRAINT discord_match_channels_match_fk FOREIGN KEY (match_id) REFERENCES bracket_matches(id) ON DELETE CASCADE,
  CONSTRAINT discord_match_channels_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT discord_match_channels_event_fk FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
