-- Game Night Tools v0.3.8 access control and staff management
-- Import once after database/003_community_foundation.sql.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE platform_staff_roles
  ADD COLUMN display_label VARCHAR(80) NULL AFTER role,
  ADD COLUMN permissions_json LONGTEXT NULL AFTER display_label,
  ADD COLUMN expires_at DATETIME(3) NULL AFTER status,
  ADD COLUMN suspended_reason VARCHAR(500) NULL AFTER expires_at,
  ADD COLUMN last_changed_by BIGINT UNSIGNED NULL AFTER assigned_by,
  ADD COLUMN last_changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER last_changed_by,
  ADD KEY platform_staff_expires_idx (status, expires_at),
  ADD CONSTRAINT platform_staff_last_changed_by_fk FOREIGN KEY (last_changed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE workspace_members
  ADD COLUMN display_label VARCHAR(80) NULL AFTER role,
  ADD COLUMN permissions_json LONGTEXT NULL AFTER display_label,
  ADD COLUMN expires_at DATETIME(3) NULL AFTER status,
  ADD COLUMN notes VARCHAR(500) NULL AFTER expires_at,
  ADD COLUMN last_changed_by BIGINT UNSIGNED NULL AFTER approved_by,
  ADD COLUMN last_changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER last_changed_by,
  ADD KEY workspace_members_expires_idx (workspace_id, status, expires_at),
  ADD CONSTRAINT workspace_members_last_changed_by_fk FOREIGN KEY (last_changed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE notifications
  ADD COLUMN dismissed_at DATETIME(3) NULL AFTER read_at,
  ADD KEY notifications_user_dismissed_idx (user_id, dismissed_at, created_at);

ALTER TABLE audit_logs
  ADD COLUMN severity ENUM('INFO', 'MODERATION', 'PERMISSIONS', 'SECURITY') NOT NULL DEFAULT 'INFO' AFTER action_name,
  ADD COLUMN is_sensitive TINYINT(1) NOT NULL DEFAULT 0 AFTER severity,
  ADD KEY audit_logs_severity_created_idx (severity, created_at);

-- Preserve the behavior users already had before granular permissions existed.
UPDATE platform_staff_roles
SET display_label = CASE role
  WHEN 'OWNER' THEN 'Owner'
  WHEN 'ADMIN' THEN 'Admin'
  WHEN 'REVIEWER' THEN 'Profile Reviewer'
  WHEN 'MODERATOR' THEN 'Moderator'
  WHEN 'SUPPORT' THEN 'Support'
  ELSE role
END
WHERE display_label IS NULL;

UPDATE workspace_members
SET display_label = CASE role
  WHEN 'OWNER' THEN 'Owner'
  WHEN 'ADMIN' THEN 'Admin'
  WHEN 'STAFF' THEN 'Staff'
  WHEN 'HOST' THEN 'Game Night Host'
  WHEN 'REFEREE' THEN 'Referee'
  WHEN 'VIEWER' THEN 'Viewer'
  ELSE role
END
WHERE display_label IS NULL;
