import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { format } from 'date-fns';
import { Check, Layers, LocateFixed, RefreshCw, Route, Undo2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { DIPLAHAN_BOUNDS, DIPLAHAN_CENTER, diplomahanBoundaries } from '@/data/diplahan-boundary';
import {
  assignResponder, createSafeRoute, dispatchNotification, getAllReports,
  getEvacuationCenters, getIotDevices, getSafeRoutes, getStaffProfiles,
} from '@/lib/api';
import type { EmergencyReport, EvacuationCenter, IotDevice, Profile, SafeRoute } from '@/types/index';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function markerIcon(color: string, iconPath: string, pulse = false) {
  return L.divIcon({
    html: `<div style="width:28px;height:34px;display:grid;place-items:center;position:relative"><span style="position:absolute;bottom:0;width:20px;height:20px;transform:rotate(-45deg);border-radius:50% 50% 50% 0;background:${color};border:2px solid white;box-shadow:0 1px 5px #0f172a88;${pulse ? 'animation:incident-marker-pulse 1s ease-in-out infinite' : ''}"></span><svg viewBox="0 0 24 24" aria-hidden="true" style="position:relative;z-index:1;width:13px;height:13px;margin-top:-7px;fill:none;stroke:white;stroke-width:2;stroke-linecap:round;stroke-linejoin:round">${iconPath}</svg></div>`,
    className: '', iconSize: [28, 34], iconAnchor: [14, 34],
  });
}
const sensorIcon = markerIcon('#1672c4', '<path d="M12 22s8-4.5 8-12a8 8 0 1 0-16 0c0 7.5 8 12 8 12Z"/><circle cx="12" cy="10" r="2.5"/>');
const shelterIcon = markerIcon('#64748b', '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-8h6v8"/>');

interface SelectedReport extends EmergencyReport { _selected?: boolean }

export default function DashboardMap({ embedded = false }: { embedded?: boolean }) {
  const mapRef = useRef<L.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const boundaryRef = useRef<L.GeoJSON | null>(null);
  const { user, profile } = useAuth();
  const [reports, setReports] = useState<EmergencyReport[]>([]);
  const [centers, setCenters] = useState<EvacuationCenter[]>([]);
  const [devices, setDevices] = useState<IotDevice[]>([]);
  const [safeRoutes, setSafeRoutes] = useState<SafeRoute[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<SelectedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [responderId, setResponderId] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [drawingRoute, setDrawingRoute] = useState(false);
  const [routePoints, setRoutePoints] = useState<SafeRoute['path']>([]);
  const [routeTitle, setRouteTitle] = useState('Landslide detour');
  const [savingRoute, setSavingRoute] = useState(false);
  const seenReportIdsRef = useRef<Set<string> | null>(null);
  const pulsingReportsRef = useRef<Map<string, number>>(new Map());
  const [pulsingReportIds, setPulsingReportIds] = useState<Set<string>>(new Set());
  const [dismissedPingIds, setDismissedPingIds] = useState<Set<string>>(new Set());
  const canAssignResponders = profile?.role === 'supervisor' || profile?.role === 'admin';

  const loadData = useCallback(async () => {
    setLoading(true);
    const [rRes, cData, deviceData, routes] = await Promise.all([
      getAllReports(0, 200, {}),
      getEvacuationCenters(),
      getIotDevices(),
      getSafeRoutes(),
    ]);
    const now = Date.now();
    if (!seenReportIdsRef.current) {
      rRes.data.forEach(report => {
        const createdAt = Date.parse(report.created_at);
        if (
          report.latitude !== null
          && report.longitude !== null
          && (report.status === 'open' || report.status === 'in_progress')
          && Number.isFinite(createdAt)
          && now - createdAt < 90000
        ) {
          pulsingReportsRef.current.set(report.id, createdAt + 90000);
        }
      });
    }
    const activeReportIds = new Set(
      rRes.data
        .filter(report => report.status === 'open' || report.status === 'in_progress')
        .map(report => report.id),
    );
    setDismissedPingIds(dismissed => new Set([...dismissed].filter(id => !activeReportIds.has(id))));
    const currentIds = new Set(rRes.data.map(report => report.id));
    if (seenReportIdsRef.current) {
      const newReports = rRes.data.filter(report => !seenReportIdsRef.current?.has(report.id));
      newReports.forEach(report => {
        pulsingReportsRef.current.set(report.id, Date.now() + 90000);
      });
    }
    seenReportIdsRef.current = currentIds;
    pulsingReportsRef.current.forEach((expiresAt, id) => {
      if (expiresAt <= now || !activeReportIds.has(id)) pulsingReportsRef.current.delete(id);
    });
    setPulsingReportIds(new Set(pulsingReportsRef.current.keys()));
    setReports(rRes.data);
    setSelected(current => current ? rRes.data.find(report => report.id === current.id) ?? current : null);
    setCenters(cData);
    setDevices(deviceData);
    setSafeRoutes(routes);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (canAssignResponders) getStaffProfiles().then(setStaff);
  }, [canAssignResponders]);

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    mapRef.current = L.map(mapDivRef.current, { center: DIPLAHAN_CENTER, zoom: 12, zoomControl: false });
    L.control.zoom({ position: 'topleft' }).addTo(mapRef.current);
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community', maxZoom: 19 },
    ).addTo(mapRef.current);
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    });
    const placeLabels = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Place names and boundaries © Esri', maxZoom: 19 },
    ).addTo(mapRef.current);
    layerRef.current = L.layerGroup().addTo(mapRef.current);

    // This outline is the published municipal ADM3 polygon, not synthetic barangay shapes.
    boundaryRef.current = L.geoJSON(diplomahanBoundaries as never, {
      attribution: '<a href="https://www.geoboundaries.org/">Municipal boundary: geoBoundaries, from NAMRIA / PSA / OCHA Philippines (CC BY 3.0 IGO)</a>',
      style: {
        color: '#fff',
        weight: 2,
        opacity: 0.95,
        fillColor: '#38bdf8',
        fillOpacity: 0.035,
        dashArray: '5 5',
      },
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(feature.properties.name, {
          permanent: false,
          direction: 'center',
          className: 'barangay-label',
        });
      },
    }).addTo(mapRef.current);

    L.control.layers({ Satellite: satellite, Streets: streets }, {
      'Place labels': placeLabels,
      'Municipal boundary': boundaryRef.current,
    }, {
      collapsed: true, position: 'topright',
    }).addTo(mapRef.current);
    L.control.scale({ imperial: false, metric: true, maxWidth: 100, position: 'bottomright' }).addTo(mapRef.current);
    routeLayerRef.current = L.layerGroup().addTo(mapRef.current);
    mapRef.current.fitBounds(DIPLAHAN_BOUNDS, { padding: [16, 16] });

    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const reportLayer = layerRef.current;
    if (!reportLayer) return;
    reportLayer.clearLayers();
    reports.forEach(r => {
      if (r.status === 'closed' || dismissedPingIds.has(r.id)) return;
      if (r.latitude === null || r.longitude === null) return;
      const hasActiveLocation = r.status === 'open' || r.status === 'in_progress';
      if (hasActiveLocation) {
        L.circleMarker([r.latitude, r.longitude], {
          radius: 12,
          color: '#dc2626',
          weight: 2,
          fillColor: '#ef4444',
          fillOpacity: 0.65,
          className: 'incident-location-pulse',
          interactive: false,
        }).addTo(reportLayer);
      }
      L.marker([r.latitude, r.longitude], {
        icon: markerIcon(
          '#c62828',
          '<path d="M12 8v4m0 4h.01"/><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"/>',
          hasActiveLocation || pulsingReportIds.has(r.id),
        ),
      })
        .bindTooltip(`${pulsingReportIds.has(r.id) ? 'NEW · ' : ''}${r.emergency_type.toUpperCase()} · ${r.severity.toUpperCase()}`, { direction: 'top' })
        .on('click', () => setSelected(r))
      .addTo(reportLayer);
    });
    devices.filter(device => device.status === 'active').forEach(device => {
      L.marker([device.latitude, device.longitude], { icon: sensorIcon })
        .bindTooltip(`${device.name} · ${device.last_reading === null ? 'No reading' : `${device.last_reading} ${device.alert_unit}`}`, { direction: 'top' })
        .addTo(reportLayer);
    });
    centers.filter(c => c.status === 'active').forEach(c => {
      L.marker([c.latitude, c.longitude], { icon: shelterIcon })
        .bindTooltip(c.name, { direction: 'top' })
        .addTo(reportLayer);
    });
  }, [reports, centers, devices, pulsingReportIds, dismissedPingIds]);

  useEffect(() => {
    const map = mapRef.current;
    const routeLayer = routeLayerRef.current;
    if (!map || !routeLayer) return;
    const addRoute = (points: SafeRoute['path'], title: string, draft = false) => {
      const latLngs = points.map(point => L.latLng(point.latitude, point.longitude));
      if (latLngs.length < 2) return;
      L.polyline(latLngs, {
        color: draft ? '#f59e0b' : '#15803d',
        weight: 10,
        opacity: 0.9,
        lineCap: 'round',
        dashArray: draft ? '8 10' : undefined,
      }).addTo(routeLayer);
      const line = L.polyline(latLngs, {
        color: draft ? '#f59e0b' : '#15803d',
        weight: 6,
        opacity: 1,
        lineCap: 'round',
        dashArray: draft ? '8 10' : undefined,
      }).addTo(routeLayer);
      const content = document.createElement('div');
      const heading = document.createElement('strong');
      heading.textContent = title;
      const note = document.createElement('p');
      note.textContent = draft
        ? 'Draft route — click the map to add safe waypoints.'
        : 'Operator-drawn route. Confirm road access and safety with responders before travel.';
      content.append(heading, note);
      line.bindPopup(content);
    };

    routeLayer.clearLayers();
    const activeReportIds = new Set(
      reports
        .filter(report => report.status === 'open' || report.status === 'in_progress')
        .map(report => report.id),
    );
    safeRoutes
      .filter(route => route.report_id !== null && activeReportIds.has(route.report_id))
      .forEach(route => addRoute(route.path, route.title));
    if (routePoints.length >= 2) addRoute(routePoints, routeTitle, true);
    routePoints.forEach((point, index) => {
      L.circleMarker([point.latitude, point.longitude], {
        radius: index === 0 || index === routePoints.length - 1 ? 6 : 4,
        color: '#fff',
        weight: 2,
        fillColor: '#d97706',
        fillOpacity: 1,
      }).addTo(routeLayer);
    });
  }, [reports, routePoints, routeTitle, safeRoutes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const mapElement = map.getContainer();
    mapElement.style.cursor = drawingRoute ? 'crosshair' : '';
    if (!drawingRoute) return () => { mapElement.style.cursor = ''; };

    const addWaypoint = (event: L.LeafletMouseEvent) => {
      setRoutePoints(points => {
        if (points.length >= 100) {
          toast.error('A route can contain no more than 100 points.');
          return points;
        }
        return [...points, {
          latitude: Number(event.latlng.lat.toFixed(6)),
          longitude: Number(event.latlng.lng.toFixed(6)),
        }];
      });
    };
    map.on('click', addWaypoint);
    return () => {
      map.off('click', addWaypoint);
      mapElement.style.cursor = '';
    };
  }, [drawingRoute]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadData(), 15000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const pingSelectedLocation = () => {
    if (!selected || selected.latitude === null || selected.longitude === null) {
      toast.error('This report does not include GPS coordinates.');
      return;
    }
    mapRef.current?.setView([selected.latitude, selected.longitude], 16);
    setDispatchOpen(true);
  };

  const dismissSelectedPing = () => {
    if (!selected) return;
    pulsingReportsRef.current.delete(selected.id);
    setPulsingReportIds(ids => {
      const next = new Set(ids);
      next.delete(selected.id);
      return next;
    });
    setDismissedPingIds(ids => new Set(ids).add(selected.id));
    setSelected(null);
    toast.success('Resolved incident location dismissed from the map.');
  };

  const handleAssignResponder = async () => {
    if (!selected || !user || !responderId) return;
    setDispatching(true);
    const { error } = await assignResponder(selected.id, responderId, user.id, 'Dispatched from the live incident map');
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Responder dispatched to the reported location.');
      setDispatchOpen(false);
      setResponderId('');
      await loadData();
    }
    setDispatching(false);
  };

  const startRouteDrawing = () => {
    if (!selected || selected.emergency_type !== 'landslide') return;
    setRoutePoints([]);
    setRouteTitle('Landslide detour');
    setDispatchOpen(false);
    setDrawingRoute(true);
    toast.info('Click the map to draw a route around the landslide. Add at least two points.');
  };

  const cancelRouteDrawing = () => {
    setDrawingRoute(false);
    setRoutePoints([]);
  };

  const handleSaveRoute = async () => {
    if (!selected || !user || routePoints.length < 2 || routeTitle.trim() === '') return;
    setSavingRoute(true);
    const result = await createSafeRoute({
      report_id: selected.id,
      title: routeTitle.trim(),
      path: routePoints,
    });
    if (result.error || !result.data) {
      toast.error(result.error?.message ?? 'The route could not be saved.');
      setSavingRoute(false);
      return;
    }

    const newRoute = result.data;
    setSafeRoutes(routes => [newRoute, ...routes.filter(route => route.report_id !== selected.id)]);
    setDrawingRoute(false);
    setRoutePoints([]);
    const notice = await dispatchNotification({
      title: 'Landslide detour available',
      body: `${newRoute.title} is now shown on the resident incident map. Confirm current road access and safety with responders before travel.`,
      target_role: 'resident',
    });
    if (notice.error) toast.error(`Route published, but residents could not be notified: ${notice.error.message}`);
    else toast.success('Safe route published and residents notified.');
    setSavingRoute(false);
  };

  const openCount = reports.filter(r => r.status === 'open').length;
  const inProgressCount = reports.filter(r => r.status === 'in_progress').length;

  return (
    <div className={embedded
      ? 'flex h-full min-h-[390px] flex-col overflow-hidden rounded-md border border-border bg-card shadow-sm'
      : 'flex h-[calc(100vh-56px)] flex-col'}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0 gap-3">
        <div>
          <h1 className="text-sm font-bold">{embedded ? 'Incident & Flood Monitoring Map' : 'Live Incident Map'}</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[11px] text-muted-foreground">
              <span className="text-[hsl(var(--severity-critical))] font-medium">{openCount}</span> open ·{' '}
              <span className="text-[hsl(var(--severity-high))] font-medium">{inProgressCount}</span> in progress
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => setShowLegend(v => !v)}>
            <Layers className="h-3.5 w-3.5 mr-1" />Legend
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <div ref={mapDivRef} className="absolute inset-0" />

        {/* Legend */}
        {showLegend && (
          <div className="absolute bottom-4 left-3 z-[1000] min-w-[160px] rounded border border-slate-200 bg-white/95 p-3 text-slate-700 shadow-lg backdrop-blur">
            <p className="text-xs font-semibold mb-2">Legend</p>
            <div className="mb-1 flex items-center gap-2 text-xs"><span className="h-3 w-3 rounded-full bg-red-700 ring-2 ring-red-100" />Emergency report</div>
            <div className="mb-1 flex items-center gap-2 text-xs"><span className="h-3 w-3 rounded-full bg-blue-600 ring-2 ring-blue-100" />Flood sensor</div>
            <div className="mb-1 flex items-center gap-2 text-xs"><span className="h-3 w-3 rounded-full bg-slate-500 ring-2 ring-slate-100" />Evacuation center</div>
            <div className="flex items-center gap-2 text-xs"><span className="h-0 w-5 border-t-2 border-dashed border-slate-500" />Municipal boundary</div>
          </div>
        )}

        {/* Selected report panel */}
        {selected && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 max-h-[calc(100%-2rem)] overflow-y-auto z-[1000] rounded border border-slate-300 bg-white p-4 text-black shadow-lg">
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="text-sm font-bold capitalize">{selected.emergency_type} Emergency</h3>
              <button onClick={() => setSelected(null)} className="text-slate-600 hover:text-black">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex gap-2">
                <span className="w-16 shrink-0 text-slate-700">Severity</span>
                <span className={`severity-${selected.severity} font-medium capitalize`}>{selected.severity}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-16 shrink-0">Status</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium status-${selected.status}`}>{selected.status.replace('_',' ')}</span>
              </div>
              {selected.description && (
                <div className="flex gap-2">
                  <span className="w-16 shrink-0 text-slate-700">Details</span>
                  <span className="line-clamp-2 text-slate-900">{selected.description}</span>
                </div>
              )}
              {selected.latitude !== null && selected.longitude !== null && (
                <div className="flex gap-2">
                  <span className="w-16 shrink-0 text-slate-700">GPS</span>
                  <span>{selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}</span>
                </div>
              )}
              <div className="flex gap-2">
                <span className="w-16 shrink-0 text-slate-700">Reported</span>
                <span>{format(new Date(selected.created_at), 'MMM d, h:mm a')}</span>
              </div>
            </div>
            <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
              {(selected.status === 'resolved' || selected.status === 'closed')
                && selected.latitude !== null
                && selected.longitude !== null
                && !dismissedPingIds.has(selected.id) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-full border-red-200 bg-white text-xs text-red-800 hover:bg-red-50 hover:text-red-900"
                    onClick={dismissSelectedPing}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />Dismiss resolved location ping
                  </Button>
                )}
              {selected.latitude !== null && selected.longitude !== null && (
                <Button size="sm" variant="outline" className="h-8 w-full border-slate-300 bg-white text-xs text-slate-900 hover:bg-slate-100 hover:text-black" onClick={pingSelectedLocation}>
                  <LocateFixed className="mr-1.5 h-3.5 w-3.5" />Ping location
                </Button>
              )}
              {dispatchOpen && canAssignResponders && (
                <div className="space-y-2 rounded border border-slate-300 bg-slate-50 p-2 text-black">
                  <p className="text-xs font-semibold"><UserPlus className="mr-1 inline h-3.5 w-3.5" />Dispatch responder</p>
                  <Select value={responderId} onValueChange={setResponderId}>
                    <SelectTrigger className="h-8 border-slate-300 bg-white text-xs text-black"><SelectValue placeholder="Select a responder…" /></SelectTrigger>
                    <SelectContent className="bg-white text-black">
                      {staff.map(responder => (
                        <SelectItem key={responder.id} value={responder.id}>
                          {responder.full_name} ({responder.role.replace('_', ' ')})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {staff.length === 0 && <p className="text-[11px] text-slate-700">No active responders are available to assign.</p>}
                  <Button size="sm" className="h-8 w-full text-xs" onClick={() => void handleAssignResponder()} disabled={!responderId || dispatching}>
                    {dispatching ? 'Sending…' : 'Send responder'}
                  </Button>
                </div>
              )}
              {selected.emergency_type === 'landslide' && canAssignResponders && (
                <div className="space-y-2 rounded border border-amber-300 bg-white p-2 text-black">
                  {drawingRoute ? (
                    <>
                      <p className="text-xs font-semibold"><Route className="mr-1 inline h-3.5 w-3.5" />Drawing landslide detour</p>
                      <p className="text-[11px] leading-relaxed">
                        Click at least two waypoints, starting on the approach side and ending on the safe side. Points: {routePoints.length}.
                      </p>
                      <Input value={routeTitle} onChange={event => setRouteTitle(event.target.value)} maxLength={160} aria-label="Safe route name" className="h-8 border-slate-300 bg-white text-xs text-black" />
                      <p className="text-[10px] leading-relaxed">
                        This is a manually drawn proposal, not verified road guidance. Confirm access with field responders before sharing.
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-8 flex-1 border-slate-300 bg-white text-xs text-slate-900 hover:bg-slate-100 hover:text-black" onClick={() => setRoutePoints(points => points.slice(0, -1))} disabled={routePoints.length === 0}>
                          <Undo2 className="mr-1 h-3.5 w-3.5" />Undo
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 flex-1 border-slate-300 bg-white text-xs text-slate-900 hover:bg-slate-100 hover:text-black" onClick={cancelRouteDrawing} disabled={savingRoute}>
                          Cancel
                        </Button>
                      </div>
                      <Button size="sm" className="h-8 w-full text-xs" onClick={() => void handleSaveRoute()} disabled={routePoints.length < 2 || !routeTitle.trim() || savingRoute}>
                        <Check className="mr-1 h-3.5 w-3.5" />{savingRoute ? 'Publishing…' : 'Publish route to residents'}
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-semibold"><Route className="mr-1 inline h-3.5 w-3.5" />Landslide detour</p>
                      <p className="text-[11px] leading-relaxed">Draw a proposed route around the affected area and publish it to the resident incident map.</p>
                      <Button size="sm" variant="outline" className="h-8 w-full border-slate-300 bg-white text-xs text-slate-900 hover:bg-slate-100 hover:text-black" onClick={startRouteDrawing}>
                        <Route className="mr-1.5 h-3.5 w-3.5" />Draw alternate route
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
