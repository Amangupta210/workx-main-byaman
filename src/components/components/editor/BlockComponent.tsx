import React, { useRef, useEffect, useCallback, useState, type KeyboardEvent } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { useUIStore } from '@/stores/uiStore';
import type { Block, BlockType } from '@/types/editor';
import {
  GripVertical, Trash2, MoreHorizontal, Type, Heading1, Heading2, Heading3,
  CheckSquare, Image, Video, Code, Minus, Music, Table, Plus, X,
} from 'lucide-react';
import { saveMedia, loadMedia } from '@/lib/db';
import { motion } from 'framer-motion';

interface BlockComponentProps {
  block: Block;
  index: number;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
}

const BlockComponent = React.memo(({ block, index, dragHandleProps }: BlockComponentProps) => {
  const { updateBlock, deleteBlock, addBlock, setFocusedBlock, changeBlockType } = useEditorStore();
  const { openSlashMenu } = useUIStore();
  const focusedBlockId = useEditorStore(s => s.focusedBlockId);
  const activePage = useEditorStore(s => s.activePage());
  const isRecent = useEditorStore(s => s.recentBlockIds.includes(block.id));
  const ref = useRef<HTMLDivElement | HTMLTextAreaElement | HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [mediaObjectUrl, setMediaObjectUrl] = useState<string | null>(null);

  // BUG FIXED: stale closure in URL cleanup.
  // The original code wrote `return () => { if (mediaObjectUrl) URL.revokeObjectURL(mediaObjectUrl) }`
  // but mediaObjectUrl is always null when the effect first registers its cleanup, so the
  // ObjectURL was never revoked — a memory leak on every media block mount/unmount.
  // Fix: mirror the state into a ref so cleanup always sees the current URL.
  const mediaObjectUrlRef = useRef<string | null>(null);

  const isFocused = focusedBlockId === block.id;

  useEffect(() => {
    if (isFocused && ref.current) {
      ref.current.focus();
      if (ref.current instanceof HTMLDivElement && ref.current.contentEditable === 'true') {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(ref.current);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [isFocused]);

  useEffect(() => {
    if ((block.type === 'image' || block.type === 'audio') && block.mediaUrl?.startsWith('idb:')) {
      const mediaId = block.mediaUrl.replace('idb:', '');
      loadMedia(mediaId).then(blob => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          setMediaObjectUrl(url);
          mediaObjectUrlRef.current = url; // keep ref in sync for cleanup
        }
      });
    }
    return () => {
      // Revoke via ref — always has the current URL, never the stale initial null
      if (mediaObjectUrlRef.current) {
        URL.revokeObjectURL(mediaObjectUrlRef.current);
        mediaObjectUrlRef.current = null;
      }
    };
  }, [block.mediaUrl, block.type]);

  useEffect(() => {
    if (!showMenu) return;
    const handler = () => setShowMenu(false);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [showMenu]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && block.type !== 'code') {
      e.preventDefault();
      addBlock(block.id);
    }
    if (e.key === 'Backspace') {
      const el = ref.current;
      if (block.type === 'text' && el instanceof HTMLDivElement) {
        if (el.textContent === '' || el.innerHTML === '' || el.innerHTML === '<br>') {
          e.preventDefault();
          deleteBlock(block.id);
        }
      }
    }
    if (e.key === 'ArrowUp' && activePage) {
      const idx = activePage.blocks.findIndex(b => b.id === block.id);
      if (idx > 0) { e.preventDefault(); setFocusedBlock(activePage.blocks[idx - 1].id); }
    }
    if (e.key === 'ArrowDown' && activePage) {
      const idx = activePage.blocks.findIndex(b => b.id === block.id);
      if (idx < activePage.blocks.length - 1) {
        e.preventDefault();
        setFocusedBlock(activePage.blocks[idx + 1].id);
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); document.execCommand('bold'); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); document.execCommand('italic'); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        const url = prompt('Enter URL:');
        if (url) {
          let finalUrl = url.trim();
          if (!/^https?:\/\//i.test(finalUrl)) finalUrl = 'https://' + finalUrl;
          document.execCommand('createLink', false, finalUrl);
          const container = (
            sel.anchorNode instanceof HTMLElement
              ? sel.anchorNode
              : sel.anchorNode?.parentElement
          )?.closest('[contenteditable]');
          container?.querySelectorAll('a').forEach(a => {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
          });
          container?.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }
  }, [block, activePage, addBlock, deleteBlock, setFocusedBlock]);

  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const html = e.currentTarget.innerHTML || '';
    const text = e.currentTarget.textContent || '';
    if (text === '/') {
      // BUG FIXED: pass the block element's bounding rect so the slash menu
      // can appear right below the block instead of at screen centre.
      const rect = ref.current?.getBoundingClientRect() ?? null;
      openSlashMenu(block.id, rect ? { x: rect.left, y: rect.bottom } : null);
      return;
    }
    updateBlock(block.id, { content: html });
  }, [block.id, updateBlock, openSlashMenu]);

  const handleMediaUpload = useCallback(async (file: File) => {
    const mediaId = crypto.randomUUID();
    await saveMedia(mediaId, file);
    updateBlock(block.id, { mediaUrl: `idb:${mediaId}` });
  }, [block.id, updateBlock]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await handleMediaUpload(file);
        return;
      }
    }
  }, [handleMediaUpload]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      await handleMediaUpload(files[0]);
    }
  }, [handleMediaUpload]);

  const handleLinkClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'A') {
      e.preventDefault();
      e.stopPropagation();
      window.open((target as HTMLAnchorElement).href, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const blockMenuItems: { type: BlockType; label: string; icon: React.ReactNode }[] = [
    { type: 'text', label: 'Text', icon: <Type size={14} /> },
    { type: 'heading1', label: 'Heading 1', icon: <Heading1 size={14} /> },
    { type: 'heading2', label: 'Heading 2', icon: <Heading2 size={14} /> },
    { type: 'heading3', label: 'Heading 3', icon: <Heading3 size={14} /> },
    { type: 'todo', label: 'To-do', icon: <CheckSquare size={14} /> },
    { type: 'image', label: 'Image', icon: <Image size={14} /> },
    { type: 'video', label: 'Video', icon: <Video size={14} /> },
    { type: 'audio', label: 'Audio', icon: <Music size={14} /> },
    { type: 'table', label: 'Table', icon: <Table size={14} /> },
    { type: 'code', label: 'Code', icon: <Code size={14} /> },
    { type: 'divider', label: 'Divider', icon: <Minus size={14} /> },
  ];

  // ── Table helpers ──────────────────────────────────────────────────────────
  const updateTableCell = (rowIdx: number, colIdx: number, value: string) => {
    if (!block.tableData) return;
    const newRows = block.tableData.rows.map((r, ri) =>
      ri === rowIdx ? r.map((c, ci) => (ci === colIdx ? value : c)) : [...r]
    );
    updateBlock(block.id, { tableData: { ...block.tableData, rows: newRows } });
  };

  const updateTableHeader = (colIdx: number, value: string) => {
    if (!block.tableData) return;
    const newHeaders = block.tableData.headers.map((h, i) => (i === colIdx ? value : h));
    updateBlock(block.id, { tableData: { ...block.tableData, headers: newHeaders } });
  };

  const addTableRow = () => {
    if (!block.tableData) return;
    const newRow = block.tableData.headers.map(() => '');
    updateBlock(block.id, { tableData: { ...block.tableData, rows: [...block.tableData.rows, newRow] } });
  };

  const addTableColumn = () => {
    if (!block.tableData) return;
    updateBlock(block.id, {
      tableData: {
        headers: [...block.tableData.headers, `Column ${block.tableData.headers.length + 1}`],
        rows: block.tableData.rows.map(r => [...r, '']),
      },
    });
  };

  const deleteTableRow = (rowIdx: number) => {
    if (!block.tableData || block.tableData.rows.length <= 1) return;
    updateBlock(block.id, {
      tableData: { ...block.tableData, rows: block.tableData.rows.filter((_, i) => i !== rowIdx) },
    });
  };

  const deleteTableColumn = (colIdx: number) => {
    if (!block.tableData || block.tableData.headers.length <= 1) return;
    updateBlock(block.id, {
      tableData: {
        headers: block.tableData.headers.filter((_, i) => i !== colIdx),
        rows: block.tableData.rows.map(r => r.filter((_, i) => i !== colIdx)),
      },
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const renderContent = () => {
    switch (block.type) {
      case 'heading1':
        return (
          <div
            ref={ref as React.RefObject<HTMLDivElement>}
            contentEditable suppressContentEditableWarning
            className="outline-none text-3xl font-bold leading-tight py-1"
            style={{ lineHeight: '1.15', overflowWrap: 'break-word' }}
            dangerouslySetInnerHTML={{ __html: block.content }}
            onInput={handleInput} onKeyDown={handleKeyDown}
            onFocus={() => setFocusedBlock(block.id)} onPaste={handlePaste} onClick={handleLinkClick}
            data-placeholder="Heading 1"
          />
        );
      case 'heading2':
        return (
          <div
            ref={ref as React.RefObject<HTMLDivElement>}
            contentEditable suppressContentEditableWarning
            className="outline-none text-2xl font-semibold leading-tight py-1"
            style={{ lineHeight: '1.2', overflowWrap: 'break-word' }}
            dangerouslySetInnerHTML={{ __html: block.content }}
            onInput={handleInput} onKeyDown={handleKeyDown}
            onFocus={() => setFocusedBlock(block.id)} onPaste={handlePaste} onClick={handleLinkClick}
            data-placeholder="Heading 2"
          />
        );
      case 'heading3':
        return (
          <div
            ref={ref as React.RefObject<HTMLDivElement>}
            contentEditable suppressContentEditableWarning
            className="outline-none text-xl font-semibold leading-snug py-1"
            style={{ lineHeight: '1.25', overflowWrap: 'break-word' }}
            dangerouslySetInnerHTML={{ __html: block.content }}
            onInput={handleInput} onKeyDown={handleKeyDown}
            onFocus={() => setFocusedBlock(block.id)} onPaste={handlePaste} onClick={handleLinkClick}
            data-placeholder="Heading 3"
          />
        );
      case 'todo':
        return (
          <div className="flex items-start gap-2 py-1">
            <input
              type="checkbox" checked={block.checked ?? false}
              onChange={(e) => updateBlock(block.id, { checked: e.target.checked })}
              className="mt-1 h-4 w-4 rounded border-border accent-primary cursor-pointer"
            />
            <div
              ref={ref as React.RefObject<HTMLDivElement>}
              contentEditable suppressContentEditableWarning
              className={`outline-none flex-1 ${block.checked ? 'line-through text-muted-foreground' : ''}`}
              style={{ overflowWrap: 'break-word' }}
              dangerouslySetInnerHTML={{ __html: block.content }}
              onInput={handleInput} onKeyDown={handleKeyDown}
              onFocus={() => setFocusedBlock(block.id)} onPaste={handlePaste} onClick={handleLinkClick}
              data-placeholder="To-do"
            />
          </div>
        );
      case 'image': {
        const imgSrc = mediaObjectUrl || block.mediaUrl || '';
        if (!imgSrc || imgSrc.startsWith('idb:')) {
          return (
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}
            >
              <Image className="mx-auto mb-2 text-muted-foreground" size={32} />
              <p className="text-sm text-muted-foreground">Click to upload or drag & drop an image</p>
              <input
                ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) handleMediaUpload(file); }}
              />
            </div>
          );
        }
        return (
          <div className="rounded-lg overflow-hidden my-1 relative group/img">
            <img src={imgSrc} alt="" className="max-w-full rounded-lg" loading="lazy" />
            <button
              onClick={() => deleteBlock(block.id)}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-destructive text-destructive-foreground opacity-0 group-hover/img:opacity-100 transition-opacity shadow-md"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      }
      case 'audio': {
        const audioSrc = mediaObjectUrl || block.mediaUrl || '';
        if (!audioSrc || audioSrc.startsWith('idb:')) {
          return (
            <div
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Music className="mx-auto mb-2 text-muted-foreground" size={28} />
              <p className="text-sm text-muted-foreground">Click to upload an audio file (MP3, WAV, etc.)</p>
              <input
                ref={fileInputRef} type="file" accept="audio/*" className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) handleMediaUpload(file); }}
              />
            </div>
          );
        }
        return (
          <div className="rounded-lg overflow-hidden my-1 relative group/audio bg-secondary/30 p-3">
            <audio src={audioSrc} controls className="w-full" preload="metadata" />
            <button
              onClick={() => deleteBlock(block.id)}
              className="absolute top-1 right-1 p-1 rounded-lg bg-destructive text-destructive-foreground opacity-0 group-hover/audio:opacity-100 transition-opacity shadow-md"
            >
              <Trash2 size={12} />
            </button>
          </div>
        );
      }
      case 'video': {
        if (!block.content && !block.mediaUrl) {
          return (
            <div className="py-1">
              <input
                ref={ref as React.RefObject<HTMLInputElement>}
                type="text" placeholder="Paste a YouTube URL..."
                className="w-full px-3 py-2 border border-border rounded-lg text-sm outline-none focus:ring-1 focus:ring-ring bg-card"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const url = (e.target as HTMLInputElement).value;
                    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
                    if (ytMatch)
                      updateBlock(block.id, {
                        mediaUrl: `https://www.youtube.com/embed/${ytMatch[1]}`,
                        content: url,
                      });
                  }
                }}
                onFocus={() => setFocusedBlock(block.id)}
              />
            </div>
          );
        }
        return (
          <div className="rounded-lg overflow-hidden my-1 aspect-video relative group/vid">
            <iframe src={block.mediaUrl} className="w-full h-full rounded-lg" allowFullScreen title="Video" />
            <button
              onClick={() => updateBlock(block.id, { mediaUrl: '', content: '' })}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-destructive text-destructive-foreground opacity-0 group-hover/vid:opacity-100 transition-opacity shadow-md"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      }
      case 'table': {
        const td = block.tableData || { headers: ['Col 1', 'Col 2'], rows: [['', '']] };
        return (
          <div className="my-2 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-secondary/60">
                  {td.headers.map((h, ci) => (
                    // BUG FIXED: table column delete button was `absolute -top-2 -right-2`
                    // which let it escape the <th> boundary, then got clipped by the wrapping
                    // overflow-x-auto div — it was invisible. Fix: inline flex layout inside the
                    // header cell, no absolute positioning needed.
                    <th key={ci} className="border-r border-border last:border-r-0 p-0 group/col">
                      <div className="flex items-center">
                        <input
                          value={h} onChange={e => updateTableHeader(ci, e.target.value)}
                          className="flex-1 px-3 py-2 bg-transparent text-left font-medium text-sm outline-none min-w-[80px]"
                        />
                        {td.headers.length > 1 && (
                          <button
                            onClick={() => deleteTableColumn(ci)}
                            className="p-1 mr-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/col:opacity-100 transition-opacity shrink-0"
                            title="Remove column"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="w-8 p-0">
                    <button
                      onClick={addTableColumn}
                      className="w-full h-full p-2 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                      title="Add column"
                    >
                      <Plus size={14} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {td.rows.map((row, ri) => (
                  <tr key={ri} className="border-t border-border group/trow hover:bg-secondary/20">
                    {row.map((cell, ci) => (
                      <td key={ci} className="border-r border-border last:border-r-0 p-0">
                        <input
                          value={cell} onChange={e => updateTableCell(ri, ci, e.target.value)}
                          className="w-full px-3 py-2 bg-transparent text-sm outline-none min-w-[80px]"
                          placeholder="..."
                        />
                      </td>
                    ))}
                    <td className="w-8 p-0">
                      {td.rows.length > 1 && (
                        <button
                          onClick={() => deleteTableRow(ri)}
                          className="w-full h-full p-2 text-muted-foreground/40 hover:text-destructive transition-colors opacity-0 group-hover/trow:opacity-100"
                          title="Remove row"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              onClick={addTableRow}
              className="w-full py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors flex items-center justify-center gap-1 border-t border-border"
            >
              <Plus size={12} /> Add row
            </button>
          </div>
        );
      }
      case 'code':
        return (
          <div className="rounded-lg overflow-hidden my-1 bg-secondary/50 border border-border">
            <textarea
              ref={ref as React.RefObject<HTMLTextAreaElement>}
              value={block.content}
              onChange={(e) => updateBlock(block.id, { content: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const t = e.target as HTMLTextAreaElement;
                  const s = t.selectionStart, end = t.selectionEnd;
                  updateBlock(block.id, {
                    content: t.value.substring(0, s) + '  ' + t.value.substring(end),
                  });
                  setTimeout(() => { t.selectionStart = t.selectionEnd = s + 2; }, 0);
                }
                handleKeyDown(e as unknown as KeyboardEvent);
              }}
              onFocus={() => setFocusedBlock(block.id)}
              className="w-full p-4 bg-transparent font-mono text-sm outline-none resize-none min-h-[80px] text-foreground"
              placeholder="Write code..."
              spellCheck={false}
            />
          </div>
        );
      case 'divider':
        return <hr className="my-3 border-border" />;
      default:
        return (
          <div
            ref={ref as React.RefObject<HTMLDivElement>}
            contentEditable suppressContentEditableWarning
            className="outline-none py-1 leading-relaxed"
            style={{ overflowWrap: 'break-word' }}
            dangerouslySetInnerHTML={{ __html: block.content }}
            onInput={handleInput} onKeyDown={handleKeyDown}
            onFocus={() => setFocusedBlock(block.id)} onPaste={handlePaste} onClick={handleLinkClick}
            data-placeholder="Type '/' for commands..."
          />
        );
    }
  };

  return (
    // BUG FIXED: removed `layout` prop from motion.div.
    // With `layout`, Framer Motion re-measures and re-animates the bounding box
    // of EVERY sibling block whenever any one block changes (typing, focus, etc.),
    // causing expensive layout recalculations on every keystroke across the whole
    // page. Keeping only enter/exit animations is enough.
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={`group relative flex items-start gap-1 px-1 -ml-8 pl-8 rounded-md hover:bg-secondary/40 transition-colors duration-100 ${
        isRecent ? 'ai-recent-block' : ''
      }`}
      onDragOver={(e) => { if (block.type === 'image') e.preventDefault(); }}
    >
      <div className="flex items-center gap-0.5 pt-1 block-hover-controls shrink-0 -ml-7">
        <button
          className="p-0.5 rounded hover:bg-secondary text-muted-foreground/60 cursor-grab active:cursor-grabbing"
          {...dragHandleProps}
        >
          <GripVertical size={14} />
        </button>
        <div className="relative">
          <button
            className="p-0.5 rounded hover:bg-secondary text-muted-foreground/60"
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          >
            <MoreHorizontal size={14} />
          </button>
          {showMenu && (
            <div
              className="absolute left-0 top-full mt-1 z-50 slash-menu w-48 py-1 animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              {blockMenuItems.map(item => (
                <button
                  key={item.type}
                  className="slash-menu-item w-full text-left text-sm hover:bg-secondary"
                  onClick={() => { changeBlockType(block.id, item.type); setShowMenu(false); }}
                >
                  <span className="text-muted-foreground">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
              <div className="border-t border-border my-1" />
              <button
                className="slash-menu-item w-full text-left text-sm text-destructive hover:bg-destructive/10"
                onClick={() => { deleteBlock(block.id); setShowMenu(false); }}
              >
                <Trash2 size={14} /><span>Delete</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0" style={{ overflowWrap: 'break-word' }}>
        {renderContent()}
      </div>
    </motion.div>
  );
});

BlockComponent.displayName = 'BlockComponent';
export default BlockComponent;
