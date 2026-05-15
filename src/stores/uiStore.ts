import { create } from 'zustand';

function getInitialTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem('workx-theme');
    if (stored === 'dark' || stored === 'light') return stored;
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch {}
  return 'light';
}

interface SlashMenuPosition {
  x: number;
  y: number;
}

interface UIState {
  sidebarOpen: boolean;
  slashMenuOpen: boolean;
  slashMenuBlockId: string | null;
  // BUG FIXED: slashMenuPosition was absent — the menu was always rendered at
  // top:50%/left:50% (screen centre) because there was nowhere to store where
  // the "/" was typed. Now openSlashMenu accepts the caret rect so the menu
  // can appear right below the block that triggered it.
  slashMenuPosition: SlashMenuPosition | null;
  searchOpen: boolean;
  searchQuery: string;
  theme: 'light' | 'dark';
  aiPanelOpen: boolean;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  openSlashMenu: (blockId: string, position: SlashMenuPosition | null) => void;
  closeSlashMenu: () => void;
  setSearchOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  toggleTheme: () => void;
  toggleAIPanel: () => void;
  setAIPanelOpen: (open: boolean) => void;
}

const initialTheme = getInitialTheme();
if (initialTheme === 'dark') {
  document.documentElement.classList.add('dark');
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  slashMenuOpen: false,
  slashMenuBlockId: null,
  slashMenuPosition: null,
  searchOpen: false,
  searchQuery: '',
  theme: initialTheme,
  aiPanelOpen: false,

  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  openSlashMenu: (blockId, position) =>
    set({ slashMenuOpen: true, slashMenuBlockId: blockId, slashMenuPosition: position }),
  closeSlashMenu: () =>
    set({ slashMenuOpen: false, slashMenuBlockId: null, slashMenuPosition: null }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  toggleTheme: () =>
    set(s => {
      const next = s.theme === 'light' ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', next === 'dark');
      localStorage.setItem('workx-theme', next);
      return { theme: next };
    }),
  toggleAIPanel: () => set(s => ({ aiPanelOpen: !s.aiPanelOpen })),
  setAIPanelOpen: (open) => set({ aiPanelOpen: open }),
}));
