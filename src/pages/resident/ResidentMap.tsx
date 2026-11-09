import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getActiveReports, getEvacuationCenters, getSafeRoutes } from '@/lib/api';
import { diplomahanBoundaries, DIPLAHAN_BOUNDS, DIPLAHAN_CENTER } from '@/data/diplahan-boundary';
import type { EmergencyReport, EvacuationCenter, SafeRoute } from '@/types/index';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Shield, Loader2, RefreshCw, LocateFixed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// Fix Leaflet default icon
delete (L.Icon.Default.prototype as unknown as Record<string,unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const SEVERITY_COLORS: Record<string, string> = {
  low: '#22c55e', moderate: '#eab308', high: '#f97316', critical: '#ef4444',
};

function makeMarker(color: string) {
  return L.divIcon({
    html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 6px ${color}88"></div>`,
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}
const shelterIcon = L.divIcon({
  html: `<div style="background:#00bcd4;width:16px;height:16px;border-radius:3px;border:2px solid #fff;display:flex;align-items:center;justify-content:center">🏥</div>`,
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});
const myLocIcon = L.divIcon({
  html: `<div style="background:#00e5ff;width:12px;height:12px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 10px #00e5ff"></div>`,
  className: '',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

export default function ResidentMap() {
  const mapRef = useRef<L.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const locationLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const boundaryRef = useRef<L.GeoJSON | null>(null);
  const locationWatchRef = useRef<number | null>(null);
  const [reports, setReports] = useState<EmergencyReport[]>([]);
  const [centers, setCenters] = useState<EvacuationCenter[]>([]);
  const [safeRoutes, setSafeRoutes] = useState<SafeRoute[]>([]);
  const [myPos, setMyPos] = useState<[number, number] | null>(null);
  const [myAccuracy, setMyAccuracy] = useState<number | null>(null);
  const [tracking, setTracking] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [reports, cRes, routes] = await Promise.all([
      getActiveReports(),
      getEvacuationCenters(),
      getSafeRoutes(),
    ]);
    setReports(reports);
    setCenters(cRes);
    setSafeRoutes(routes);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Init map
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    mapRef.current = L.map(mapDivRef.current, {
      center: DIPLAHAN_CENTER,
      zoom: 12,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(mapRef.current);
    markersRef.current = L.layerGroup().addTo(mapRef.current);
    locationLayerRef.current = L.layerGroup().addTo(mapRef.current);
    routeLayerRef.current = L.layerGroup().addTo(mapRef.current);

    // Draw the published municipal outline without implying estimated barangay lines are surveyed.
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

    // Fit map to Diplahan municipal bounds on load
    mapRef.current.fitBounds(DIPLAHAN_BOUNDS, { padding: [16, 16] });

    return () => {
      if (locationWatchRef.current !== null) navigator.geolocation?.clearWatch(locationWatchRef.current);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const toggleTracking = () => {
    if (tracking) {
      if (locationWatchRef.current !== null) navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
      setTracking(false);
      toast.info('Location tracking stopped');
      return;
    }
    if (!navigator.geolocation) {
      toast.error('Location tracking is not supported by this browser.');
      return;
    }
    setTracking(true);
    locationWatchRef.current = navigator.geolocation.watchPosition(
      position => {
        setMyPos([position.coords.latitude, position.coords.longitude]);
        setMyAccuracy(position.coords.accuracy);
      },
      error => {
        locationWatchRef.current = null;
        setTracking(false);
        const message = error.code === error.PERMISSION_DENIED
          ? 'Allow location access in your browser settings to track your position.'
          : error.code === error.POSITION_UNAVAILABLE
            ? 'Your device could not determine its location.'
            : 'Location request timed out. Try again where GPS reception is better.';
        toast.error(message);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
  };

  const centerOnMyLocation = () => {
    if (myPos) mapRef.current?.setView(myPos, 16);
    else toast.info('Start location tracking to find your position.');
  };

  // Update markers
  useEffect(() => {
    if (!mapRef.current || !markersRef.current) return;
    markersRef.current.clearLayers();

    reports.forEach(r => {
      if (r.latitude !== null && r.longitude !== null) {
        const color = SEVERITY_COLORS[r.severity] ?? '#aaa';
        L.marker([r.latitude, r.longitude], { icon: makeMarker(color) })
          .bindPopup(`<b>${r.emergency_type.toUpperCase()}</b><br>Severity: ${r.severity}<br>Status: ${r.status}`)
          .addTo(markersRef.current!);
      }
    });

    centers.filter(c => c.status === 'active').forEach(c => {
      L.marker([c.latitude, c.longitude], { icon: shelterIcon })
        .bindPopup(`<b>${c.name}</b><br>${c.address}<br>Capacity: ${c.capacity}`)
        .addTo(markersRef.current!);
    });

  }, [reports, centers]);

  useEffect(() => {
    const routeLayer = routeLayerRef.current;
    if (!routeLayer) return;
    routeLayer.clearLayers();
    const activeReportIds = new Set(reports.map(report => report.id));
    safeRoutes.filter(route => route.report_id !== null && activeReportIds.has(route.report_id)).forEach(route => {
      const latLngs = route.path.map(point => L.latLng(point.latitude, point.longitude));
      if (latLngs.length < 2) return;
      L.polyline(latLngs, {
        color: '#fff',
        weight: 10,
        opacity: 0.95,
        lineCap: 'round',
      }).addTo(routeLayer);
      const line = L.polyline(latLngs, {
        color: '#15803d',
        weight: 6,
        opacity: 1,
        lineCap: 'round',
      }).addTo(routeLayer);
      const content = document.createElement('div');
      const heading = document.createElement('strong');
      heading.textContent = route.title;
      const note = document.createElement('p');
      note.textContent = 'Operator-drawn proposal. Confirm road access and safety with responders before travel.';
      content.append(heading, note);
      line.bindPopup(content).bindTooltip(route.title);
    });
  }, [reports, safeRoutes]);

  useEffect(() => {
    if (!mapRef.current || !locationLayerRef.current) return;
    locationLayerRef.current.clearLayers();
    if (!myPos) return;
    if (myAccuracy !== null) {
      L.circle(myPos, {
        radius: myAccuracy,
        color: '#0284c7',
        weight: 1,
        fillColor: '#38bdf8',
        fillOpacity: 0.16,
      }).addTo(locationLayerRef.current);
    }
    L.marker(myPos, { icon: myLocIcon })
      .bindPopup(`<b>Your device location</b>${myAccuracy !== null ? `<br>Accuracy: about ${Math.round(myAccuracy)} m` : ''}`)
      .addTo(locationLayerRef.current);
  }, [myPos, myAccuracy]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadData(), 15000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  return (
    <div className="relative h-[calc(100vh-56px)] md:h-screen flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <div>
          <h1 className="text-sm font-bold">Incident Map</h1>
          <p className="text-xs text-muted-foreground">{reports.length} active incidents</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {myAccuracy !== null && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                GPS accuracy ±{Math.round(myAccuracy)} m
              </span>
            )}
            <Button variant={tracking ? 'default' : 'outline'} size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={toggleTracking} aria-pressed={tracking}>
              <LocateFixed className="h-3.5 w-3.5" />
              {tracking ? 'Stop tracking' : 'Track my location'}
            </Button>
            {myPos && (
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label="Center map on my location" onClick={centerOnMyLocation}>
                <LocateFixed className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground">
            {Object.entries(SEVERITY_COLORS).map(([k,v]) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{background:v}} />
                {k}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-primary/60" />shelter
            </span>
          </div>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      <div ref={mapDivRef} className="flex-1 min-h-0 w-full" />
      {safeRoutes.length > 0 && (
        <div className="absolute left-3 top-[4.5rem] z-[1000] max-w-[min(22rem,calc(100%-1.5rem))] rounded border border-green-200 bg-white/95 p-3 text-green-950 shadow-lg">
          <p className="text-xs font-semibold">Published landslide detour{safeRoutes.length === 1 ? '' : 's'} ({safeRoutes.length})</p>
          <p className="mt-1 text-xs">{safeRoutes[0].title}</p>
          <p className="mt-1 text-[10px] leading-relaxed">
            Tap a green route for details. Confirm road access and safety with responders before travel.
          </p>
        </div>
      )}
    </div>
  );
}
