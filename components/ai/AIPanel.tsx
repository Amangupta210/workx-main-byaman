import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Sparkles,
  X,
  Send,
  Trash2,
  Loader2,
  ListChecks,
  Settings as SettingsIcon,
  FileText,
  History,
  Square,
  Copy,
  Check,
  Undo2,
  Brain,
  Wand2,
} from 'lucide-react';
import { useAIStore } from '@/stores/aiStore';
import { useUIStore } from '@/stores/uiStore';
import { useEditorStore } from '@/stores/editorStore';
import {
  aiDb,
  getOllamaSettings,
  setOllamaSettings,
  DEFAULT_OLLAMA_URL,
  DEFAULT_OLLAMA_MODEL,
} from '@/lib/aiDb';

function blocksToText(blocks: { type: string; content: string }[]) {
  return blocks
    .filter((b) => b.type !== 'divider')
    .map((b) => b.content)
    .filter(Boolean)
    .join('\n');
}

type Tab = 'chat' | 'history';

export default function AIPanel() {
  const open = useUIStore((s) => s.aiPanelOpen);
  const setOpen = useUIStore((s) => s.setAIPanelOpen);
  const {
    messages,
    loading,
    askPrompt,
    clearChat,
    loadForPage,
    pendingTasks,
    setPendingTasks,
    reSaveTasks,
    undoLastTaskInsert,
    stop,
    workspaceMemory,
    setWorkspaceMemory,
    organizeWorkspace,
    createRichTasksFromActivePage,
  } = useAIStore();

  const activePage = useEditorStore((s) => s.activePage());
  const activePageId = activePage?.id ?? null;

  const [input, setInput] = useState('');
  const [tab, setTab] = useState<Tab>('chat');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reload chat whenever the active page changes.
  useEffect(() => {
    loadForPage(activePageId);
  }, [activePageId, loadForPage]);

  // Auto-scroll on new content.
  useEffect(() => {
    if (!open || tab !== 'chat') return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, [messages, open, tab]);

  // Filtered history for the active page.
  const summaries = useLiveQuery(
    () =>
      activePageId
        ? aiDb.summaries.where('pageId').equals(activePageId).reverse().sortBy('createdAt')
        : Promise.resolve([]),
    [activePageId],
  );
  const taskBatches = useLiveQuery(
    () =>
      activePageId
        ? aiDb.generatedTasks.where('pageId').equals(activePageId).reverse().sortBy('createdAt')
        : Promise.resolve([]),
    [activePageId],
  );

  // Live settings for header subtitle.
  const settingsRec = useLiveQuery(() => aiDb.settings.get('ollama'), []);
  const headerSubtitle = useMemo(() => {
    const model = settingsRec?.model || DEFAULT_OLLAMA_MODEL;
    const url = settingsRec?.baseUrl || DEFAULT_OLLAMA_URL;
    return `Local · ${model} · ${url.replace(/^https?:\/\//, '')}`;
  }, [settingsRec]);

  const handleSend = async () => {
    const v = input.trim();
    if (!v || loading) return;
    setInput('');
    await askPrompt(v);
  };

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-30 bg-black/30 transition-opacity md:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        className={`fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight">AI Assistant</div>
              <div className="truncate text-xs text-muted-foreground">{headerSubtitle}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary"
              title="AI settings"
            >
              <SettingsIcon size={15} />
            </button>
            <button
              onClick={clearChat}
              disabled={loading || messages.length === 0}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
              title="Clear chat for this page"
            >
              <Trash2 size={15} />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border bg-card">
          <TabButton active={tab === 'chat'} onClick={() => setTab('chat')} icon={<Sparkles size={13} />}>
            Chat
          </TabButton>
          <TabButton
            active={tab === 'history'}
            onClick={() => setTab('history')}
            icon={<History size={13} />}
          >
            History
            {(summaries?.length ?? 0) + (taskBatches?.length ?? 0) > 0 && (
              <span className="ml-1 rounded-full bg-primary/15 px-1.5 text-[10px] text-primary">
                {(summaries?.length ?? 0) + (taskBatches?.length ?? 0)}
              </span>
            )}
          </TabButton>
        </div>

        {/* Body */}
        {tab === 'chat' ? (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
                  <Sparkles size={28} className="mb-3 text-primary/60" />
                  <p className="font-medium text-foreground">
                    {activePage ? `Chat about "${activePage.title || 'Untitled'}"` : 'Ask anything'}
                  </p>
                  <p className="mt-1 max-w-[15rem] text-xs">
                    Each page has its own conversation, summaries, and generated tasks.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m, i) => (
                    <MessageBubble key={m.id ?? i} role={m.role} content={m.content} />
                  ))}
                  {loading && (
                    <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                      <Loader2 size={12} className="animate-spin" />
                      Thinking…
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pending tasks bar */}
            {pendingTasks && activePageId === pendingTasks.pageId && (
              <div className="border-t border-border bg-secondary/40 px-4 py-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium">
                  <ListChecks size={14} className="text-primary" />
                  {pendingTasks.alreadySaved
                    ? `Added ${pendingTasks.tasks.length} task${pendingTasks.tasks.length === 1 ? '' : 's'} to this page`
                    : `${pendingTasks.tasks.length} task${pendingTasks.tasks.length === 1 ? '' : 's'} ready`}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={reSaveTasks}
                    className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    {pendingTasks.alreadySaved ? 'Save again' : `Save to "${pendingTasks.pageTitle}"`}
                  </button>
                  {pendingTasks.alreadySaved && pendingTasks.blockIds.length > 0 && (
                    <button
                      onClick={undoLastTaskInsert}
                      className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
                      title="Remove the tasks just added"
                    >
                      <Undo2 size={12} /> Undo
                    </button>
                  )}
                  <button
                    onClick={() => setPendingTasks(null)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Input */}
            <div className="border-t border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  onClick={() => setWorkspaceMemory(!workspaceMemory)}
                  className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                    workspaceMemory
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-secondary'
                  }`}
                  title="When on, the AI can read all your pages, tasks, and voice notes from IndexedDB."
                >
                  <Brain size={11} />
                  Workspace memory {workspaceMemory ? 'on' : 'off'}
                </button>
                {!workspaceMemory && activePage && (
                  <span className="text-[10px] text-muted-foreground">
                    Using current page as context
                  </span>
                )}
              </div>
              <PromptPresets
                disabled={loading}
                onPick={(p) => {
                  setInput((v) => (v ? `${v}\n${p}` : p));
                }}
                onAction={(name) => {
                  if (name === 'organize') organizeWorkspace();
                  else if (name === 'richTasks') createRichTasksFromActivePage();
                }}
              />
              <div className="flex items-end gap-2 rounded-lg border border-border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-primary/30">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={1}
                  placeholder="Ask AI anything… (Shift+Enter for newline)"
                  className="max-h-40 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
                />
                <button
                  onClick={handleSend}
                  onClickCapture={(e) => {
                    if (loading) {
                      e.preventDefault();
                      e.stopPropagation();
                      stop();
                    }
                  }}
                  disabled={!loading && !input.trim()}
                  className={`flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-40 ${
                    loading
                      ? 'bg-destructive text-destructive-foreground'
                      : 'bg-primary text-primary-foreground'
                  }`}
                  title={loading ? 'Stop generating' : 'Ask AI'}
                >
                  {loading ? <Square size={12} fill="currentColor" /> : <Send size={12} />}
                  {loading ? 'Stop' : 'Ask AI'}
                </button>
              </div>
              {activePage && (
                <QuickActions
                  pageId={activePage.id}
                  pageTitle={activePage.title || 'Untitled'}
                  content={blocksToText(activePage.blocks)}
                />
              )}
            </div>
          </>
        ) : (
          <HistoryView
            pageTitle={activePage?.title || 'this page'}
            summaries={summaries ?? []}
            taskBatches={taskBatches ?? []}
          />
        )}
      </aside>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? 'border-b-2 border-primary text-foreground'
          : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function MessageBubble({ role, content }: { role: string; content: string }) {
  const isUser = role === 'user';
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
          {content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] whitespace-pre-wrap text-sm text-foreground">
        {content || <span className="text-muted-foreground">…</span>}
      </div>
    </div>
  );
}

function QuickActions({
  pageId,
  pageTitle,
  content,
}: {
  pageId: string;
  pageTitle: string;
  content: string;
}) {
  const { summarizePage, generateTasksForPage, askPrompt, loading } = useAIStore();
  const disabled = loading || !content.trim();
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button
        onClick={() => summarizePage(pageId, pageTitle, content)}
        disabled={disabled}
        className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
      >
        ✨ Summarize note
      </button>
      <button
        onClick={() => generateTasksForPage(pageId, pageTitle, content)}
        disabled={disabled}
        className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
      >
        ✅ Generate tasks
      </button>
      <button
        onClick={() => askPrompt('Improve the writing of this page. Keep the meaning, fix grammar, and tighten phrasing.')}
        disabled={disabled}
        className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
      >
        ✍️ Improve writing
      </button>
      <button
        onClick={() => askPrompt('Explain this page in simple terms.')}
        disabled={disabled}
        className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
      >
        💡 Explain page
      </button>
    </div>
  );
}

type PresetActionName = 'organize' | 'richTasks';
type Preset =
  | { label: string; prompt: string }
  | { label: string; action: PresetActionName };

const PRESETS: Preset[] = [
  { label: '🗂 Organize workspace', action: 'organize' },
  { label: '📅 Schedule tasks', action: 'richTasks' },
  { label: '✅ Create tasks', prompt: 'Create a checklist of actionable tasks based on this page.' },
  { label: '✨ Summarize', prompt: 'Summarize this page in 5 bullet points.' },
  { label: '✍️ Improve writing', prompt: 'Improve the writing of this page. Keep the meaning, fix grammar, and tighten phrasing.' },
  { label: '🧠 Restructure page', prompt: 'Reorganize this page into clear sections with headings and bullets.' },
  { label: '🏷 Generate title', prompt: 'Suggest 5 concise titles for this page.' },
  { label: '📅 Today', prompt: 'Looking at my workspace, what tasks should I focus on today?' },
  { label: '🔎 Find meetings', prompt: 'Which of my pages mention "meeting"? List them with one-line summaries.' },
  { label: '📈 This week', prompt: 'Summarize what I worked on this week using my pages and voice notes.' },
];

function PromptPresets({
  disabled,
  onPick,
  onAction,
}: {
  disabled: boolean;
  onPick: (p: string) => void;
  onAction: (a: PresetActionName) => void;
}) {
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {PRESETS.map((p) => {
        const isAction = 'action' in p;
        return (
          <button
            key={p.label}
            disabled={disabled}
            onClick={() => (isAction ? onAction(p.action) : onPick(p.prompt))}
            className={`rounded-full border px-2 py-0.5 text-[10.5px] transition-colors disabled:opacity-40 ${
              isAction
                ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                : 'border-border bg-background text-muted-foreground hover:bg-secondary'
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function HistoryView({
  pageTitle,
  summaries,
  taskBatches,
}: {
  pageTitle: string;
  summaries: { id?: number; summary: string; createdAt: number }[];
  taskBatches: { id?: number; tasks: string[]; createdAt: number }[];
}) {
  const empty = summaries.length === 0 && taskBatches.length === 0;
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {empty ? (
        <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
          <History size={26} className="mb-3 text-primary/50" />
          <p className="font-medium text-foreground">No AI history yet</p>
          <p className="mt-1 max-w-[15rem] text-xs">
            Summaries and generated task lists for "{pageTitle}" will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {summaries.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <FileText size={12} /> Summaries
              </h3>
              <div className="space-y-2">
                {summaries.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-md border border-border bg-background p-3 text-xs"
                  >
                    <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                      <span>{new Date(s.createdAt).toLocaleString()}</span>
                      <CopyButton text={s.summary} label="Copy summary" />
                    </div>
                    <div className="whitespace-pre-wrap text-foreground">{s.summary}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {taskBatches.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <ListChecks size={12} /> Generated tasks
              </h3>
              <div className="space-y-2">
                {taskBatches.map((b) => (
                  <div
                    key={b.id}
                    className="rounded-md border border-border bg-background p-3 text-xs"
                  >
                    <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                      <span>
                        {new Date(b.createdAt).toLocaleString()} · {b.tasks.length} task
                        {b.tasks.length === 1 ? '' : 's'}
                      </span>
                      <CopyButton
                        text={b.tasks.map((t) => `- [ ] ${t}`).join('\n')}
                        label="Copy task list"
                      />
                    </div>
                    <ul className="space-y-1">
                      {b.tasks.map((t, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-foreground">
                          <span className="mt-0.5 text-muted-foreground">☐</span>
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <button
      onClick={onCopy}
      title={label}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 normal-case tracking-normal text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
    >
      {copied ? <Check size={11} className="text-primary" /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getOllamaSettings().then((s) => {
      setBaseUrl(s.baseUrl);
      setModel(s.model);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await setOllamaSettings(baseUrl, model);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    setBaseUrl(DEFAULT_OLLAMA_URL);
    setModel(DEFAULT_OLLAMA_MODEL);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">AI settings</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-secondary"
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Ollama endpoint URL
            </label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={DEFAULT_OLLAMA_URL}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Default: {DEFAULT_OLLAMA_URL}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Model
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={DEFAULT_OLLAMA_MODEL}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Any locally pulled model (e.g. <code>llama3.2</code>, <code>mistral:latest</code>).
            </p>
          </div>

          <div className="rounded-md border border-border bg-secondary/40 p-3 text-[11px] text-muted-foreground">
            If browser requests fail with “Failed to fetch”, run Ollama with{' '}
            <code className="rounded bg-background px-1">OLLAMA_ORIGINS=*</code> so it accepts
            cross-origin browser calls.
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            onClick={resetDefaults}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Reset to defaults
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}