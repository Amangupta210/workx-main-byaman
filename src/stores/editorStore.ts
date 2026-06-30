import { create } from 'zustand';
import { type Block, type Page, createBlock, createPage, type BlockType } from '@/types/editor';
import { savePageToDB, loadAllPages, deletePageFromDB } from '@/lib/db';

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

interface EditorState {
  pages: Page[];
  activePageId: string | null;
  focusedBlockId: string | null;
  favorites: string[];
  /** Block IDs recently inserted by AI; UI uses this to flash a highlight. */
  recentBlockIds: string[];

  activePage: () => Page | undefined;

  initialize: () => Promise<void>;
  addPage: (parentId?: string | null) => string;
  addPageWithBlocks: (
    title: string,
    blocks: { type: string; content: string }[],
    parentId?: string | null,
    icon?: string,
  ) => string;
  deletePage: (id: string) => void;
  setActivePage: (id: string) => void;
  updatePageTitle: (id: string, title: string) => void;
  updatePageIcon: (id: string, icon: string) => void;
  updatePageCover: (id: string, coverImage: string) => void;
  toggleFavorite: (id: string) => void;

  addBlock: (afterId?: string, type?: BlockType, content?: string) => string;
  updateBlock: (blockId: string, updates: Partial<Block>) => void;
  deleteBlock: (blockId: string) => void;
  moveBlock: (fromIndex: number, toIndex: number) => void;
  setFocusedBlock: (blockId: string | null) => void;
  changeBlockType: (blockId: string, newType: BlockType) => void;
  /** Remove multiple blocks from a specific page (used by AI Undo). */
  removeBlocks: (pageId: string, ids: string[]) => void;
  /** Mark blocks as recently added so they animate/highlight briefly. */
  markRecentBlocks: (ids: string[]) => void;
}

function debouncedSave(page: Page) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => { savePageToDB(page); }, 500);
}

function loadFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem('workx-favorites') || '[]'); }
  catch { return []; }
}

function saveFavorites(favs: string[]) {
  localStorage.setItem('workx-favorites', JSON.stringify(favs));
}

function updatePage(
  state: { pages: Page[] },
  pageId: string,
  updater: (p: Page) => Page,
) {
  const newPages = state.pages.map(p =>
    p.id === pageId ? updater({ ...p, updatedAt: Date.now() }) : p
  );
  const updated = newPages.find(p => p.id === pageId);
  if (updated) debouncedSave(updated);
  return { pages: newPages };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  pages: [],
  activePageId: null,
  focusedBlockId: null,
  favorites: loadFavorites(),
  recentBlockIds: [],

  activePage: () => {
    const { pages, activePageId } = get();
    return pages.find(p => p.id === activePageId);
  },

  initialize: async () => {
    const rawPages = await loadAllPages();
    // BUG FIXED: IndexedDB returns pages in insertion order which is not
    // guaranteed after migrations or partial writes.  Sort by createdAt so the
    // page list is stable across reloads.
    const pages = rawPages.slice().sort((a, b) => a.createdAt - b.createdAt);

    if (pages.length === 0) {
      const defaultPage = createPage('Welcome to WorkX');
      defaultPage.icon = '👋';
      defaultPage.blocks = [
        createBlock('heading1', 'Welcome to WorkX'),
        createBlock('text', 'Your all-in-one offline-first workspace for notes, tasks, journaling, voice notes, and local AI assistance.'),
        createBlock('divider'),
        createBlock('heading2', '🚀 Getting started'),
        createBlock('todo', 'Type "/" to open the slash command menu and insert blocks'),
        createBlock('todo', 'Press Enter to create a new block, drag to reorder'),
        createBlock('todo', 'Click the ✨ icon in the top bar to open the AI panel'),
        createBlock('todo', 'Click the 🎙️ mic icon to dictate a voice note'),
        createBlock('todo', 'Click the 🪄 wand icon to ask AI to create a new page'),
        createBlock('heading2', '🧱 Block types'),
        createBlock('text', 'Headings, text, todo, code, image, video, audio, table, divider — all available from the slash menu.'),
        createBlock('heading2', '⌨️ Keyboard shortcuts'),
        createBlock('text', '⌘K — search · ⌘/ — slash menu · Shift+Enter — newline in chat · Enter — send'),
        createBlock('heading2', '🤖 AI usage guide'),
        createBlock('text', 'WorkX talks to a local Ollama server (default mistral:latest at http://localhost:11434). Toggle "Workspace memory" in the AI panel so the AI can read all your pages, tasks and voice transcripts to answer questions like "what are my tasks today?" or "find birthday notes".'),
        createBlock('heading2', '🎙️ Voice notes'),
        createBlock('text', 'Press the mic button to dictate. Transcripts are stored locally in IndexedDB and can be inserted into any note, summarized, or converted into tasks.'),
        createBlock('heading2', '📅 Calendar & reminders'),
        createBlock('text', 'Add todos with due dates inline — they show up in this workspace and can be tracked by AI.'),
        createBlock('divider'),
        createBlock('heading3', '👤 About'),
        createBlock('text', 'WorkX was created by Aman Gupta (https://www.instagram.com/gupta_aman_1516) and Saurab Negi (https://www.instagram.com/_.s.aura.b._/).'),
      ];
      await savePageToDB(defaultPage);
      set({ pages: [defaultPage], activePageId: defaultPage.id });
    } else {
      set({ pages, activePageId: pages[0].id });
    }
  },

  addPage: (parentId) => {
    const page = createPage('Untitled', parentId);
    set(state => {
      savePageToDB(page);
      return { pages: [...state.pages, page], activePageId: page.id };
    });
    return page.id;
  },

  addPageWithBlocks: (title, aiBlocks, parentId, icon) => {
    const allowed = new Set<BlockType>(['heading1', 'heading2', 'heading3', 'text', 'todo']);
    const blocks: Block[] = aiBlocks
      .filter(b => allowed.has(b.type as BlockType) && b.content?.trim())
      .map(b => createBlock(b.type as BlockType, b.content));
    const page = createPage(title || 'Untitled', parentId);
    page.icon = icon || page.icon;
    if (blocks.length) page.blocks = blocks;
    set(state => {
      savePageToDB(page);
      return { pages: [...state.pages, page], activePageId: page.id };
    });
    return page.id;
  },

  deletePage: (id) => {
    set(state => {
      const idsToDelete = new Set<string>([id]);
      const findChildren = (parentId: string) => {
        state.pages
          .filter(p => p.parentId === parentId)
          .forEach(child => { idsToDelete.add(child.id); findChildren(child.id); });
      };
      findChildren(id);
      idsToDelete.forEach(pid => deletePageFromDB(pid));
      const newPages = state.pages.filter(p => !idsToDelete.has(p.id));
      const newFavs  = state.favorites.filter(f => !idsToDelete.has(f));
      saveFavorites(newFavs);
      const newActive = idsToDelete.has(state.activePageId || '')
        ? (newPages[0]?.id ?? null)
        : state.activePageId;
      return { pages: newPages, activePageId: newActive, favorites: newFavs };
    });
  },

  setActivePage: (id) => set({ activePageId: id, focusedBlockId: null }),

  updatePageTitle: (id, title) =>
    set(state => updatePage(state, id, p => ({ ...p, title }))),
  updatePageIcon: (id, icon) =>
    set(state => updatePage(state, id, p => ({ ...p, icon }))),
  updatePageCover: (id, coverImage) =>
    set(state => updatePage(state, id, p => ({ ...p, coverImage }))),

  toggleFavorite: (id) => {
    set(state => {
      const newFavs = state.favorites.includes(id)
        ? state.favorites.filter(f => f !== id)
        : [...state.favorites, id];
      saveFavorites(newFavs);
      return { favorites: newFavs };
    });
  },

  addBlock: (afterId, type = 'text', content = '') => {
    const block = createBlock(type, content);
    set(state => {
      const page = state.pages.find(p => p.id === state.activePageId);
      if (!page) return state;
      const blocks = [...page.blocks];
      if (afterId) {
        const idx = blocks.findIndex(b => b.id === afterId);
        // BUG FIXED: when afterId was provided but not found (idx === -1),
        // splice(-1 + 1 = 0, …) inserted the block at the beginning instead of
        // the end.  Now fall back to appending when the anchor isn't found.
        if (idx !== -1) {
          blocks.splice(idx + 1, 0, block);
        } else {
          blocks.push(block);
        }
      } else {
        blocks.push(block);
      }
      const result = updatePage(state, state.activePageId!, p => ({ ...p, blocks }));
      return { ...result, focusedBlockId: block.id };
    });
    return block.id;
  },

  updateBlock: (blockId, updates) => {
    set(state => {
      const page = state.pages.find(p => p.id === state.activePageId);
      if (!page) return state;
      const blocks = page.blocks.map(b => b.id === blockId ? { ...b, ...updates } : b);
      return updatePage(state, state.activePageId!, p => ({ ...p, blocks }));
    });
  },

  deleteBlock: (blockId) => {
    set(state => {
      const page = state.pages.find(p => p.id === state.activePageId);
      if (!page) return state;

      // BUG FIXED: when the page had exactly one block, deleteBlock silently
      // returned early with no feedback.  Pressing Backspace on the only empty
      // block appeared completely broken — nothing happened, no visual cue.
      // Fix: if it's the last block, clear its content instead of deleting it,
      // so the page always has at least one editable block.
      if (page.blocks.length <= 1) {
        const [only] = page.blocks;
        if (only.id !== blockId) return state;
        const blocks = [{ ...only, content: '', type: 'text' as BlockType, checked: false }];
        return updatePage(state, state.activePageId!, p => ({ ...p, blocks }));
      }

      const idx = page.blocks.findIndex(b => b.id === blockId);
      const blocks = page.blocks.filter(b => b.id !== blockId);
      const focusId = blocks[Math.max(0, idx - 1)]?.id ?? null;
      const result = updatePage(state, state.activePageId!, p => ({ ...p, blocks }));
      return { ...result, focusedBlockId: focusId };
    });
  },

  moveBlock: (fromIndex, toIndex) => {
    set(state => {
      const page = state.pages.find(p => p.id === state.activePageId);
      if (!page) return state;
      const blocks = [...page.blocks];
      const [moved] = blocks.splice(fromIndex, 1);
      blocks.splice(toIndex, 0, moved);
      return updatePage(state, state.activePageId!, p => ({ ...p, blocks }));
    });
  },

  setFocusedBlock: (blockId) => set({ focusedBlockId: blockId }),

  changeBlockType: (blockId, newType) => {
    set(state => {
      const page = state.pages.find(p => p.id === state.activePageId);
      if (!page) return state;
      const blocks = page.blocks.map(b =>
        b.id === blockId
          ? {
              ...b,
              type: newType,
              content: newType === 'divider' ? '' : b.content,
              checked: newType === 'todo' ? false : undefined,
              tableData:
                newType === 'table'
                  ? (b.tableData || {
                      headers: ['Column 1', 'Column 2', 'Column 3'],
                      rows: [['', '', ''], ['', '', '']],
                    })
                  : undefined,
            }
          : b
      );
      return updatePage(state, state.activePageId!, p => ({ ...p, blocks }));
    });
  },

  removeBlocks: (pageId, ids) => {
    if (!ids.length) return;
    set(state => {
      const page = state.pages.find(p => p.id === pageId);
      if (!page) return state;
      const idSet = new Set(ids);
      let blocks = page.blocks.filter(b => !idSet.has(b.id));
      // Preserve the invariant that every page has at least one block.
      if (blocks.length === 0) {
        blocks = [{ ...page.blocks[0], content: '', type: 'text' as BlockType, checked: false }];
      }
      const result = updatePage(state, pageId, p => ({ ...p, blocks }));
      const recentBlockIds = state.recentBlockIds.filter(id => !idSet.has(id));
      return { ...result, recentBlockIds };
    });
  },

  markRecentBlocks: (ids) => {
    if (!ids.length) return;
    set(state => ({ recentBlockIds: Array.from(new Set([...state.recentBlockIds, ...ids])) }));
    // Auto-clear after the highlight has had time to fade.
    setTimeout(() => {
      set(state => ({
        recentBlockIds: state.recentBlockIds.filter(id => !ids.includes(id)),
      }));
    }, 6000);
  },
}));
