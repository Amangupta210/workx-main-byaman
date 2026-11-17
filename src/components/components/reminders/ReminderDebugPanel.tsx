import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, Bug, RefreshCw, BellRing, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import {
  subscribeReminderDebug,
  subscribePermission,
  triggerTestReminder,
  type ReminderDebugInfo,
  type ReminderPermission,
} from '@/lib/reminders';
import { aiDb, type CalendarEventRecord, type RichTaskRecord } from '@/lib/aiDb';

function fmt(t: number | null | undefined) {
  if (!t) return '—';
  return new Date(t).toLocaleString();
}

function resultBadge(r: ReminderDebugInfo['lastResult']) {
  const map: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    notified:    { label: 'Notified',    cls: 'bg-emerald-500/10 text-emerald-600', Icon: CheckCircle2 },
    'toast-only':{ label: 'Toast only',  cls: 'bg-amber-500/10  text-amber-600',    Icon: AlertTriangle },
    'past-stale':{ label: 'Stale',       cls: 'bg-muted text-muted-foreground',     Icon: Clock },
    pending:     { label: 'Pending',     cls: 'bg-blue-500/10   text-blue-600',     Icon: Clock },
    completed:   { label: 'Done',        cls: 'bg-emerald-500/10 text-emerald-600', Icon: CheckCircle2 },
    error:       { label: 'Error',       cls: 'bg-destructive/10 text-destructive', Icon: AlertTriangle },
  };
  const m = r ? map[r] : { label: 'Idle', cls: 'bg-muted text-muted-foreground', Icon: Clock };
  const Icon = m.Icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${m.cls}`}>
      <Icon size={10} /> {m.label}
    </span>
  );
}

export default function ReminderDebugPanel({
  open,
  onClose,
}: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<ReminderDebugInfo[]>([]);
  const [perm, setPerm] = useState<ReminderPermission>('default');

  const tasks = useLiveQuery<RichTaskRecord[]>(() => aiDb.richTasks.toArray(), []) ?? [];
  const events = useLiveQuery<CalendarEventRecord[]>(() => aiDb.events.toArray(), []) ?? [];

  useEffect(() => subscribeReminderDebug(setRows), []);
  useEffect(() => subscribePermission(setPerm), []);

  if (!open) return null;

  const byId = new Map(rows.map((r) => [r.taskId, r]));
  const sortedTasks = [...tasks].sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col border-l border-border bg-card text-card-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Bug size={16} className="text-primary" />
            <h2 className="text-sm font-semibold">Reminder debug</h2>
            <span
              className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
                perm === 'granted'
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : perm === 'denied'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-amber-500/10 text-amber-600'
              }`}
            >
              <BellRing size={10} /> Permission: {perm}
            </span>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-secondary">
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 text-xs">
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tasks ({sortedTasks.length})
            </h3>
            {sortedTasks.length === 0 && (
              <p className="rounded border border-dashed border-border p-3 text-muted-foreground">
                No rich tasks. Create one in /tasks.
              </p>
            )}
            <ul className="space-y-1.5">
              {sortedTasks.map((t) => {
                const d = t.id != null ? byId.get(t.id) : undefined;
                return (
                  <li
                    key={t.id}
                    className="rounded-lg border border-border bg-background/40 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 truncate font-medium">
                        {t.completed ? '✓ ' : ''}{t.title}
                      </div>
                      {resultBadge(d?.lastResult ?? (t.completed ? 'completed' : 'pending'))}
                    </div>
                    <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <div><dt className="inline">Due:</dt> <dd className="inline text-foreground">{fmt(t.due ?? null)}</dd></div>
                      <div><dt className="inline">Fires at:</dt> <dd className="inline text-foreground">{fmt(d?.fireAt ?? null)}</dd></div>
                      <div><dt className="inline">Scheduled:</dt> <dd className="inline text-foreground">{fmt(d?.scheduledAt ?? null)}</dd></div>
                      <div><dt className="inline">Last result at:</dt> <dd className="inline text-foreground">{fmt(d?.lastResultAt ?? null)}</dd></div>
                      <div className="col-span-2"><dt className="inline">Lead:</dt> <dd className="inline text-foreground">
                        {t.reminderMinsBefore == null ? 'default' : `${t.reminderMinsBefore} min`}
                      </dd></div>
                      {d?.error && (
                        <div className="col-span-2 text-destructive">Error: {d.error}</div>
                      )}
                    </dl>
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={() => triggerTestReminder({
                          id: t.id, title: t.title, due: t.due,
                          reminderMinsBefore: t.reminderMinsBefore ?? 0,
                          priority: t.priority, labels: t.labels,
                        })}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-secondary"
                      >
                        <RefreshCw size={10} /> Test
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="mt-5">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Calendar events ({events.length})
            </h3>
            {events.length === 0 && (
              <p className="rounded border border-dashed border-border p-3 text-muted-foreground">
                No events.
              </p>
            )}
            <ul className="space-y-1.5">
              {events.slice(0, 50).map((e) => (
                <li key={e.id} className="rounded-lg border border-border bg-background/40 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 truncate font-medium">{e.title}</div>
                    <span className="text-[10px] text-muted-foreground">{fmt(e.start)}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Reminders for events use the global default lead. Convert to a task for per-event lead.
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => triggerTestReminder({ title: e.title, due: e.start, reminderMinsBefore: 0, priority: 'med', labels: [] })}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-secondary"
                    >
                      <RefreshCw size={10} /> Test
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
