import {
  Activity, AlertTriangle, BarChart2, Bell, BookOpen, ChevronRight, Cpu, FileText, Home,
  LayoutDashboard, LogOut, Map, Menu, Phone, Radio, Settings, Shield, Users, Volume2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/contexts/AuthContext';
import { useIncidentAlerts } from '@/contexts/IncidentAlertContext';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types/index';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: UserRole[];
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  // Resident
  { label: 'Home', href: '/resident', icon: Home, roles: ['resident'] },
  { label: 'Report Emergency', href: '/resident/report', icon: AlertTriangle, roles: ['resident'] },
  { label: 'My Reports', href: '/resident/my-reports', icon: FileText, roles: ['resident'] },
  { label: 'Incident Map', href: '/resident/map', icon: Map, roles: ['resident'] },
  { label: 'Evacuation Centers', href: '/resident/evacuation', icon: Shield, roles: ['resident'] },
  { label: 'Notifications', href: '/resident/notifications', icon: Bell, roles: ['resident'] },
  // Staff/Supervisor
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['ldrrmo_staff', 'supervisor', 'admin'] },
  { label: 'Map View', href: '/dashboard/map', icon: Map, roles: ['ldrrmo_staff', 'supervisor', 'admin'] },
  { label: 'Emergency Reports', href: '/dashboard/reports', icon: FileText, roles: ['ldrrmo_staff', 'supervisor', 'admin'] },
  { label: 'Incident Records', href: '/dashboard/caller-log', icon: Phone, roles: ['ldrrmo_staff', 'supervisor', 'admin'] },
  { label: 'Flood Monitoring', href: '/dashboard/iot', icon: Activity, roles: ['ldrrmo_staff', 'supervisor', 'admin'] },
  { label: 'Evacuation Centers', href: '/dashboard/evacuation', icon: Shield, roles: ['supervisor', 'admin'] },
  { label: 'Broadcast Alert', href: '/dashboard/broadcast', icon: Radio, roles: ['supervisor', 'admin'] },
  // Admin
  { label: 'Admin Panel', href: '/admin', icon: BarChart2, roles: ['admin'] },
  { label: 'User Management', href: '/admin/users', icon: Users, roles: ['admin'] },
  { label: 'IoT Devices', href: '/admin/iot-devices', icon: Cpu, roles: ['admin'] },
  { label: 'Audit Logs', href: '/admin/audit', icon: BookOpen, roles: ['admin'] },
  { label: 'System Config', href: '/admin/config', icon: Settings, roles: ['admin'] },
];

function SidebarContent({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const role = profile?.role;

  const visibleItems = NAV_ITEMS.filter(item => role && item.roles.includes(role));

  const residentItems = visibleItems.filter(i => i.roles.includes('resident') && !i.roles.includes('ldrrmo_staff'));
  const staffItems = visibleItems.filter(i => i.roles.includes('ldrrmo_staff'));
  const adminItems = visibleItems.filter(i => i.roles.includes('admin') && !i.roles.includes('ldrrmo_staff'));

  const groups = role === 'resident'
    ? [{ label: 'Resident Portal', items: residentItems }]
    : role === 'admin'
    ? [
        { label: 'Operations', items: staffItems },
        { label: 'Administration', items: adminItems },
      ]
    : [{ label: 'Operations', items: staffItems }];

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Logo */}
      {!compact && <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10 border border-primary/30">
          <AlertTriangle className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-primary truncate">LDRRMO</p>
          <p className="text-[10px] text-muted-foreground truncate">Diplahan Emergency System</p>
        </div>
      </div>}

      {/* Nav */}
      <nav className={`flex-1 overflow-y-auto px-2 py-4 ${compact ? 'space-y-1' : 'space-y-6'}`}>
        {groups.map(group => (
          <div key={group.label}>
            {!compact && <p className="px-3 mb-2 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">{group.label}</p>}
            <ul className="space-y-0.5">
              {group.items.map(item => {
                const isActive = location.pathname === item.href ||
                  (item.href !== '/dashboard' && item.href !== '/resident' && item.href !== '/admin' && location.pathname.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      to={item.href}
                      onClick={onNavigate}
                      className={cn(
                        'flex items-center gap-3 border-l-2 border-transparent px-3 py-2.5 text-xs transition-colors',
                        isActive
                          ? 'border-l-white bg-white/15 font-semibold text-white'
                          : 'text-sidebar-foreground hover:border-l-white/50 hover:bg-sidebar-accent hover:text-white'
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 min-w-0 truncate">{item.label}</span>
                      {item.badge && <Badge className="shrink-0 text-[10px] h-4 px-1">{item.badge}</Badge>}
                      {isActive && <ChevronRight className="h-3 w-3 shrink-0 text-primary/60" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User info + logout */}
      {compact ? (
        <div className="border-t border-sidebar-border px-3 py-4 text-[10px] leading-relaxed text-sidebar-foreground/75">
          <p className="font-semibold text-white">Diplahan, Zamboanga Sibugay</p>
          <p className="mt-1">Sa Ligtas na Komunidad,<br />Bawat Isa ay Mahalaga.</p>
        </div>
      ) : (
        <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 px-2 py-2 rounded hover:bg-sidebar-accent">
          <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary">
              {profile?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{profile?.full_name ?? 'User'}</p>
            <p className="text-[10px] text-muted-foreground capitalize truncate">
              {profile?.role?.replace('_', ' ')}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, signOut } = useAuth();
  const { soundEnabled, enableSound } = useIncidentAlerts();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="dashboard-theme flex min-h-screen w-full flex-col bg-background">
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-white/15 bg-[#74151d] px-3 text-white shadow-sm sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation menu" className="h-8 w-8 text-white hover:bg-white/10 hover:text-white">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="dashboard-theme w-60 border-white/10 bg-sidebar p-0 text-white">
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          </div>
          <Link to="/dashboard" className="flex min-w-0 items-center gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Diplahan Emergency Response System</p>
              <p className="truncate text-[10px] text-white/65">GIS-Based Response &amp; Flood Monitoring</p>
            </div>
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {profile?.role !== 'resident' && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={soundEnabled ? 'Incident sound alerts enabled' : 'Enable incident sound alerts'}
              aria-pressed={soundEnabled}
              title={soundEnabled ? 'Incident sound alerts enabled' : 'Enable incident sound alerts (plays a test sound)'}
              className="h-8 w-8 text-white/85 hover:bg-white/10 hover:text-white disabled:opacity-100"
              disabled={soundEnabled}
              onClick={() => void enableSound()}
            >
              <Volume2 className={`h-4 w-4 ${soundEnabled ? 'text-emerald-300' : ''}`} />
            </Button>
          )}
          <Link to="/dashboard/reports" aria-label="View incoming reports" className="relative rounded-md p-2 text-white/85 transition hover:bg-white/10 hover:text-white">
            <Bell className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2 border-l border-white/20 pl-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-xs font-bold">
              {profile?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
            </div>
            <div className="hidden max-w-40 sm:block">
              <p className="truncate text-xs font-medium">{profile?.full_name ?? 'User'}</p>
              <p className="truncate text-[10px] capitalize text-white/65">{profile?.role?.replace('_', ' ')}</p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out" className="h-8 w-8 text-white/80 hover:bg-white/10 hover:text-white" onClick={() => void handleSignOut()}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-48 shrink-0 flex-col md:flex">
          <SidebarContent compact />
        </aside>
        <main className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
