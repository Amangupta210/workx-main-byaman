import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useEditorStore } from '@/stores/editorStore';
import { useUIStore } from '@/stores/uiStore';
import {
  Plus, Trash2, ChevronRight, ChevronDown, Search,
  PanelLeftClose, HelpCircle, Star, Moon, Sun, Download, Calendar as CalendarIcon, Home, CheckSquare,
  BookHeart,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import EmojiPicker from '@/components/editor/EmojiPicker';
import AboutModal from '@/components/editor/AboutModal';
import logo from '@/assets/logo_workx.png';
import { exportPageAsMarkdown } from '@/lib/export';
import PWAInstallButton from '@/components/PWAInstallButton';

export default function AppSidebar() {
  const { pages, activePageId, favorites, setActivePage, addPage, deletePage, updatePageIcon, toggleFavorite } =
    useEditorStore();
  const { sidebarOpen, toggleSidebar, setSearchOpen, theme, toggleTheme } = useUIStore();
  const [emojiPickerPageId, setEmojiPickerPageId] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const location = useLocation();
  const onCalendar = location.pathname.startsWith('/calendar');
  const onTasks = location.pathname.startsWith('/tasks');
  const onJournal = location.pathname.startsWith('/journal');
  const onNotes = !onCalendar && !onTasks && !onJournal;

  // BUG FIXED: removed `hoveredPage` useState + onMouseEnter/onMouseLeave.
  // The old code conditionally rendered the action buttons only when
  // hoveredPage === page.id.  onMouseEnter never fires on touch devices, so
  // the delete/star/add buttons were permanently absent from the DOM on mobile.
  // Fix: buttons are always in the DOM; CSS `group-hover` + `isActive` control
  // their visibility — no JS state required.

  const rootPages = pages.filter(p => !p.parentId);
  const favoritePages = pages.filter(p => favorites.includes(p.id));

  const toggleExpand = (id: string) => {
    setExpandedPages(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    const page = pages.find(p => p.id === activePageId);
    if (page) exportPageAsMarkdown(page);
  };

  const renderPageItem = (page: typeof pages[0], depth = 0) => {
    const isActive = activePageId === page.id;
    const children = pages.filter(p => p.parentId === page.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedPages.has(page.id);
    const isFav = favorites.includes(page.id);

    return (
      <div key={page.id}>
        {/*
         * 'group' on this div enables CSS group-hover for the action buttons.
         * Previously the entire row had onMouseEnter/onMouseLeave driving a JS
         * hoveredPage state.  That approach meant the buttons never appeared on
         * touch devices.  Now hover is pure CSS; mobile users always see buttons
         * when the page is active (isActive → opacity-100).
         */}
        <div
          className={`sidebar-item group ${isActive ? 'sidebar-item-active' : ''}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => setActivePage(page.id)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(page.id); }}
              className="p-0.5 rounded hover:bg-secondary/80 text-muted-foreground shrink-0"
            >
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          <div className="relative shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEmojiPickerPageId(emojiPickerPageId === page.id ? null : page.id);
              }}
              className="hover:bg-secondary/80 rounded p-0.5 transition-colors"
            >
              {page.icon || '📄'}
            </button>
            {emojiPickerPageId === page.id && (
              <EmojiPicker
                onSelect={(emoji) => { updatePageIcon(page.id, emoji); setEmojiPickerPageId(null); }}
                onClose={() => setEmojiPickerPageId(null)}
              />
            )}
          </div>

          <span className="truncate flex-1 text-sm">{page.title || 'Untitled'}</span>

          {/*
           * Action buttons — always in the DOM.
           * Desktop: opacity-0 by default, revealed by group-hover.
           * Mobile:  isActive makes them opacity-100 (touch has no hover event).
           */}
          <div
            className={`flex items-center gap-0.5 shrink-0 transition-opacity duration-150 ${
              isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => { e.stopPropagation(); toggleFavorite(page.id); }}
              className={`p-0.5 rounded hover:bg-secondary/80 ${isFav ? 'text-yellow-500' : 'text-muted-foreground'}`}
              title={isFav ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Star size={12} fill={isFav ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); addPage(page.id); }}
              className="p-0.5 rounded hover:bg-secondary/80 text-muted-foreground"
              title="Add sub-page"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); deletePage(page.id); }}
              className="p-0.5 rounded hover:bg-destructive/10 text-destructive"
              title="Delete page"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {children.map(child => renderPageItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="h-screen flex flex-col border-r border-border bg-card overflow-hidden shrink-0"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <img src={logo} alt="WorkX" className="h-6" />
              </div>
              <button
                onClick={toggleSidebar}
                className="p-1 rounded hover:bg-secondary text-muted-foreground transition-colors"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>

            {/* Search */}
            <div className="px-3 py-2">
              <button
                onClick={() => setSearchOpen(true)}
                className="sidebar-item w-full text-muted-foreground text-sm"
              >
                <Search size={14} />
                <span>Search</span>
                <span className="ml-auto text-[10px] text-muted-foreground/60">⌘K</span>
              </button>
              <Link
                to="/"
                className={`sidebar-item w-full text-sm ${onNotes ? 'sidebar-item-active' : 'text-muted-foreground'}`}
              >
                <Home size={14} />
                <span>Notes</span>
              </Link>
              <Link
                to="/tasks"
                className={`sidebar-item w-full text-sm ${onTasks ? 'sidebar-item-active' : 'text-muted-foreground'}`}
              >
                <CheckSquare size={14} />
                <span>Tasks</span>
              </Link>
              <Link
                to="/calendar"
                className={`sidebar-item w-full text-sm ${onCalendar ? 'sidebar-item-active' : 'text-muted-foreground'}`}
              >
                <CalendarIcon size={14} />
                <span>Calendar</span>
              </Link>
              <Link
                to="/journal"
                className={`sidebar-item w-full text-sm ${onJournal ? 'sidebar-item-active' : 'text-muted-foreground'}`}
              >
                <BookHeart size={14} />
                <span>Work X · Days</span>
              </Link>
            </div>

            {/* Favorites */}
            {favoritePages.length > 0 && (
              <div className="px-2 py-1">
                <div className="flex items-center px-2 mb-1">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Favorites
                  </span>
                </div>
                {favoritePages.map(page => (
                  <div
                    key={`fav-${page.id}`}
                    className={`sidebar-item ${activePageId === page.id ? 'sidebar-item-active' : ''}`}
                    onClick={() => setActivePage(page.id)}
                  >
                    <Star size={12} className="text-yellow-500 shrink-0" fill="currentColor" />
                    <span className="shrink-0">{page.icon || '📄'}</span>
                    <span className="truncate flex-1 text-sm">{page.title || 'Untitled'}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Pages list */}
            <div className="flex-1 overflow-y-auto px-2 py-1">
              <div className="flex items-center justify-between px-2 mb-1">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Pages
                </span>
                <button
                  onClick={() => addPage()}
                  className="p-0.5 rounded hover:bg-secondary text-muted-foreground transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>

              {rootPages.map(page => renderPageItem(page))}

              {rootPages.length === 0 && (
                <div className="px-3 py-6 text-center">
                  <p className="text-sm text-muted-foreground mb-2">No pages yet</p>
                  <button onClick={() => addPage()} className="text-sm text-primary hover:underline">
                    Create your first page
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-3 py-3 border-t border-border space-y-1">
              <button onClick={() => addPage()} className="sidebar-item w-full text-sm">
                <Plus size={14} />
                <span>New page</span>
              </button>
              <button onClick={handleExport} className="sidebar-item w-full text-sm text-muted-foreground">
                <Download size={14} />
                <span>Export page</span>
              </button>
              <button onClick={toggleTheme} className="sidebar-item w-full text-sm text-muted-foreground">
                {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
                <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
              </button>
              <button
                onClick={() => setAboutOpen(true)}
                className="sidebar-item w-full text-sm text-muted-foreground"
              >
                <HelpCircle size={14} />
                <span>How to use</span>
              </button>
              <PWAInstallButton />
              <a
                href="https://www.instagram.com/gupta_aman_1516"
                target="_blank"
                rel="noreferrer noopener"
                className="block px-2 pt-2 text-center text-[10.5px] text-muted-foreground hover:text-foreground"
                title="Open creator's Instagram"
              >
                Built by Aman Gupta
              </a>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  );
}
