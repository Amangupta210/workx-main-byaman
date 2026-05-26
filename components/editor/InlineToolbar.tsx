import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Bold, Italic, Link, Unlink, Palette } from 'lucide-react';

const TEXT_COLORS = [
  { label: 'Default', color: '' },
  { label: 'Red',     color: 'hsl(0, 72%, 51%)' },
  { label: 'Orange',  color: 'hsl(25, 95%, 53%)' },
  { label: 'Green',   color: 'hsl(142, 71%, 40%)' },
  { label: 'Blue',    color: 'hsl(199, 89%, 48%)' },
  { label: 'Purple',  color: 'hsl(270, 70%, 55%)' },
  { label: 'Pink',    color: 'hsl(330, 80%, 55%)' },
  { label: 'Gray',    color: 'hsl(220, 10%, 55%)' },
];

export default function InlineToolbar() {
  const [visible, setVisible]         = useState(false);
  const [position, setPosition]       = useState({ x: 0, y: 0 });
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [showColors, setShowColors]   = useState(false);
  const [linkUrl, setLinkUrl]         = useState('');
  const toolbarRef    = useRef<HTMLDivElement>(null);
  const linkInputRef  = useRef<HTMLInputElement>(null);
  const savedRange    = useRef<Range | null>(null);

  // BUG FIXED: checkSelection previously closed over showLinkInput/showColors
  // as state values.  When either changed, useCallback recreated the function,
  // which triggered the useEffect to remove + re-add the selectionchange listener.
  // During that brief re-registration window the listener was absent, causing the
  // toolbar to flicker or vanish when clicking Bold/Italic (execCommand collapses
  // the selection momentarily).
  // Fix: store the flags in refs so checkSelection is stable and never needs to
  // be recreated on each render.
  const showLinkInputRef = useRef(false);
  const showColorsRef    = useRef(false);

  useEffect(() => { showLinkInputRef.current = showLinkInput; }, [showLinkInput]);
  useEffect(() => { showColorsRef.current    = showColors;    }, [showColors]);

  const checkSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      // Don't hide while the link input or colour picker is open — the user
      // clicked an element inside the toolbar, which collapsed the selection.
      if (!showLinkInputRef.current && !showColorsRef.current) setVisible(false);
      return;
    }
    const range = sel.getRangeAt(0);
    const editable =
      range.commonAncestorContainer instanceof HTMLElement
        ? range.commonAncestorContainer.closest('[contenteditable="true"]')
        : range.commonAncestorContainer.parentElement?.closest('[contenteditable="true"]');
    if (!editable) {
      if (!showLinkInputRef.current && !showColorsRef.current) setVisible(false);
      return;
    }
    const rect = range.getBoundingClientRect();
    const TOOLBAR_HALF_WIDTH = 130; // approximate half-width in px

    // BUG FIXED: clamping used a hardcoded 120px on both sides.  On narrow
    // viewports (phones) this made min > max and the toolbar jumped to 120px
    // regardless of selection position.  Use dynamic half-width instead.
    setPosition({
      x: Math.min(
        Math.max(rect.left + rect.width / 2, TOOLBAR_HALF_WIDTH),
        window.innerWidth - TOOLBAR_HALF_WIDTH,
      ),
      y: rect.top - 8,
    });
    setVisible(true);
  }, []); // stable — reads refs, no state dependencies

  useEffect(() => {
    document.addEventListener('selectionchange', checkSelection);
    return () => document.removeEventListener('selectionchange', checkSelection);
  }, [checkSelection]); // checkSelection is now stable → effect runs only once

  const execFormat = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    const sel = window.getSelection();
    if (sel?.anchorNode) {
      const el =
        sel.anchorNode instanceof HTMLElement
          ? sel.anchorNode.closest('[contenteditable]')
          : sel.anchorNode.parentElement?.closest('[contenteditable]');
      el?.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  const handleColorSelect = (color: string) => {
    if (color) execFormat('foreColor', color);
    else       execFormat('removeFormat');
    setShowColors(false);
    showColorsRef.current = false;
  };

  const handleLinkClick = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRange.current = sel.getRangeAt(0).cloneRange();
    setShowLinkInput(true);
    showLinkInputRef.current = true;
    setTimeout(() => linkInputRef.current?.focus(), 50);
  };

  const applyLink = () => {
    if (!linkUrl.trim()) {
      setShowLinkInput(false);
      showLinkInputRef.current = false;
      return;
    }
    if (savedRange.current) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRange.current);
    }
    let url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    document.execCommand('createLink', false, url);
    const sel = window.getSelection();
    if (sel?.anchorNode) {
      const container =
        sel.anchorNode instanceof HTMLElement
          ? sel.anchorNode
          : sel.anchorNode.parentElement;
      container?.closest('[contenteditable]')?.querySelectorAll('a').forEach(link => {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      });
      container?.closest('[contenteditable]')?.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setLinkUrl('');
    setShowLinkInput(false);
    showLinkInputRef.current = false;
    setVisible(false);
    savedRange.current = null;
  };

  const removeLink = () => {
    document.execCommand('unlink');
    const sel = window.getSelection();
    if (sel?.anchorNode) {
      const el =
        sel.anchorNode instanceof HTMLElement
          ? sel.anchorNode.closest('[contenteditable]')
          : sel.anchorNode.parentElement?.closest('[contenteditable]');
      el?.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  if (!visible) return null;

  // BUG FIXED: colour-picker viewport overflow.
  // `absolute top-full` placed the swatch popup below the toolbar, which is
  // already rendered above the selection via `transform:translate(-50%,-100%)`.
  // Near the top of the viewport the popup escaped off-screen upward, and near
  // the bottom it overflowed downward.  Fix: decide open-direction at render
  // time based on toolbar y-position.
  const colorPickerOpenUpward = position.y < 120;

  return (
    <div
      ref={toolbarRef}
      className="fixed z-[150] flex items-center gap-0.5 bg-foreground text-background px-1.5 py-1 rounded-lg shadow-xl animate-scale-in"
      style={{ left: position.x, top: position.y, transform: 'translate(-50%, -100%)' }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {showLinkInput ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => { e.preventDefault(); applyLink(); }}
        >
          <input
            ref={linkInputRef}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            className="w-40 px-2 py-0.5 bg-background/20 text-background text-xs rounded outline-none placeholder:text-background/50"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowLinkInput(false);
                showLinkInputRef.current = false;
                setLinkUrl('');
              }
            }}
          />
          <button
            type="submit"
            className="px-2 py-0.5 bg-primary text-primary-foreground text-xs rounded hover:bg-primary/90 active:scale-95"
          >
            Add
          </button>
        </form>
      ) : (
        <>
          <button
            onClick={() => execFormat('bold')}
            className="p-1.5 rounded hover:bg-background/20 active:scale-90 transition-all"
            title="Bold (Ctrl+B)"
          >
            <Bold size={14} />
          </button>
          <button
            onClick={() => execFormat('italic')}
            className="p-1.5 rounded hover:bg-background/20 active:scale-90 transition-all"
            title="Italic (Ctrl+I)"
          >
            <Italic size={14} />
          </button>

          <div className="w-px h-4 bg-background/30 mx-0.5" />

          {/* Colour picker */}
          <div className="relative">
            <button
              onClick={() => {
                setShowColors(v => !v);
                showColorsRef.current = !showColorsRef.current;
              }}
              className="p-1.5 rounded hover:bg-background/20 active:scale-90 transition-all"
              title="Text colour"
            >
              <Palette size={14} />
            </button>
            {showColors && (
              <div
                className={`absolute left-1/2 -translate-x-1/2 bg-popover border border-border rounded-lg shadow-xl p-2 flex gap-1.5 animate-scale-in ${
                  colorPickerOpenUpward ? 'bottom-full mb-2' : 'top-full mt-2'
                }`}
              >
                {TEXT_COLORS.map(tc => (
                  <button
                    key={tc.label}
                    onClick={() => handleColorSelect(tc.color)}
                    title={tc.label}
                    className="w-6 h-6 rounded-full border-2 border-border hover:scale-110 active:scale-95 transition-transform"
                    style={{ backgroundColor: tc.color || 'hsl(var(--foreground))' }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-background/30 mx-0.5" />

          <button
            onClick={handleLinkClick}
            className="p-1.5 rounded hover:bg-background/20 active:scale-90 transition-all"
            title="Add link (Ctrl+K)"
          >
            <Link size={14} />
          </button>
          <button
            onClick={removeLink}
            className="p-1.5 rounded hover:bg-background/20 active:scale-90 transition-all"
            title="Remove link"
          >
            <Unlink size={14} />
          </button>
        </>
      )}
    </div>
  );
}
