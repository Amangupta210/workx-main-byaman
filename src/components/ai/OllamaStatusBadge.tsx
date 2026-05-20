import { useEffect, useState } from 'react';
import { CircleDot, RefreshCw } from 'lucide-react';
import { pingOllama } from '@/lib/ollama';

/** Inline status indicator for local Ollama availability. */
export default function OllamaStatusBadge({ className = '' }: { className?: string }) {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const check = async () => {
    setStatus('checking');
    const ok = await pingOllama();
    setStatus(ok ? 'online' : 'offline');
  };

  useEffect(() => {
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, []);

  const meta =
    status === 'online'
      ? { dot: 'text-emerald-500', label: 'AI online', tip: 'Local Ollama reachable — full AI features available.' }
      : status === 'offline'
      ? { dot: 'text-amber-500', label: 'AI offline', tip: 'Ollama not reachable. Start it with `ollama serve` (set OLLAMA_ORIGINS=* for browser CORS). Offline fallbacks still work.' }
      : { dot: 'text-muted-foreground animate-pulse', label: 'Checking AI…', tip: 'Pinging local Ollama.' };

  return (
    <button
      onClick={check}
      title={meta.tip}
      className={`inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-secondary ${className}`}
    >
      <CircleDot size={10} className={meta.dot} />
      <span>{meta.label}</span>
      <RefreshCw size={9} className="opacity-50" />
    </button>
  );
}
