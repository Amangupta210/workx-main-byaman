/**
 * Tiny localStorage-backed queue for AI requests issued while Ollama is
 * offline. When Ollama comes back online, queued jobs are replayed and their
 * results are passed back via a handler registered per `kind`.
 *
 * Features:
 *  - De-duplication: enqueueing the same (kind + payload) returns the existing
 *    job instead of creating a duplicate. This prevents replay storms from
 *    producing duplicate sticky notes when Ollama reconnects.
 *  - Failed jobs are retained (status='failed') with `attempts` + `lastError`
 *    so a UI can show them and offer retry / clear.
 */
import { pingOllama } from './ollama';

const KEY = 'workx-ai-queue-v1';

export type JobStatus = 'pending' | 'failed';

export interface QueuedJob {
  id: string;
  kind: string;             // e.g. "note-generate"
  payload: unknown;         // anything JSON-serialisable
  createdAt: number;
  status: JobStatus;
  attempts: number;
  lastError?: string;
  fingerprint: string;      // dedupe key
}

type Handler = (payload: unknown) => Promise<void>;
const handlers = new Map<string, Handler>();
const listeners = new Set<() => void>();
let polling = false;
const MAX_ATTEMPTS = 3;

function read(): QueuedJob[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as QueuedJob[];
    // Back-compat: older entries may lack the new fields.
    return raw.map((j) => ({
      status: 'pending' as JobStatus,
      attempts: 0,
      fingerprint: stableFingerprint(j.kind, j.payload),
      ...j,
    }));
  } catch { return []; }
}
function write(jobs: QueuedJob[]) {
  localStorage.setItem(KEY, JSON.stringify(jobs));
  listeners.forEach((l) => { try { l(); } catch { /* noop */ } });
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k])).join(',') + '}';
}
function stableFingerprint(kind: string, payload: unknown): string {
  return kind + '::' + stableStringify(payload);
}

export function getQueue(): QueuedJob[] { return read(); }
export function queueSize(): number { return read().filter((j) => j.status === 'pending').length; }
export function failedSize(): number { return read().filter((j) => j.status === 'failed').length; }

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function enqueue(kind: string, payload: unknown): QueuedJob {
  const fp = stableFingerprint(kind, payload);
  const jobs = read();
  // De-duplicate: if a pending or failed job already exists with the same
  // (kind + payload), return it instead of adding a duplicate.
  const existing = jobs.find((j) => j.fingerprint === fp);
  if (existing) {
    if (existing.status === 'failed') {
      existing.status = 'pending';
      existing.lastError = undefined;
      write(jobs);
    }
    return existing;
  }
  const job: QueuedJob = {
    id: (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
    kind, payload, createdAt: Date.now(),
    status: 'pending', attempts: 0, fingerprint: fp,
  };
  jobs.push(job);
  write(jobs);
  return job;
}

export function clearQueue() { write([]); }
export function clearFailed() { write(read().filter((j) => j.status !== 'failed')); }
export function removeJob(id: string) { write(read().filter((j) => j.id !== id)); }

export function retryJob(id: string) {
  const jobs = read();
  const j = jobs.find((x) => x.id === id);
  if (!j) return;
  j.status = 'pending';
  j.lastError = undefined;
  j.attempts = 0;
  write(jobs);
  void drain();
}

export function registerHandler(kind: string, fn: Handler) {
  handlers.set(kind, fn);
}

export async function drain(): Promise<{ done: number; failed: number }> {
  const jobs = read();
  const pending = jobs.filter((j) => j.status === 'pending');
  if (pending.length === 0) return { done: 0, failed: 0 };
  const online = await pingOllama();
  if (!online) return { done: 0, failed: 0 };

  let done = 0; let failed = 0;
  const remaining: QueuedJob[] = [];
  for (const j of jobs) {
    if (j.status !== 'pending') { remaining.push(j); continue; }
    const h = handlers.get(j.kind);
    if (!h) { remaining.push(j); continue; }
    try {
      await h(j.payload);
      done++;
      // success → drop the job
    } catch (e) {
      j.attempts += 1;
      j.lastError = e instanceof Error ? e.message : String(e);
      if (j.attempts >= MAX_ATTEMPTS) j.status = 'failed';
      remaining.push(j);
      failed++;
    }
  }
  write(remaining);
  return { done, failed };
}

/** Start a background poller that drains the queue when Ollama returns. */
export function startQueuePoller(intervalMs = 20000) {
  if (polling) return;
  polling = true;
  const tick = async () => { try { await drain(); } catch { /* swallow */ } };
  setInterval(tick, intervalMs);
  window.addEventListener('online', tick);
  tick();
}
