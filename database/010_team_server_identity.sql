-- Game Night Tools v0.9.5 — Teams & Server Identity
-- Import ONCE after database/009_game_night_tools_series.sql.
-- This migration adds two base tables (48 -> 50) and one team column.
-- Do not rerun migrations 001-009.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE platform_settings (
  setting_key VARCHAR(80) NOT NULL,
  setting_value VARCHAR(500) NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (setting_key),
  CONSTRAINT platform_settings_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO platform_settings (setting_key, setting_value)
VALUES ('server_profile_approval_required', '1');

ALTER TABLE teams
  ADD COLUMN private_server_url VARCHAR(1000) NULL AFTER home_workspace_id;

CREATE TABLE team_workspace_affiliations (
  team_id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'DENIED', 'REVOKED') NOT NULL DEFAULT 'PENDING',
  initiated_by_scope ENUM('TEAM', 'WORKSPACE') NOT NULL,
  initiated_by_user_id BIGINT UNSIGNED NOT NULL,
  reviewed_by_user_id BIGINT UNSIGNED NULL,
  requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reviewed_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (team_id, workspace_id),
  KEY team_workspace_affiliations_workspace_idx (workspace_id, status, updated_at),
  KEY team_workspace_affiliations_team_idx (team_id, status, updated_at),
  CONSTRAINT team_workspace_affiliations_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT team_workspace_affiliations_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT team_workspace_affiliations_initiator_fk FOREIGN KEY (initiated_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT team_workspace_affiliations_reviewer_fk FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing home-server relationships were already approved by platform/server staff.
-- Carry them forward so v0.9.5 does not make existing teams request approval again.
INSERT IGNORE INTO team_workspace_affiliations
  (team_id, workspace_id, status, initiated_by_scope, initiated_by_user_id, reviewed_at)
SELECT t.id, t.home_workspace_id, 'APPROVED', 'TEAM', t.owner_user_id, CURRENT_TIMESTAMP(3)
FROM teams t
INNER JOIN workspaces w ON w.id = t.home_workspace_id
WHERE t.home_workspace_id IS NOT NULL
  AND t.profile_status = 'APPROVED'
  AND w.profile_status = 'APPROVED';
