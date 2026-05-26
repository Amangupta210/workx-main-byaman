import React, { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, HelpCircle, BookOpen, Bug } from 'lucide-react';
import {
  getDefaultReminderMins,
  setDefaultReminderMins,
  requestPermission,
  subscribePermission,
  type ReminderPermission,
} from '@/lib/reminders';
import PermissionGuideModal from './PermissionGuideModal';
import ReminderDebugPanel from './ReminderDebugPanel';

export default function ReminderStatusBadge({ compact = false }: { compact?: boolean }) {
  const [perm, setPerm] = useState<ReminderPermission>('default');
  const [mins, setMins] = useState<number>(getDefaultReminderMins());
  const [guideOpen, setGuideOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => subscribePermission(setPerm), []);

  const meta = (() => {
    switch (perm) {
      case 'granted':
        return { Icon: BellRing, label: 'Reminders on', tone: 'text-emerald-500', bg: 'bg-emerald-500/10' };
      case 'denied':
        return { Icon: BellOff, label: 'Blocked — toasts only', tone: 'text-destructive', bg: 'bg-destructive/10' };
      case 'unsupported':
        return { Icon: HelpCircle, label: 'Unsupported', tone: 'text-muted-foreground', bg: 'bg-muted' };
      default:
        return { Icon: Bell, label: 'Reminders off', tone: 'text-amber-500', bg: 'bg-amber-500/10' };
    }
  })();
  const { Icon } = meta;

  const handleEnable = async () => {
    const r = await requestPermission();
    if (r === 'denied') {
      // Browser remembers denial — guide the user.
      alert(
        'Notifications are blocked for this site. Open your browser site settings and allow notifications, then reload.',
      );
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={handleEnable}
        disabled={perm === 'unsupported'}
        title="Click to request notification permission"
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.bg} ${meta.tone} hover:opacity-90 disabled:opacity-60`}
      >
        <Icon size={12} />
        <span>{meta.label}</span>
        {perm !== 'granted' && perm !== 'unsupported' && (
          <span className="ml-1 underline-offset-2 hover:underline">Enable</span>
        )}
      </button>
      {!compact && (
        <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Default lead
          <input
            type="number"
            min={0}
            max={1440}
            value={mins}
            onChange={(e) => {
              const v = Math.max(0, Math.min(1440, parseInt(e.target.value || '0', 10) || 0));
              setMins(v);
              setDefaultReminderMins(v);
            }}
            className="w-16 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
          min before due
        </label>
      )}
      <button
        onClick={() => setGuideOpen(true)}
        title="How permission and offline test work"
        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary"
      >
        <BookOpen size={11} /> Guide
      </button>
      <button
        onClick={() => setDebugOpen(true)}
        title="Open reminder debug panel"
        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary"
      >
        <Bug size={11} /> Debug
      </button>
      <PermissionGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
      <ReminderDebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} />
    </div>
  );
}
