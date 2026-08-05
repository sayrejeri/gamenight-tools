-- Game Night Tools v0.2 expanded events and server profiles
-- Import once after database/001_initial.sql.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE workspaces
  ADD COLUMN discord_invite_url VARCHAR(500) NULL AFTER description,
  ADD COLUMN main_game_category VARCHAR(80) NULL AFTER discord_invite_url,
  ADD COLUMN roblox_community_url VARCHAR(500) NULL AFTER main_game_category,
  ADD COLUMN roblox_community_name VARCHAR(191) NULL AFTER roblox_community_url;

CREATE TABLE workspace_games (
  id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  platform_name VARCHAR(80) NOT NULL,
  game_name VARCHAR(191) NOT NULL,
  game_url VARCHAR(500) NULL,
  external_id VARCHAR(80) NULL,
  universe_id VARCHAR(80) NULL,
  thumbnail_url VARCHAR(1000) NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY workspace_games_workspace_idx (workspace_id, sort_order),
  CONSTRAINT workspace_games_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE events
  MODIFY COLUMN status ENUM(
    'DRAFT',
    'AWAITING_APPROVAL',
    'SIGNUPS_OPEN',
    'SIGNUPS_CLOSED',
    'CHECK_IN_OPEN',
    'LIVE',
    'COMPLETED',
    'POSTPONED',
    'CANCELLED'
  ) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN platform_name VARCHAR(80) NULL AFTER game_name,
  ADD COLUMN subgame_name VARCHAR(191) NULL AFTER platform_name,
  ADD COLUMN game_url VARCHAR(500) NULL AFTER subgame_name,
  ADD COLUMN game_external_id VARCHAR(80) NULL AFTER game_url,
  ADD COLUMN game_universe_id VARCHAR(80) NULL AFTER game_external_id,
  ADD COLUMN game_thumbnail_url VARCHAR(1000) NULL AFTER game_universe_id,
  ADD COLUMN required_connection_type VARCHAR(50) NULL AFTER game_thumbnail_url,
  ADD COLUMN check_in_opens_at DATETIME(3) NULL AFTER signup_deadline,
  ADD COLUMN check_in_deadline DATETIME(3) NULL AFTER check_in_opens_at,
  ADD COLUMN bracket_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER max_participants,
  ADD COLUMN bracket_format ENUM('SINGLE_ELIMINATION', 'THREE_PLAYER') NULL AFTER bracket_enabled,
  ADD COLUMN bracket_seeding_mode ENUM('RANDOM', 'MANUAL') NULL AFTER bracket_format,
  ADD COLUMN bracket_auto_generate TINYINT(1) NOT NULL DEFAULT 0 AFTER bracket_seeding_mode,
  ADD COLUMN bracket_require_check_in TINYINT(1) NOT NULL DEFAULT 0 AFTER bracket_auto_generate,
  ADD COLUMN published_at DATETIME(3) NULL AFTER approved_at,
  ADD COLUMN signups_closed_at DATETIME(3) NULL AFTER published_at;

ALTER TABLE user_connections
  ADD COLUMN profile_url VARCHAR(500) NULL AFTER display_name,
  ADD COLUMN avatar_url VARCHAR(1000) NULL AFTER profile_url;

CREATE TABLE event_templates (
  id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(500) NULL,
  platform_name VARCHAR(80) NULL,
  subgame_name VARCHAR(191) NULL,
  game_url VARCHAR(500) NULL,
  game_external_id VARCHAR(80) NULL,
  game_universe_id VARCHAR(80) NULL,
  game_thumbnail_url VARCHAR(1000) NULL,
  configuration_json LONGTEXT NOT NULL,
  is_shared TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY event_templates_workspace_idx (workspace_id, is_shared, name),
  CONSTRAINT event_templates_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT event_templates_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_preferences (
  user_id BIGINT UNSIGNED NOT NULL,
  timezone VARCHAR(100) NULL,
  time_format ENUM('AUTO', '12H', '24H') NOT NULL DEFAULT 'AUTO',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  CONSTRAINT user_preferences_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
