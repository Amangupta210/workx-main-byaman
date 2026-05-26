import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { useUIStore } from '@/stores/uiStore';
import { Search, FileText, X } from 'lucide-react';

interface SearchResult {
  pageId: string;
  pageTitle: string;
  pageIcon: string;
  matchText: string;
  blockId?: string;
}

export default function SearchModal() {
  const { searchOpen, setSearchOpen, searchQuery, setSearchQuery } = useUIStore();
  const { pages, setActivePage, setFocusedBlock } = useEditorStore();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback((query: string) => {
    if (!query.trim()) {
      setResults(
        pages.map(p => ({
          pageId: p.id,
          pageTitle: p.title || 'Untitled',
          pageIcon: p.icon || '📄',
          matchText: `${p.blocks.length} blocks`,
        }))
      );
      return;
    }

    const q = query.toLowerCase();
    const found: SearchResult[] = [];

    for (const page of pages) {
      if (page.title.toLowerCase().includes(q)) {
        found.push({
          pageId: page.id,
          pageTitle: page.title || 'Untitled',
          pageIcon: page.icon || '📄',
          matchText: 'Title match',
        });
      }

      for (const block of page.blocks) {
        const plainText = block.content.replace(/<[^>]*>/g, '');
        if (plainText.toLowerCase().includes(q)) {
          const idx = plainText.toLowerCase().indexOf(q);
          const start = Math.max(0, idx - 30);
          const end   = Math.min(plainText.length, idx + query.length + 30);
          const snippet =
            (start > 0 ? '…' : '') +
            plainText.slice(start, end) +
            (end < plainText.length ? '…' : '');

          found.push({
            pageId: page.id,
            pageTitle: page.title || 'Untitled',
            pageIcon: page.icon || '📄',
            matchText: snippet,
            blockId: block.id,
          });
        }
      }
    }

    setResults(found);
  }, [pages]);

  useEffect(() => { search(searchQuery); setActiveIndex(0); }, [searchQuery, search]);

  // Arrow / Enter / Escape navigation while modal is open
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && results[activeIndex]) {
        e.preventDefault(); handleSelect(results[activeIndex]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen, results, activeIndex]);

  // BUG FIXED: Ctrl+K conflict.
  // The original handler fired on all keydown events unconditionally.  But
  // BlockComponent also listens for Ctrl+K on its contenteditable to add links.
  // When the user pressed Ctrl+K with text selected in a block, both handlers
  // fired: the link-add prompt appeared AND the search modal toggled.
  // Fix: only open search from Ctrl+K when the active element is NOT a
  // contenteditable or a plain text input (i.e., not inside the editor itself).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'k') return;
      const active = document.activeElement;
      const isEditing =
        active instanceof HTMLElement &&
        (active.isContentEditable ||
          active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA');
      if (isEditing) return; // let BlockComponent handle it
      e.preventDefault();
      setSearchOpen(!searchOpen);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen, setSearchOpen]);

  const handleSelect = (result: SearchResult) => {
    setActivePage(result.pageId);
    if (result.blockId) {
      setTimeout(() => setFocusedBlock(result.blockId!), 100);
    }
    setSearchOpen(false);
    setSearchQuery('');
  };

  if (!searchOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSearchOpen(false)} />
      <div className="relative w-full max-w-lg mx-4 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={18} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            placeholder="Search pages and content..."
          />
          <button
            onClick={() => setSearchOpen(false)}
            className="p-1 rounded hover:bg-secondary text-muted-foreground"
          >
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto py-1">
          {results.length === 0 && searchQuery && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">No results found</div>
          )}
          {results.map((result, i) => (
            <button
              key={`${result.pageId}-${result.blockId || 'title'}-${i}`}
              className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors duration-75 ${
                i === activeIndex ? 'bg-secondary' : 'hover:bg-secondary/60'
              }`}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="shrink-0 mt-0.5">{result.pageIcon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{result.pageTitle}</div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">{result.matchText}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer hints */}
        <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[11px] text-muted-foreground">
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}
