import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  journalDb,
  getOrCreateEntry,
  saveEntry,
  deleteEntry,
  moodMeta,
  MOODS,
  type JournalEntry,
  type Mood,
} from '@/lib/journalDb';
import { saveMedia, loadMedia } from '@/lib/db';
import {
  Search, Plus, X, BookOpen, Calendar as CalendarIcon, Image as ImageIcon,
  Save, Sparkles, RefreshCw, Heart, Lock, Settings, ArrowLeft, Trash2, Brain, Loader2,
  Download,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { askAI, OllamaError, pingOllama, translateText, rewriteText, summarizeNote } from '@/lib/ollama';
import OllamaStatusBadge from '@/components/ai/OllamaStatusBadge';
import { exportEntriesToPdf } from '@/lib/journalPdf';

/* ───────────── PIN gate ───────────── */

const PIN_KEY = 'snewritez-pin';
const PIN_UNLOCKED_KEY = 'snewritez-unlocked';

function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [mode, setMode] = useState<'enter' | 'set'>(
    () => (localStorage.getItem(PIN_KEY) ? 'enter' : 'set'),
  );

  useEffect(() => { refs.current[0]?.focus(); }, []);

  const value = digits.join('');

  const submit = (v: string) => {
    if (mode === 'set') {
      localStorage.setItem(PIN_KEY, v);
      sessionStorage.setItem(PIN_UNLOCKED_KEY, '1');
      toast.success('PIN set');
      onUnlock();
      return;
    }
    if (v === localStorage.getItem(PIN_KEY)) {
      sessionStorage.setItem(PIN_UNLOCKED_KEY, '1');
      onUnlock();
    } else {
      setError('Wrong PIN, try again');
      setDigits(['', '', '', '']);
      refs.current[0]?.focus();
    }
  };

  const onChange = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    setError('');
    if (d && i < 3) refs.current[i + 1]?.focus();
    if (next.every((x) => x) && next.join('').length === 4) submit(next.join(''));
  };

  const resetPin = () => {
    if (!confirm('Reset your PIN? Your entries are not deleted.')) return;
    localStorage.removeItem(PIN_KEY);
    setMode('set');
    setDigits(['', '', '', '']);
    setError('');
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4"
         style={{ background: 'linear-gradient(135deg, #c9a0dc 0%, #b389d0 100%)' }}>
      <div className="w-full max-w-md rounded-3xl bg-[#2a2438] p-10 text-center shadow-2xl">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full"
             style={{ background: 'radial-gradient(circle, #d4b3f0 0%, #b389d0 100%)' }}>
          <Heart size={36} className="text-[#2a2438]" />
        </div>
        <h1 className="font-serif text-4xl font-bold tracking-wider text-white">WORK X · DAYS</h1>
        <p className="mt-1 text-sm text-white/60">
          {mode === 'set' ? 'Create a password to protect your days' : 'Your private journey log'}
        </p>
        <div className="my-6 flex justify-center text-white/40"><Lock size={22} /></div>
        <p className="text-sm text-white">
          🔒 {mode === 'set' ? 'Required — set a 4-digit password' : 'Enter your password to continue'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => onChange(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
              }}
              className="h-12 w-12 rounded-xl bg-[#1f1a2b] text-center text-2xl text-white outline-none focus:ring-2 focus:ring-[#c9a0dc]"
            />
          ))}
        </div>
        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
        {mode === 'enter' && (
          <button onClick={resetPin} className="mt-6 block w-full text-sm text-white/70 hover:text-white">
            Forgot password? Reset it
          </button>
        )}
        <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-white/50">
          <Settings size={12} /> {mode === 'set' ? 'Stored locally on this device only' : 'Security Options'}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Photo thumb ───────────── */

function Thumb({ mediaId, onRemove }: { mediaId: string; onRemove?: () => void }) {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    let active = true;
    let created = '';
    loadMedia(mediaId).then((b) => {
      if (b && active) {
        created = URL.createObjectURL(b);
        setUrl(created);
      }
    });
    return () => { active = false; if (created) URL.revokeObjectURL(created); };
  }, [mediaId]);
  if (!url) return <div className="h-24 w-24 animate-pulse rounded-lg bg-white/5" />;
  return (
    <div className="group relative h-24 w-24 overflow-hidden rounded-lg">
      <img src={url} alt="" className="h-full w-full object-cover" />
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/* ───────────── New / Edit Entry modal ───────────── */

const PROMPTS = [
  "What's something new you learned about yourself? 🌱",
  'Three things you are grateful for today ✨',
  'A small win worth celebrating 🎉',
  'A feeling you want to remember 💜',
  'Who made you smile today and why? 😊',
  'What did you let go of today? 🍃',
];

function EntryModal({
  entry, onClose,
}: { entry: JournalEntry; onClose: () => void }) {
  const [title, setTitle] = useState(entry.title ?? '');
  const [content, setContent] = useState(entry.content);
  const [photos, setPhotos] = useState<string[]>(entry.photos ?? []);
  const [dateStr, setDateStr] = useState(entry.dateKey);
  const [mood, setMood] = useState<Mood | null>(entry.mood);
  const [analysis, setAnalysis] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    await saveEntry(entry.id!, { title, content, photos, mood });
    toast.success('Entry saved 💜');
    onClose();
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const ids: string[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      const id = crypto.randomUUID();
      await saveMedia(id, f);
      ids.push(id);
    }
    setPhotos((p) => [...p, ...ids]);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this entry?')) return;
    await deleteEntry(entry.id!);
    toast.success('Entry deleted');
    onClose();
  };

  const localFallbackAnalysis = () => {
    const words = content.trim().split(/\s+/).filter(Boolean).length;
    const m = mood ? MOODS.find((x) => x.value === mood) : null;
    const lines = [
      `📓 Offline summary (Ollama unavailable)`,
      m ? `• Mood: ${m.emoji} ${m.label}` : `• Mood: not set`,
      `• Length: ${words} word${words === 1 ? '' : 's'}`,
      content.trim()
        ? `• First line: "${content.trim().split('\n')[0].slice(0, 120)}"`
        : `• No journal text yet — try jotting one sentence.`,
      `• Tip: start Ollama (\`ollama serve\`) for a deeper reflection.`,
    ];
    return lines.join('\n');
  };

  const analyzeMood = async () => {
    if (!content.trim() && !mood) {
      toast.error('Add some content or pick a mood first');
      return;
    }
    setAnalyzing(true);
    setAnalysis('');
    try {
      const online = await pingOllama();
      if (!online) {
        setAnalysis(localFallbackAnalysis());
        return;
      }
      const m = mood ? `${mood}` : 'unspecified';
      const out = await askAI(
        `I journaled today. Mood: ${m}.\n\nEntry:\n${content || '(no text)'}\n\nPlease:\n1) Reflect briefly on what this entry suggests about my state of mind.\n2) Point out 1–2 patterns or triggers (be honest, not generic).\n3) Suggest 2 concrete next steps I can try tomorrow.\nKeep it warm, under 150 words.`,
        { onChunk: (c) => setAnalysis((p) => p + c) },
      );
      if (!out) setAnalysis(localFallbackAnalysis());
    } catch (err) {
      const msg = err instanceof OllamaError ? err.message : 'AI request failed';
      setAnalysis(`⚠️ ${msg}\n\n${localFallbackAnalysis()}`);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-[#1f1a2b] p-6 text-white shadow-2xl ring-1 ring-white/10">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-serif text-2xl font-bold">{entry.title ? 'Edit Entry' : 'New Entry'}</h2>
          <button onClick={onClose} className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
          <CalendarIcon size={14} className="text-[#c9a0dc]" /> Date
        </label>
        <input
          type="date"
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
          className="mb-4 w-full rounded-lg bg-[#15111e] px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-[#c9a0dc]"
        />

        <label className="mb-1.5 block text-sm font-medium">Title (optional)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give your entry a title..."
          className="mb-4 w-full rounded-lg bg-[#15111e] px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-[#c9a0dc] placeholder:text-white/30"
        />

        <label className="mb-1.5 block text-sm font-medium">How are you feeling?</label>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {MOODS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMood(mood === m.value ? null : m.value)}
              className={`rounded-full px-3 py-1.5 text-xs transition ${
                mood === m.value
                  ? 'bg-[#c9a0dc] text-[#2a2438] font-semibold'
                  : 'bg-[#15111e] text-white/70 ring-1 ring-white/10 hover:bg-white/5'
              }`}
              title={m.label}
            >
              <span className="mr-1">{m.emoji}</span>{m.label}
            </button>
          ))}
        </div>

        <label className="mb-1.5 block text-sm font-medium">Your thoughts & memories</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Dear diary, today I..."
          className="mb-4 min-h-[200px] w-full resize-y rounded-lg bg-[#15111e] px-3 py-2.5 text-sm leading-relaxed text-white outline-none ring-1 ring-white/10 focus:ring-[#c9a0dc] placeholder:text-white/30"
        />

        <div className="mb-4 rounded-xl border border-[#c9a0dc]/20 bg-[#c9a0dc]/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Brain size={14} className="text-[#c9a0dc]" /> AI assistant (local Ollama)
            </div>
            <button
              onClick={analyzeMood}
              disabled={analyzing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#c9a0dc] px-3 py-1.5 text-xs font-medium text-[#2a2438] hover:bg-[#d4b3f0] disabled:opacity-50"
            >
              {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {analyzing ? 'Thinking…' : analysis ? 'Re-run' : 'Analyze mood'}
            </button>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[
              { label: '🌍 Translate → English', run: (o: any) => translateText(content, 'English', o) },
              { label: '🇮🇳 Translate → Hindi', run: (o: any) => translateText(content, 'Hindi', o) },
              { label: '✍️ Rewrite (clear)', run: (o: any) => rewriteText(content, 'clear, warm and natural', o) },
              { label: '✨ Polish', run: (o: any) => rewriteText(content, 'concise and well-structured, fix grammar', o) },
              { label: '📝 Summarize', run: (o: any) => summarizeNote(content, o) },
              { label: '🏷 Suggest tags', run: (o: any) => askAI(`Suggest 4-6 short hashtags (one word each, no #) for this journal entry. Return only a comma-separated list.\n\n${content}`, o) },
            ].map((act) => (
              <button
                key={act.label}
                disabled={analyzing || !content.trim()}
                onClick={async () => {
                  setAnalyzing(true); setAnalysis('');
                  try {
                    const online = await pingOllama();
                    if (!online) { setAnalysis(localFallbackAnalysis()); return; }
                    const out = await act.run({ onChunk: (c) => setAnalysis((p) => p + c) });
                    if (!out) setAnalysis('(no response)');
                  } catch (err) {
                    const msg = err instanceof OllamaError ? err.message : 'AI request failed';
                    setAnalysis(`⚠️ ${msg}`);
                  } finally { setAnalyzing(false); }
                }}
                className="rounded-full bg-[#15111e] px-2.5 py-1 text-[11px] text-white/80 ring-1 ring-white/10 hover:bg-white/5 disabled:opacity-40"
              >
                {act.label}
              </button>
            ))}
          </div>
          {analysis ? (
            <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-white/85 font-sans">{analysis}</pre>
          ) : (
            <p className="text-xs text-white/50">Runs locally via Ollama — your entry never leaves this device. If Ollama is offline you'll get a quick local summary.</p>
          )}
        </div>

        <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
          <ImageIcon size={14} className="text-[#c9a0dc]" /> Photos
        </label>
        <div
          onClick={() => fileRef.current?.click()}
          className="mb-4 cursor-pointer rounded-xl border-2 border-dashed border-white/15 bg-[#15111e]/50 p-6 text-center hover:border-[#c9a0dc]/50"
        >
          <ImageIcon className="mx-auto mb-2 text-white/40" size={28} />
          <div className="text-sm text-white/70">Click to add photos to your entry</div>
          <div className="text-xs text-white/40">You can select multiple photos</div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
        {photos.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {photos.map((id) => (
              <Thumb key={id} mediaId={id} onRemove={() => setPhotos((p) => p.filter((x) => x !== id))} />
            ))}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          {entry.id && (entry.content || entry.title || (entry.photos?.length ?? 0)) ? (
            <button onClick={handleDelete}
              className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-500/10">
              <Trash2 size={14} /> Delete
            </button>
          ) : null}
          <button onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-white/80 hover:bg-white/10">Cancel</button>
          <button onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-lg bg-[#c9a0dc] px-4 py-2 text-sm font-medium text-[#2a2438] hover:bg-[#d4b3f0]">
            <Save size={14} /> Save Entry
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Entry preview card ───────────── */

function EntryCard({ entry, onOpen }: { entry: JournalEntry; onOpen: () => void }) {
  const m = moodMeta(entry.mood);
  return (
    <button onClick={onOpen}
      className="group w-full rounded-2xl border border-white/5 bg-[#1f1a2b]/80 p-5 text-left transition hover:border-[#c9a0dc]/40 hover:bg-[#241e32]">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm text-white/60">{format(new Date(entry.date), 'EEE, MMM d, yyyy')}</div>
        {m && <span className="text-lg" title={m.label}>{m.emoji}</span>}
      </div>
      {entry.title && <div className="mb-1 font-serif text-lg font-semibold text-white">{entry.title}</div>}
      <p className="line-clamp-3 text-sm text-white/70">{entry.content || 'Empty entry'}</p>
      {(entry.photos?.length ?? 0) > 0 && (
        <div className="mt-3 flex gap-1.5">
          {entry.photos!.slice(0, 4).map((id) => <Thumb key={id} mediaId={id} />)}
        </div>
      )}
      {entry.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.tags.map((t) => (
            <span key={t} className="rounded-full bg-[#c9a0dc]/15 px-2 py-0.5 text-[11px] text-[#d4b3f0]">#{t}</span>
          ))}
        </div>
      )}
    </button>
  );
}

/* ───────────── Page ───────────── */

export default function JournalRoute() {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(PIN_UNLOCKED_KEY) === '1',
  );
  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;
  return <JournalPage />;
}

function JournalPage() {
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [modalEntry, setModalEntry] = useState<JournalEntry | null>(null);
  const [promptIdx, setPromptIdx] = useState(0);
  const [tab, setTab] = useState<'timeline' | 'calendar' | 'mood'>('timeline');
  const [moodFilter, setMoodFilter] = useState<JournalEntry['mood'] | null>(null);

  const entries = useLiveQuery(
    () => journalDb.entries.orderBy('date').reverse().toArray(),
    [],
  ) ?? [];

  const filtered = useMemo(() => {
    let list = entries;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          (e.title ?? '').toLowerCase().includes(q) ||
          e.content.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (dateFilter) list = list.filter((e) => e.dateKey === dateFilter);
    if (moodFilter) list = list.filter((e) => e.mood === moodFilter);
    return list;
  }, [entries, search, dateFilter, moodFilter]);

  const photosCount = useMemo(
    () => entries.reduce((n, e) => n + (e.photos?.length ?? 0), 0),
    [entries],
  );

  const monthsActive = useMemo(() => {
    const s = new Set(entries.map((e) => e.dateKey.slice(0, 7)));
    return s.size;
  }, [entries]);

  const handleNewEntry = async (when?: Date) => {
    const e = await getOrCreateEntry(when ?? new Date());
    setModalEntry(e);
  };

  return (
    <div className="min-h-screen w-full bg-[#15111e] text-white">
      {/* glow backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-50"
        style={{
          background:
            'radial-gradient(60% 40% at 50% 0%, rgba(201,160,220,0.18) 0%, transparent 60%), radial-gradient(40% 30% at 100% 100%, rgba(244,194,194,0.10) 0%, transparent 60%)',
        }}
      />

      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Top bar */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-bold tracking-wider">WORK X · DAYS</h1>
            <p className="text-sm text-white/60">Your private journey log</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-white/60">
            <OllamaStatusBadge />
            <ExportMenu entries={entries} filtered={filtered} />
            <Link to="/" className="ml-1 inline-flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 hover:bg-white/10">
              <ArrowLeft size={12} /> Notes
            </Link>
          </div>
        </div>

        {/* Search + date + new */}
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your memories..."
              className="w-full rounded-full bg-[#1f1a2b] py-3 pl-10 pr-4 text-sm text-white outline-none ring-1 ring-white/5 focus:ring-[#c9a0dc]/50 placeholder:text-white/40"
            />
          </div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-full bg-[#1f1a2b] px-4 py-3 text-sm text-white outline-none ring-1 ring-white/5 focus:ring-[#c9a0dc]/50"
          />
          <button
            onClick={() => handleNewEntry()}
            className="inline-flex items-center gap-2 rounded-full bg-[#c9a0dc] px-5 py-3 text-sm font-medium text-[#2a2438] hover:bg-[#d4b3f0]"
          >
            <Plus size={16} /> New Entry
          </button>
        </div>

        {/* Writing inspiration */}
        <div className="mb-6 rounded-2xl border border-white/5 bg-[#1f1a2b]/60 p-5">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles size={16} className="text-[#c9a0dc]" />
            <span className="font-semibold">Writing Inspiration</span>
          </div>
          <p className="mb-4 text-sm text-white/80">{PROMPTS[promptIdx]}</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleNewEntry()}
              className="rounded-lg bg-[#c9a0dc] px-3 py-1.5 text-xs font-medium text-[#2a2438] hover:bg-[#d4b3f0]"
            >
              Use This Prompt
            </button>
            <button
              onClick={() => setPromptIdx((i) => (i + 1) % PROMPTS.length)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
            >
              <RefreshCw size={12} /> New Prompt
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard icon={<BookOpen size={20} className="text-[#c9a0dc]" />} value={entries.length} label="Total Entries" />
          <StatCard icon={<CalendarIcon size={20} className="text-[#c9a0dc]" />} value={monthsActive} label="Months Active" />
          <StatCard icon={<ImageIcon size={20} className="text-[#c9a0dc]" />} value={photosCount} label="Photos Saved" />
        </div>

        {/* Tabs */}
        <div className="mb-5 inline-flex rounded-full bg-[#1f1a2b] p-1 text-sm">
          {(['timeline', 'calendar', 'mood'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 capitalize transition ${
                tab === t ? 'bg-[#c9a0dc] text-[#2a2438] font-medium' : 'text-white/70 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
          {moodFilter && (
            <button
              onClick={() => setMoodFilter(null)}
              className="ml-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/15"
              title="Clear mood filter"
            >
              Clear: {moodFilter} ×
            </button>
          )}
        </div>

        {tab === 'calendar' && (
          <JournalCalendar
            entries={entries}
            onPick={async (d) => {
              const e = await getOrCreateEntry(d);
              setModalEntry(e);
            }}
          />
        )}

        {tab === 'mood' && (
          <MoodDashboard
            entries={entries}
            onFilter={(m) => { setMoodFilter(m); setTab('timeline'); }}
          />
        )}

        {tab === 'timeline' && (
          filtered.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-[#1f1a2b]/60 p-12 text-center"
                 style={{ boxShadow: '0 0 80px rgba(201,160,220,0.10) inset' }}>
              <BookOpen size={36} className="mx-auto mb-4 text-white/40" />
              <h2 className="font-serif text-2xl font-bold">
                {entries.length === 0 ? 'Welcome to your days log!' : 'No entries match'} ✨
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
                {entries.length === 0
                  ? 'Capture your days, moods, and moments. Start with your first entry or try a prompt above.'
                  : 'Try a different search, clear the date filter, or remove the mood filter.'}
              </p>
              <button
                onClick={() => handleNewEntry()}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#c9a0dc] px-5 py-3 text-sm font-medium text-[#2a2438] hover:bg-[#d4b3f0]"
              >
                <Plus size={16} /> Write Your First Entry
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filtered.map((e) => (
                <EntryCard key={e.id} entry={e} onOpen={() => setModalEntry(e)} />
              ))}
            </div>
          )
        )}

        <div className="mt-10 text-center text-xs text-white/40">
          Made with <span className="text-red-400">♥</span> by{' '}
          <a
            href="https://www.instagram.com/gupta_aman_1516"
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-white/80 underline decoration-white/20"
            title="Aman Gupta on Instagram"
          >
            Aman Gupta
          </a>
          {' & '}
          <a
            href="https://www.instagram.com/_.s.aura.b._/"
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-white/80 underline decoration-white/20"
            title="Saurab Negi on Instagram"
          >
            Saurab Negi
          </a>
        </div>
      </div>

      {modalEntry && <EntryModal entry={modalEntry} onClose={() => setModalEntry(null)} />}
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-[#1f1a2b]/60 p-6 text-center">
      <div className="mb-2 flex justify-center">{icon}</div>
      <div className="text-3xl font-bold">{value}</div>
      <div className="mt-1 text-sm text-white/60">{label}</div>
    </div>
  );
}

/* ───────────── Export menu (current view / all / date range / pick days) ───────────── */

function ExportMenu({ entries, filtered }: { entries: JournalEntry[]; filtered: JournalEntry[] }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'current' | 'all' | 'range' | 'pick'>('current');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const runExport = async (list: JournalEntry[], label: string) => {
    if (!list.length) { toast.error('No entries to export'); return; }
    const t = toast.loading(`Exporting ${list.length} entr${list.length === 1 ? 'y' : 'ies'}…`);
    try {
      await exportEntriesToPdf(list, `work-x-days-${label}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success('PDF downloaded', { id: t });
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message || 'Export failed', { id: t });
    }
  };

  const handleConfirm = async () => {
    if (mode === 'current') return runExport(filtered.length ? filtered : entries, 'view');
    if (mode === 'all') return runExport(entries, 'all');
    if (mode === 'range') {
      if (!from || !to) { toast.error('Pick a from and to date'); return; }
      const list = entries.filter((e) => e.dateKey >= from && e.dateKey <= to);
      return runExport(list, `${from}_to_${to}`);
    }
    // pick
    const list = entries.filter((e) => picked.has(e.dateKey));
    return runExport(list, 'selected');
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-white/80 hover:bg-white/10"
        title="Export PDF — pick days or range"
      >
        <Download size={12} /> Export PDF
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-white/10 bg-[#1f1a2b] p-3 text-xs text-white shadow-2xl">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-white/50">Export scope</div>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              ['current', `Current view (${filtered.length || entries.length})`],
              ['all', `All entries (${entries.length})`],
              ['range', 'Date range'],
              ['pick', 'Pick specific days'],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setMode(k)}
                className={`rounded-md px-2 py-1.5 text-left ${mode === k ? 'bg-[#c9a0dc] text-[#2a2438] font-medium' : 'bg-white/5 hover:bg-white/10'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'range' && (
            <div className="mt-3 flex items-center gap-2">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="flex-1 rounded-md bg-[#15111e] px-2 py-1.5 text-white outline-none ring-1 ring-white/10" />
              <span className="text-white/40">→</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 rounded-md bg-[#15111e] px-2 py-1.5 text-white outline-none ring-1 ring-white/10" />
            </div>
          )}

          {mode === 'pick' && (
            <div className="mt-3 max-h-48 overflow-auto rounded-md bg-[#15111e] p-2 ring-1 ring-white/10">
              {entries.length === 0 ? (
                <p className="text-white/40">No entries yet.</p>
              ) : entries.map((e) => {
                const checked = picked.has(e.dateKey);
                return (
                  <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = new Set(picked);
                        checked ? next.delete(e.dateKey) : next.add(e.dateKey);
                        setPicked(next);
                      }}
                    />
                    <span className="text-white/80">{format(new Date(e.date), 'EEE, MMM d, yyyy')}</span>
                    <span className="ml-auto truncate text-white/40">{e.title || e.content?.slice(0, 24) || '—'}</span>
                  </label>
                );
              })}
              {entries.length > 0 && (
                <div className="mt-2 flex gap-2 text-[11px]">
                  <button onClick={() => setPicked(new Set(entries.map((e) => e.dateKey)))} className="text-[#c9a0dc] hover:underline">Select all</button>
                  <button onClick={() => setPicked(new Set())} className="text-white/60 hover:underline">Clear</button>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-white/60 hover:bg-white/10">Cancel</button>
            <button
              onClick={handleConfirm}
              className="rounded-md bg-[#c9a0dc] px-3 py-1 font-medium text-[#2a2438] hover:bg-[#d4b3f0]"
            >
              Export PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── Calendar view ───────────── */

function JournalCalendar({
  entries,
  onPick,
}: { entries: JournalEntry[]; onPick: (d: Date) => void }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const byKey = useMemo(() => {
    const m = new Map<string, JournalEntry>();
    entries.forEach((e) => m.set(e.dateKey, e));
    return m;
  }, [entries]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const pad = (n: number) => String(n).padStart(2, '0');
  const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = keyOf(new Date());

  return (
    <div className="rounded-2xl border border-white/5 bg-[#1f1a2b]/60 p-5">
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="rounded-lg bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
        >
          ←
        </button>
        <h3 className="font-serif text-xl font-bold">{format(cursor, 'MMMM yyyy')}</h3>
        <button
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="rounded-lg bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
        >
          →
        </button>
      </div>
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] text-white/40">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="aspect-square rounded-lg" />;
          const k = keyOf(d);
          const e = byKey.get(k);
          const m = e ? moodMeta(e.mood) : null;
          const isToday = k === today;
          return (
            <button
              key={i}
              onClick={() => onPick(d)}
              className={`group relative aspect-square overflow-hidden rounded-lg border text-left text-[11px] transition ${
                e ? 'border-[#c9a0dc]/40 bg-[#15111e]' : 'border-white/5 bg-white/[0.02] hover:border-white/15'
              } ${isToday ? 'ring-1 ring-[#c9a0dc]' : ''}`}
              title={e?.title || e?.content?.slice(0, 60) || `Open ${k}`}
            >
              <PhotoBg mediaId={e?.photos?.[0]} />
              <div className="relative flex h-full flex-col p-1.5">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] ${isToday ? 'font-bold text-[#c9a0dc]' : 'text-white/60'}`}>
                    {d.getDate()}
                  </span>
                  {m && <span className="text-sm">{m.emoji}</span>}
                </div>
                {e && (
                  <span className="mt-auto truncate text-[10px] text-white/80">
                    {e.title || e.content || ' '}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-white/40">Click any day to open or create that entry.</p>
    </div>
  );
}

function PhotoBg({ mediaId }: { mediaId?: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!mediaId) return;
    let active = true;
    let created = '';
    loadMedia(mediaId).then((b) => {
      if (b && active) { created = URL.createObjectURL(b); setUrl(created); }
    });
    return () => { active = false; if (created) URL.revokeObjectURL(created); };
  }, [mediaId]);
  if (!url) return null;
  return (
    <div className="absolute inset-0 opacity-50">
      <img src={url} alt="" className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
    </div>
  );
}

/* ───────────── Mood dashboard ───────────── */

function MoodDashboard({
  entries,
  onFilter,
}: { entries: JournalEntry[]; onFilter: (m: Mood) => void }) {
  const moodScore: Record<Mood, number> = {
    amazing: 5, happy: 5, grateful: 5,
    good: 4, calm: 4,
    okay: 3,
    tired: 2, anxious: 2, low: 2,
    sad: 1, angry: 1, bad: 1,
  };

  const last7 = useMemo(() => {
    const arr: { key: string; date: Date; entry?: JournalEntry }[] = [];
    const map = new Map(entries.map((e) => [e.dateKey, e]));
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const pad = (n: number) => String(n).padStart(2, '0');
      const k = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
      arr.push({ key: k, date: d, entry: map.get(k) });
    }
    return arr;
  }, [entries]);

  const last30 = useMemo(() => {
    const arr: { key: string; date: Date; entry?: JournalEntry }[] = [];
    const map = new Map(entries.map((e) => [e.dateKey, e]));
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const pad = (n: number) => String(n).padStart(2, '0');
      const k = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
      arr.push({ key: k, date: d, entry: map.get(k) });
    }
    return arr;
  }, [entries]);

  const counts = useMemo(() => {
    const c: Record<Mood, number> = {
      amazing: 0, happy: 0, good: 0, calm: 0, grateful: 0,
      okay: 0, tired: 0, anxious: 0, low: 0, sad: 0, angry: 0, bad: 0,
    };
    entries.forEach((e) => { if (e.mood) c[e.mood]++; });
    return c;
  }, [entries]);

  // Streak: consecutive days from today backwards with a logged entry (any mood or content).
  const streak = useMemo(() => {
    const set = new Set(entries.filter((e) => e.mood || e.content).map((e) => e.dateKey));
    let s = 0;
    const d = new Date(); d.setHours(0,0,0,0);
    while (true) {
      const pad = (n: number) => String(n).padStart(2, '0');
      const k = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
      if (set.has(k)) { s++; d.setDate(d.getDate() - 1); } else break;
    }
    return s;
  }, [entries]);

  const avg7 = useMemo(() => {
    const vals = last7.map((x) => x.entry?.mood ? moodScore[x.entry.mood] : 0).filter((v) => v > 0);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
  }, [last7]);

  const max = 5;

  // Insights: compare this week vs prior week, find the most-changed mood,
  // and surface what's trending so users get a real, human takeaway.
  const insights = useMemo(() => {
    const scored = (arr: typeof last7) =>
      arr.map((x) => x.entry?.mood ? moodScore[x.entry.mood] : 0).filter((v) => v > 0);
    // last30 is oldest→newest, so the previous week is the 7 days right
    // before the most recent 7 (indices 16..22).
    const prevWeekSlice = last30.slice(16, 23);
    const thisWeek = scored(last7);
    const prevWeek = scored(prevWeekSlice);
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const aNow = avg(thisWeek);
    const aPrev = avg(prevWeek);
    // Only meaningful if both weeks have at least one logged mood.
    const delta = thisWeek.length && prevWeek.length ? aNow - aPrev : 0;

    // Most-changed mood (count this week vs prior week)
    const countMoods = (arr: typeof last7) => {
      const c = new Map<Mood, number>();
      arr.forEach((x) => { if (x.entry?.mood) c.set(x.entry.mood, (c.get(x.entry.mood) ?? 0) + 1); });
      return c;
    };
    const cNow = countMoods(last7);
    const cPrev = countMoods(prevWeekSlice);
    const keys = new Set<Mood>([...cNow.keys(), ...cPrev.keys()]);
    let topMood: Mood | null = null;
    let topAbs = 0;
    let topDelta = 0;
    keys.forEach((k) => {
      const d = (cNow.get(k) ?? 0) - (cPrev.get(k) ?? 0);
      if (Math.abs(d) > topAbs) { topAbs = Math.abs(d); topMood = k; topDelta = d; }
    });

    // Dominant mood this month
    let dominant: Mood | null = null;
    let domCount = 0;
    Object.entries(counts).forEach(([k, v]) => {
      if (v > domCount) { domCount = v; dominant = k as Mood; }
    });

    return { aNow, aPrev, delta, topMood, topDelta, dominant, domCount, loggedThisWeek: thisWeek.length };
  }, [last7, last30, counts]);

  const dirArrow = insights.delta > 0.3 ? '↑' : insights.delta < -0.3 ? '↓' : '→';
  const dirWord  = insights.delta > 0.3 ? 'lifted' : insights.delta < -0.3 ? 'dipped' : 'held steady';
  const topMeta  = insights.topMood ? moodMeta(insights.topMood) : null;
  const domMeta  = insights.dominant ? moodMeta(insights.dominant) : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon={<Sparkles size={18} className="text-[#c9a0dc]" />} value={streak} label="Day streak" />
        <StatCard icon={<Heart size={18} className="text-[#c9a0dc]" />} value={Number(avg7) || 0} label="7-day avg" />
        <StatCard icon={<BookOpen size={18} className="text-[#c9a0dc]" />} value={entries.filter((e) => e.mood).length} label="Moods logged" />
        <StatCard icon={<CalendarIcon size={18} className="text-[#c9a0dc]" />} value={last30.filter((x) => x.entry).length} label="30-day entries" />
      </div>

      {/* Insights */}
      <div className="rounded-2xl border border-[#c9a0dc]/20 bg-gradient-to-br from-[#1f1a2b]/80 to-[#2a2438]/80 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Brain size={16} className="text-[#c9a0dc]" />
          <h3 className="font-serif text-lg font-bold">Insights</h3>
        </div>
        {insights.loggedThisWeek === 0 ? (
          <p className="text-sm text-white/60">
            Log a few moods this week and insights will appear here — trends, changes, and what to watch.
          </p>
        ) : (
          <ul className="space-y-2 text-sm text-white/85">
            <li className="flex items-start gap-2">
              <span className="text-base">{dirArrow}</span>
              <span>
                {insights.aPrev > 0
                  ? <>Your mood <b>{dirWord}</b> vs last week ({insights.aPrev.toFixed(1)} → <b>{insights.aNow.toFixed(1)}</b> / 5).</>
                  : <>This week's average is <b>{insights.aNow.toFixed(1)} / 5</b>. Log next week to see a true comparison.</>
                }
              </span>
            </li>
            {topMeta && insights.topDelta !== 0 && (
              <li className="flex items-start gap-2">
                <span className="text-base">{topMeta.emoji}</span>
                <span>
                  Biggest change: <b>{topMeta.label}</b> {insights.topDelta > 0 ? 'went up' : 'went down'} by{' '}
                  <b>{Math.abs(insights.topDelta)}</b> day{Math.abs(insights.topDelta) === 1 ? '' : 's'}.
                </span>
              </li>
            )}
            {domMeta && (
              <li className="flex items-start gap-2">
                <span className="text-base">{domMeta.emoji}</span>
                <span>
                  Most common mood overall: <b>{domMeta.label}</b> ({insights.domCount} entries).
                </span>
              </li>
            )}
          </ul>
        )}
      </div>



      <div className="rounded-2xl border border-white/5 bg-[#1f1a2b]/60 p-5">
        <h3 className="mb-3 font-serif text-lg font-bold">Last 7 days · mood trend</h3>
        <div className="flex h-40 items-end gap-2">
          {last7.map((x) => {
            const score = x.entry?.mood ? moodScore[x.entry.mood] : 0;
            const h = (score / max) * 100;
            const m = x.entry?.mood ? moodMeta(x.entry.mood) : null;
            return (
              <button
                key={x.key}
                onClick={() => x.entry?.mood && onFilter(x.entry.mood)}
                className="group flex flex-1 flex-col items-center gap-1"
                title={x.entry?.mood ? `${x.entry.mood} · click to filter` : 'No entry'}
              >
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-md transition group-hover:opacity-80"
                    style={{
                      height: `${h}%`,
                      background: m?.color ?? 'rgba(255,255,255,0.08)',
                      minHeight: score ? 6 : 2,
                    }}
                  />
                </div>
                <div className="text-[10px] text-white/60">{format(x.date, 'EEE')}</div>
                <div className="text-xs">{m?.emoji ?? '·'}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 bg-[#1f1a2b]/60 p-5">
        <h3 className="mb-3 font-serif text-lg font-bold">Last 30 days</h3>
        <div className="flex h-24 items-end gap-1">
          {last30.map((x) => {
            const score = x.entry?.mood ? moodScore[x.entry.mood] : 0;
            const h = (score / max) * 100;
            const m = x.entry?.mood ? moodMeta(x.entry.mood) : null;
            return (
              <button
                key={x.key}
                onClick={() => x.entry?.mood && onFilter(x.entry.mood)}
                className="flex-1"
                title={`${x.key}${x.entry?.mood ? ' · ' + x.entry.mood : ''}`}
              >
                <div
                  className="w-full rounded-sm hover:opacity-80"
                  style={{
                    height: `${Math.max(h, 4)}%`,
                    background: m?.color ?? 'rgba(255,255,255,0.06)',
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 bg-[#1f1a2b]/60 p-5">
        <h3 className="mb-3 font-serif text-lg font-bold">Mood distribution · tap to filter</h3>
        <div className="space-y-2">
          {MOODS.map((m) => {
            const c = counts[m.value];
            const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
            const pct = Math.round((c / total) * 100);
            return (
              <button
                key={m.value}
                onClick={() => c > 0 && onFilter(m.value)}
                disabled={c === 0}
                className="flex w-full items-center gap-3 disabled:opacity-40"
              >
                <span className="w-24 text-left text-sm">
                  {m.emoji} {m.label}
                </span>
                <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full" style={{ width: `${pct}%`, background: m.color }} />
                </div>
                <span className="w-12 text-right text-xs text-white/60">{c}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
