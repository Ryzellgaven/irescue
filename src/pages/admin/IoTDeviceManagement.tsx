import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { getIotDevices, upsertIotDevice } from '@/lib/api';
import type { IotDevice } from '@/types/index';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Cpu, Plus, Pencil, Activity, RefreshCw, MapPin } from 'lucide-react';
import { format } from 'date-fns';

const SENSOR_TYPES = ['water_level', 'rainfall', 'wind_speed', 'temperature'];
const SENSOR_UNITS: Record<string, string> = {
  water_level: 'm', rainfall: 'mm/hr', wind_speed: 'km/h', temperature: '°C',
};

const schema = z.object({
  device_code: z.string().min(2),
  name: z.string().min(2),
  sensor_type: z.string().min(1),
  latitude: z.string().min(1),
  longitude: z.string().min(1),
  alert_threshold: z.string().min(1),
  alert_unit: z.string().min(1),
  status: z.string().min(1),
});
type FormData = z.infer<typeof schema>;

export default function IoTDeviceManagement() {
  const [devices, setDevices] = useState<IotDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<IotDevice | null>(null);
  const [saving, setSaving] = useState(false);
  const [newDeviceCredentials, setNewDeviceCredentials] = useState<{ deviceCode: string; deviceToken: string } | null>(null);

  const form = useForm<FormData, unknown, FormData>({
    resolver: zodResolver(schema) as import('react-hook-form').Resolver<FormData>,
    defaultValues: { sensor_type: 'water_level', alert_unit: 'm', status: 'active' },
  });

  const load = useCallback(() => {
    setLoading(true);
    getIotDevices().then(d => { setDevices(d); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const watchSensorType = form.watch('sensor_type');
  useEffect(() => {
    form.setValue('alert_unit', SENSOR_UNITS[watchSensorType] ?? '');
  }, [watchSensorType, form]);

  const openAdd = () => {
    setEditing(null);
    form.reset({ sensor_type: 'water_level', alert_unit: 'm', status: 'active' });
    setOpen(true);
  };
  const openEdit = (d: IotDevice) => {
    setEditing(d);
    form.reset({
      device_code: d.device_code, name: d.name, sensor_type: d.sensor_type,
      latitude: String(d.latitude), longitude: String(d.longitude),
      alert_threshold: String(d.alert_threshold), alert_unit: d.alert_unit, status: d.status,
    });
    setOpen(true);
  };

  const onSubmit = async (values: FormData) => {
    setSaving(true);
    const payload = {
      ...(editing ? { id: editing.id } : {}),
      device_code: values.device_code, name: values.name,
      sensor_type: values.sensor_type as never,
      latitude: parseFloat(values.latitude), longitude: parseFloat(values.longitude),
      alert_threshold: parseFloat(values.alert_threshold),
      alert_unit: values.alert_unit, status: values.status,
    };
    const { data, error } = await upsertIotDevice(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? 'Device updated' : 'Device added');
    if (data?.device_token) {
      setNewDeviceCredentials({ deviceCode: data.device_code, deviceToken: data.device_token });
    }
    setOpen(false);
    load();
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Admin Panel</p>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary shrink-0" />IoT Device Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{devices.length} device{devices.length !== 1 ? 's' : ''} registered</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={load} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8" onClick={openAdd}><Plus className="mr-1.5 h-4 w-4" />Add Device</Button>
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} IoT Device</DialogTitle></DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 mt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="device_code" render={({ field }) => (
                      <FormItem><FormLabel>Device Code</FormLabel><FormControl><Input className="px-3" placeholder="SENSOR-001" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Device Name</FormLabel><FormControl><Input className="px-3" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="sensor_type" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sensor Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {SENSOR_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace('_',' ')}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="latitude" render={({ field }) => (
                      <FormItem><FormLabel>Latitude</FormLabel><FormControl><Input className="px-3" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="longitude" render={({ field }) => (
                      <FormItem><FormLabel>Longitude</FormLabel><FormControl><Input className="px-3" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="alert_threshold" render={({ field }) => (
                      <FormItem><FormLabel>Alert Threshold</FormLabel><FormControl><Input type="number" className="px-3" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="alert_unit" render={({ field }) => (
                      <FormItem><FormLabel>Unit</FormLabel><FormControl><Input className="px-3" {...field} /></FormControl></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="maintenance">Maintenance</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full" disabled={saving}>
                    {saving ? <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : 'Save'}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={newDeviceCredentials !== null} onOpenChange={isOpen => { if (!isOpen) setNewDeviceCredentials(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save sensor credentials</DialogTitle>
          </DialogHeader>
          {newDeviceCredentials && (
            <div className="space-y-3 text-sm">
              <p>Copy these credentials now. The device token is shown only once.</p>
              <div>
                <p className="text-muted-foreground">Device code</p>
                <code className="break-all">{newDeviceCredentials.deviceCode}</code>
              </div>
              <div>
                <p className="text-muted-foreground">Device token</p>
                <code className="break-all">{newDeviceCredentials.deviceToken}</code>
              </div>
              <p className="text-muted-foreground">
                Configure the sensor to POST its reading to the application API&apos;s <code>device-reading</code> endpoint using the
                <code> X-Device-Token </code> header.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[0,1,2].map(i => <Skeleton key={i} className="h-32 rounded" />)}
        </div>
      ) : devices.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Cpu className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No IoT devices registered yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {devices.map(d => {
            const isAlert = d.last_reading !== null && d.last_reading >= d.alert_threshold;
            return (
              <Card key={d.id} className={`bg-card border-border ${isAlert ? 'border-[hsl(var(--severity-critical)/0.5)]' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${d.status === 'active' ? 'bg-[hsl(var(--severity-low))]' : 'bg-muted-foreground/40'}`} />
                      <h3 className="text-sm font-semibold truncate">{d.name}</h3>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => openEdit(d)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Code</span><p className="font-mono font-medium">{d.device_code}</p></div>
                    <div><span className="text-muted-foreground">Type</span><p className="capitalize">{d.sensor_type.replace('_',' ')}</p></div>
                    <div>
                      <span className="text-muted-foreground">Last Reading</span>
                      <p className={isAlert ? 'text-[hsl(var(--severity-critical))] font-semibold' : 'font-medium'}>
                        {d.last_reading !== null ? `${d.last_reading} ${d.alert_unit}` : '—'}
                      </p>
                    </div>
                    <div><span className="text-muted-foreground">Threshold</span><p>{d.alert_threshold} {d.alert_unit}</p></div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground/60">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span>{d.latitude?.toFixed(4)}, {d.longitude?.toFixed(4)}</span>
                    {d.last_reading_at && (
                      <span className="ml-auto flex items-center gap-1">
                        <Activity className="h-3 w-3" />{format(new Date(d.last_reading_at), 'HH:mm')}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
