import { toast } from 'sonner';

export type XamppRole = 'resident' | 'ldrrmo_staff' | 'supervisor' | 'admin';
export type XamppStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type XamppSeverity = 'low' | 'moderate' | 'high' | 'critical';
export type XamppEmergencyType =
  | 'fire'
  | 'flood'
  | 'medical'
  | 'accident'
  | 'landslide'
  | 'earthquake'
  | 'other';
export type XamppSensorType = 'water_level' | 'rainfall' | 'wind_speed' | 'temperature';

export interface XamppUser {
  id: number;
  full_name: string;
  email: string;
  role: XamppRole;
}

export interface XamppProfile extends XamppUser {
  phone: string | null;
  address: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface XamppReport {
  id: number;
  emergency_type: XamppEmergencyType;
  severity: XamppSeverity;
  status: XamppStatus;
  description: string | null;
  location: string;
  latitude: number | null;
  longitude: number | null;
  reporter_name: string;
  created_at: string;
}

export interface XamppSensor {
  id: number;
  device_code: string;
  name: string;
  sensor_type: XamppSensorType;
  unit: string;
  latitude: number;
  longitude: number;
  alert_threshold: number;
  status: 'active' | 'inactive';
  last_reading: number | null;
  last_reading_at: string | null;
  is_alert: boolean;
}

export interface XamppDashboard {
  stats: {
    active_incidents: number;
    flood_sensors: number;
    total_responders: number;
    total_reports: number;
  };
  reports: XamppReport[];
  map_reports: XamppReport[];
  sensors: XamppSensor[];
}

export interface XamppReportPage {
  items: XamppReport[];
  total: number;
  page: number;
  per_page: number;
}

const API_URL =
  import.meta.env.VITE_API_URL ??
  import.meta.env.VITE_XAMPP_API_URL ??
  '/api/index.php';

let csrfToken: string | null = null;
const lastReadErrors = new Map<string, number>();

function surfaceReadError(message: string) {
  const now = Date.now();
  if (now - (lastReadErrors.get(message) ?? 0) < 30000) return;
  lastReadErrors.set(message, now);
  toast.error(message);
}

interface ApiResponse<T> {
  data?: T;
  error?: { message?: string };
}

export async function apiRequest<T>(
  action: string,
  options: RequestInit = {},
  query: Record<string, string> = {},
): Promise<T> {
  const url = new URL(API_URL, window.location.origin);
  url.searchParams.set('action', action);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));

  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (csrfToken && options.method && options.method !== 'GET') {
    headers.set('X-CSRF-Token', csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers, credentials: 'include' });
  } catch {
    const message = `Cannot reach the application API at ${API_URL}. Check the server and API configuration.`;
    if (!options.method || options.method === 'GET') surfaceReadError(message);
    throw new Error(message);
  }

  let body: ApiResponse<T>;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    const message = `The application API returned an invalid response (${response.status}).`;
    if (!options.method || options.method === 'GET') surfaceReadError(message);
    throw new Error(message);
  }
  if (!response.ok) {
    const message = body.error?.message ?? `Application API request failed (${response.status}).`;
    if (!options.method || options.method === 'GET') surfaceReadError(message);
    throw new Error(message);
  }
  if (!('data' in body)) {
    throw new Error('The application API response did not include the expected data.');
  }
  return body.data as T;
}

export function getXamppSession() {
  return apiRequest<{ authenticated: boolean; user: XamppUser | null; csrf_token: string }>('session')
    .then(session => {
      csrfToken = session.csrf_token;
      return session;
    });
}

export async function xamppLogin(email: string, password: string) {
  const session = await apiRequest<{ user: XamppUser; csrf_token: string }>(
    'login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );
  csrfToken = session.csrf_token;
  return session;
}

export function xamppLogout() {
  return apiRequest<{ csrf_token: string }>('logout', { method: 'POST' }).then(session => {
    csrfToken = session.csrf_token;
  });
}

export function getXamppDashboard() {
  return apiRequest<XamppDashboard>('dashboard');
}

export function getXamppReports(page: number) {
  return apiRequest<XamppReportPage>('reports', {}, { page: String(page) });
}

export function createXamppReport(report: {
  emergency_type: XamppEmergencyType;
  severity: XamppSeverity;
  description: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
}) {
  return apiRequest<XamppReport>('reports', { method: 'POST', body: JSON.stringify(report) });
}

export function updateXamppReportStatus(id: number, status: XamppStatus) {
  return apiRequest<XamppReport>(
    'report-status',
    { method: 'PATCH', body: JSON.stringify({ status }) },
    { id: String(id) },
  );
}

export function registerXamppSensor(sensor: {
  name: string;
  sensor_type: XamppSensorType;
  latitude: number;
  longitude: number;
  alert_threshold: number;
}) {
  return apiRequest<XamppSensor & { device_token: string }>(
    'sensors',
    { method: 'POST', body: JSON.stringify(sensor) },
  );
}

export function registerXamppUser(payload: {
  full_name: string; email: string; password: string; phone: string; address: string;
}) {
  return apiRequest<{ user: XamppUser; csrf_token: string }>('register', {
    method: 'POST', body: JSON.stringify(payload),
  }).then(session => {
    csrfToken = session.csrf_token;
    return session;
  });
}

export async function uploadReportMedia(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  return apiRequest<{ path: string }>('report-media', { method: 'POST', body: form }).then(result => result.path);
}

export function getPrivateMediaUrl(path: string) {
  const url = new URL(API_URL, window.location.origin);
  url.searchParams.set('action', 'report-media');
  url.searchParams.set('path', path);
  return url.toString();
}
