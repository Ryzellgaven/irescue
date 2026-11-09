CREATE TABLE IF NOT EXISTS profiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NULL,
  address VARCHAR(255) NULL,
  role ENUM('resident','ldrrmo_staff','supervisor','admin') NOT NULL DEFAULT 'resident',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  avatar_url VARCHAR(500) NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_profiles_role_active (role,is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS evacuation_centers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL, address VARCHAR(255) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL, longitude DECIMAL(10,7) NOT NULL,
  capacity INT UNSIGNED NOT NULL DEFAULT 0, current_occupancy INT UNSIGNED NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'active', contact_person VARCHAR(120) NULL,
  contact_number VARCHAR(40) NULL, notes TEXT NULL, created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_centers_creator FOREIGN KEY(created_by) REFERENCES profiles(id) ON DELETE SET NULL,
  INDEX idx_centers_status(status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS emergency_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reporter_id BIGINT UNSIGNED NOT NULL,
  emergency_type ENUM('fire','flood','medical','accident','landslide','earthquake','other') NOT NULL DEFAULT 'other',
  severity ENUM('low','moderate','high','critical') NOT NULL DEFAULT 'moderate',
  description TEXT NULL, latitude DECIMAL(10,7) NULL, longitude DECIMAL(10,7) NULL,
  address_text VARCHAR(255) NULL, photo_url VARCHAR(500) NULL, video_url VARCHAR(500) NULL,
  status ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
  assigned_to BIGINT UNSIGNED NULL, after_action_report TEXT NULL,
  is_caller_report TINYINT(1) NOT NULL DEFAULT 0, caller_name VARCHAR(120) NULL,
  caller_phone VARCHAR(40) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_report_reporter FOREIGN KEY(reporter_id) REFERENCES profiles(id),
  CONSTRAINT fk_report_assigned FOREIGN KEY(assigned_to) REFERENCES profiles(id) ON DELETE SET NULL,
  INDEX idx_reports_status_time(status,created_at), INDEX idx_reports_map(latitude,longitude),
  INDEX idx_reports_reporter_time(reporter_id,created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS report_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, report_id BIGINT UNSIGNED NOT NULL,
  responder_id BIGINT UNSIGNED NOT NULL, assigned_by BIGINT UNSIGNED NOT NULL, notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_assignment_report FOREIGN KEY(report_id) REFERENCES emergency_reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_assignment_responder FOREIGN KEY(responder_id) REFERENCES profiles(id),
  CONSTRAINT fk_assignment_assigner FOREIGN KEY(assigned_by) REFERENCES profiles(id),
  INDEX idx_assignments_report(report_id,created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS safe_routes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  report_id BIGINT UNSIGNED NULL, title VARCHAR(160) NOT NULL, path_json JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1, created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_safe_route_report FOREIGN KEY(report_id) REFERENCES emergency_reports(id) ON DELETE SET NULL,
  CONSTRAINT fk_safe_route_creator FOREIGN KEY(created_by) REFERENCES profiles(id) ON DELETE SET NULL,
  INDEX idx_safe_routes_active(is_active,created_at),
  INDEX idx_safe_routes_report(report_id,is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS status_updates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, report_id BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  old_status ENUM('open','in_progress','resolved','closed') NULL,
  new_status ENUM('open','in_progress','resolved','closed') NOT NULL, notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_status_report FOREIGN KEY(report_id) REFERENCES emergency_reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_status_actor FOREIGN KEY(updated_by) REFERENCES profiles(id),
  INDEX idx_status_report(report_id,created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS location_updates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL,
  latitude DECIMAL(10,7) NOT NULL, longitude DECIMAL(10,7) NOT NULL, report_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_location_user FOREIGN KEY(user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_location_report FOREIGN KEY(report_id) REFERENCES emergency_reports(id) ON DELETE SET NULL,
  INDEX idx_locations_user_time(user_id,created_at), INDEX idx_locations_time(created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS iot_devices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, device_code VARCHAR(48) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL, latitude DECIMAL(10,7) NOT NULL, longitude DECIMAL(10,7) NOT NULL,
  sensor_type ENUM('water_level','rainfall','wind_speed','temperature') NOT NULL DEFAULT 'water_level',
  alert_threshold DECIMAL(12,3) NOT NULL DEFAULT 5.0, alert_unit VARCHAR(12) NOT NULL DEFAULT 'm',
  status VARCHAR(24) NOT NULL DEFAULT 'active', device_token_hash CHAR(64) NOT NULL,
  last_reading DECIMAL(12,3) NULL, last_reading_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_devices_status(status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sensor_readings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, device_id BIGINT UNSIGNED NOT NULL,
  value DECIMAL(12,3) NOT NULL, unit VARCHAR(12) NOT NULL, is_alert TINYINT(1) NOT NULL DEFAULT 0,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reading_device FOREIGN KEY(device_id) REFERENCES iot_devices(id) ON DELETE CASCADE,
  INDEX idx_readings_device_time(device_id,recorded_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, title VARCHAR(180) NOT NULL, body TEXT NOT NULL,
  channel ENUM('in_app','push','sms','email') NOT NULL DEFAULT 'in_app',
  status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
  target_role ENUM('resident','ldrrmo_staff','supervisor','admin') NULL,
  target_user_id BIGINT UNSIGNED NULL, sent_by BIGINT UNSIGNED NULL, error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at TIMESTAMP NULL,
  CONSTRAINT fk_notification_target FOREIGN KEY(target_user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_sender FOREIGN KEY(sent_by) REFERENCES profiles(id) ON DELETE SET NULL,
  INDEX idx_notifications_created(created_at), INDEX idx_notifications_target(target_user_id,target_role)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notification_reads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, notification_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL, read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notification_read(notification_id,user_id),
  CONSTRAINT fk_notification_read_notification FOREIGN KEY(notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_read_user FOREIGN KEY(user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS caller_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, caller_name VARCHAR(120) NULL,
  caller_phone VARCHAR(40) NOT NULL,
  emergency_type ENUM('fire','flood','medical','accident','landslide','earthquake','other') NOT NULL DEFAULT 'other',
  reported_location VARCHAR(255) NULL, latitude DECIMAL(10,7) NULL, longitude DECIMAL(10,7) NULL,
  description TEXT NULL, logged_by BIGINT UNSIGNED NOT NULL, report_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_caller_user FOREIGN KEY(logged_by) REFERENCES profiles(id),
  CONSTRAINT fk_caller_report FOREIGN KEY(report_id) REFERENCES emergency_reports(id) ON DELETE SET NULL,
  INDEX idx_caller_created(created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL, table_name VARCHAR(80) NULL, record_id VARCHAR(64) NULL,
  old_values JSON NULL, new_values JSON NULL, ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_profiles FOREIGN KEY(user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  INDEX idx_audit_created(created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS system_config (
  `key` VARCHAR(120) NOT NULL PRIMARY KEY, `value` TEXT NOT NULL, description VARCHAR(255) NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_config_user FOREIGN KEY(updated_by) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, email VARCHAR(254) NOT NULL,
  ip_address VARCHAR(45) NOT NULL, attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_login_ip_time(ip_address,attempted_at), INDEX idx_login_email_time(email,attempted_at)
) ENGINE=InnoDB;

-- Operational settings only; these do not create users or demo records.
INSERT IGNORE INTO system_config (`key`,`value`,description) VALUES
  ('sms_gateway_url','','SMS gateway API endpoint'),
  ('sms_api_key','','SMS gateway API key (leave blank until a provider is configured)'),
  ('alert_email','ldrrmo@diplahan.gov.ph','Alert notification email address'),
  ('system_name','LDRRMO Diplahan Emergency Response System','System display name'),
  ('flood_alert_message','FLOOD ALERT: Water levels are rising. Please proceed to the nearest evacuation center immediately.','Default flood alert message');
