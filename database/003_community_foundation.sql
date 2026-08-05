-- Game Night Tools v0.3 community foundation
-- Import once after database/002_expanded_events.sql.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE users
  ADD COLUMN site_username VARCHAR(40) NULL AFTER global_name,
  ADD COLUMN bio VARCHAR(500) NULL AFTER avatar_hash,
  ADD COLUMN banner_url VARCHAR(1000) NULL AFTER bio,
  ADD COLUMN main_platform VARCHAR(80) NULL AFTER banner_url,
  ADD COLUMN profile_visibility ENUM('PUBLIC', 'MEMBERS', 'PRIVATE') NOT NULL DEFAULT 'PUBLIC' AFTER main_platform,
  ADD COLUMN onboarding_completed TINYINT(1) NOT NULL DEFAULT 0 AFTER profile_visibility,
  ADD COLUMN account_status ENUM('ACTIVE', 'SUSPENDED', 'BANNED') NOT NULL DEFAULT 'ACTIVE' AFTER onboarding_completed,
  ADD COLUMN last_seen_at DATETIME(3) NULL AFTER last_login_at,
  ADD UNIQUE KEY users_site_username_unique (site_username);

ALTER TABLE user_preferences
  ADD COLUMN show_game_identities TINYINT(1) NOT NULL DEFAULT 1 AFTER time_format,
  ADD COLUMN show_event_history TINYINT(1) NOT NULL DEFAULT 1 AFTER show_game_identities,
  ADD COLUMN show_teams TINYINT(1) NOT NULL DEFAULT 1 AFTER show_event_history,
  ADD COLUMN show_servers TINYINT(1) NOT NULL DEFAULT 1 AFTER show_teams,
  ADD COLUMN discoverable TINYINT(1) NOT NULL DEFAULT 1 AFTER show_servers,
  ADD COLUMN allow_profile_messages TINYINT(1) NOT NULL DEFAULT 1 AFTER discoverable,
  ADD COLUMN notification_preferences_json LONGTEXT NULL AFTER allow_profile_messages;

ALTER TABLE workspaces
  ADD COLUMN profile_status ENUM('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'DENIED', 'SUSPENDED', 'ARCHIVED') NOT NULL DEFAULT 'APPROVED' AFTER roblox_community_name,
  ADD COLUMN verification_level ENUM('APPROVED', 'OWNERSHIP_VERIFIED', 'OFFICIAL', 'PARTNER') NULL AFTER profile_status,
  ADD COLUMN is_featured TINYINT(1) NOT NULL DEFAULT 0 AFTER verification_level,
  ADD COLUMN chat_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER is_featured,
  ADD COLUMN suggestions_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER chat_enabled;

ALTER TABLE notifications
  ADD COLUMN category VARCHAR(60) NULL AFTER notification_type,
  ADD COLUMN action_url VARCHAR(500) NULL AFTER message;

CREATE TABLE platform_staff_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('OWNER', 'ADMIN', 'REVIEWER', 'MODERATOR', 'SUPPORT') NOT NULL,
  status ENUM('ACTIVE', 'SUSPENDED', 'REMOVED') NOT NULL DEFAULT 'ACTIVE',
  assigned_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  CONSTRAINT platform_staff_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT platform_staff_assigned_by_fk FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE teams (
  id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  tag VARCHAR(16) NULL,
  description TEXT NULL,
  logo_url VARCHAR(1000) NULL,
  banner_url VARCHAR(1000) NULL,
  main_platform VARCHAR(80) NULL,
  main_game VARCHAR(191) NULL,
  region VARCHAR(80) NULL,
  recruiting_status ENUM('OPEN', 'INVITE_ONLY', 'CLOSED') NOT NULL DEFAULT 'INVITE_ONLY',
  profile_status ENUM('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'DENIED', 'SUSPENDED', 'ARCHIVED') NOT NULL DEFAULT 'PENDING',
  verification_level ENUM('APPROVED', 'OWNERSHIP_VERIFIED', 'OFFICIAL', 'PARTNER') NULL,
  chat_enabled TINYINT(1) NOT NULL DEFAULT 0,
  suggestions_enabled TINYINT(1) NOT NULL DEFAULT 1,
  home_workspace_id CHAR(36) NULL,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY teams_slug_unique (slug),
  KEY teams_owner_idx (owner_user_id),
  KEY teams_workspace_idx (home_workspace_id),
  KEY teams_status_idx (profile_status, recruiting_status),
  CONSTRAINT teams_workspace_fk FOREIGN KEY (home_workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
  CONSTRAINT teams_owner_fk FOREIGN KEY (owner_user_id) REFERENCES users(id),
  CONSTRAINT teams_reviewer_fk FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_members (
  team_id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('OWNER', 'MANAGER', 'CAPTAIN', 'PLAYER', 'SUBSTITUTE', 'COACH') NOT NULL DEFAULT 'PLAYER',
  status ENUM('INVITED', 'ACTIVE', 'DECLINED', 'REMOVED') NOT NULL DEFAULT 'INVITED',
  invited_by BIGINT UNSIGNED NULL,
  joined_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (team_id, user_id),
  KEY team_members_user_idx (user_id, status),
  CONSTRAINT team_members_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT team_members_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT team_members_invited_by_fk FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE team_applications (
  id CHAR(36) NOT NULL,
  team_id CHAR(36) NOT NULL,
  applicant_user_id BIGINT UNSIGNED NOT NULL,
  desired_role ENUM('PLAYER', 'SUBSTITUTE', 'COACH', 'MANAGER') NOT NULL DEFAULT 'PLAYER',
  message VARCHAR(1000) NULL,
  status ENUM('PENDING', 'ACCEPTED', 'DENIED', 'WITHDRAWN') NOT NULL DEFAULT 'PENDING',
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY team_application_open_unique (team_id, applicant_user_id, status),
  CONSTRAINT team_applications_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT team_applications_user_fk FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT team_applications_reviewer_fk FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE profile_requests (
  id CHAR(36) NOT NULL,
  request_type ENUM('SERVER', 'TEAM') NOT NULL,
  applicant_user_id BIGINT UNSIGNED NOT NULL,
  requested_name VARCHAR(120) NOT NULL,
  requested_slug VARCHAR(80) NULL,
  discord_guild_id VARCHAR(32) NULL,
  description TEXT NULL,
  logo_url VARCHAR(1000) NULL,
  banner_url VARCHAR(1000) NULL,
  main_platform VARCHAR(80) NULL,
  main_game VARCHAR(191) NULL,
  discord_invite_url VARCHAR(500) NULL,
  roblox_community_url VARCHAR(500) NULL,
  home_workspace_id CHAR(36) NULL,
  payload_json LONGTEXT NULL,
  status ENUM('DRAFT', 'PENDING', 'CHANGES_REQUESTED', 'APPROVED', 'DENIED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  reviewer_user_id BIGINT UNSIGNED NULL,
  review_reason VARCHAR(1000) NULL,
  reviewed_at DATETIME(3) NULL,
  created_profile_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY profile_requests_status_idx (status, request_type, created_at),
  KEY profile_requests_applicant_idx (applicant_user_id, created_at),
  CONSTRAINT profile_requests_applicant_fk FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT profile_requests_reviewer_fk FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT profile_requests_workspace_fk FOREIGN KEY (home_workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE suggestions (
  id CHAR(36) NOT NULL,
  author_user_id BIGINT UNSIGNED NOT NULL,
  scope_type ENUM('PLATFORM', 'WORKSPACE', 'TEAM') NOT NULL DEFAULT 'PLATFORM',
  scope_id CHAR(36) NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  category ENUM('EVENTS', 'BRACKETS', 'TEAMS', 'PROFILES', 'MOBILE', 'DISCORD', 'TOOLS', 'OTHER') NOT NULL DEFAULT 'OTHER',
  status ENUM('NEW', 'UNDER_REVIEW', 'NEEDS_INFO', 'PLANNED', 'IN_DEVELOPMENT', 'RELEASED', 'DECLINED', 'DUPLICATE') NOT NULL DEFAULT 'NEW',
  staff_note VARCHAR(1000) NULL,
  duplicate_of_id CHAR(36) NULL,
  is_locked TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY suggestions_scope_idx (scope_type, scope_id, status, created_at),
  KEY suggestions_author_idx (author_user_id, created_at),
  CONSTRAINT suggestions_author_fk FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT suggestions_duplicate_fk FOREIGN KEY (duplicate_of_id) REFERENCES suggestions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE suggestion_votes (
  suggestion_id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  vote_value TINYINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (suggestion_id, user_id),
  KEY suggestion_votes_user_idx (user_id),
  CONSTRAINT suggestion_votes_suggestion_fk FOREIGN KEY (suggestion_id) REFERENCES suggestions(id) ON DELETE CASCADE,
  CONSTRAINT suggestion_votes_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT suggestion_votes_value_check CHECK (vote_value IN (-1, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE suggestion_comments (
  id CHAR(36) NOT NULL,
  suggestion_id CHAR(36) NOT NULL,
  author_user_id BIGINT UNSIGNED NOT NULL,
  body VARCHAR(2000) NOT NULL,
  is_staff_reply TINYINT(1) NOT NULL DEFAULT 0,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY suggestion_comments_suggestion_idx (suggestion_id, created_at),
  CONSTRAINT suggestion_comments_suggestion_fk FOREIGN KEY (suggestion_id) REFERENCES suggestions(id) ON DELETE CASCADE,
  CONSTRAINT suggestion_comments_author_fk FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE workspace_webhooks (
  id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NOT NULL,
  label VARCHAR(100) NOT NULL,
  encrypted_url LONGTEXT NOT NULL,
  url_hint VARCHAR(120) NOT NULL,
  notification_types_json LONGTEXT NULL,
  username_override VARCHAR(80) NULL,
  avatar_url VARCHAR(1000) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  failure_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_success_at DATETIME(3) NULL,
  last_error_at DATETIME(3) NULL,
  last_error_message VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY workspace_webhooks_workspace_idx (workspace_id, is_active),
  CONSTRAINT workspace_webhooks_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT workspace_webhooks_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE webhook_delivery_logs (
  id CHAR(36) NOT NULL,
  webhook_id CHAR(36) NOT NULL,
  event_id CHAR(36) NULL,
  notification_type VARCHAR(80) NOT NULL,
  status ENUM('SUCCESS', 'FAILED') NOT NULL,
  response_status INT NULL,
  error_message VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY webhook_logs_webhook_idx (webhook_id, created_at),
  CONSTRAINT webhook_logs_webhook_fk FOREIGN KEY (webhook_id) REFERENCES workspace_webhooks(id) ON DELETE CASCADE,
  CONSTRAINT webhook_logs_event_fk FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_blocks (
  blocker_user_id BIGINT UNSIGNED NOT NULL,
  blocked_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (blocker_user_id, blocked_user_id),
  CONSTRAINT user_blocks_blocker_fk FOREIGN KEY (blocker_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_blocks_blocked_fk FOREIGN KEY (blocked_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reports (
  id CHAR(36) NOT NULL,
  reporter_user_id BIGINT UNSIGNED NOT NULL,
  target_type ENUM('USER', 'WORKSPACE', 'TEAM', 'EVENT', 'SUGGESTION', 'MESSAGE') NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  reason ENUM('SPAM', 'HARASSMENT', 'IMPERSONATION', 'INAPPROPRIATE_CONTENT', 'CHEATING', 'OTHER') NOT NULL,
  details VARCHAR(2000) NULL,
  status ENUM('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED') NOT NULL DEFAULT 'OPEN',
  assigned_to BIGINT UNSIGNED NULL,
  resolved_by BIGINT UNSIGNED NULL,
  resolution_note VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolved_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY reports_status_idx (status, created_at),
  KEY reports_target_idx (target_type, target_id),
  CONSTRAINT reports_reporter_fk FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT reports_assigned_fk FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT reports_resolved_fk FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_follows (
  user_id BIGINT UNSIGNED NOT NULL,
  target_type ENUM('USER', 'WORKSPACE', 'TEAM', 'GAME') NOT NULL,
  target_id VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, target_type, target_id),
  CONSTRAINT user_follows_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE feature_flags (
  flag_key VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  is_enabled_globally TINYINT(1) NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (flag_key),
  CONSTRAINT feature_flags_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE feature_flag_assignments (
  flag_key VARCHAR(80) NOT NULL,
  target_type ENUM('USER', 'WORKSPACE', 'TEAM') NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  assigned_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (flag_key, target_type, target_id),
  CONSTRAINT feature_flag_assignment_flag_fk FOREIGN KEY (flag_key) REFERENCES feature_flags(flag_key) ON DELETE CASCADE,
  CONSTRAINT feature_flag_assignment_user_fk FOREIGN KEY (assigned_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
