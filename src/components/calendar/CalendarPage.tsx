import React, { useMemo, useState } from 'react';
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek,
  format, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek, subMonths, subWeeks,
} from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Plus, Trash2, X, Clock, ListTodo } from 'lucide-react';
import {
  aiDb,
  addEvent,
  deleteEvent,
  type CalendarEventRecord,
  type RichTaskRecord,
} from '@/lib/aiDb';

type View = 'month' | 'week' | 'day';

interface CalItem {
  kind: 'event' | 'task';
  id: number;
  start: number;
  end: number;
  title: string;
  color?: string;
  raw: CalendarEventRecord | RichTaskRecord;
}

export default function CalendarPage() {
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState<Date>(new Date());
  const [editing, setEditing] = useState<{ start: number; end: number } | null>(null);

  const events = useLiveQuery(() => aiDb.events.toArray(), []) ?? [];
  const tasks = useLiveQuery(() => aiDb.richTasks.toArray(), []) ?? [];

  const items: CalItem[] = useMemo(() => {
    const a: CalItem[] = events.map((e) => ({
      kind: 'event', id: e.id!, start: e.start, end: e.end, title: e.title, color: e.color, raw: e,
    }));
    const b: CalItem[] = tasks
      .filter((t) => t.due)
      .map((t) => ({
        kind: 'task', id: t.id!, start: t.due!, end: t.due! + 30 * 60 * 1000,
        title: (t.completed ? '✓ ' : '') + t.title,
        color: t.priority === 'high' ? '#ef4444' : t.priority === 'low' ? '#94a3b8' : '#3b82f6',
        raw: t,
      }));
    return [...a, ...b].sort((x, y) => x.start - y.start);
  }, [events, tasks]);

  const itemsForDay = (d: Date) =>
    items.filter((i) => isSameDay(new Date(i.start), d));

  const navigate = (dir: 1 | -1) => {
    if (view === 'month') setCursor((c) => (dir === 1 ? addMonths(c, 1) : subMonths(c, 1)));
    else if (view === 'week') setCursor((c) => (dir === 1 ? addWeeks(c, 1) : subWeeks(c, 1)));
    else setCursor((c) => addDays(c, dir));
  };

  const heading =
    view === 'month' ? format(cursor, 'MMMM yyyy')
    : view === 'week' ? `${format(startOfWeek(cursor), 'MMM d')} – ${format(endOfWeek(cursor), 'MMM d, yyyy')}`
    : format(cursor, 'EEEE, MMMM d, yyyy');

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold">📅 Calendar</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => navigate(-1)} className="rounded p-1 hover:bg-secondary"><ChevronLeft size={16} /></button>
          <button onClick={() => setCursor(new Date())} className="rounded border border-border px-2 py-0.5 text-xs hover:bg-secondary">Today</button>
          <button onClick={() => navigate(1)} className="rounded p-1 hover:bg-secondary"><ChevronRight size={16} /></button>
        </div>
        <div className="text-sm font-medium">{heading}</div>
        <div className="ml-auto flex gap-1 rounded-md border border-border p-0.5 text-xs">
          {(['month', 'week', 'day'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded px-2 py-1 capitalize ${view === v ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}
            >{v}</button>
          ))}
        </div>
        <button
          onClick={() => {
            const s = startOfDay(cursor).getTime() + 9 * 3600 * 1000;
            setEditing({ start: s, end: s + 60 * 60 * 1000 });
          }}
          className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
        ><Plus size={12} /> Event</button>
      </header>

      <div className="flex-1 overflow-auto p-3">
        {view === 'month' && <MonthGrid cursor={cursor} itemsForDay={itemsForDay} onPick={(d) => { setCursor(d); setView('day'); }} />}
        {view === 'week' && <WeekGrid cursor={cursor} itemsForDay={itemsForDay} onPick={(d) => { setCursor(d); setView('day'); }} />}
        {view === 'day' && <DayList day={cursor} items={itemsForDay(cursor)} onAdd={() => {
          const s = startOfDay(cursor).getTime() + 9 * 3600 * 1000;
          setEditing({ start: s, end: s + 60 * 60 * 1000 });
        }} />}
      </div>

      {editing && <EventModal initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MonthGrid({
  cursor, itemsForDay, onPick,
}: { cursor: Date; itemsForDay: (d: Date) => CalItem[]; onPick: (d: Date) => void }) {
  const start = startOfWeek(startOfMonth(cursor));
  const end = endOfWeek(endOfMonth(cursor));
  const days = eachDayOfInterval({ start, end });
  return (
    <div>
      <div className="grid grid-cols-7 text-[11px] font-medium text-muted-foreground">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
          <div key={d} className="px-2 py-1.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
        {days.map((d) => {
          const inMonth = isSameMonth(d, cursor);
          const today = isSameDay(d, new Date());
          const its = itemsForDay(d);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onPick(d)}
              className={`group min-h-[88px] bg-card p-1.5 text-left transition-colors hover:bg-secondary/50 ${inMonth ? '' : 'opacity-50'}`}
            >
              <div className={`mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${today ? 'bg-primary text-primary-foreground' : ''}`}>
                {format(d, 'd')}
              </div>
              <div className="space-y-0.5">
                {its.slice(0, 3).map((i) => (
                  <div key={`${i.kind}-${i.id}`} className="truncate rounded px-1 py-0.5 text-[10.5px] text-white" style={{ backgroundColor: i.color || '#6366f1' }}>
                    {i.title}
                  </div>
                ))}
                {its.length > 3 && <div className="text-[10px] text-muted-foreground">+{its.length - 3} more</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({
  cursor, itemsForDay, onPick,
}: { cursor: Date; itemsForDay: (d: Date) => CalItem[]; onPick: (d: Date) => void }) {
  const start = startOfWeek(cursor);
  const days = eachDayOfInterval({ start, end: endOfWeek(cursor) });
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => {
        const its = itemsForDay(d);
        const today = isSameDay(d, new Date());
        return (
          <button key={d.toISOString()} onClick={() => onPick(d)} className="flex min-h-[180px] flex-col rounded-lg border border-border bg-card p-2 text-left hover:bg-secondary/50">
            <div className={`mb-2 text-xs font-medium ${today ? 'text-primary' : 'text-muted-foreground'}`}>
              {format(d, 'EEE d')}
            </div>
            <div className="space-y-1">
              {its.map((i) => (
                <div key={`${i.kind}-${i.id}`} className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-white" style={{ backgroundColor: i.color || '#6366f1' }}>
                  {i.kind === 'task' ? <ListTodo size={10} /> : <Clock size={10} />}
                  <span className="truncate">{i.title}</span>
                </div>
              ))}
              {its.length === 0 && <div className="text-[11px] text-muted-foreground/60">—</div>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function DayList({ day, items, onAdd }: { day: Date; items: CalItem[]; onAdd: () => void }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{format(day, 'EEEE, MMMM d')}</div>
        <button onClick={onAdd} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-secondary">
          <Plus size={12} /> Add event
        </button>
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nothing scheduled. Click “Add event” or generate scheduled tasks from the AI panel.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={`${i.kind}-${i.id}`} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <div className="h-8 w-1 rounded" style={{ backgroundColor: i.color || '#6366f1' }} />
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium">{i.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  {format(new Date(i.start), 'p')}
                  {i.kind === 'event' && ` – ${format(new Date(i.end), 'p')}`}
                  {i.kind === 'task' && ' · task'}
                </div>
              </div>
              {i.kind === 'event' && (
                <button onClick={() => deleteEvent(i.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete event">
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventModal({ initial, onClose }: { initial: { start: number; end: number }; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(toLocal(initial.start));
  const [end, setEnd] = useState(toLocal(initial.end));
  const [color, setColor] = useState('#6366f1');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const s = new Date(start).getTime();
    const en = new Date(end).getTime();
    await addEvent({ title: title.trim(), start: s, end: Math.max(en, s + 15 * 60 * 1000), color });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">New event</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-secondary"><X size={14} /></button>
        </div>
        <input
          autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="Event title"
          className="mb-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="mb-2 grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">Start
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">End
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          </label>
        </div>
        <label className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          Color <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-10 rounded border border-border" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary">Cancel</button>
          <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">Save</button>
        </div>
      </form>
    </div>
  );
}

function toLocal(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
