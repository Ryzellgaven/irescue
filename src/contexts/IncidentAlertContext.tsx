import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { getAllReports } from '@/lib/api';

interface IncidentAlertContextValue {
  soundEnabled: boolean;
  enableSound: () => Promise<void>;
}

const IncidentAlertContext = createContext<IncidentAlertContextValue | null>(null);

function playIncidentAlertTone(context: AudioContext) {
  const startTime = context.currentTime;

  [880, 660].forEach((frequency, index) => {
    const toneStart = startTime + index * 0.24;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, toneStart);
    gain.gain.setValueAtTime(0.0001, toneStart);
    gain.gain.exponentialRampToValueAtTime(0.18, toneStart + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + 0.2);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(toneStart);
    oscillator.stop(toneStart + 0.21);
  });
}

export function IncidentAlertProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [soundEnabled, setSoundEnabled] = useState(false);
  const soundEnabledRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const seenReportIdsRef = useRef<Set<string> | null>(null);
  const pendingAlertIdsRef = useRef<Set<string>>(new Set());
  const alarmTimerRef = useRef<number | null>(null);
  const pollingRef = useRef(false);
  const lastPollErrorRef = useRef<string | null>(null);
  const isStaff = profile?.role === 'ldrrmo_staff' || profile?.role === 'supervisor' || profile?.role === 'admin';

  const stopAlarm = useCallback(() => {
    if (alarmTimerRef.current !== null) {
      window.clearInterval(alarmTimerRef.current);
      alarmTimerRef.current = null;
    }
  }, []);

  const startAlarm = useCallback(() => {
    const context = audioContextRef.current;
    if (!soundEnabledRef.current || !context || context.state !== 'running' || alarmTimerRef.current !== null) return;
    if (pendingAlertIdsRef.current.size === 0) return;

    playIncidentAlertTone(context);
    alarmTimerRef.current = window.setInterval(() => {
      if (pendingAlertIdsRef.current.size === 0) {
        stopAlarm();
        return;
      }
      if (context.state === 'running') playIncidentAlertTone(context);
    }, 900);
  }, [stopAlarm]);

  const acknowledgeReport = useCallback((reportId: string) => {
    pendingAlertIdsRef.current.delete(reportId);
    toast.dismiss(`incident-${reportId}`);
    if (pendingAlertIdsRef.current.size === 0) stopAlarm();
  }, [stopAlarm]);

  const enableSound = useCallback(async () => {
    if (soundEnabledRef.current) return;

    try {
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) throw new Error('This browser does not support sound alerts.');
      const context = audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = context;
      await context.resume();
      soundEnabledRef.current = true;
      setSoundEnabled(true);
      if (pendingAlertIdsRef.current.size > 0) startAlarm();
      else playIncidentAlertTone(context);
    } catch (error) {
      toast.error('Unable to enable incident sound alerts', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [startAlarm]);

  useEffect(() => {
    if (!isStaff) {
      seenReportIdsRef.current = null;
      return;
    }

    let active = true;
    const checkForReports = async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;

      try {
        const { data, error } = await getAllReports(0, 200);
        if (!active) return;
        if (error) {
          if (lastPollErrorRef.current !== error.message) {
            toast.error('Unable to check for new incident reports', { description: error.message });
            lastPollErrorRef.current = error.message;
          }
          return;
        }
        if (data === null) return;

        lastPollErrorRef.current = null;
        const currentIds = new Set(data.map(report => report.id));
        if (seenReportIdsRef.current) {
          const newReports = data.filter(report => !seenReportIdsRef.current?.has(report.id));
          newReports.forEach(report => {
            pendingAlertIdsRef.current.add(report.id);
            toast.error(`New ${report.emergency_type} report`, {
              description: `${report.severity} severity${report.address_text ? ` · ${report.address_text}` : ''}`,
              duration: Number.POSITIVE_INFINITY,
              id: `incident-${report.id}`,
              action: {
                label: 'Acknowledge',
                onClick: () => acknowledgeReport(report.id),
              },
            });
          });
          startAlarm();
        }
        seenReportIdsRef.current = currentIds;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (lastPollErrorRef.current !== message) {
          toast.error('Unable to check for new incident reports', { description: message });
          lastPollErrorRef.current = message;
        }
      } finally {
        pollingRef.current = false;
      }
    };

    void checkForReports();
    const timer = window.setInterval(() => void checkForReports(), 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
      seenReportIdsRef.current = null;
      pendingAlertIdsRef.current.forEach(reportId => toast.dismiss(`incident-${reportId}`));
      pendingAlertIdsRef.current.clear();
      stopAlarm();
    };
  }, [acknowledgeReport, isStaff, startAlarm, stopAlarm]);

  return (
    <IncidentAlertContext.Provider value={{ soundEnabled, enableSound }}>
      {children}
    </IncidentAlertContext.Provider>
  );
}

export function useIncidentAlerts() {
  const context = useContext(IncidentAlertContext);
  if (!context) throw new Error('useIncidentAlerts must be used within IncidentAlertProvider');
  return context;
}
