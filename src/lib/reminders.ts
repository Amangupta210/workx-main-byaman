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
const DEFAULT_MINS_KEY = 'workx-default-reminder-mins';

/* ───────── Debug info (per-task) ───────── */

export interface ReminderDebugInfo {
  taskId: number;
  title: string;
  due: number | null;
  fireAt: number | null;
  scheduledAt: number | null;
  lastResult: 'notified' | 'toast-only' | 'past-stale' | 'pending' | 'completed' | 'error' | null;
  lastResultAt: number | null;
  error?: string;
}
const debugMap = new Map<number, ReminderDebugInfo>();
type DebugListener = (rows: ReminderDebugInfo[]) => void;
const debugListeners = new Set<DebugListener>();
function emitDebug() {
  const rows = Array.from(debugMap.values()).sort(
    (a, b) => (a.fireAt ?? Infinity) - (b.fireAt ?? Infinity),
  );
  debugListeners.forEach((fn) => { try { fn(rows); } catch {} });
}
export function subscribeReminderDebug(fn: DebugListener): () => void {
  debugListeners.add(fn);
  fn(Array.from(debugMap.values()));
  return () => debugListeners.delete(fn);
}
export function getReminderDebugRows(): ReminderDebugInfo[] {
  return Array.from(debugMap.values());
}
function updateDebug(taskId: number, patch: Partial<ReminderDebugInfo>) {
  const cur = debugMap.get(taskId) ?? {
    taskId, title: '', due: null, fireAt: null,
    scheduledAt: null, lastResult: null, lastResultAt: null,
  };
  debugMap.set(taskId, { ...cur, ...patch });
  emitDebug();
}

/* ───────── Default reminder minutes ───────── */

export function getDefaultReminderMins(): number {
  try {
    const raw = localStorage.getItem(DEFAULT_MINS_KEY);
    if (raw == null) return 10;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 10;
  } catch {
    return 10;
  }
}
export function setDefaultReminderMins(mins: number) {
  try {
    localStorage.setItem(DEFAULT_MINS_KEY, String(Math.max(0, Math.floor(mins))));
  } catch {}
  // Reschedule everything with the new default.
  sweep();
}

/* ───────── Permission helpers ───────── */

export type ReminderPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function getPermissionStatus(): ReminderPermission {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as ReminderPermission;
}

type PermListener = (s: ReminderPermission) => void;
const permListeners = new Set<PermListener>();
export function subscribePermission(fn: PermListener): () => void {
  permListeners.add(fn);
  fn(getPermissionStatus());
  return () => permListeners.delete(fn);
}
function emitPermission() {
  const s = getPermissionStatus();
  permListeners.forEach((fn) => {
    try { fn(s); } catch {}
  });
}

export async function requestPermission(): Promise<ReminderPermission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    emitPermission();
    return Notification.permission as ReminderPermission;
  }
  try {
    const r = await Notification.requestPermission();
    emitPermission();
    return r as ReminderPermission;
  } catch {
    return 'default';
  }
}

/* ───────── Test fire ───────── */

export function triggerTestReminder(t: Partial<RichTaskRecord> & { title: string }) {
  const stub: RichTaskRecord = {
    id: t.id ?? -1,
    pageId: t.pageId ?? null,
    title: `[Test] ${t.title}`,
    due: t.due ?? Date.now(),
    reminderMinsBefore: t.reminderMinsBefore ?? 0,
    priority: t.priority ?? 'med',
    labels: t.labels ?? [],
    recurrence: t.recurrence ?? 'none',
    completed: false,
    createdAt: Date.now(),
  };
  notify(stub);
}
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

  let result: ReminderDebugInfo['lastResult'] = 'toast-only';
  let errorMsg: string | undefined;
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, tag: `workx-task-${t.id}`, icon: '/favicon.ico' });
      result = 'notified';
    } catch (e) {
      result = 'error';
      errorMsg = (e as Error)?.message ?? String(e);
    }
  }
  toast(title, { description: body });
  if (t.id != null && t.id >= 0) {
    updateDebug(t.id, {
      title: t.title,
      due: t.due ?? null,
      lastResult: result,
      lastResultAt: Date.now(),
      error: errorMsg,
    });
  }
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
  if (t.completed) {
    if (debugMap.has(t.id)) updateDebug(t.id, { title: t.title, lastResult: 'completed', fireAt: null });
    return;
  }
  if (!t.due) return;
  const mins = t.reminderMinsBefore == null ? getDefaultReminderMins() : t.reminderMinsBefore;
  const fireAt = t.due - mins * 60_000;
  const now = Date.now();
  const key = firedKey(t);
  updateDebug(t.id, {
    title: t.title, due: t.due, fireAt, scheduledAt: now,
    lastResult: debugMap.get(t.id)?.lastResult ?? 'pending',
  });
  if (fired.has(key)) return;

  if (fireAt <= now) {
    if (now - fireAt < STALE_GRACE_MS) fire(t);
    else {
      fired.add(key);
      saveFired(fired);
      updateDebug(t.id, { lastResult: 'past-stale', lastResultAt: Date.now() });
    }
    return;
  }
  const delay = Math.min(fireAt - now, 2_000_000_000);
  const h = setTimeout(() => {
    scheduled.delete(t.id!);
    aiDb.richTasks.get(t.id!).then((latest) => {
      if (latest && !latest.completed && latest.due) fire(latest);
    });
  }, delay);
  scheduled.set(t.id, h);
}

async function sweep() {
  const all = await aiDb.richTasks.toArray();
  const seen = new Set<number>();
  for (const t of all) {
    if (t.id == null) continue;
    seen.add(t.id);
    scheduleOne(t);
  }
  for (const id of Array.from(scheduled.keys())) {
    if (!seen.has(id)) unschedule(id);
  }
  for (const id of Array.from(debugMap.keys())) {
    if (!seen.has(id)) { debugMap.delete(id); }
  }
  emitDebug();
}

let started = false;
export async function startReminderService() {
  if (started || typeof window === 'undefined') return;
  started = true;
  // Best-effort permission ask (non-blocking; we still toast as fallback).
  ensurePermission().then(emitPermission);
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
