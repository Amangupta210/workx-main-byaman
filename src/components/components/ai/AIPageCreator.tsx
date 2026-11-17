import React, { useState } from 'react';
import { Wand2, X, Loader2 } from 'lucide-react';
import { useAIStore } from '@/stores/aiStore';
import { useEditorStore } from '@/stores/editorStore';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional parent page id; when set, the new page is nested under it. */
  defaultParentId?: string | null;
}

export default function AIPageCreator({ open, onClose, defaultParentId = null }: Props) {
  const [topic, setTopic] = useState('');
  const [nestUnderActive, setNestUnderActive] = useState(defaultParentId !== null);
  const { createPageFromAI, loading } = useAIStore();
  const activePage = useEditorStore(s => s.activePage());

  if (!open) return null;

  const submit = async () => {
    const t = topic.trim();
    if (!t || loading) return;
    const parentId =
      defaultParentId !== null
        ? defaultParentId
        : nestUnderActive && activePage
        ? activePage.id
        : null;
    onClose();
    setTopic('');
    await createPageFromAI(t, parentId);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Wand2 size={15} className="text-primary" /> Create page with AI
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-secondary"
          >
            <X size={15} />
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          What's the page about?
        </label>
        <textarea
          autoFocus
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={3}
          placeholder="e.g. Q4 marketing roadmap, weekly meal plan, study notes on RNNs…"
          className="w-full resize-none rounded-md border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />

        {activePage && defaultParentId === null && (
          <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={nestUnderActive}
              onChange={(e) => setNestUnderActive(e.target.checked)}
            />
            Nest under "{activePage.title || 'Untitled'}"
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!topic.trim() || loading}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
            Generate
          </button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          The new page is saved to IndexedDB and added to your sidebar.
        </p>
      </div>
    </div>
  );
}
