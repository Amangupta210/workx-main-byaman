import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Pin, PinOff, Trash2, Plus, Search, Archive, ArchiveRestore,
  Sparkles, X, Palette, Tag as TagIcon, Loader2, Home,
} from 'lucide-react';
import {
  listNotes, createNote, updateNote, deleteNote,
  type StickyNote, type NoteColor, NOTE_COLOR_STYLES,
} from '@/lib/notesDb';
import { askAI, summarizeNote, pingOllama, OllamaError } from '@/lib/ollama';
import OllamaStatusBadge from '@/components/ai/OllamaStatusBadge';
import { useToast } from '@/hooks/use-toast';

const COLORS: NoteColor[] = ['default', 'yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'teal', 'green', 'gray'];

export default function NotesPage() {
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<StickyNote | null>(null);
  const [composing, setComposing] = useState(false);
  const { toast } = useToast();

  const refresh = async () => setNotes(await listNotes());
  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes
      .filter((n) => n.archived === showArchived)
      .filter((n) => !q
        || n.title.toLowerCase().includes(q)
        || n.content.toLowerCase().includes(q)
        || n.tags.some((t) => t.toLowerCase().includes(q)));
  }, [notes, query, showArchived]);

  const pinned = filtered.filter((n) => n.pinned);
  const others = filtered.filter((n) => !n.pinned);

  const handleAIGenerate = async (prompt: string) => {
    const ok = await pingOllama();
    if (!ok) {
      toast({ title: 'AI offline', description: 'Start Ollama (`ollama serve`) to generate notes.' });
      return;
    }
    try {
      const text = await askAI(
        `Create a short, useful sticky note about: ${prompt}.\n\nReturn the note text only — no preamble.`,
      );
      await createNote({ title: prompt.slice(0, 60), content: text.trim() });
      await refresh();
      toast({ title: 'AI note created' });
    } catch (e) {
      toast({ title: 'AI failed', description: e instanceof OllamaError ? e.message : String(e), variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-secondary">
            <Home size={14} /> Home
          </Link>
          <h1 className="text-lg font-semibold">Sticky Notes</h1>
          <OllamaStatusBadge className="ml-1" />
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notes…"
                className="h-9 w-56 rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm hover:bg-accent"
              title={showArchived ? 'Show active' : 'Show archived'}
            >
              {showArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              {showArchived ? 'Archived' : 'Active'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {!showArchived && (
          <Composer
            open={composing}
            setOpen={setComposing}
            onCreate={async (n) => { await createNote(n); await refresh(); }}
            onAIGenerate={handleAIGenerate}
          />
        )}

        {pinned.length > 0 && (
          <Section title="Pinned" notes={pinned} onOpen={setEditing} onChange={refresh} />
        )}
        <Section
          title={pinned.length > 0 ? 'Others' : showArchived ? 'Archived' : 'Notes'}
          notes={others}
          onOpen={setEditing}
          onChange={refresh}
          empty={
            filtered.length === 0
              ? showArchived ? 'No archived notes yet.' : 'Capture your first thought above.'
              : undefined
          }
        />
      </main>

      {editing && (
        <EditModal
          note={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { await refresh(); setEditing(null); }}
        />
      )}
    </div>
  );
}

function Section({
  title, notes, onOpen, onChange, empty,
}: {
  title: string;
  notes: StickyNote[];
  onOpen: (n: StickyNote) => void;
  onChange: () => void | Promise<void>;
  empty?: string;
}) {
  if (notes.length === 0 && !empty) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {notes.map((n) => (
            <NoteCard key={n.id} note={n} onOpen={() => onOpen(n)} onChange={onChange} />
          ))}
        </div>
      )}
    </section>
  );
}

function NoteCard({
  note, onOpen, onChange,
}: { note: StickyNote; onOpen: () => void; onChange: () => void | Promise<void> }) {
  const style = NOTE_COLOR_STYLES[note.color];
  const togglePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await updateNote(note.id!, { pinned: !note.pinned });
    await onChange();
  };
  const toggleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await updateNote(note.id!, { archived: !note.archived, pinned: false });
    await onChange();
  };
  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this note?')) return;
    await deleteNote(note.id!);
    await onChange();
  };

  return (
    <div
      onClick={onOpen}
      className={`group relative cursor-pointer rounded-xl ${style.bg} p-4 ring-1 ${style.ring} transition-shadow hover:shadow-md`}
    >
      <button
        onClick={togglePin}
        title={note.pinned ? 'Unpin' : 'Pin'}
        className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-background/60 hover:text-foreground group-hover:opacity-100"
      >
        {note.pinned ? <PinOff size={14} /> : <Pin size={14} />}
      </button>
      {note.title && <h3 className="mb-1 pr-7 text-sm font-semibold leading-snug">{note.title}</h3>}
      {note.content && (
        <p className="whitespace-pre-wrap break-words text-sm leading-snug text-foreground/90 line-clamp-[12]">
          {note.content}
        </p>
      )}
      {note.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {note.tags.map((t) => (
            <span key={t} className="rounded-full bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground">
              #{t}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={toggleArchive} title={note.archived ? 'Restore' : 'Archive'} className="rounded p-1 hover:bg-background/60">
            {note.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
          </button>
          <button onClick={remove} title="Delete" className="rounded p-1 text-destructive hover:bg-destructive/10">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Composer({
  open, setOpen, onCreate, onAIGenerate,
}: {
  open: boolean;
  setOpen: (b: boolean) => void;
  onCreate: (n: Partial<StickyNote>) => Promise<void>;
  onAIGenerate: (prompt: string) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [color, setColor] = useState<NoteColor>('default');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const reset = () => { setTitle(''); setContent(''); setColor('default'); setAiPrompt(''); setOpen(false); };

  const submit = async () => {
    if (!title.trim() && !content.trim()) { reset(); return; }
    await onCreate({ title: title.trim(), content: content.trim(), color });
    reset();
  };

  const runAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    try { await onAIGenerate(aiPrompt.trim()); setAiPrompt(''); }
    finally { setAiBusy(false); }
  };

  const style = NOTE_COLOR_STYLES[color];

  return (
    <div className={`mx-auto mb-6 max-w-2xl rounded-xl ${style.bg} ring-1 ${style.ring} transition-all`}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-muted-foreground"
        >
          <Plus size={16} /> Take a note…
        </button>
      ) : (
        <div className="p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full bg-transparent px-1 py-1 text-sm font-semibold outline-none placeholder:text-muted-foreground"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Take a note…"
            rows={3}
            className="mt-1 w-full resize-none bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground"
          />

          <div className="mt-3 rounded-lg bg-background/50 p-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Sparkles size={12} /> Generate with AI
            </div>
            <div className="flex gap-2">
              <input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runAI(); }}
                placeholder='e.g. "Packing list for 3-day trip"'
                className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={runAI}
                disabled={aiBusy || !aiPrompt.trim()}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50"
              >
                {aiBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                Generate
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <ColorPicker color={color} onChange={setColor} />
            <div className="flex items-center gap-2">
              <button onClick={reset} className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary">
                Cancel
              </button>
              <button onClick={submit} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ColorPicker({ color, onChange }: { color: NoteColor; onChange: (c: NoteColor) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <Palette size={12} className="text-muted-foreground" />
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          title={c}
          className={`h-5 w-5 rounded-full ring-1 transition-transform hover:scale-110 ${NOTE_COLOR_STYLES[c].chip} ${
            color === c ? 'ring-2 ring-foreground' : 'ring-border'
          }`}
        />
      ))}
    </div>
  );
}

function EditModal({
  note, onClose, onSaved,
}: { note: StickyNote; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [color, setColor] = useState<NoteColor>(note.color);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(note.tags);
  const [aiBusy, setAiBusy] = useState<null | 'summarize' | 'expand' | 'improve'>(null);
  const { toast } = useToast();

  const save = async () => {
    await updateNote(note.id!, { title: title.trim(), content, color, tags });
    await onSaved();
  };

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (!t) return;
    if (!tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const runAI = async (kind: 'summarize' | 'expand' | 'improve') => {
    if (!content.trim()) { toast({ title: 'Nothing to process', description: 'Write something first.' }); return; }
    const ok = await pingOllama();
    if (!ok) { toast({ title: 'AI offline', description: 'Start Ollama to use AI actions.' }); return; }
    setAiBusy(kind);
    try {
      let out = '';
      if (kind === 'summarize') out = await summarizeNote(content);
      else if (kind === 'expand') out = await askAI(`Expand this note with more detail and structure. Keep voice. Output the new note only:\n\n${content}`);
      else out = await askAI(`Improve clarity, grammar, and structure of this note. Output the rewritten note only:\n\n${content}`);
      setContent(out.trim());
    } catch (e) {
      toast({ title: 'AI failed', description: e instanceof OllamaError ? e.message : String(e), variant: 'destructive' });
    } finally { setAiBusy(null); }
  };

  const style = NOTE_COLOR_STYLES[color];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-2xl rounded-2xl ${style.bg} p-5 ring-1 ${style.ring} shadow-xl`}
      >
        <button onClick={onClose} className="absolute right-3 top-3 rounded-md p-1.5 hover:bg-background/60">
          <X size={16} />
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Take a note…"
          rows={10}
          className="mt-2 w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <TagIcon size={12} className="text-muted-foreground" />
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-background/60 px-2 py-0.5 text-[11px]">
              #{t}
              <button onClick={() => setTags(tags.filter((x) => x !== t))} className="text-muted-foreground hover:text-foreground">
                <X size={10} />
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            placeholder="Add tag"
            className="h-6 w-24 rounded-md bg-background/60 px-2 text-[11px] outline-none"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          <span className="text-[11px] font-medium text-muted-foreground">AI:</span>
          {(['summarize', 'improve', 'expand'] as const).map((k) => (
            <button
              key={k}
              onClick={() => runAI(k)}
              disabled={aiBusy !== null}
              className="inline-flex items-center gap-1 rounded-md bg-background/60 px-2.5 py-1 text-[11px] hover:bg-background disabled:opacity-50"
            >
              {aiBusy === k ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <ColorPicker color={color} onChange={setColor} />
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-background/60">
              Cancel
            </button>
            <button onClick={save} className="rounded-md bg-primary px-4 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
