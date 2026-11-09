PRAGMA foreign_keys = ON;

CREATE TABLE profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  role TEXT NOT NULL DEFAULT 'resident' CHECK (role IN ('resident','ldrrmo_staff','supervisor','admin')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  avatar_url TEXT,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_profiles_role_active ON profiles(role,is_active);

CREATE TABLE evacuation_centers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 0,
  current_occupancy INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  contact_person TEXT,
  contact_number TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_centers_status ON evacuation_centers(status);

CREATE TABLE app_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_expiration ON app_sessions(expires_at);

CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);
CREATE INDEX idx_login_ip_time ON login_attempts(ip_address,attempted_at);
CREATE INDEX idx_login_email_time ON login_attempts(email,attempted_at);

CREATE TABLE emergency_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES profiles(id),
  emergency_type TEXT NOT NULL DEFAULT 'other' CHECK (emergency_type IN ('fire','flood','medical','accident','landslide','earthquake','other')),
  severity TEXT NOT NULL DEFAULT 'moderate' CHECK (severity IN ('low','moderate','high','critical')),
  description TEXT,
  latitude REAL,
  longitude REAL,
  address_text TEXT,
  photo_url TEXT,
  video_url TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  assigned_to INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  after_action_report TEXT,
  is_caller_report INTEGER NOT NULL DEFAULT 0,
  caller_name TEXT,
  caller_phone TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_reports_status_time ON emergency_reports(status,created_at);
CREATE INDEX idx_reports_map ON emergency_reports(latitude,longitude);
CREATE INDEX idx_reports_reporter_time ON emergency_reports(reporter_id,created_at);

CREATE TABLE report_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES emergency_reports(id) ON DELETE CASCADE,
  responder_id INTEGER NOT NULL REFERENCES profiles(id),
  assigned_by INTEGER NOT NULL REFERENCES profiles(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_assignments_report ON report_assignments(report_id,created_at);

CREATE TABLE safe_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER REFERENCES emergency_reports(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  path_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_safe_routes_active ON safe_routes(is_active,created_at);
CREATE INDEX idx_safe_routes_report ON safe_routes(report_id,is_active);

CREATE TABLE status_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES emergency_reports(id) ON DELETE CASCADE,
  updated_by INTEGER NOT NULL REFERENCES profiles(id),
  old_status TEXT,
  new_status TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_status_report ON status_updates(report_id,created_at);

CREATE TABLE location_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  report_id INTEGER REFERENCES emergency_reports(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_locations_user_time ON location_updates(user_id,created_at);
CREATE INDEX idx_locations_time ON location_updates(created_at);

CREATE TABLE iot_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  sensor_type TEXT NOT NULL DEFAULT 'water_level' CHECK (sensor_type IN ('water_level','rainfall','wind_speed','temperature')),
  alert_threshold REAL NOT NULL DEFAULT 5.0,
  alert_unit TEXT NOT NULL DEFAULT 'm',
  status TEXT NOT NULL DEFAULT 'active',
  device_token_hash TEXT NOT NULL,
  last_reading REAL,
  last_reading_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_devices_status ON iot_devices(status);

CREATE TABLE sensor_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL REFERENCES iot_devices(id) ON DELETE CASCADE,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  is_alert INTEGER NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_readings_device_time ON sensor_readings(device_id,recorded_at);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app','push','sms','email')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  target_role TEXT CHECK (target_role IS NULL OR target_role IN ('resident','ldrrmo_staff','supervisor','admin')),
  target_user_id INTEGER REFERENCES profiles(id) ON DELETE CASCADE,
  sent_by INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);
CREATE INDEX idx_notifications_created ON notifications(created_at);
CREATE INDEX idx_notifications_target ON notifications(target_user_id,target_role);

CREATE TABLE notification_reads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(notification_id,user_id)
);

CREATE TABLE caller_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caller_name TEXT,
  caller_phone TEXT NOT NULL,
  emergency_type TEXT NOT NULL DEFAULT 'other',
  reported_location TEXT,
  latitude REAL,
  longitude REAL,
  description TEXT,
  logged_by INTEGER NOT NULL REFERENCES profiles(id),
  report_id INTEGER REFERENCES emergency_reports(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_caller_created ON caller_logs(created_at);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id TEXT,
  old_values TEXT,
  new_values TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_by INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO system_config(key,value,description) VALUES
  ('sms_gateway_url','','SMS gateway API endpoint'),
  ('sms_api_key','','SMS gateway API key (leave blank until a provider is configured)'),
  ('alert_email','ldrrmo@diplahan.gov.ph','Alert notification email address'),
  ('system_name','LDRRMO Diplahan Emergency Response System','System display name'),
  ('flood_alert_message','FLOOD ALERT: Water levels are rising. Please proceed to the nearest evacuation center immediately.','Default flood alert message');

CREATE TABLE report_media (
  path TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL,
  body BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
