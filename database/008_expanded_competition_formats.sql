-- Game Night Tools v0.7.0 expanded competition formats
-- Import exactly once after database/007_tournament_operations.sql.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE events
  MODIFY COLUMN bracket_format ENUM(
    'SINGLE_ELIMINATION',
    'THREE_PLAYER',
    'DOUBLE_ELIMINATION',
    'ROUND_ROBIN',
    'GROUPS_PLAYOFFS'
  ) NULL,
  ADD COLUMN bracket_entry_mode ENUM('PLAYER', 'TEAM') NOT NULL DEFAULT 'PLAYER' AFTER bracket_format,
  ADD COLUMN bracket_group_count TINYINT UNSIGNED NOT NULL DEFAULT 2 AFTER bracket_require_check_in,
  ADD COLUMN bracket_advancers_per_group TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER bracket_group_count,
  ADD COLUMN bracket_tiebreak_mode ENUM('HEAD_TO_HEAD_THEN_SEED', 'SEED') NOT NULL DEFAULT 'HEAD_TO_HEAD_THEN_SEED' AFTER bracket_advancers_per_group;

ALTER TABLE brackets
  MODIFY COLUMN format ENUM(
    'SINGLE_ELIMINATION',
    'THREE_PLAYER',
    'DOUBLE_ELIMINATION',
    'ROUND_ROBIN',
    'GROUPS_PLAYOFFS'
  ) NOT NULL DEFAULT 'SINGLE_ELIMINATION';

ALTER TABLE bracket_entries
  ADD COLUMN team_id CHAR(36) NULL AFTER user_id,
  ADD KEY bracket_entries_team_idx (team_id),
  ADD CONSTRAINT bracket_entries_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

ALTER TABLE bracket_matches
  ADD COLUMN stage_key VARCHAR(40) NULL AFTER match_number,
  ADD COLUMN stage_label VARCHAR(100) NULL AFTER stage_key,
  ADD COLUMN group_key VARCHAR(20) NULL AFTER stage_label,
  ADD COLUMN bracket_side ENUM('MAIN', 'WINNERS', 'LOSERS', 'GROUP', 'PLAYOFF', 'FINALS') NOT NULL DEFAULT 'MAIN' AFTER group_key,
  ADD COLUMN stage_round_number INT UNSIGNED NULL AFTER bracket_side,
  ADD KEY bracket_matches_stage_idx (bracket_id, bracket_side, stage_round_number, match_number),
  ADD KEY bracket_matches_group_idx (bracket_id, group_key, stage_round_number);

UPDATE bracket_matches
SET stage_key = 'main',
    stage_label = CONCAT('Round ', round_number),
    bracket_side = 'MAIN',
    stage_round_number = round_number
WHERE stage_key IS NULL;

CREATE TABLE event_team_entries (
  event_id CHAR(36) NOT NULL,
  team_id CHAR(36) NOT NULL,
  status ENUM('REGISTERED', 'WITHDRAWN', 'DISQUALIFIED') NOT NULL DEFAULT 'REGISTERED',
  seed_number INT UNSIGNED NULL,
  captain_user_id BIGINT UNSIGNED NULL,
  registered_by BIGINT UNSIGNED NOT NULL,
  roster_json LONGTEXT NULL,
  registered_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (event_id, team_id),
  KEY event_team_entries_team_idx (team_id, status),
  KEY event_team_entries_captain_idx (captain_user_id),
  CONSTRAINT event_team_entries_event_fk FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT event_team_entries_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT event_team_entries_captain_fk FOREIGN KEY (captain_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT event_team_entries_registered_by_fk FOREIGN KEY (registered_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE event_public_share_links (
  event_id CHAR(36) NOT NULL,
  token CHAR(48) NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  expires_at DATETIME(3) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (event_id),
  UNIQUE KEY event_public_share_token_unique (token),
  KEY event_public_share_enabled_idx (is_enabled, expires_at),
  CONSTRAINT event_public_share_event_fk FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT event_public_share_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
