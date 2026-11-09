import { apiRequest, getPrivateMediaUrl, uploadReportMedia } from '@/lib/xampp-api';
import type {
  AuditLog, CallerLog, EmergencyReport, EvacuationCenter, IotDevice, Notification,
  Profile, ReportAssignment, SafeRoute, SensorReading, StatusUpdate, SystemConfig,
} from '@/types/index';

type Result<T> = { data: T | null; error: Error | null; count?: number };
const result = async <T>(work: Promise<T>): Promise<Result<T>> => {
  try { return { data: await work, error: null }; }
  catch (error) { return { data: null, error: error instanceof Error ? error : new Error(String(error)) }; }
};
const withMediaUrl = (report: EmergencyReport): EmergencyReport => ({
  ...report,
  photo_url: report.photo_url && !report.photo_url.startsWith('http')
    ? getPrivateMediaUrl(report.photo_url)
    : report.photo_url,
});

export async function getProfile(_id?: string): Promise<Profile | null> {
  try { return await apiRequest<Profile>('profile'); } catch { return null; }
}

export async function updateProfile(_id: string, updates: Partial<Profile>) {
  return result(apiRequest<Profile>('profile', { method: 'PATCH', body: JSON.stringify(updates) }));
}

export async function getAllProfiles(page = 0, pageSize = 50) {
  const response = await result<{ items: Profile[]; total: number }>(
    apiRequest('profiles', {}, { page: String(page + 1), per_page: String(pageSize) }),
  );
  return { data: response.data?.items ?? [], error: response.error, count: response.data?.total ?? 0 };
}

export async function getStaffProfiles(): Promise<Profile[]> {
  try { return await apiRequest<Profile[]>('staff-profiles'); } catch { return []; }
}

export async function createUser(payload: {
  email: string; password: string; full_name: string; phone?: string; role: string;
}) {
  return result(apiRequest<Profile>('users', { method: 'POST', body: JSON.stringify(payload) }));
}
export async function updateUser(id: string, updates: Partial<Profile>) {
  return result(apiRequest<Profile>('users', { method: 'PATCH', body: JSON.stringify(updates) }, { id }));
}
export async function setUserActive(id: string, is_active: boolean) {
  return result(apiRequest<Profile>('users', { method: 'PATCH', body: JSON.stringify({ is_active }) }, { id }));
}

export async function submitReport(payload: {
  emergency_type: EmergencyReport['emergency_type']; severity: EmergencyReport['severity'];
  description: string; latitude: number | null; longitude: number | null;
  address_text: string; photo_url: string | null; photo?: File | null;
}) {
  return result((async () => {
    let mediaPath = payload.photo_url;
    if (payload.photo) mediaPath = await uploadReportMedia(payload.photo);
    const { photo, ...report } = payload;
    return apiRequest<EmergencyReport>('reports', {
      method: 'POST',
      body: JSON.stringify({ ...report, photo_url: mediaPath }),
    }).then(withMediaUrl);
  })());
}

export async function getMyReports(_reporterId: string, page = 0, pageSize = 20) {
  const response = await result<{ items: EmergencyReport[]; total: number }>(
    apiRequest('my-reports', {}, { page: String(page + 1), per_page: String(pageSize) }),
  );
  return { data: response.data?.items.map(withMediaUrl) ?? [], error: response.error, count: response.data?.total ?? 0 };
}

export async function getAllReports(page = 0, pageSize = 50, filters: {
  status?: EmergencyReport['status']; emergency_type?: EmergencyReport['emergency_type'];
  severity?: EmergencyReport['severity'];
} = {}) {
  const response = await result<{ items: EmergencyReport[]; total: number }>(
    apiRequest('reports', {}, {
      page: String(page + 1), per_page: String(pageSize),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.emergency_type ? { emergency_type: filters.emergency_type } : {}),
      ...(filters.severity ? { severity: filters.severity } : {}),
    }),
  );
  return { data: response.data?.items.map(withMediaUrl) ?? [], error: response.error, count: response.data?.total ?? 0 };
}

export async function getReportById(id: string): Promise<EmergencyReport | null> {
  try { return withMediaUrl(await apiRequest<EmergencyReport>('report', {}, { id })); } catch { return null; }
}

export async function updateReportStatus(
  reportId: string, newStatus: EmergencyReport['status'], _updatedBy: string,
  notes?: string, afterActionReport?: string,
) {
  return result(apiRequest<EmergencyReport>('report-status', {
    method: 'PATCH', body: JSON.stringify({ status: newStatus, notes, after_action_report: afterActionReport }),
  }, { id: reportId }));
}
export async function assignResponder(reportId: string, responderId: string, _assignedBy: string, notes?: string) {
  return result(apiRequest('report-assignments', {
    method: 'POST', body: JSON.stringify({ responder_id: responderId, notes }),
  }, { id: reportId }));
}
export async function getReportAssignments(reportId: string): Promise<ReportAssignment[]> {
  try { return await apiRequest('report-assignments', {}, { id: reportId }); } catch { return []; }
}
export async function getReportStatusHistory(reportId: string): Promise<StatusUpdate[]> {
  try { return await apiRequest('report-status-history', {}, { id: reportId }); } catch { return []; }
}

export async function upsertLocation(_userId: string, latitude: number, longitude: number, reportId?: string) {
  return result(apiRequest('locations', { method: 'POST', body: JSON.stringify({ latitude, longitude, report_id: reportId ?? null }) }));
}
export async function getLatestLocations() {
  try { return await apiRequest('locations'); } catch { return []; }
}
export async function getActiveReports() {
  try { return (await apiRequest<EmergencyReport[]>('active-reports')).map(withMediaUrl); } catch { return []; }
}

export async function getSafeRoutes(): Promise<SafeRoute[]> {
  try { return await apiRequest<SafeRoute[]>('safe-routes'); } catch { return []; }
}
export async function createSafeRoute(route: {
  report_id: string;
  title: string;
  path: SafeRoute['path'];
}) {
  return result(apiRequest<SafeRoute>('safe-routes', {
    method: 'POST',
    body: JSON.stringify(route),
  }));
}

export async function getEvacuationCenters(): Promise<EvacuationCenter[]> {
  try { return await apiRequest('evacuation-centers'); } catch { return []; }
}
export async function upsertEvacuationCenter(center: Partial<EvacuationCenter>) {
  const method = center.id ? 'PATCH' : 'POST';
  return result(apiRequest('evacuation-centers', { method, body: JSON.stringify(center) }, center.id ? { id: center.id } : {}));
}
export async function deleteEvacuationCenter(id: string) {
  return result(apiRequest('evacuation-centers', { method: 'PATCH', body: JSON.stringify({ status: 'inactive' }) }, { id }));
}

export async function getIotDevices(): Promise<IotDevice[]> {
  try { return await apiRequest('iot-devices'); } catch { return []; }
}
export async function upsertIotDevice(device: Partial<IotDevice>): Promise<Result<IotDevice & { device_token?: string }>> {
  const method = device.id ? 'PATCH' : 'POST';
  return result(apiRequest<IotDevice & { device_token?: string }>('iot-devices', { method, body: JSON.stringify(device) }, device.id ? { id: device.id } : {}));
}
export async function getSensorReadings(deviceId: string, limit = 50): Promise<SensorReading[]> {
  try { return await apiRequest('sensor-readings', {}, { device_id: deviceId, limit: String(limit) }); } catch { return []; }
}

export async function getNotifications(_userId: string, _role: string, page = 0, pageSize = 30): Promise<Notification[]> {
  try { return await apiRequest('notifications', {}, { page: String(page + 1), per_page: String(pageSize) }); } catch { return []; }
}
export async function markNotificationRead(id: string) {
  return result(apiRequest('notification-read', { method: 'POST', body: JSON.stringify({ notification_id: id }) }));
}
export async function dispatchNotification(payload: {
  title: string; body: string; channel?: string; target_role?: string | null; target_user_id?: string | null;
}) {
  return result(apiRequest<Notification>('notifications', { method: 'POST', body: JSON.stringify(payload) }));
}

export async function getCallerLogs(page = 0, pageSize = 50): Promise<CallerLog[]> {
  try { return await apiRequest('caller-logs', {}, { page: String(page + 1), per_page: String(pageSize) }); } catch { return []; }
}
export async function createCallerLog(log: Omit<CallerLog, 'id' | 'created_at' | 'profiles'>) {
  return result(apiRequest('caller-logs', { method: 'POST', body: JSON.stringify(log) }));
}
export async function getAuditLogs(page = 0, pageSize = 50): Promise<AuditLog[]> {
  try { return await apiRequest('audit-logs', {}, { page: String(page + 1), per_page: String(pageSize) }); } catch { return []; }
}
export async function getSystemConfig(): Promise<SystemConfig[]> {
  try { return await apiRequest('system-config'); } catch { return []; }
}
export async function updateSystemConfig(key: string, value: string) {
  return result(apiRequest('system-config', { method: 'PATCH', body: JSON.stringify({ value }) }, { key }));
}
export async function getAnalyticsSummary() {
  return apiRequest<{
    reports: Pick<EmergencyReport, 'status' | 'emergency_type' | 'severity' | 'created_at'>[];
    profiles: Pick<Profile, 'role' | 'is_active' | 'created_at'>[];
    readings: Pick<SensorReading, 'is_alert' | 'recorded_at'>[];
  }>('analytics');
}

export async function getOperationsSummary() {
  const summary = await apiRequest<{
    reports: EmergencyReport[]; counts: { open: number; in_progress: number; resolved: number; total: number };
  }>('operations-summary');
  summary.reports = summary.reports.map(withMediaUrl);
  return summary;
}
