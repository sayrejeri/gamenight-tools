-- Game Night Tools v0.4.0 community communication
-- Import once after database/004_access_control.sql.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE community_channels (
  id CHAR(36) NOT NULL,
  scope_type ENUM('WORKSPACE', 'TEAM') NOT NULL,
  scope_id CHAR(36) NOT NULL,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  channel_type ENUM('CHAT', 'ANNOUNCEMENT', 'STAFF') NOT NULL DEFAULT 'CHAT',
  topic VARCHAR(240) NULL,
  position INT UNSIGNED NOT NULL DEFAULT 0,
  slowmode_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY community_channels_scope_slug_unique (scope_type, scope_id, slug),
  KEY community_channels_scope_idx (scope_type, scope_id, is_archived, position),
  CONSTRAINT community_channels_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_messages (
  id CHAR(36) NOT NULL,
  channel_id CHAR(36) NOT NULL,
  author_user_id BIGINT UNSIGNED NOT NULL,
  reply_to_message_id CHAR(36) NULL,
  body VARCHAR(4000) NOT NULL,
  is_announcement TINYINT(1) NOT NULL DEFAULT 0,
  is_pinned TINYINT(1) NOT NULL DEFAULT 0,
  edited_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by BIGINT UNSIGNED NULL,
  delete_reason VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY community_messages_channel_idx (channel_id, created_at),
  KEY community_messages_author_idx (author_user_id, created_at),
  KEY community_messages_reply_idx (reply_to_message_id),
  CONSTRAINT community_messages_channel_fk FOREIGN KEY (channel_id) REFERENCES community_channels(id) ON DELETE CASCADE,
  CONSTRAINT community_messages_author_fk FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT community_messages_reply_fk FOREIGN KEY (reply_to_message_id) REFERENCES community_messages(id) ON DELETE SET NULL,
  CONSTRAINT community_messages_deleted_by_fk FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_message_reactions (
  message_id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  emoji VARCHAR(32) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (message_id, user_id, emoji),
  KEY community_reactions_message_idx (message_id, created_at),
  CONSTRAINT community_reactions_message_fk FOREIGN KEY (message_id) REFERENCES community_messages(id) ON DELETE CASCADE,
  CONSTRAINT community_reactions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_channel_reads (
  channel_id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  last_read_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (channel_id, user_id),
  KEY community_reads_user_idx (user_id, last_read_at),
  CONSTRAINT community_reads_channel_fk FOREIGN KEY (channel_id) REFERENCES community_channels(id) ON DELETE CASCADE,
  CONSTRAINT community_reads_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_chat_timeouts (
  scope_type ENUM('WORKSPACE', 'TEAM') NOT NULL,
  scope_id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  reason VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (scope_type, scope_id, user_id),
  KEY community_timeouts_expiry_idx (expires_at),
  CONSTRAINT community_timeouts_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT community_timeouts_creator_fk FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing approved communities receive useful defaults immediately.
INSERT IGNORE INTO community_channels
  (id, scope_type, scope_id, name, slug, channel_type, topic, position, created_by)
SELECT UUID(), 'WORKSPACE', w.id, 'General', 'general', 'CHAT', 'General community conversation', 0, w.created_by
FROM workspaces w
WHERE w.profile_status = 'APPROVED';

INSERT IGNORE INTO community_channels
  (id, scope_type, scope_id, name, slug, channel_type, topic, position, created_by)
SELECT UUID(), 'WORKSPACE', w.id, 'Announcements', 'announcements', 'ANNOUNCEMENT', 'Official server announcements', 1, w.created_by
FROM workspaces w
WHERE w.profile_status = 'APPROVED';

INSERT IGNORE INTO community_channels
  (id, scope_type, scope_id, name, slug, channel_type, topic, position, created_by)
SELECT UUID(), 'TEAM', t.id, 'General', 'general', 'CHAT', 'Team conversation', 0, t.owner_user_id
FROM teams t
WHERE t.profile_status = 'APPROVED';

INSERT IGNORE INTO community_channels
  (id, scope_type, scope_id, name, slug, channel_type, topic, position, created_by)
SELECT UUID(), 'TEAM', t.id, 'Announcements', 'announcements', 'ANNOUNCEMENT', 'Official team announcements', 1, t.owner_user_id
FROM teams t
WHERE t.profile_status = 'APPROVED';
