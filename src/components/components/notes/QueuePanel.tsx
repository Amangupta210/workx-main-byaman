/**
 * Queue management panel: lists pending + failed offline AI jobs and lets the
 * user retry or remove them without reloading the page.
 *
 * Keyboard support:
 *  - Esc closes
 *  - Tab cycles only inside the dialog (focus trap)
 *  - Focus moves to the close button on open; returns to opener on close
 *
 * Per-job state:
 *  - The retry button shows a spinner and is disabled while the job is being
 *    re-enqueued / drained so the user can't fire duplicate retries.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Trash2, X, CloudOff, AlertTriangle } from 'lucide-react';
import {
  getQueue, retryJob, removeJob, clearFailed, drain, subscribe,
  type QueuedJob,
} from '@/lib/aiQueue';

interface Props { open: boolean; onClose: () => void }

function describePayload(j: QueuedJob): string {
  const p = j.payload as { prompt?: string; count?: number } | null;
  if (!p) return j.kind;
  if (j.kind === 'note-multi' && p.prompt) return `Generate ${p.count ?? '?'} notes · "${truncate(p.prompt, 80)}"`;
  if (j.kind === 'note-generate' && p.prompt) return `Generate note · "${truncate(p.prompt, 80)}"`;
  return j.kind;
}
function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function QueuePanel({ open, onClose }: Props) {
  const [jobs, setJobs] = useState<QueuedJob[]>([]);
  const [draining, setDraining] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    const refresh = () => setJobs(getQueue());
    refresh();
    const unsub = subscribe(refresh);
    // Focus the first focusable element (close button) on open.
    requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((n) => !n.hasAttribute('disabled'));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      unsub();
      window.removeEventListener('keydown', onKey, true);
      // Return focus to whatever opened the dialog.
      (openerRef.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const pending = jobs.filter((j) => j.status === 'pending');
  const failed = jobs.filter((j) => j.status === 'failed');

  const markBusy = (id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleRetry = async (id: string) => {
    if (busyIds.has(id)) return;
    markBusy(id, true);
    try { retryJob(id); await drain(); }
    finally { markBusy(id, false); }
  };

  const retryAll = async () => {
    const ids = failed.map((j) => j.id);
    ids.forEach((id) => markBusy(id, true));
    failed.forEach((j) => retryJob(j.id));
    setDraining(true);
    try { await drain(); }
    finally {
      setDraining(false);
      ids.forEach((id) => markBusy(id, false));
    }
  };

  const drainNow = async () => {
    setDraining(true);
    try { await drain(); } finally { setDraining(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end bg-background/60 p-2 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="AI queue manager"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-card text-card-foreground shadow-xl ring-1 ring-border focus:outline-none"
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <CloudOff size={16} className="text-amber-500" aria-hidden="true" />
            <h2 className="text-sm font-semibold">AI queue</h2>
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {pending.length} pending · {failed.length} failed
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={drainNow}
              disabled={draining || jobs.length === 0}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              title="Try to drain the queue now"
            >
              {draining ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Drain
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1.5 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <X size={14} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-3">
          {jobs.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              No queued AI jobs. Anything you ask while Ollama is offline will appear here.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {[...pending, ...failed].map((j) => {
                const isBusy = busyIds.has(j.id);
                return (
                  <li
                    key={j.id}
                    className={`rounded-lg border p-3 text-xs ${
                      j.status === 'failed'
                        ? 'border-destructive/40 bg-destructive/5'
                        : 'border-border bg-background'
                    } ${isBusy ? 'opacity-80' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {j.status === 'failed' && <AlertTriangle size={11} className="text-destructive" aria-hidden="true" />}
                          <span className="font-medium">{describePayload(j)}</span>
                          {isBusy && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Loader2 size={10} className="animate-spin" /> retrying
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {j.status} · attempts: {j.attempts} · queued {new Date(j.createdAt).toLocaleTimeString()}
                        </div>
                        {j.lastError && (
                          <div className="mt-1 break-words text-[10px] text-destructive">
                            {j.lastError}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => handleRetry(j.id)}
                          disabled={isBusy}
                          aria-busy={isBusy}
                          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-[11px] hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          title={isBusy ? 'Retrying…' : 'Retry now'}
                        >
                          {isBusy ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                          {isBusy ? 'Retrying' : 'Retry'}
                        </button>
                        <button
                          onClick={() => removeJob(j.id)}
                          disabled={isBusy}
                          aria-label="Remove job"
                          className="inline-flex items-center rounded-md p-1 text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                          title="Remove"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {failed.length > 0 && (
          <footer className="flex items-center justify-between border-t border-border px-4 py-2 text-xs">
            <span className="text-muted-foreground">{failed.length} failed job{failed.length === 1 ? '' : 's'}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={retryAll}
                disabled={draining || busyIds.size > 0}
                className="rounded-md border border-input px-2 py-1 hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                Retry all failed
              </button>
              <button
                onClick={clearFailed}
                className="rounded-md px-2 py-1 text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                Clear failed
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
