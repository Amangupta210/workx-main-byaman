import React, { useEffect, useMemo, useState } from 'react';
import AppSidebar from '@/components/layout/AppSidebar';
import AIPanel from '@/components/ai/AIPanel';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  aiDb,
  addRichTask,
  deleteRichTask,
  updateRichTask,
  type RichTaskRecord,
  type TaskPriority,
} from '@/lib/aiDb';
import { format, isToday, isTomorrow, isPast } from 'date-fns';
import { Bell, Plus, Trash2, Check, FlaskConical, Sparkles, Loader2, X } from 'lucide-react';
import ReminderStatusBadge from '@/components/reminders/ReminderStatusBadge';
import OllamaStatusBadge from '@/components/ai/OllamaStatusBadge';
import { getDefaultReminderMins, triggerTestReminder } from '@/lib/reminders';
import { toast } from 'sonner';
import { generateRichTasks, OllamaError, pingOllama } from '@/lib/ollama';

const priorityOrder: Record<TaskPriority, number> = { high: 0, med: 1, low: 2 };

export default function TasksRoute() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TasksPage />
      </div>
      <AIPanel />
    </div>
  );
}

type Section = 'Overdue' | 'Today' | 'Tomorrow' | 'Upcoming' | 'Someday' | 'Done';

function bucket(task: RichTaskRecord): Section {
  if (task.completed) return 'Done';
  if (!task.due) return 'Someday';
  const d = new Date(task.due);
  if (isPast(d) && !isToday(d)) return 'Overdue';
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return 'Upcoming';
}

const SECTION_ORDER: Section[] = ['Overdue', 'Today', 'Tomorrow', 'Upcoming', 'Someday', 'Done'];

function TasksPage() {
  const tasks = useLiveQuery(() => aiDb.richTasks.toArray(), []) ?? [];
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('open');
  const [newTitle, setNewTitle] = useState('');
  const [aiOpen, setAiOpen] = useState(false);

  const grouped = useMemo(() => {
    const filtered = tasks.filter((t) =>
      filter === 'all' ? true : filter === 'open' ? !t.completed : t.completed,
    );
    const map = new Map<Section, RichTaskRecord[]>();
    for (const t of filtered) {
      const k = bucket(t);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const ad = a.due ?? Number.POSITIVE_INFINITY;
        const bd = b.due ?? Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
    }
    return SECTION_ORDER.map((s) => [s, map.get(s) ?? []] as const).filter(([, v]) => v.length);
  }, [tasks, filter]);

  const addQuick = async () => {
    const title = newTitle.trim();
    if (!title) return;
    await addRichTask({
      pageId: null,
      title,
      due: null,
      reminderMinsBefore: null,
      priority: 'med',
      labels: [],
      recurrence: 'none',
      completed: false,
    });
    setNewTitle('');
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold">✅ Tasks</h1>
        <OllamaStatusBadge />
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setAiOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-medium text-white shadow hover:opacity-90"
            title="Generate tasks from a description using local AI"
          >
            <Sparkles size={12} /> Generate with AI
          </button>
          <ReminderStatusBadge />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <div className="flex gap-1 rounded-md border border-border p-0.5 text-xs">
          {(['open', 'all', 'done'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2 py-1 capitalize ${filter === f ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addQuick()}
            placeholder="New task…"
            className="w-56 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={addQuick}
            className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus size={12} /> Add
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {grouped.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No {filter === 'all' ? '' : filter} tasks. Add one above or click <b>Generate with AI</b>.
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {grouped.map(([section, list]) => (
              <section key={section}>
                <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section}
                  <span className="rounded-full bg-secondary px-1.5 text-[10px]">{list.length}</span>
                </h2>
                <ul className="space-y-2">
                  {list.map((t) => <TaskRow key={t.id} task={t} />)}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {aiOpen && <AITaskModal onClose={() => setAiOpen(false)} />}
    </div>
  );
}

function AITaskModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'generating' | 'fallback'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancel = false;
    pingOllama().then((ok) => { if (!cancel) setOnline(ok); });
    return () => { cancel = true; };
  }, []);

  const offlineFallback = async (t: string) => {
    const lines = t.split(/\n|;|·|•/).map((l) => l.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean);
    if (!lines.length) throw new Error('Nothing to add — write at least one line.');
    for (const title of lines) {
      await addRichTask({ pageId: null, title, due: null, reminderMinsBefore: null,
        priority: 'med', labels: [], recurrence: 'none', completed: false });
    }
    return lines.length;
  };

  const run = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setError(null); setPhase('checking');
    try {
      const isOnline = await pingOllama();
      setOnline(isOnline);
      if (!isOnline) {
        setPhase('fallback');
        const n = await offlineFallback(t);
        toast.success(`Added ${n} task${n === 1 ? '' : 's'} (offline fallback)`);
        onClose();
        return;
      }
      setPhase('generating');
      const tasks = await generateRichTasks(t);
      if (!tasks.length) {
        // AI returned nothing parseable → degrade to fallback rather than failing.
        const n = await offlineFallback(t);
        toast.success(`AI returned no tasks — added ${n} from your text instead`);
        onClose();
        return;
      }
      for (const task of tasks) {
        await addRichTask({
          pageId: null,
          title: task.title,
          due: task.due ? Date.parse(task.due) : null,
          reminderMinsBefore: task.reminderMinsBefore ?? null,
          priority: task.priority,
          labels: task.labels,
          recurrence: task.recurrence,
          completed: false,
        });
      }
      toast.success(`Added ${tasks.length} AI-generated task${tasks.length === 1 ? '' : 's'}`);
      onClose();
    } catch (err) {
      const msg = err instanceof OllamaError ? err.message : (err as Error).message || 'Failed to generate tasks';
      setError(msg);
    } finally {
      setBusy(false); setPhase('idle');
    }
  };

  const phaseLabel =
    phase === 'checking' ? 'Checking local AI…' :
    phase === 'generating' ? 'Generating with Ollama…' :
    phase === 'fallback' ? 'Adding offline…' : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles size={14} className="text-primary" /> Generate tasks with local AI
          </h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-secondary"><X size={14} /></button>
        </div>

        {online === false && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            <Loader2 size={12} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium text-amber-100">Ollama is offline</div>
              Start it with <code className="rounded bg-black/30 px-1">ollama serve</code> (set <code className="rounded bg-black/30 px-1">OLLAMA_ORIGINS=*</code>). I'll still add each line as a plain task.
            </div>
          </div>
        )}
        {online === true && (
          <div className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-200">
            ✓ Local AI ready — due dates, priority, labels & recurrence will be inferred.
          </div>
        )}

        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          disabled={busy}
          placeholder="e.g. Prep launch deck by Friday 5pm, daily standup at 9am, call dentist tomorrow…"
          className="w-full resize-none rounded-md border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
        />

        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            'Plan my week: launch deck Friday 5pm, gym Mon/Wed/Fri 7am, call mom Sunday',
            'Daily standup at 9am, weekly review every Friday 4pm, dentist next Tuesday',
            'Pay rent on the 1st, water plants Tue & Sat, ship MVP by next Friday',
          ].map((ex) => (
            <button key={ex} disabled={busy}
              onClick={() => setText(ex)}
              className="rounded-full border border-border bg-background px-2 py-0.5 text-[10.5px] text-muted-foreground hover:bg-secondary disabled:opacity-40">
              {ex.split(':')[0]}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
            <div className="font-medium">Couldn't generate tasks</div>
            {error}
          </div>
        )}

        {phase !== 'idle' && (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 size={11} className="animate-spin" /> {phaseLabel}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-50">Cancel</button>
          <button onClick={run} disabled={!text.trim() || busy}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {busy ? 'Working…' : online === false ? 'Add offline' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}


function TaskRow({ task }: { task: RichTaskRecord }) {
  const def = getDefaultReminderMins();
  const effectiveMins = task.reminderMinsBefore ?? def;
  const usingOverride = task.reminderMinsBefore != null;
  const overdue = task.due && !task.completed && task.due < Date.now();

  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 ${
        task.completed ? 'opacity-60' : ''
      }`}
    >
      <button
        onClick={() => updateRichTask(task.id!, { completed: !task.completed })}
        className={`grid h-5 w-5 place-items-center rounded-md border ${
          task.completed ? 'bg-primary border-primary text-primary-foreground' : 'border-border hover:bg-secondary'
        }`}
        title="Toggle complete"
      >
        {task.completed && <Check size={12} />}
      </button>

      <div className="flex-1 min-w-0">
        <div className={`truncate text-sm font-medium ${task.completed ? 'line-through' : ''}`}>{task.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {task.due ? (
            <span className={overdue ? 'text-destructive font-medium' : ''}>
              {format(new Date(task.due), 'EEE MMM d · p')}
            </span>
          ) : (
            <span>No due date</span>
          )}
          <span>·</span>
          <span className="capitalize">{task.priority} priority</span>
          {task.labels.length > 0 && (
            <>
              <span>·</span>
              <span>{task.labels.map((l) => `#${l}`).join(' ')}</span>
            </>
          )}
        </div>
      </div>

      <label className="flex items-center gap-1 text-[11px] text-muted-foreground" title="Minutes before due">
        <Bell size={11} />
        <input
          type="number"
          min={0}
          max={1440}
          value={effectiveMins}
          onChange={(e) => {
            const v = Math.max(0, Math.min(1440, parseInt(e.target.value || '0', 10) || 0));
            updateRichTask(task.id!, { reminderMinsBefore: v });
          }}
          className={`w-14 rounded-md border bg-background px-1.5 py-0.5 text-foreground outline-none focus:ring-2 focus:ring-primary/30 ${
            usingOverride ? 'border-primary/60' : 'border-border'
          }`}
        />
        <span>min</span>
        {usingOverride && (
          <button
            onClick={() => updateRichTask(task.id!, { reminderMinsBefore: null })}
            className="ml-0.5 underline-offset-2 hover:underline"
            title={`Reset to default (${def} min)`}
          >
            reset
          </button>
        )}
      </label>

      <button
        onClick={() => {
          triggerTestReminder(task);
          toast.success('Test reminder fired');
        }}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-secondary"
        title="Fire a local notification right now"
      >
        <FlaskConical size={11} /> Test
      </button>

      <button
        onClick={() => deleteRichTask(task.id!)}
        className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        title="Delete task"
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}
