import React, { useMemo, useState } from 'react';
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
import { format } from 'date-fns';
import { Bell, Plus, Trash2, Check, FlaskConical } from 'lucide-react';
import ReminderStatusBadge from '@/components/reminders/ReminderStatusBadge';
import { getDefaultReminderMins, triggerTestReminder } from '@/lib/reminders';
import { toast } from 'sonner';

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

function TasksPage() {
  const tasks = useLiveQuery(() => aiDb.richTasks.toArray(), []) ?? [];
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('open');
  const [newTitle, setNewTitle] = useState('');

  const sorted = useMemo(() => {
    const list = tasks.filter((t) =>
      filter === 'all' ? true : filter === 'open' ? !t.completed : t.completed,
    );
    return list.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const ad = a.due ?? Number.POSITIVE_INFINITY;
      const bd = b.due ?? Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
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
        <div className="ml-auto flex items-center gap-3">
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
        {sorted.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No {filter === 'all' ? '' : filter} tasks. Create one above or generate from the AI panel.
          </div>
        ) : (
          <ul className="mx-auto max-w-3xl space-y-2">
            {sorted.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        )}
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
