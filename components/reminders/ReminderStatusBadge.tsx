import React, { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, HelpCircle, BookOpen, Bug, RefreshCw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  getDefaultReminderMins,
  setDefaultReminderMins,
  subscribeDefaultReminderMins,
  rerequestPermission,
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
  const [asking, setAsking] = useState(false);

  useEffect(() => subscribePermission(setPerm), []);
  useEffect(() => subscribeDefaultReminderMins(setMins), []);

  const meta = (() => {
    switch (perm) {
      case 'granted':
        return { Icon: BellRing, label: 'Reminders on', tone: 'text-emerald-500', bg: 'bg-emerald-500/10' };
      case 'denied':
        return { Icon: BellOff, label: 'Blocked — toasts only', tone: 'text-destructive', bg: 'bg-destructive/10' };
      case 'unsupported':
        return { Icon: HelpCircle, label: 'Unsupported', tone: 'text-muted-foreground', bg: 'bg-muted' };
      default:
        return { Icon: Bell, label: 'Reminders unknown', tone: 'text-amber-500', bg: 'bg-amber-500/10' };
    }
  })();
  const { Icon } = meta;

  const handleAsk = async () => {
    setAsking(true);
    try {
      const { status, needsManual } = await rerequestPermission();
      if (status === 'granted') toast.success('Reminders enabled — notifications will fire locally.');
      else if (needsManual) {
        toast.error('Browser is blocking notifications. Opening the guide to unblock.');
        setGuideOpen(true);
      } else if (status === 'denied') toast.error('Permission denied. You will still get in-app toasts.');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span
        title={`Notification permission: ${perm}`}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.bg} ${meta.tone}`}
      >
        <Icon size={12} />
        <span>{meta.label}</span>
      </span>

      {perm !== 'granted' && perm !== 'unsupported' && (
        <button
          onClick={handleAsk}
          disabled={asking}
          title={perm === 'denied' ? 'Re-request notification permission' : 'Request notification permission'}
          className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          <RefreshCw size={11} className={asking ? 'animate-spin' : ''} />
          {perm === 'denied' ? 'Re-request permission' : 'Enable reminders'}
        </button>
      )}

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
              setDefaultReminderMins(v);
            }}
            aria-label="Default minutes before due"
            className="w-16 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
          min before due
          {mins !== 10 && (
            <button
              onClick={() => setDefaultReminderMins(10)}
              title="Reset default to 10 min"
              className="inline-flex items-center gap-1 rounded px-1 hover:bg-secondary"
            >
              <RotateCcw size={10} />
            </button>
          )}
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
