/**
 * Tiny localStorage-backed queue for AI requests issued while Ollama is
 * offline. When the network/Ollama comes back online, queued jobs are
 * replayed and their results are passed back to the caller via a handler
 * registered per `kind`.
 */
import { pingOllama } from './ollama';

const KEY = 'workx-ai-queue-v1';

export interface QueuedJob {
  id: string;
  kind: string;       // e.g. "note-generate"
  payload: unknown;   // anything JSON-serialisable
  createdAt: number;
}

type Handler = (payload: unknown) => Promise<void>;
const handlers = new Map<string, Handler>();
let polling = false;

function read(): QueuedJob[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as QueuedJob[]; }
  catch { return []; }
}
function write(jobs: QueuedJob[]) { localStorage.setItem(KEY, JSON.stringify(jobs)); }

export function getQueue(): QueuedJob[] { return read(); }
export function queueSize(): number { return read().length; }

export function enqueue(kind: string, payload: unknown): QueuedJob {
  const job: QueuedJob = {
    id: (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
    kind, payload, createdAt: Date.now(),
  };
  const jobs = read();
  jobs.push(job);
  write(jobs);
  return job;
}

export function clearQueue() { write([]); }

export function registerHandler(kind: string, fn: Handler) {
  handlers.set(kind, fn);
}

export async function drain(): Promise<{ done: number; failed: number }> {
  const jobs = read();
  if (jobs.length === 0) return { done: 0, failed: 0 };
  const online = await pingOllama();
  if (!online) return { done: 0, failed: 0 };
  let done = 0; let failed = 0;
  const remaining: QueuedJob[] = [];
  for (const j of jobs) {
    const h = handlers.get(j.kind);
    if (!h) { remaining.push(j); continue; }
    try { await h(j.payload); done++; }
    catch { failed++; remaining.push(j); }
  }
  write(remaining);
  return { done, failed };
}

/** Start a background poller that drains the queue when Ollama returns. */
export function startQueuePoller(intervalMs = 20000) {
  if (polling) return;
  polling = true;
  const tick = async () => {
    try { await drain(); } catch { /* swallow */ }
  };
  setInterval(tick, intervalMs);
  // Also try once on regain of connectivity.
  window.addEventListener('online', tick);
  // Fire one immediate attempt.
  tick();
}
