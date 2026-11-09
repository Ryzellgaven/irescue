USE ldrrmo_xampp;

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
