CREATE TABLE IF NOT EXISTS app_state (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  json LONGTEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS faculties (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  auth_user_id VARCHAR(64) NULL,
  name VARCHAR(255) NOT NULL,
  first_name VARCHAR(128) NULL,
  middle_name VARCHAR(128) NULL,
  last_name VARCHAR(128) NULL,
  email VARCHAR(255) NOT NULL,
  contact_number VARCHAR(64) NULL,
  grade VARCHAR(64) NULL,
  qualification VARCHAR(255) NULL,
  faculty_code VARCHAR(64) NOT NULL,
  faculty_username VARCHAR(128) NOT NULL,
  password VARCHAR(255) NULL,
  app_password VARCHAR(255) NULL,
  photo_data_url LONGTEXT NULL,
  advisory_sections_json LONGTEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Optional initial row (safe to re-run)
INSERT INTO app_state (id, json)
VALUES ('default', '{}')
ON DUPLICATE KEY UPDATE id = id;

-- LMS activity logs (same DDL as server/services/CustomActivityLogger.js init)
CREATE TABLE IF NOT EXISTS lms_activity_logs (
  id VARCHAR(128) NOT NULL PRIMARY KEY,
  userId VARCHAR(128) NOT NULL,
  userEmail VARCHAR(512) NULL,
  userRole VARCHAR(64) NULL,
  activityType VARCHAR(128) NOT NULL,
  resourceId VARCHAR(512) NULL,
  details JSON NULL,
  `timestamp` VARCHAR(64) NOT NULL,
  KEY idx_lms_activity_timestamp (timestamp),
  KEY idx_lms_activity_userId (userId),
  KEY idx_lms_activity_activityType (activityType)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

