import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertTriangle, Map, Activity, Bell, Shield, Phone,
  ChevronRight, Cpu, Users, Radio,
} from 'lucide-react';

const features = [
  { icon: AlertTriangle, label: 'Emergency Reporting', desc: 'Submit geo-tagged emergency reports with photo evidence instantly.' },
  { icon: Map, label: 'GIS Incident Map', desc: 'Real-time Leaflet map with live incident markers and flood zone overlays.' },
  { icon: Activity, label: 'IoT Flood Monitoring', desc: 'Live water level and rainfall sensor data with threshold alerts.' },
  { icon: Bell, label: 'Emergency Alerts', desc: 'Instant broadcast notifications to all residents via multiple channels.' },
  { icon: Shield, label: 'Evacuation Centers', desc: 'Map and list of active evacuation centers with capacity tracking.' },
  { icon: Phone, label: 'Caller/SMS Tracking', desc: 'Log and track emergency calls and SMS reports from the field.' },
  { icon: Users, label: 'Responder Coordination', desc: 'Assign and track LDRRMO staff with real-time GPS positions.' },
  { icon: Radio, label: 'Incident Management', desc: 'Full incident lifecycle from open to resolved with after-action reports.' },
  { icon: Cpu, label: 'Admin Dashboard', desc: 'Complete system management with audit logs, analytics, and IoT device control.' },
];

export default function LandingPage() {
  return (
    <div className="dashboard-theme min-h-screen bg-[#f2f4f5] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#74151d] text-white shadow-sm">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="inline-flex items-center gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/70 bg-white shadow-sm">
              <Shield className="h-8 w-8 fill-[#86151f] text-[#86151f]" strokeWidth={1.5} />
              <AlertTriangle className="absolute h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70 sm:text-xs">Municipality of Diplahan</p>
              <p className="mt-0.5 text-sm font-bold leading-tight sm:text-base">Emergency Response System</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white" asChild>
              <Link to="/login">Sign In</Link>
            </Button>
            <Button size="sm" className="rounded-lg bg-white font-semibold text-[#89151f] shadow-sm hover:bg-white/90" asChild>
              <Link to="/register">Register</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-[#74151d] text-white">
        <div className="tactical-grid pointer-events-none absolute inset-0 opacity-20" />
        <div className="pointer-events-none absolute -right-36 top-[-12rem] h-[34rem] w-[34rem] rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-16 top-[-8rem] h-[25rem] w-[25rem] rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 h-72 w-[120%] rotate-[-6deg] rounded-[50%] bg-[#5a1118]/70" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.4fr_0.8fr] lg:px-8">
          <div>
            <Badge className="mb-6 border-white/25 bg-white/10 text-[10px] font-semibold uppercase tracking-[0.18em] text-white hover:bg-white/10">
              Diplahan, Zamboanga Sibugay
          </Badge>
          <h1 className="mb-6 max-w-3xl text-balance text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl">
            GIS-Based Emergency Response System
          </h1>
          <p className="mb-9 max-w-2xl text-pretty text-sm leading-7 text-white/75 sm:text-base md:text-lg">
            A unified command platform for LDRRMO Diplahan. Real-time incident mapping,
            IoT flood monitoring, responder coordination, and resident emergency reporting —
            all in one community-centered system.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button size="lg" className="h-11 rounded-lg bg-white font-semibold text-[#89151f] shadow-sm hover:bg-white/90" asChild>
              <Link to="/register">
                Register as Resident <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="h-11 rounded-lg border-white/40 bg-white/5 text-white hover:bg-white/10 hover:text-white" asChild>
              <Link to="/login">LDRRMO Staff Login</Link>
            </Button>
            <Button size="lg" variant="ghost" className="h-11 rounded-lg text-white/80 hover:bg-white/10 hover:text-white" asChild>
              <Link to="/operations">Open Operations Center</Link>
            </Button>
          </div>
          </div>
          <div className="relative z-10 rounded-2xl border border-white/15 bg-[#4f1018]/55 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Community safety</p>
                <p className="mt-1 text-lg font-bold">Help is within reach</p>
              </div>
            </div>
            <p className="text-sm leading-6 text-white/75">
              Report emergencies, find evacuation support, and stay informed with updates from your local response team.
            </p>
            <div className="mt-6 flex items-center gap-2 border-t border-white/15 pt-5 text-xs font-medium text-white/70">
              <Map className="h-4 w-4 text-white" />
              <span>One connected system for a safer Diplahan</span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Resident access', value: 'Emergency reporting', color: 'text-[#89151f]' },
              { label: 'Response operations', value: 'Role-based staff access', color: 'text-[#89151f]' },
              { label: 'Incident records', value: 'Persisted in the application database', color: 'text-slate-700' },
              { label: 'Sensor readings', value: 'Registered devices only', color: 'text-slate-700' },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 text-center sm:px-4">
                <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-[10px]">{s.label}</p>
                <p className={`text-xs font-bold sm:text-sm ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-20 lg:px-8">
        <div className="mb-10 text-left md:mb-12 md:text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#89151f]">System Capabilities</p>
          <h2 className="text-balance text-2xl font-bold text-slate-900 md:text-3xl">End-to-End Emergency Management</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map(f => (
            <Card key={f.label} className="rounded-xl border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#89151f]/30 hover:shadow-md">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#89151f]/10 bg-[#89151f]/[0.06]">
                    <f.icon className="h-4 w-4 text-[#89151f]" />
                  </div>
                  <div>
                    <p className="mb-1 text-sm font-semibold text-slate-800">{f.label}</p>
                    <p className="text-xs leading-relaxed text-pretty text-slate-500">{f.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-[#74151d] text-center text-white">
        <div className="tactical-grid pointer-events-none absolute inset-0 opacity-15" />
        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 md:py-16 lg:px-8">
          <h2 className="mb-4 text-balance text-xl font-bold md:text-2xl">Ready to respond?</h2>
          <p className="mx-auto mb-8 max-w-md text-pretty text-sm leading-6 text-white/75">
            Residents can register to report emergencies. LDRRMO staff log in to access the operations center.
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
            <Button className="rounded-lg bg-white font-semibold text-[#89151f] hover:bg-white/90" asChild>
              <Link to="/register">Register as Resident</Link>
            </Button>
            <Button variant="outline" className="rounded-lg border-white/40 bg-white/5 text-white hover:bg-white/10 hover:text-white" asChild>
              <Link to="/login">Staff / Admin Login</Link>
            </Button>
            <Button variant="ghost" className="rounded-lg text-white/80 hover:bg-white/10 hover:text-white" asChild>
              <Link to="/operations">Open Operations Center</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#260f15] px-4 py-6 text-center">
        <p className="text-xs text-white/60">
          © {new Date().getFullYear()} LDRRMO Diplahan Emergency Response System · Zamboanga Sibugay
        </p>
      </footer>
    </div>
  );
}
