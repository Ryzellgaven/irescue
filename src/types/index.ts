export interface Option {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  withCount?: boolean;
}

export type UserRole = 'resident' | 'ldrrmo_staff' | 'supervisor' | 'admin';
export type IncidentStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type EmergencyType = 'fire' | 'flood' | 'medical' | 'accident' | 'landslide' | 'earthquake' | 'other';
export type SeverityLevel = 'low' | 'moderate' | 'high' | 'critical';
export type SensorType = 'water_level' | 'rainfall' | 'wind_speed' | 'temperature';
export type NotificationChannel = 'in_app' | 'push' | 'sms' | 'email';
export type NotificationStatus = 'pending' | 'sent' | 'failed';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  role: UserRole;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvacuationCenter {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  capacity: number;
  current_occupancy: number;
  status: string;
  contact_person: string | null;
  contact_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmergencyReport {
  id: string;
  reporter_id: string;
  emergency_type: EmergencyType;
  severity: SeverityLevel;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  address_text: string | null;
  photo_url: string | null;
  video_url: string | null;
  status: IncidentStatus;
  assigned_to: string | null;
  after_action_report: string | null;
  is_caller_report: boolean;
  caller_name: string | null;
  caller_phone: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Pick<Profile, 'full_name' | 'phone'> | null;
  assigned_profile?: Pick<Profile, 'full_name'> | null;
}

export interface ReportAssignment {
  id: string;
  report_id: string;
  responder_id: string;
  assigned_by: string;
  notes: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'full_name' | 'role'> | null;
}

export interface StatusUpdate {
  id: string;
  report_id: string;
  updated_by: string;
  old_status: IncidentStatus | null;
  new_status: IncidentStatus;
  notes: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'full_name'> | null;
}

export interface LocationUpdate {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  report_id: string | null;
  created_at: string;
}

export interface SafeRoute {
  id: string;
  report_id: string | null;
  title: string;
  path: { latitude: number; longitude: number }[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface IotDevice {
  id: string;
  device_code: string;
  name: string;
  latitude: number;
  longitude: number;
  sensor_type: SensorType;
  alert_threshold: number;
  alert_unit: string;
  status: string;
  last_reading: number | null;
  last_reading_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SensorReading {
  id: string;
  device_id: string;
  value: number;
  unit: string;
  is_alert: boolean;
  recorded_at: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  target_role: UserRole | null;
  target_user_id: string | null;
  sent_by: string | null;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface CallerLog {
  id: string;
  caller_name: string | null;
  caller_phone: string;
  emergency_type: EmergencyType;
  reported_location: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  logged_by: string;
  report_id: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'full_name'> | null;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'full_name' | 'email'> | null;
}

export interface SystemConfig {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
}
