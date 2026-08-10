-- Game Night Tools v0.8.0 game night tools and series
-- Import exactly once after database/008_expanded_competition_formats.sql.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE game_night_pools (
  id CHAR(36) NOT NULL,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  pool_type ENUM('GAME', 'MAP', 'MIXED') NOT NULL DEFAULT 'MAP',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY game_night_pools_owner_name_unique (owner_user_id, name),
  KEY game_night_pools_owner_type_idx (owner_user_id, pool_type, updated_at),
  CONSTRAINT game_night_pools_owner_fk FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE game_night_pool_items (
  id CHAR(36) NOT NULL,
  pool_id CHAR(36) NOT NULL,
  label VARCHAR(191) NOT NULL,
  details VARCHAR(255) NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY game_night_pool_items_pool_idx (pool_id, is_active, sort_order),
  CONSTRAINT game_night_pool_items_pool_fk FOREIGN KEY (pool_id) REFERENCES game_night_pools(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
