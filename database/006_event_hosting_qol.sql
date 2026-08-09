-- Game Night Tools v0.4.1 event hosting QOL
-- Import once after database/005_community_communication.sql.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE events
  ADD COLUMN signup_mode ENUM('AUTO', 'APPROVAL') NOT NULL DEFAULT 'AUTO' AFTER join_code_required,
  ADD COLUMN cancellation_reason VARCHAR(1000) NULL AFTER signups_closed_at,
  ADD COLUMN cancelled_at DATETIME(3) NULL AFTER cancellation_reason,
  ADD COLUMN cloned_from_event_id CHAR(36) NULL AFTER cancelled_at,
  ADD KEY events_cloned_from_idx (cloned_from_event_id),
  ADD CONSTRAINT events_cloned_from_fk FOREIGN KEY (cloned_from_event_id) REFERENCES events(id) ON DELETE SET NULL;

ALTER TABLE event_participants
  ADD COLUMN staff_note VARCHAR(1000) NULL AFTER game_identity_value,
  ADD COLUMN reviewed_by BIGINT UNSIGNED NULL AFTER staff_note,
  ADD COLUMN reviewed_at DATETIME(3) NULL AFTER reviewed_by,
  ADD CONSTRAINT event_participants_reviewed_by_fk FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
