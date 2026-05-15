import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { useUIStore } from '@/stores/uiStore';
import type { BlockType } from '@/types/editor';
import {
  Type, Heading1, Heading2, Heading3, CheckSquare, Image, Video, Code, Minus, Music, Table,
} from 'lucide-react';

interface SlashMenuItem {
  type: BlockType;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const menuItems: SlashMenuItem[] = [
  { type: 'text',     label: 'Text',      description: 'Plain text block',              icon: <Type size={18} /> },
  { type: 'heading1', label: 'Heading 1', description: 'Large section heading',          icon: <Heading1 size={18} /> },
  { type: 'heading2', label: 'Heading 2', description: 'Medium section heading',         icon: <Heading2 size={18} /> },
  { type: 'heading3', label: 'Heading 3', description: 'Small section heading',          icon: <Heading3 size={18} /> },
  { type: 'todo',     label: 'To-do',     description: 'Track a task with a checkbox',   icon: <CheckSquare size={18} /> },
  { type: 'table',    label: 'Table',     description: 'Add a table with rows & columns',icon: <Table size={18} /> },
  { type: 'image',    label: 'Image',     description: 'Upload or embed an image',       icon: <Image size={18} /> },
  { type: 'video',    label: 'Video',     description: 'Embed a YouTube video',          icon: <Video size={18} /> },
  { type: 'audio',    label: 'Audio',     description: 'Upload MP3 or audio file',       icon: <Music size={18} /> },
  { type: 'code',     label: 'Code',      description: 'Write a code snippet',           icon: <Code size={18} /> },
  { type: 'divider',  label: 'Divider',   description: 'Visual separator',               icon: <Minus size={18} /> },
];

const MENU_WIDTH  = 288; // px  (w-72)
const MENU_HEIGHT = 320; // px  (max-h-80, approximate)
const MARGIN      = 8;   // px  gap between caret and menu

export default function SlashCommandMenu() {
  const { slashMenuOpen, slashMenuBlockId, slashMenuPosition, closeSlashMenu } = useUIStore();
  const { changeBlockType, updateBlock } = useEditorStore();
  const [filter, setFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = menuItems.filter(item =>
    item.label.toLowerCase().includes(filter.toLowerCase())
  );

  useEffect(() => { setFilter(''); setActiveIndex(0); }, [slashMenuOpen]);

  const handleSelect = useCallback((type: BlockType) => {
    if (slashMenuBlockId) {
      updateBlock(slashMenuBlockId, { content: '' });
      changeBlockType(slashMenuBlockId, type);
    }
    closeSlashMenu();
  }, [slashMenuBlockId, changeBlockType, updateBlock, closeSlashMenu]);

  useEffect(() => {
    if (!slashMenuOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault(); setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault(); if (filtered[activeIndex]) handleSelect(filtered[activeIndex].type);
      } else if (e.key === 'Escape') {
        e.preventDefault(); closeSlashMenu();
      } else if (e.key.length === 1) {
        setFilter(f => f + e.key);
      } else if (e.key === 'Backspace') {
        if (filter.length === 0) closeSlashMenu(); else setFilter(f => f.slice(0, -1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [slashMenuOpen, filtered, activeIndex, filter, handleSelect, closeSlashMenu]);

  useEffect(() => {
    if (!slashMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeSlashMenu();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [slashMenuOpen, closeSlashMenu]);

  if (!slashMenuOpen) return null;

  // BUG FIXED: menu was always rendered at top:50%, left:50% — screen centre.
  // Now we use the stored slashMenuPosition (the block's bottom-left) and clamp
  // the menu to stay within the viewport so it never appears off-screen.
  let menuLeft = 0;
  let menuTop  = 0;

  if (slashMenuPosition) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Place below the block, left-aligned with it
    menuLeft = slashMenuPosition.x;
    menuTop  = slashMenuPosition.y + MARGIN;

    // Clamp so menu doesn't overflow viewport edges
    if (menuLeft + MENU_WIDTH > vw - MARGIN) menuLeft = vw - MENU_WIDTH - MARGIN;
    if (menuLeft < MARGIN) menuLeft = MARGIN;
    if (menuTop + MENU_HEIGHT > vh - MARGIN) menuTop = slashMenuPosition.y - MENU_HEIGHT - MARGIN;
    if (menuTop < MARGIN) menuTop = MARGIN;
  } else {
    // Fallback: centre of screen
    menuLeft = window.innerWidth  / 2 - MENU_WIDTH  / 2;
    menuTop  = window.innerHeight / 2 - MENU_HEIGHT / 2;
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] slash-menu w-72 max-h-80 overflow-y-auto py-1 animate-scale-in"
      style={{ top: menuTop, left: menuLeft }}
    >
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {filter ? `Filtering: ${filter}` : 'Basic blocks'}
      </div>
      {filtered.length === 0 && (
        <div className="px-3 py-4 text-sm text-muted-foreground text-center">No results</div>
      )}
      {filtered.map((item, i) => (
        <button
          key={item.type}
          className={`slash-menu-item w-full text-left ${i === activeIndex ? 'slash-menu-item-active' : ''}`}
          onClick={() => handleSelect(item.type)}
          onMouseEnter={() => setActiveIndex(i)}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-secondary text-foreground shrink-0">
            {item.icon}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium">{item.label}</div>
            <div className="text-xs text-muted-foreground truncate">{item.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
