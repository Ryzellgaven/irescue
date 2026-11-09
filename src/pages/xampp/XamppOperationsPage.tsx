import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Activity,
  AlertTriangle,
  Bell,
  Check,
  ChevronDown,
  CircleUserRound,
  CloudRain,
  FilePlus2,
  FileText,
  Flame,
  HeartPulse,
  LogOut,
  MapPin,
  Menu,
  Plus,
  RefreshCw,
  Shield,
  Thermometer,
  Users,
  Waves,
  Wind,
  X,
} from 'lucide-react';
import {
  createXamppReport,
  getXamppDashboard,
  getXamppReports,
  getXamppSession,
  registerXamppSensor,
  updateXamppReportStatus,
  xamppLogin,
  xamppLogout,
  type XamppDashboard,
  type XamppEmergencyType,
  type XamppReport,
  type XamppSensor,
  type XamppSensorType,
  type XamppSeverity,
  type XamppStatus,
  type XamppUser,
} from '@/lib/xampp-api';

type Section = 'overview' | 'reports' | 'sensors';

const EMERGENCY_TYPES: { value: XamppEmergencyType; label: string }[] = [
  { value: 'flood', label: 'Flood' },
  { value: 'fire', label: 'Fire' },
  { value: 'medical', label: 'Medical emergency' },
  { value: 'accident', label: 'Accident' },
  { value: 'landslide', label: 'Landslide' },
  { value: 'earthquake', label: 'Earthquake' },
  { value: 'other', label: 'Other' },
];
const STATUSES: { value: XamppStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];
const SENSOR_TYPES: { value: XamppSensorType; label: string; unit: string }[] = [
  { value: 'water_level', label: 'Water level', unit: 'm' },
  { value: 'rainfall', label: 'Rainfall', unit: 'mm' },
  { value: 'wind_speed', label: 'Wind speed', unit: 'm/s' },
  { value: 'temperature', label: 'Temperature', unit: '°C' },
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function sensorIcon(type: XamppSensorType) {
  if (type === 'water_level') return Waves;
  if (type === 'rainfall') return CloudRain;
  if (type === 'wind_speed') return Wind;
  return Thermometer;
}

function incidentIcon(severity: XamppSeverity) {
  const colors: Record<XamppSeverity, string> = {
    low: '#16a34a',
    moderate: '#d97706',
    high: '#ea580c',
    critical: '#dc2626',
  };
  const color = colors[severity];
  return L.divIcon({
    html: `<span style="display:block;width:18px;height:18px;border:3px solid white;border-radius:50%;background:${color};box-shadow:0 1px 7px #17203388"></span>`,
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function sensorMapIcon() {
  return L.divIcon({
    html: '<span style="display:block;width:14px;height:14px;border:3px solid white;border-radius:4px;background:#0284c7;box-shadow:0 1px 7px #17203388"></span>',
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function tooltipText(text: string) {
  const element = document.createElement('span');
  element.textContent = text;
  return element;
}

function statusLabel(status: XamppStatus) {
  return STATUSES.find(option => option.value === status)?.label ?? status;
}

function statusClass(status: XamppStatus) {
  const classes: Record<XamppStatus, string> = {
    open: 'bg-red-50 text-red-700 ring-red-200',
    in_progress: 'bg-amber-50 text-amber-800 ring-amber-200',
    resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    closed: 'bg-slate-100 text-slate-600 ring-slate-200',
  };
  return classes[status];
}

function IncidentGlyph({ type }: { type: XamppEmergencyType }) {
  if (type === 'fire') return <Flame className="h-4 w-4" />;
  if (type === 'medical') return <HeartPulse className="h-4 w-4" />;
  if (type === 'flood') return <Waves className="h-4 w-4" />;
  return <AlertTriangle className="h-4 w-4" />;
}

function LoginScreen({
  onAuthenticated,
  connectionMessage,
}: {
  onAuthenticated: (user: XamppUser) => void;
  connectionMessage: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await xamppLogin(email, password);
      onAuthenticated(result.user);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
      setPassword('');
    }
  }

  return (
    <main className="xampp-root flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-700 text-white shadow-lg shadow-red-900/20">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-700">LDRRMO · Diplahan</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Operations Portal</h1>
          <p className="mt-2 text-sm text-slate-500">Sign in with an account provisioned by your system administrator.</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {connectionMessage && (
            <div role="alert" className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{connectionMessage}</span>
            </div>
          )}
          {error && (
            <div role="alert" className="mb-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <label className="mb-4 block text-sm font-medium text-slate-700">
            Staff email
            <input
              autoComplete="username"
              type="email"
              required
              value={email}
              onChange={event => setEmail(event.target.value)}
              className="mt-1.5 block h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-100"
            />
          </label>
          <label className="mb-6 block text-sm font-medium text-slate-700">
            Password
            <input
              autoComplete="current-password"
              type="password"
              required
              value={password}
              onChange={event => setPassword(event.target.value)}
              className="mt-1.5 block h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-100"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
          >
            {busy && <RefreshCw className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
          <p className="mt-5 text-center text-xs leading-5 text-slate-500">
            No sample login is included. Configure XAMPP, import the database, and have an administrator create your account.
          </p>
        </form>
      </div>
    </main>
  );
}

function ReportForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const [coordinates, setCoordinates] = useState({ latitude: '', longitude: '' });

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError('This browser does not support location access.');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      position => {
        setCoordinates({
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
        });
        setLocating(false);
      },
      cause => {
        setError(cause.code === cause.PERMISSION_DENIED
          ? 'Location permission was denied. Enter coordinates manually or allow location access.'
          : 'Could not determine your location. Enter coordinates manually and try again.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const values = new FormData(event.currentTarget);
    const latitudeText = coordinates.latitude.trim();
    const longitudeText = coordinates.longitude.trim();
    try {
      await createXamppReport({
        emergency_type: String(values.get('emergency_type')) as XamppEmergencyType,
        severity: String(values.get('severity')) as XamppSeverity,
        description: String(values.get('description') ?? '').trim(),
        location: String(values.get('location') ?? '').trim(),
        latitude: latitudeText ? Number(latitudeText) : null,
        longitude: longitudeText ? Number(longitudeText) : null,
      });
      await onSaved();
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Record an emergency" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Incident type
            <select name="emergency_type" required className="xampp-input mt-1.5">
              {EMERGENCY_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Severity
            <select name="severity" required className="xampp-input mt-1.5">
              {(['low', 'moderate', 'high', 'critical'] as XamppSeverity[]).map(level => (
                <option key={level} value={level}>{level[0].toUpperCase() + level.slice(1)}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Location
          <input name="location" maxLength={255} required className="xampp-input mt-1.5" placeholder="Barangay, street or landmark" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Latitude <span className="font-normal text-slate-400">(optional)</span>
            <input name="latitude" type="number" step="any" min="-90" max="90" value={coordinates.latitude} onChange={event => setCoordinates(current => ({ ...current, latitude: event.target.value }))} className="xampp-input mt-1.5" placeholder="7.8123" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Longitude <span className="font-normal text-slate-400">(optional)</span>
            <input name="longitude" type="number" step="any" min="-180" max="180" value={coordinates.longitude} onChange={event => setCoordinates(current => ({ ...current, longitude: event.target.value }))} className="xampp-input mt-1.5" placeholder="122.9456" />
          </label>
          <button type="button" onClick={useCurrentLocation} disabled={locating} className="flex items-center gap-2 justify-self-start rounded-lg px-1 py-1 text-xs font-semibold text-sky-700 hover:text-sky-900 disabled:opacity-50 sm:col-span-2">
            <MapPin className="h-3.5 w-3.5" />{locating ? 'Finding location…' : 'Use my current location'}
          </button>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Details <span className="font-normal text-slate-400">(optional)</span>
          <textarea name="description" maxLength={5000} rows={4} className="xampp-input mt-1.5 resize-y" placeholder="Describe what happened and any immediate needs." />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="xampp-secondary-button">Cancel</button>
          <button type="submit" disabled={busy} className="xampp-primary-button">
            {busy ? 'Saving…' : 'Save incident'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SensorForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (sensor: XamppSensor & { device_token: string }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const values = new FormData(event.currentTarget);
    try {
      const sensor = await registerXamppSensor({
        name: String(values.get('name') ?? '').trim(),
        sensor_type: String(values.get('sensor_type')) as XamppSensorType,
        latitude: Number(values.get('latitude')),
        longitude: Number(values.get('longitude')),
        alert_threshold: Number(values.get('alert_threshold')),
      });
      await onSaved(sensor);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Register a sensor" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <label className="block text-sm font-medium text-slate-700">
          Sensor name
          <input name="name" required maxLength={120} className="xampp-input mt-1.5" placeholder="Poblacion river gauge" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Sensor type
          <select name="sensor_type" required className="xampp-input mt-1.5">
            {SENSOR_TYPES.map(sensor => <option key={sensor.value} value={sensor.value}>{sensor.label} ({sensor.unit})</option>)}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Latitude
            <input name="latitude" type="number" step="any" min="-90" max="90" required className="xampp-input mt-1.5" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Longitude
            <input name="longitude" type="number" step="any" min="-180" max="180" required className="xampp-input mt-1.5" />
          </label>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Alert threshold
          <input name="alert_threshold" type="number" step="any" required className="xampp-input mt-1.5" />
        </label>
        <p className="text-xs leading-5 text-slate-500">
          The API will display readings posted by this device. It does not simulate or generate sensor readings.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="xampp-secondary-button">Cancel</button>
          <button type="submit" disabled={busy} className="xampp-primary-button">
            {busy ? 'Registering…' : 'Register sensor'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="my-auto w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl sm:p-7">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ReportRows({
  reports,
  onStatusChange,
  busyReport,
}: {
  reports: XamppReport[];
  onStatusChange: (report: XamppReport, status: XamppStatus) => void;
  busyReport: number | null;
}) {
  if (reports.length === 0) {
    return (
      <div className="py-14 text-center">
        <FileText className="mx-auto h-9 w-9 text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-700">No incidents recorded</p>
        <p className="mt-1 text-xs text-slate-500">New reports saved to MySQL will appear here.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {reports.map(report => (
        <article key={report.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            report.severity === 'critical' || report.severity === 'high' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'
          }`}>
            <IncidentGlyph type={report.emergency_type} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold capitalize text-slate-900">{report.emergency_type} emergency</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                report.severity === 'critical' || report.severity === 'high'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-slate-100 text-slate-600'
              }`}>{report.severity}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${statusClass(report.status)}`}>
                {statusLabel(report.status)}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">{report.location}</p>
            <p className="mt-1 text-[11px] text-slate-400">
              {report.reporter_name} · {format(new Date(report.created_at.replace(' ', 'T') + (report.created_at.endsWith('Z') ? '' : 'Z')), 'MMM d, yyyy · h:mm a')}
            </p>
          </div>
          <label className="sr-only" htmlFor={`status-${report.id}`}>Change report status</label>
          <select
            id={`status-${report.id}`}
            value={report.status}
            disabled={busyReport === report.id}
            onChange={event => onStatusChange(report, event.target.value as XamppStatus)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-red-500 disabled:opacity-50 sm:w-36"
          >
            {STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
        </article>
      ))}
    </div>
  );
}

function SensorRows({ sensors, loaded }: { sensors: XamppSensor[]; loaded: boolean }) {
  if (!loaded) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm font-semibold text-slate-700">Sensor data unavailable</p>
        <p className="mt-1 text-xs text-slate-500">Check the application API connection to load registered devices.</p>
      </div>
    );
  }
  if (sensors.length === 0) {
    return (
      <div className="py-12 text-center">
        <Activity className="mx-auto h-9 w-9 text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-700">No sensors registered</p>
        <p className="mt-1 text-xs text-slate-500">Register a real device to receive its signed readings.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {sensors.map(sensor => {
        const Icon = sensorIcon(sensor.sensor_type);
        const readingFresh = sensor.last_reading_at
          ? Date.now() - new Date(sensor.last_reading_at.replace(' ', 'T') + (sensor.last_reading_at.endsWith('Z') ? '' : 'Z')).getTime() < 30 * 60 * 1000
          : false;
        return (
          <article key={sensor.id} className="flex items-center gap-3 px-4 py-4 sm:px-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700"><Icon className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{sensor.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">{sensor.device_code} · {sensor.sensor_type.replace('_', ' ')}</p>
              {sensor.last_reading_at && (
                <p className="mt-1 text-[11px] text-slate-400">
                  Updated {formatDistanceToNow(new Date(sensor.last_reading_at.replace(' ', 'T') + (sensor.last_reading_at.endsWith('Z') ? '' : 'Z')), { addSuffix: true })}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className={`text-sm font-bold ${sensor.is_alert ? 'text-red-700' : 'text-slate-900'}`}>
                {sensor.last_reading === null ? '—' : `${sensor.last_reading} ${sensor.unit}`}
              </p>
              <p className={`mt-0.5 text-[10px] font-semibold uppercase ${
                sensor.is_alert ? 'text-red-600' : readingFresh ? 'text-emerald-600' : 'text-slate-400'
              }`}>
                {sensor.is_alert ? 'Last reading exceeded threshold' : readingFresh ? 'Recent reading' : 'No recent reading'}
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function XamppMap({
  reports,
  sensors,
}: {
  reports: XamppReport[];
  sensors: XamppSensor[];
}) {
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapElement.current || map.current) return;
    const instance = L.map(mapElement.current, { center: [7.8123, 122.9456], zoom: 13 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(instance);
    markers.current = L.layerGroup().addTo(instance);
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      markers.current = null;
    };
  }, []);

  useEffect(() => {
    if (!markers.current) return;
    markers.current.clearLayers();
    reports.forEach(report => {
      if (report.latitude === null || report.longitude === null) return;
      L.marker([report.latitude, report.longitude], { icon: incidentIcon(report.severity) })
        .bindTooltip(tooltipText(`${report.emergency_type.toUpperCase()} · ${report.severity}`))
        .addTo(markers.current!);
    });
    sensors.filter(sensor => sensor.status === 'active').forEach(sensor => {
      L.marker([sensor.latitude, sensor.longitude], { icon: sensorMapIcon() })
        .bindTooltip(tooltipText(`${sensor.name} · ${sensor.last_reading === null ? 'No reading' : `${sensor.last_reading} ${sensor.unit}`}`))
        .addTo(markers.current!);
    });
  }, [reports, sensors]);

  return <div ref={mapElement} className="h-full min-h-[300px] w-full rounded-b-xl" aria-label="Map of incidents and registered sensors" />;
}

function XamppOperationsPage() {
  const [user, setUser] = useState<XamppUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [dashboard, setDashboard] = useState<XamppDashboard | null>(null);
  const [allReports, setAllReports] = useState<XamppReport[]>([]);
  const [reportPage, setReportPage] = useState(0);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsLoadFailed, setReportsLoadFailed] = useState(false);
  const [hasMoreReports, setHasMoreReports] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [section, setSection] = useState<Section>('overview');
  const [reportOpen, setReportOpen] = useState(false);
  const [sensorOpen, setSensorOpen] = useState(false);
  const [newDeviceCredential, setNewDeviceCredential] = useState<{ device_code: string; device_token: string } | null>(null);
  const [busyReport, setBusyReport] = useState<number | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refreshDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getXamppDashboard();
      setDashboard(data);
      setApiError('');
      setLastUpdated(new Date());
    } catch (cause) {
      setApiError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReportPage = useCallback(async (page: number, append = false) => {
    setReportsLoading(true);
    setReportsLoadFailed(false);
    setApiError('');
    try {
      const result = await getXamppReports(page);
      setAllReports(previous => append ? [...previous, ...result.items] : result.items);
      setReportPage(result.page);
      setHasMoreReports(result.page * result.per_page < result.total);
      setReportsLoaded(true);
    } catch (cause) {
      setApiError(errorMessage(cause));
      setReportsLoaded(true);
      setReportsLoadFailed(true);
    } finally {
      setReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    getXamppSession()
      .then(session => setUser(session.authenticated ? session.user : null))
      .catch(cause => setApiError(errorMessage(cause)))
      .finally(() => setSessionLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    void refreshDashboard();
    const timer = window.setInterval(() => void refreshDashboard(), 30_000);
    return () => window.clearInterval(timer);
  }, [user, refreshDashboard]);

  useEffect(() => {
    if (user && section === 'reports' && !reportsLoaded && !reportsLoading) {
      void loadReportPage(1);
    }
  }, [user, section, reportsLoaded, reportsLoading, loadReportPage]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(''), 4500);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  async function changeStatus(report: XamppReport, status: XamppStatus) {
    setBusyReport(report.id);
    setApiError('');
    try {
      const updatedReport = await updateXamppReportStatus(report.id, status);
      setAllReports(previous => previous.map(item => item.id === updatedReport.id ? updatedReport : item));
      await refreshDashboard();
      setToastMessage(`Incident status updated to ${statusLabel(status).toLowerCase()}.`);
    } catch (cause) {
      setApiError(errorMessage(cause));
    } finally {
      setBusyReport(null);
    }
  }

  async function saveSensor(sensor: XamppSensor & { device_token: string }) {
    setSensorOpen(false);
    setNewDeviceCredential({ device_code: sensor.device_code, device_token: sensor.device_token });
    await refreshDashboard();
    setToastMessage('Sensor registered. Copy its token now; it is shown only once.');
  }

  async function reportSaved() {
    setAllReports([]);
    setReportPage(0);
    setReportsLoaded(false);
    setReportsLoadFailed(false);
    setHasMoreReports(false);
    await refreshDashboard();
  }

  async function signOut() {
    try {
      await xamppLogout();
      setUser(null);
      setDashboard(null);
      setApiError('');
    } catch (cause) {
      setApiError(errorMessage(cause));
    }
  }

  if (sessionLoading) {
    return (
      <main className="xampp-root flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Connecting to the operations server…
      </main>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        connectionMessage={apiError}
        onAuthenticated={signedInUser => { setUser(signedInUser); setApiError(''); }}
      />
    );
  }

  const navItems: { id: Section; label: string; icon: typeof Activity }[] = [
    { id: 'overview', label: 'Dashboard', icon: Activity },
    { id: 'reports', label: 'Incident records', icon: FileText },
    { id: 'sensors', label: 'Flood monitoring', icon: Waves },
  ];
  const reports = dashboard?.reports ?? [];
  const mapReports = dashboard?.map_reports ?? [];
  const sensors = dashboard?.sensors ?? [];
  const stats = dashboard?.stats;

  return (
    <div className="xampp-root min-h-screen bg-slate-100 text-slate-900">
      {mobileNavOpen && <button aria-label="Close menu" className="fixed inset-0 z-30 bg-slate-950/40 md:hidden" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#7d171b] text-white transition-transform md:translate-x-0 ${
        mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/10"><Shield className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">Diplahan LDRRMO</p>
            <p className="text-[10px] text-red-100/75">Emergency Response System</p>
          </div>
        </div>
        <nav aria-label="Operations navigation" className="flex-1 space-y-1 px-3 py-5">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-red-100/60">Operations</p>
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => { setSection(item.id); setMobileNavOpen(false); }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  section === item.id ? 'bg-white/15 font-semibold text-white' : 'text-red-100/85 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />{item.label}
              </button>
            );
          })}
          <a href="/" className="mt-6 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-100/75 hover:bg-white/10 hover:text-white">
            <ChevronDown className="h-4 w-4 rotate-90" />Main website
          </a>
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-lg bg-black/10 p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15"><CircleUserRound className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{user.full_name}</p>
              <p className="truncate text-[10px] capitalize text-red-100/70">{user.role.replace('_', ' ')}</p>
            </div>
            <button type="button" aria-label="Sign out" title="Sign out" onClick={() => void signOut()} className="rounded p-1.5 text-red-100/80 hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-3 text-center text-[10px] text-red-100/50">XAMPP · MySQL operations portal</p>
        </div>
      </aside>

      <div className="min-h-screen md:pl-64">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" aria-label="Open menu" onClick={() => setMobileNavOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden">
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">LDRRMO · Operations</p>
              <h1 className="mt-0.5 truncate text-lg font-bold text-slate-900">
                {section === 'overview' ? 'Emergency Response Dashboard' : section === 'reports' ? 'Incident records' : 'Flood monitoring'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-medium text-slate-700">{lastUpdated ? `Updated ${format(lastUpdated, 'h:mm:ss a')}` : 'Waiting for data'}</p>
              <p className="text-[10px] text-slate-400">Auto-refreshes every 30 seconds</p>
            </div>
            <button type="button" aria-label="Refresh dashboard" title="Refresh dashboard" onClick={() => void refreshDashboard()} disabled={loading} className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <span className="hidden h-8 w-px bg-slate-200 sm:block" />
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-700"><CircleUserRound className="h-5 w-5" /></span>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8">
          {apiError && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="min-w-0 flex-1">{apiError}</p>
              <button type="button" aria-label="Dismiss error" onClick={() => setApiError('')}><X className="h-4 w-4" /></button>
            </div>
          )}

          {newDeviceCredential && (
            <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-amber-900">Copy this device credential now</p>
                  <p className="mt-1 text-xs text-amber-800">The raw token is not stored by the server and cannot be shown again. Configure the physical sensor to send JSON to the device-reading API with this device code and token.</p>
                  <p className="mt-3 text-[11px] font-semibold text-amber-900">Device code</p>
                  <code className="mt-1 block break-all rounded-lg bg-white px-3 py-2 text-xs text-slate-800">{newDeviceCredential.device_code}</code>
                  <p className="mt-3 text-[11px] font-semibold text-amber-900">Device token</p>
                  <code className="mt-1 block break-all rounded-lg bg-white px-3 py-2 text-xs text-slate-800">{newDeviceCredential.device_token}</code>
                  <button type="button" onClick={() => {
                    const credential = `Device code: ${newDeviceCredential.device_code}\nDevice token: ${newDeviceCredential.device_token}`;
                    void navigator.clipboard.writeText(credential).then(
                      () => setToastMessage('Device code and token copied.'),
                      () => setApiError('Clipboard access was denied; select and copy the device credential manually.'),
                    );
                  }} className="mt-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900">Copy credential</button>
                </div>
                <button type="button" aria-label="Dismiss device credential" onClick={() => setNewDeviceCredential(null)} className="text-amber-800"><X className="h-4 w-4" /></button>
              </div>
            </div>
          )}

          {section === 'overview' && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Situation overview</h2>
                  <p className="mt-1 text-xs text-slate-500">Live records stored in your XAMPP MySQL database.</p>
                </div>
                <button type="button" onClick={() => setReportOpen(true)} className="xampp-primary-button">
                  <FilePlus2 className="h-4 w-4" /> Record emergency
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {[
                  { label: 'Active incidents', value: stats?.active_incidents, icon: AlertTriangle, color: 'bg-red-50 text-red-700', accent: 'text-red-700' },
                  { label: 'Flood sensors', value: stats?.flood_sensors, icon: Waves, color: 'bg-sky-50 text-sky-700', accent: 'text-sky-700' },
                  { label: 'Active responders', value: stats?.total_responders, icon: Users, color: 'bg-emerald-50 text-emerald-700', accent: 'text-emerald-700' },
                  { label: 'Reports recorded', value: stats?.total_reports, icon: FileText, color: 'bg-amber-50 text-amber-700', accent: 'text-amber-700' },
                ].map(stat => {
                  const Icon = stat.icon;
                  return (
                    <section key={stat.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-slate-500">{stat.label}</p>
                        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.color}`}><Icon className="h-4 w-4" /></span>
                      </div>
                      <p className={`mt-2 text-2xl font-bold ${stat.accent}`}>{stat.value ?? (loading ? '…' : '—')}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">From saved database records</p>
                    </section>
                  );
                })}
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Incident &amp; sensor map</h2>
                      <p className="mt-0.5 text-[11px] text-slate-500">Only geolocated database records are plotted.</p>
                    </div>
                    <MapPin className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="h-[330px] sm:h-[400px]">
                    <XamppMap reports={mapReports} sensors={sensors} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 px-4 py-3 text-[10px] text-slate-500 sm:px-5">
                    <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-red-600" /> Incident</span>
                    <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-sky-600" /> Registered sensor</span>
                    <span className="ml-auto">Map tiles © OpenStreetMap contributors</span>
                  </div>
                </section>

                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Recent emergency reports</h2>
                      <p className="mt-0.5 text-[11px] text-slate-500">Most recent records from MySQL</p>
                    </div>
                    <button type="button" onClick={() => setSection('reports')} className="text-xs font-semibold text-red-700 hover:text-red-900">View all</button>
                  </div>
                  {!dashboard ? (
                    <div className="px-5 py-14 text-center">
                      {loading ? <RefreshCw className="mx-auto h-7 w-7 animate-spin text-slate-400" /> : <AlertTriangle className="mx-auto h-7 w-7 text-amber-500" />}
                      <p className="mt-3 text-sm font-semibold text-slate-700">{loading ? 'Loading reports…' : 'Report data unavailable'}</p>
                    </div>
                  ) : reports.length === 0 ? (
                    <div className="px-5 py-14 text-center">
                      <Bell className="mx-auto h-8 w-8 text-slate-300" />
                      <p className="mt-3 text-sm font-semibold text-slate-700">No reports yet</p>
                      <p className="mt-1 text-xs text-slate-500">This database has no sample incidents.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {reports.slice(0, 6).map(report => (
                        <article key={report.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            report.severity === 'critical' || report.severity === 'high' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'
                          }`}><IncidentGlyph type={report.emergency_type} /></div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-xs font-semibold capitalize text-slate-800">{report.emergency_type}</p>
                              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset ${statusClass(report.status)}`}>{statusLabel(report.status)}</span>
                            </div>
                            <p className="mt-0.5 truncate text-[10px] text-slate-500">{report.location} · {report.reporter_name}</p>
                            <p className="mt-0.5 text-[10px] text-slate-400">{formatDistanceToNow(new Date(report.created_at.replace(' ', 'T') + (report.created_at.endsWith('Z') ? '' : 'Z')), { addSuffix: true })}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
                    <button type="button" onClick={() => setReportOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-semibold text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700">
                      <Plus className="h-3.5 w-3.5" /> Add incident record
                    </button>
                  </div>
                </section>
              </div>

              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Flood sensor monitoring</h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">The last reading is reported by the registered device, not simulated.</p>
                  </div>
                  <button type="button" onClick={() => setSection('sensors')} className="text-xs font-semibold text-red-700 hover:text-red-900">View sensors</button>
                </div>
                <SensorRows sensors={sensors.filter(sensor => sensor.sensor_type === 'water_level')} loaded={Boolean(dashboard)} />
              </section>
            </>
          )}

          {section === 'reports' && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Incident records</h2>
                  <p className="mt-1 text-xs text-slate-500">{stats?.total_reports ?? 0} saved reports · status changes are audit-logged.</p>
                </div>
                <button type="button" onClick={() => setReportOpen(true)} className="xampp-primary-button"><Plus className="h-4 w-4" /> Record incident</button>
              </div>
              {!reportsLoaded && reportsLoading ? (
                <div className="flex items-center justify-center gap-2 py-14 text-sm text-slate-500">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Loading incident records…
                </div>
              ) : reportsLoadFailed && allReports.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm font-semibold text-slate-700">Could not load incident records</p>
                  <button type="button" onClick={() => void loadReportPage(1)} className="mt-3 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Retry</button>
                </div>
              ) : (
                <ReportRows reports={allReports} onStatusChange={(report, status) => void changeStatus(report, status)} busyReport={busyReport} />
              )}
              {hasMoreReports && (
                <div className="border-t border-slate-100 px-4 py-3 text-center">
                  <button
                    type="button"
                    disabled={reportsLoading}
                    onClick={() => void loadReportPage(reportPage + 1, true)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {reportsLoading ? 'Loading…' : 'Load more reports'}
                  </button>
                </div>
              )}
            </section>
          )}

          {section === 'sensors' && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Registered sensors</h2>
                  <p className="mt-1 text-xs text-slate-500">Readings only appear after an authenticated device posts them.</p>
                </div>
                {user.role === 'admin' && (
                  <button type="button" onClick={() => setSensorOpen(true)} className="xampp-primary-button"><Plus className="h-4 w-4" /> Register sensor</button>
                )}
              </div>
              <SensorRows sensors={sensors} loaded={Boolean(dashboard)} />
              {user.role !== 'admin' && <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Ask an administrator to register sensors and provision device credentials.</p>}
            </section>
          )}

          <footer className="pb-2 text-center text-[10px] text-slate-400">
            Operations data is served by the configured XAMPP PHP API and MySQL database.
          </footer>
        </main>
      </div>

      {reportOpen && <ReportForm onClose={() => setReportOpen(false)} onSaved={reportSaved} />}
      {sensorOpen && <SensorForm onClose={() => setSensorOpen(false)} onSaved={saveSensor} />}
      {toastMessage && (
        <div role="status" className="fixed bottom-5 right-5 z-[2100] flex max-w-sm items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
          <Check className="h-4 w-4 shrink-0 text-emerald-400" />{toastMessage}
          <button type="button" aria-label="Dismiss message" onClick={() => setToastMessage('')} className="ml-2 text-slate-300"><X className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

export default XamppOperationsPage;
