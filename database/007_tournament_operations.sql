-- Game Night Tools v0.6.0 tournament operations
-- Import exactly once after database/006_event_hosting_qol.sql.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE bracket_entries
  ADD COLUMN participant_key VARCHAR(80) NULL AFTER user_id,
  ADD KEY bracket_entry_participant_idx (bracket_id, participant_key);

UPDATE bracket_entries
SET participant_key = CONCAT('user-', user_id)
WHERE participant_key IS NULL AND user_id IS NOT NULL;

ALTER TABLE bracket_matches
  ADD COLUMN best_of TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER scheduled_at,
  ADD COLUMN ready_a_at DATETIME(3) NULL AFTER best_of,
  ADD COLUMN ready_b_at DATETIME(3) NULL AFTER ready_a_at,
  ADD COLUMN started_at DATETIME(3) NULL AFTER ready_b_at,
  ADD COLUMN completed_at DATETIME(3) NULL AFTER started_at,
  ADD COLUMN no_show_deadline_at DATETIME(3) NULL AFTER completed_at,
  ADD COLUMN submitted_by BIGINT UNSIGNED NULL AFTER no_show_deadline_at,
  ADD COLUMN submitted_at DATETIME(3) NULL AFTER submitted_by,
  ADD COLUMN confirmation_due_at DATETIME(3) NULL AFTER submitted_at,
  ADD KEY bracket_matches_schedule_idx (bracket_id, scheduled_at, status),
  ADD CONSTRAINT bracket_matches_submitted_by_fk FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL;

-- Pre-v0.6 READY meant the bracket slots were populated, not that both players completed a ready check.
UPDATE bracket_matches
SET status = 'PENDING'
WHERE status = 'READY' AND winner_entry_id IS NULL;

CREATE TABLE tournament_settings (
  event_id CHAR(36) NOT NULL,
  default_best_of TINYINT UNSIGNED NOT NULL DEFAULT 1,
  no_show_minutes INT UNSIGNED NOT NULL DEFAULT 15,
  confirmation_minutes INT UNSIGNED NOT NULL DEFAULT 30,
  paused_at DATETIME(3) NULL,
  paused_by BIGINT UNSIGNED NULL,
  pause_reason VARCHAR(500) NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (event_id),
  CONSTRAINT tournament_settings_event_fk FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT tournament_settings_paused_by_fk FOREIGN KEY (paused_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT tournament_settings_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE match_reports (
  id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  winner_entry_id CHAR(36) NOT NULL,
  score_a INT UNSIGNED NULL,
  score_b INT UNSIGNED NULL,
  game_results_json LONGTEXT NULL,
  proof_url VARCHAR(1000) NULL,
  notes VARCHAR(2000) NULL,
  status ENUM('PENDING', 'CONFIRMED', 'DISPUTED', 'OVERRIDDEN', 'VOID') NOT NULL DEFAULT 'PENDING',
  submitted_by BIGINT UNSIGNED NOT NULL,
  confirmed_by BIGINT UNSIGNED NULL,
  confirmed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY match_reports_match_status_idx (match_id, status, created_at),
  KEY match_reports_submitter_idx (submitted_by, created_at),
  CONSTRAINT match_reports_match_fk FOREIGN KEY (match_id) REFERENCES bracket_matches(id) ON DELETE CASCADE,
  CONSTRAINT match_reports_winner_fk FOREIGN KEY (winner_entry_id) REFERENCES bracket_entries(id) ON DELETE CASCADE,
  CONSTRAINT match_reports_submitted_by_fk FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT match_reports_confirmed_by_fk FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE match_disputes (
  id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  report_id CHAR(36) NULL,
  opened_by BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(2000) NOT NULL,
  proof_url VARCHAR(1000) NULL,
  status ENUM('OPEN', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
  resolved_by BIGINT UNSIGNED NULL,
  resolution_action ENUM('CONFIRM_REPORT', 'OVERRIDE_RESULT', 'VOID_REPORT') NULL,
  resolution_note VARCHAR(2000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolved_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY match_disputes_match_status_idx (match_id, status, created_at),
  CONSTRAINT match_disputes_match_fk FOREIGN KEY (match_id) REFERENCES bracket_matches(id) ON DELETE CASCADE,
  CONSTRAINT match_disputes_report_fk FOREIGN KEY (report_id) REFERENCES match_reports(id) ON DELETE SET NULL,
  CONSTRAINT match_disputes_opened_by_fk FOREIGN KEY (opened_by) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT match_disputes_resolved_by_fk FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
