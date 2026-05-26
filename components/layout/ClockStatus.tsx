import { useEffect, useState } from 'react';
import { Wifi, WifiOff, CircleDot } from 'lucide-react';
import { pingOllama } from '@/lib/ollama';

/** Compact corner widget: live local time + Ollama/offline indicator. */
export default function ClockStatus() {
  const [now, setNow] = useState(() => new Date());
  const [online, setOnline] = useState(() => navigator.onLine);
  const [ollamaUp, setOllamaUp] = useState<boolean | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ok = await pingOllama();
      if (!cancelled) setOllamaUp(ok);
    };
    check();
    const t = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  const aiLabel =
    ollamaUp === null ? 'AI: checking…' :
    ollamaUp ? 'AI ready (local Ollama)' :
    'AI offline — start `ollama serve` to enable chat & analysis';

  return (
    <div className="hidden md:flex items-center gap-2 px-2 mr-1 text-[11px] text-muted-foreground border-r border-border pr-3">
      <div
        className="flex items-center gap-1"
        title={aiLabel}
      >
        <CircleDot
          size={10}
          className={
            ollamaUp === null ? 'text-muted-foreground animate-pulse' :
            ollamaUp ? 'text-emerald-500' : 'text-amber-500'
          }
        />
        <span className="hidden lg:inline">{ollamaUp ? 'AI' : 'AI off'}</span>
      </div>
      <span
        className="flex items-center gap-1"
        title={online ? 'Online' : 'Offline — local features still work'}
      >
        {online ? <Wifi size={10} className="text-emerald-500" /> : <WifiOff size={10} className="text-amber-500" />}
      </span>
      <div className="leading-tight text-right">
        <div className="font-medium tabular-nums text-foreground">{time}</div>
        <div className="text-[10px] text-muted-foreground">{date}</div>
      </div>
    </div>
  );
}
