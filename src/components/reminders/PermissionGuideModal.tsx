import React, { useEffect, useState } from 'react';
import { X, BellRing, ShieldCheck, WifiOff, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  requestPermission,
  subscribePermission,
  type ReminderPermission,
} from '@/lib/reminders';

export default function PermissionGuideModal({
  open,
  onClose,
}: { open: boolean; onClose: () => void }) {
  const [perm, setPerm] = useState<ReminderPermission>('default');
  useEffect(() => subscribePermission(setPerm), []);
  if (!open) return null;

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isChrome = /Chrome|Chromium|Edg/i.test(ua) && !/Firefox/i.test(ua);
  const isFirefox = /Firefox/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome/i.test(ua);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <BellRing size={16} className="text-primary" />
            <h2 className="text-sm font-semibold">Reminder permission guide</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-secondary">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm">
          <div
            className={`flex items-start gap-2 rounded-lg p-3 ${
              perm === 'granted'
                ? 'bg-emerald-500/10 text-emerald-600'
                : perm === 'denied'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-amber-500/10 text-amber-600'
            }`}
          >
            {perm === 'granted' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <div className="text-xs">
              Current status: <b className="capitalize">{perm}</b>
              {perm === 'denied' && (
                <p className="mt-1 text-foreground/80">
                  Your browser remembers the block. You must allow notifications from the site settings
                  (the lock icon next to the URL), then reload.
                </p>
              )}
            </div>
          </div>

          <ol className="list-decimal space-y-2 pl-5 text-foreground/90">
            <li>Click <b>Enable reminders</b> below — your browser will show a prompt.</li>
            <li>Choose <b>Allow</b>. Pinning the tab/installing as PWA improves background delivery.</li>
            <li>
              Use <b>Test reminder</b> on any task to fire one immediately and confirm it arrives.
            </li>
          </ol>

          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <div className="mb-1 flex items-center gap-1.5 font-medium">
              <WifiOff size={12} /> What works offline
            </div>
            <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
              <li>Local notifications scheduled by this tab while it is open or installed as PWA.</li>
              <li>In-app sonner toast fallback (always shown, even without permission).</li>
              <li>The “Test reminder” button — fires instantly using the same code path.</li>
            </ul>
            <div className="mt-2 mb-1 flex items-center gap-1.5 font-medium">
              <ShieldCheck size={12} /> What doesn't work offline
            </div>
            <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
              <li>Push from a remote server — there is no server in WorkX.</li>
              <li>Reminders while the browser is fully closed on iOS Safari (install as PWA to mitigate).</li>
              <li>Reminders denied by OS-level Do Not Disturb / Focus modes.</li>
            </ul>
          </div>

          <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
            <b className="text-foreground">If the browser prompt doesn't appear:</b>
            <ul className="ml-4 mt-1 list-disc space-y-1">
              {isChrome && <li>Chrome: lock icon → Site settings → Notifications → Allow.</li>}
              {isFirefox && <li>Firefox: lock icon → Connection secure → More info → Permissions.</li>}
              {isSafari && <li>Safari: Settings → Websites → Notifications → Allow.</li>}
              {!isChrome && !isFirefox && !isSafari && (
                <li>Open the site permissions next to the URL and allow notifications.</li>
              )}
              <li>After allowing, reload the page and click Test reminder again.</li>
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs hover:bg-secondary">
            Close
          </button>
          <button
            onClick={async () => {
              const r = await requestPermission();
              if (r === 'denied') {
                alert('Notifications are blocked. Open site settings and allow them, then reload.');
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <BellRing size={12} /> Enable reminders
          </button>
        </div>
      </div>
    </div>
  );
}
