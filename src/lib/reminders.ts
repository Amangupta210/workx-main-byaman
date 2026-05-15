/**
 * Local reminder scheduler for rich tasks. Fully offline.
 *
 * - Watches the `richTasks` Dexie table via Dexie's hooks + a periodic sweep.
 * - For every uncompleted task with a `due` time, schedules a setTimeout to
 *   fire at `due - reminderMinsBefore*60_000` (defaults to "at due time" when
 *   reminderMinsBefore is null).
 * - On fire, shows a system Notification (when permitted) and always falls
 *   back to a sonner toast so the user never silently misses one.
 * - Deduplicated via the in-memory `scheduled` Map, and via `firedKey` stored
 *   in localStorage so reloading the app doesn't re-fire past reminders.
 */
import { aiDb, type RichTaskRecord } from './aiDb';
import { toast } from 'sonner';

const scheduled = new Map<number, ReturnType<typeof setTimeout>>();
const FIRED_KEY = 'workx-fired-reminders';
// Don't surface reminders for things due more than 7d in the past on first load.
const STALE_GRACE_MS = 7 * 24 * 3600 * 1000;
// Re-sweep every 60s to pick up edits + handle very-long timeouts.
const SWEEP_MS = 60 * 1000;

function loadFired(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveFired(set: Set<string>) {
  try {
    // Keep the list bounded.
    const arr = Array.from(set).slice(-500);
    localStorage.setItem(FIRED_KEY, JSON.stringify(arr));
  } catch {}
}

const fired = loadFired();
function firedKey(t: RichTaskRecord): string {
  return `${t.id}:${t.due}:${t.reminderMinsBefore ?? 0}`;
}

async function ensurePermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const r = await Notification.requestPermission();
    return r === 'granted';
  } catch {
    return false;
  }
}

function notify(t: RichTaskRecord) {
  const dueStr = t.due ? new Date(t.due).toLocaleString() : '';
  const title = `⏰ ${t.title}`;
  const body =
    [
      dueStr && `Due ${dueStr}`,
      t.priority !== 'med' && `Priority: ${t.priority}`,
      t.labels.length && t.labels.map((l) => '#' + l).join(' '),
    ]
      .filter(Boolean)
      .join(' · ') || 'Reminder';

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, tag: `workx-task-${t.id}`, icon: '/favicon.ico' });
    } catch {
      // Some browsers require ServiceWorkerRegistration.showNotification when
      // installed as PWA. Toast fallback below still fires.
    }
  }
  toast(title, { description: body });
}

function fire(t: RichTaskRecord) {
  const key = firedKey(t);
  if (fired.has(key)) return;
  fired.add(key);
  saveFired(fired);
  notify(t);
}

function unschedule(id: number | undefined) {
  if (id == null) return;
  const h = scheduled.get(id);
  if (h) {
    clearTimeout(h);
    scheduled.delete(id);
  }
}

function scheduleOne(t: RichTaskRecord) {
  if (t.id == null) return;
  unschedule(t.id);
  if (t.completed || !t.due) return;
  const fireAt = t.due - (t.reminderMinsBefore ?? 0) * 60_000;
  const now = Date.now();
  const key = firedKey(t);
  if (fired.has(key)) return;

  if (fireAt <= now) {
    // Past — fire immediately unless extremely stale on first load.
    if (now - fireAt < STALE_GRACE_MS) fire(t);
    else {
      fired.add(key);
      saveFired(fired);
    }
    return;
  }
  // setTimeout caps around ~24.8 days; clamp to sweep interval and let the
  // periodic sweep reschedule longer waits.
  const delay = Math.min(fireAt - now, 2_000_000_000);
  const h = setTimeout(() => {
    scheduled.delete(t.id!);
    // Re-read to ensure it wasn't completed/edited just before firing.
    aiDb.richTasks.get(t.id!).then((latest) => {
      if (latest && !latest.completed && latest.due) fire(latest);
    });
  }, delay);
  scheduled.set(t.id, h);
}

async function sweep() {
  const all = await aiDb.richTasks.toArray();
  // Schedule current set
  const seen = new Set<number>();
  for (const t of all) {
    if (t.id == null) continue;
    seen.add(t.id);
    scheduleOne(t);
  }
  // Drop stale handles for deleted tasks
  for (const id of Array.from(scheduled.keys())) {
    if (!seen.has(id)) unschedule(id);
  }
}

let started = false;
export async function startReminderService() {
  if (started || typeof window === 'undefined') return;
  started = true;
  // Best-effort permission ask (non-blocking; we still toast as fallback).
  ensurePermission();
  await sweep();
  setInterval(sweep, SWEEP_MS);

  // React to live changes to the richTasks table.
  aiDb.richTasks.hook('creating', (_pk, obj) => {
    queueMicrotask(() => scheduleOne(obj as RichTaskRecord));
  });
  aiDb.richTasks.hook('updating', (_mods, _pk, obj) => {
    queueMicrotask(() => scheduleOne(obj as RichTaskRecord));
  });
  aiDb.richTasks.hook('deleting', (pk) => {
    unschedule(pk as number);
  });

  // Re-sweep when tab regains focus (covers backgrounded suspended timers).
  window.addEventListener('focus', sweep);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sweep();
  });
}
