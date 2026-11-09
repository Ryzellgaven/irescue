import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { submitReport } from '@/lib/api';
import { DIPLAHAN_BARANGAYS } from '@/data/diplahan-barangays';
import { DIPLAHAN_BOUNDS, DIPLAHAN_CENTER, diplomahanBoundaries } from '@/data/diplahan-boundary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { MapPin, Upload, Loader2, AlertTriangle, X, CheckCircle2, ArrowLeft, ArrowRight, LocateFixed } from 'lucide-react';

const EMERGENCY_TYPES = [
  { value: 'fire', label: 'Fire' },
  { value: 'flood', label: 'Flood' },
  { value: 'medical', label: 'Medical Emergency' },
  { value: 'accident', label: 'Accident' },
  { value: 'landslide', label: 'Landslide' },
  { value: 'earthquake', label: 'Earthquake' },
  { value: 'other', label: 'Other' },
];

const SEVERITY_LEVELS = [
  { value: 'low', label: 'Low', color: 'text-[hsl(var(--severity-low))]' },
  { value: 'moderate', label: 'Moderate', color: 'text-[hsl(var(--severity-moderate))]' },
  { value: 'high', label: 'High', color: 'text-[hsl(var(--severity-high))]' },
  { value: 'critical', label: 'Critical', color: 'text-[hsl(var(--severity-critical))]' },
];

const schema = z.object({
  emergency_type: z.string().min(1, 'Select emergency type'),
  severity: z.string().min(1, 'Select severity level'),
  description: z.string().min(5, 'Describe the emergency'),
});
type FormData = z.infer<typeof schema>;
type LocationMethod = 'gps' | 'manual';

interface StreetChoice {
  name: string;
  latitude: number;
  longitude: number;
}

interface PhotonResponse {
  features?: {
    properties?: {
      type?: string;
      name?: string;
      locality?: string;
      district?: string;
      countrycode?: string;
    };
    geometry?: {
      coordinates?: [number, number];
    };
  }[];
}

function isWithinDiplahan(latitude: number, longitude: number) {
  const ring = diplomahanBoundaries.features[0].geometry.coordinates[0];
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [currentLongitude, currentLatitude] = ring[index];
    const [previousLongitude, previousLatitude] = ring[previous];
    const crossesLatitude = (currentLatitude > latitude) !== (previousLatitude > latitude);
    const crossingLongitude = ((previousLongitude - currentLongitude) * (latitude - currentLatitude))
      / (previousLatitude - currentLatitude) + currentLongitude;
    if (crossesLatitude && longitude < crossingLongitude) inside = !inside;
  }
  return inside;
}

export default function ReportEmergency() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [locationMethod, setLocationMethod] = useState<LocationMethod | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [selectedBarangay, setSelectedBarangay] = useState('');
  const [selectedStreet, setSelectedStreet] = useState('');
  const [pinSource, setPinSource] = useState<'street' | 'map' | null>(null);
  const [streetChoices, setStreetChoices] = useState<StreetChoice[]>([]);
  const [streetLoading, setStreetLoading] = useState(false);
  const [streetError, setStreetError] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const locationMapContainerRef = useRef<HTMLDivElement>(null);
  const locationMapRef = useRef<L.Map | null>(null);
  const locationMarkerRef = useRef<L.Marker | null>(null);
  const streetRequestRef = useRef<AbortController | null>(null);

  const form = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (locationMethod !== 'manual' || step !== 1 || !locationMapContainerRef.current || locationMapRef.current) return;

    const map = L.map(locationMapContainerRef.current, { center: DIPLAHAN_CENTER, zoom: 12 });
    locationMapRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    L.geoJSON(diplomahanBoundaries as never, {
      style: { color: '#89151f', weight: 2, fillOpacity: 0.03, dashArray: '5 5' },
    }).addTo(map);
    map.fitBounds(DIPLAHAN_BOUNDS, { padding: [12, 12] });

    const pinIcon = L.divIcon({
      html: '<span style="display:block;width:22px;height:22px;border:3px solid white;border-radius:50%;background:#b91c1c;box-shadow:0 1px 8px #0009"></span>',
      className: '',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    map.on('click', event => {
      if (!isWithinDiplahan(event.latlng.lat, event.latlng.lng)) {
        toast.error('Choose a location inside Diplahan.');
        return;
      }
      const point = {
        lat: Number(event.latlng.lat.toFixed(6)),
        lng: Number(event.latlng.lng.toFixed(6)),
        accuracy: 0,
      };
      setCoords(point);
      setPinSource('map');
      locationMarkerRef.current?.setLatLng([point.lat, point.lng]);
      if (!locationMarkerRef.current) {
        locationMarkerRef.current = L.marker([point.lat, point.lng], { icon: pinIcon }).addTo(map);
      }
    });

    return () => {
      map.remove();
      locationMapRef.current = null;
      locationMarkerRef.current = null;
    };
  }, [locationMethod, selectedBarangay, step]);

  useEffect(() => () => {
    streetRequestRef.current?.abort();
    streetRequestRef.current = null;
  }, []);

  useEffect(() => {
    const marker = locationMarkerRef.current;
    const map = locationMapRef.current;
    if (!coords || !marker || !map || locationMethod !== 'manual') return;
    marker.setLatLng([coords.lat, coords.lng]);
  }, [coords, locationMethod]);

  const captureGPS = useCallback(() => new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 10000,
      enableHighAccuracy: true,
      maximumAge: 0,
    });
  }), []);

  const detectGPS = useCallback(async () => {
    streetRequestRef.current?.abort();
    streetRequestRef.current = null;
    setLocationMethod('gps');
    setCoords(null);
    setSelectedBarangay('');
    setSelectedStreet('');
    setStreetChoices([]);
    setStreetLoading(false);
    setStreetError('');
    setPinSource(null);
    setGpsError('');
    setGpsLoading(true);
    try {
      const pos = await captureGPS();
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      toast.success('Location captured');
    } catch {
      setGpsError('Could not access your location. Check browser permission and try again, or choose a barangay and pin the location on the map.');
    } finally {
      setGpsLoading(false);
    }
  }, [captureGPS]);

  const chooseBarangay = async (barangay: string) => {
    streetRequestRef.current?.abort();
    streetRequestRef.current = null;
    setSelectedBarangay(barangay);
    setSelectedStreet('');
    setStreetChoices([]);
    setStreetLoading(false);
    setStreetError('');
    setCoords(null);
    setPinSource(null);
    locationMarkerRef.current?.remove();
    locationMarkerRef.current = null;
    locationMapRef.current?.fitBounds(DIPLAHAN_BOUNDS, { padding: [12, 12] });
    if (!barangay) return;

    const controller = new AbortController();
    streetRequestRef.current = controller;
    setStreetLoading(true);
    try {
      const bounds = L.latLngBounds(DIPLAHAN_BOUNDS);
      const query = new URL('https://photon.komoot.io/api/');
      query.searchParams.set('q', `${barangay} Diplahan Zamboanga Sibugay`);
      query.searchParams.set('layer', 'street');
      query.searchParams.set(
        'bbox',
        `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`,
      );
      query.searchParams.set('limit', '50');
      query.searchParams.set('lang', 'en');
      const response = await fetch(query, { signal: controller.signal });
      if (!response.ok) throw new Error(`Street lookup failed (${response.status}).`);
      const data = (await response.json()) as PhotonResponse;
      const normalizedBarangay = barangay.toLocaleLowerCase();
      const choices = (data.features ?? []).flatMap(feature => {
        const properties = feature.properties;
        const coordinates = feature.geometry?.coordinates;
        if (
          properties?.type !== 'street'
          || properties.countrycode !== 'PH'
          || !properties.name
          || !coordinates
          || ![properties.locality, properties.district].some(
            locality => locality?.trim().toLocaleLowerCase() === normalizedBarangay,
          )
        ) return [];
        const [longitude, latitude] = coordinates;
        if (!isWithinDiplahan(latitude, longitude)) return [];
        return [{
          name: properties.name,
          latitude,
          longitude,
        }];
      });
      const uniqueChoices = [...new Map(choices.map(choice => [choice.name, choice])).values()];
      setStreetChoices(uniqueChoices);
      if (uniqueChoices.length === 0) {
        setStreetError('OpenStreetMap has no named streets mapped for this barangay yet. Tap the map below to place the exact incident pin.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const message = error instanceof Error ? error.message : 'Could not load mapped streets.';
      setStreetError(`${message} You can still place the incident pin directly on the map.`);
    } finally {
      if (streetRequestRef.current === controller) {
        streetRequestRef.current = null;
        setStreetLoading(false);
      }
    }
  };

  const chooseStreet = (streetName: string) => {
    setSelectedStreet(streetName);
    const choice = streetChoices.find(street => street.name === streetName);
    if (!choice) return;
    const point = { lat: choice.latitude, lng: choice.longitude, accuracy: 0 };
    setCoords(point);
    setPinSource('street');
    locationMapRef.current?.setView([point.lat, point.lng], 17);
    if (locationMapRef.current) {
      const icon = L.divIcon({
        html: '<span style="display:block;width:22px;height:22px;border:3px solid white;border-radius:50%;background:#b91c1c;box-shadow:0 1px 8px #0009"></span>',
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      if (locationMarkerRef.current) locationMarkerRef.current.setLatLng([point.lat, point.lng]);
      else locationMarkerRef.current = L.marker([point.lat, point.lng], { icon }).addTo(locationMapRef.current!);
    }
  };

  const continueToDetails = () => {
    if (!locationMethod) {
      toast.error('Choose how you want to provide the incident location.');
      return;
    }
    if (locationMethod === 'gps' && !coords) {
      toast.error('Track your location before continuing.');
      return;
    }
    if (locationMethod === 'manual' && (!selectedBarangay || !coords)) {
      toast.error('Choose a barangay and select a street or tap the map to pin the location.');
      return;
    }
    setStep(2);
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Photo must be under 5MB'); return; }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const onSubmit = async (values: FormData) => {
    if (!locationMethod) {
      toast.error('Choose how you want to provide the incident location.');
      setStep(1);
      return;
    }
    setSubmitting(true);
    try {
      let location = coords;
      if (locationMethod === 'gps') {
        try {
          const position = await captureGPS();
          location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          setCoords(location);
        } catch {
          toast.error('Could not refresh your GPS location. Retry tracking or choose a manual address.');
          setStep(1);
          return;
        }
      }
      setUploading(Boolean(photoFile));
      const { error } = await submitReport({
        emergency_type: values.emergency_type as never,
        severity: values.severity as never,
        description: values.description,
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
        address_text: locationMethod === 'manual'
          ? `Brgy. ${selectedBarangay}${selectedStreet ? `, ${selectedStreet}` : ', selected map pin'}`
          : '',
        photo_url: null,
        photo: photoFile,
      });

      if (error) { toast.error(error.message); return; }
      toast.success('Emergency report submitted. LDRRMO has been notified.');
      navigate('/resident/my-reports');
    } finally {
      setUploading(false);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#f2f4f5] px-4 py-6 text-slate-900 md:px-8 md:py-8">
      <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-6">
        <p className="mb-1 text-xs uppercase tracking-widest text-slate-700">Resident Portal</p>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-[hsl(var(--severity-critical))] shrink-0" />
          Report Emergency
        </h1>
        <p className="mt-1 text-sm text-slate-700">
          LDRRMO responders will be notified immediately upon submission.
        </p>
      </div>

      <Form {...form}>
        <form
          onSubmit={event => {
            if (step === 1) {
              event.preventDefault();
              continueToDetails();
              return;
            }
            void form.handleSubmit(onSubmit)(event);
          }}
          className="space-y-5"
        >
          <div className="mb-6 flex items-center gap-3" aria-label={`Step ${step} of 2`}>
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step === 1 ? 'bg-[#89151f] text-white' : 'bg-emerald-100 text-emerald-800'}`}>
              {step === 1 ? '1' : <CheckCircle2 className="h-4 w-4" />}
            </span>
            <span className={`h-0.5 flex-1 ${step === 2 ? 'bg-[#89151f]' : 'bg-slate-200'}`} />
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step === 2 ? 'bg-[#89151f] text-white' : 'bg-slate-100 text-slate-500'}`}>2</span>
            <span className={`text-xs font-medium ${step === 2 ? 'text-slate-900' : 'text-slate-600'}`}>
              {step === 1 ? 'Location' : 'Emergency details'}
            </span>
          </div>

          {step === 1 ? (
            <section className="space-y-4" aria-labelledby="location-step-heading">
              <div>
                <h2 id="location-step-heading" className="text-lg font-bold text-slate-900">Where is the emergency?</h2>
                <p className="mt-1 text-sm text-slate-700">Choose how you want to share the incident location.</p>
              </div>

              <button
                type="button"
                aria-pressed={locationMethod === 'gps'}
                onClick={() => { setLocationMethod('gps'); setCoords(null); setGpsError(''); }}
                className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors ${locationMethod === 'gps' ? 'border-[#89151f] bg-[#89151f]/5 ring-1 ring-[#89151f]' : 'border-slate-300 bg-white hover:border-[#89151f]/60'}`}
              >
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${locationMethod === 'gps' ? 'bg-[#89151f] text-white' : 'bg-slate-100 text-slate-700'}`}>
                  <LocateFixed className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Use my current location</span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-700">Use your device GPS to include coordinates for responders.</span>
                </span>
              </button>

              <button
                type="button"
                aria-pressed={locationMethod === 'manual'}
                onClick={() => {
                  setLocationMethod('manual');
                  setCoords(null);
                  setSelectedBarangay('');
                  setSelectedStreet('');
                  setStreetChoices([]);
                  setStreetLoading(false);
                  setStreetError('');
                  setPinSource(null);
                  setGpsError('');
                }}
                className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors ${locationMethod === 'manual' ? 'border-[#89151f] bg-[#89151f]/5 ring-1 ring-[#89151f]' : 'border-slate-300 bg-white hover:border-[#89151f]/60'}`}
              >
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${locationMethod === 'manual' ? 'bg-[#89151f] text-white' : 'bg-slate-100 text-slate-700'}`}>
                  <MapPin className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Enter a location manually</span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-700">Choose a barangay and street, then pin the exact spot on the map.</span>
                </span>
              </button>

              {locationMethod === 'gps' && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  {coords ? (
                    <div className="flex items-start gap-2 text-sm text-slate-900">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                      <div>
                        <p className="font-semibold">Location captured</p>
                        <p className="mt-1 break-all text-xs text-slate-700">
                          {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)} · accuracy about {Math.round(coords.accuracy)} m
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-700">
                      GPS accuracy depends on your device and surroundings. Allow location access when prompted.
                    </p>
                  )}
                  <Button type="button" onClick={() => void detectGPS()} disabled={gpsLoading} className="h-10 w-full bg-[#89151f] text-white hover:bg-[#70111a]">
                    {gpsLoading
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Finding your location…</>
                      : <><LocateFixed className="mr-2 h-4 w-4" />{coords ? 'Update my location' : 'Track my location'}</>
                    }
                  </Button>
                  {gpsError && <p role="alert" className="text-xs font-medium text-red-700">{gpsError}</p>}
                </div>
              )}

              {locationMethod === 'manual' && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="space-y-1.5">
                    <label htmlFor="incident-barangay" className="text-sm font-medium text-slate-900">Barangay</label>
                    <Select value={selectedBarangay} onValueChange={value => void chooseBarangay(value)}>
                      <SelectTrigger id="incident-barangay" className="h-11 border-slate-300 bg-white text-slate-900">
                        <SelectValue placeholder="Choose a barangay…" />
                      </SelectTrigger>
                      <SelectContent>
                        {DIPLAHAN_BARANGAYS.map(barangay => (
                          <SelectItem key={barangay} value={barangay}>{barangay}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedBarangay && (
                    <div className="space-y-1.5">
                      <label htmlFor="incident-street" className="text-sm font-medium text-slate-900">Street</label>
                      <Select
                        value={selectedStreet}
                        onValueChange={chooseStreet}
                        disabled={streetLoading || streetChoices.length === 0}
                      >
                        <SelectTrigger id="incident-street" className="h-11 border-slate-300 bg-white text-slate-900">
                          <SelectValue placeholder={streetLoading ? 'Finding mapped streets…' : 'Choose a mapped street…'} />
                        </SelectTrigger>
                        <SelectContent>
                          {streetChoices.map(street => (
                            <SelectItem key={street.name} value={street.name}>{street.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-700">
                        {streetLoading
                          ? 'Searching OpenStreetMap for named streets in this barangay…'
                          : streetError || 'Selecting a street places an approximate pin. Tap the map to mark the exact incident location.'}
                      </p>
                    </div>
                  )}

                  {selectedBarangay && (
                    <>
                      <p className="text-xs font-medium text-slate-900">
                        {coords
                          ? pinSource === 'map' ? 'Exact map pin selected.' : 'Approximate street pin selected.'
                          : 'Tap the map to place an exact pin for this incident.'}
                      </p>
                      <div
                        ref={locationMapContainerRef}
                        aria-label="Choose the exact incident location on the map"
                        className="h-64 w-full overflow-hidden rounded border border-slate-300 bg-slate-200"
                      />
                      {coords && (
                        <p className="break-all text-xs text-slate-700">
                          Pin: {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-600">Map data © OpenStreetMap contributors</p>
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1 border-slate-300 bg-white text-slate-900 hover:bg-slate-100" onClick={() => navigate('/resident')}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="flex-1 bg-[#89151f] text-white hover:bg-[#70111a]"
                  disabled={gpsLoading || streetLoading || (locationMethod === 'gps' && !coords) || (locationMethod === 'manual' && (!selectedBarangay || !coords))}
                  onClick={continueToDetails}
                >
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </section>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex min-w-0 items-start gap-2 text-sm text-slate-900">
                  {locationMethod === 'gps' ? <LocateFixed className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" /> : <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" />}
                  <div className="min-w-0">
                    <p className="font-semibold">{locationMethod === 'gps' ? 'GPS location selected' : 'Manual location selected'}</p>
                    <p className="break-all text-xs text-slate-700">
                      {locationMethod === 'gps' && coords
                        ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)} · accuracy about ${Math.round(coords.accuracy)} m`
                        : locationMethod === 'manual'
                          ? `Brgy. ${selectedBarangay}${selectedStreet ? `, ${selectedStreet}` : ''}`
                          : ''}
                    </p>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" className="shrink-0 text-xs text-[#89151f]" onClick={() => setStep(1)}>Change</Button>
              </div>

              <FormField control={form.control} name="emergency_type" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-900">Emergency Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl><SelectTrigger className="border-slate-300 bg-white text-slate-900"><SelectValue placeholder="Select type…" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {EMERGENCY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="severity" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-900">Severity Level</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl><SelectTrigger className="border-slate-300 bg-white text-slate-900"><SelectValue placeholder="Select severity…" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {SEVERITY_LEVELS.map(s => (
                        <SelectItem key={s.value} value={s.value}>
                          <span className={s.color}>{s.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-900">Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the emergency situation, number of people affected, and any other relevant details…"
                      className="min-h-[100px] resize-none border-slate-300 bg-white px-3 text-slate-900 placeholder:text-slate-500"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div>
                <p className="mb-2 text-sm font-medium text-slate-900">Photo Evidence <span className="font-normal text-slate-700">(optional)</span></p>
                {photoPreview ? (
                  <div className="relative aspect-video w-full overflow-hidden rounded border border-slate-300 bg-slate-100">
                    <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
                    <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-slate-900 hover:bg-white">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded border border-dashed border-slate-300 p-8 text-slate-800 transition-colors hover:border-[#89151f]/50 hover:bg-[#89151f]/5">
                    <Upload className="h-5 w-5" />
                    <span className="text-xs">Click to attach photo (max 5MB)</span>
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              </div>

              {uploading && (
                <div className="flex items-center gap-2 text-xs text-slate-800">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Uploading photo…
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1 border-slate-300 bg-white text-slate-900 hover:bg-slate-100" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />Back
                </Button>
                <Button type="submit" className="flex-1 bg-[#89151f] text-white hover:bg-[#70111a]" disabled={submitting || uploading}>
                  {submitting
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><AlertTriangle className="mr-2 h-4 w-4" />Submit Report</>
                  }
                </Button>
              </div>
            </>
          )}
        </form>
      </Form>

      {/* Offline notice */}
      <p className="mt-6 text-center text-xs text-slate-700">
        Reports are stored offline and auto-submitted when connectivity is restored.
      </p>
      </div>
    </div>
  );
}
