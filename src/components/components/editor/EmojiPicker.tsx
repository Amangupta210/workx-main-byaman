import React, { useState, useRef, useEffect } from 'react';

const EMOJI_CATEGORIES = [
  { label: 'Smileys', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😋','😛','🤔','🤗','🤫','😎','🥳','😏','😌','😴'] },
  { label: 'Objects', emojis: ['📄','📝','📋','📌','📎','📐','📏','✏️','🖊️','📖','📚','📓','📒','📕','📗','📘','📙','💼','📁','📂','🗂️','📊','📈','📉','🗃️'] },
  { label: 'Symbols', emojis: ['⭐','🌟','💫','✨','⚡','🔥','💡','🎯','🚀','💎','🏆','🎨','🎵','🎬','📸','🔑','🔒','🔔','💬','❤️','💙','💚','💜','🖤','🤍'] },
  { label: 'Nature',  emojis: ['🌱','🌿','🍀','🌸','🌺','🌻','🌈','☀️','🌙','⛅','🌊','🏔️','🌲','🍃','🦋','🐝','🐾','🦊','🐱','🐶','🌵','🍄','🌾','🪴','🎋'] },
  { label: 'Food',    emojis: ['🍎','🍕','🍔','🌮','🍣','🍜','☕','🍵','🧁','🍰','🎂','🍪','🍩','🍫','🍬','🧇','🥑','🥕','🌽','🍇','🍓','🍑','🥝','🍋','🫐'] },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [activeTab, setActiveTab] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // BUG FIXED: original code only listened to `mousedown`.
    // On touch devices `mousedown` doesn't fire — tapping anywhere outside
    // the picker never closed it, trapping the user.
    // Fix: listen to both mousedown (desktop) and touchstart (mobile).
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e instanceof TouchEvent ? e.touches[0]?.target : e.target;
      if (ref.current && target instanceof Node && !ref.current.contains(target)) {
        onClose();
      }
    };

    window.addEventListener('mousedown', handler as EventListener);
    window.addEventListener('touchstart', handler as EventListener, { passive: true });
    return () => {
      window.removeEventListener('mousedown', handler as EventListener);
      window.removeEventListener('touchstart', handler as EventListener);
    };
  }, [onClose]);

  // BUG FIXED: `absolute left-0 top-full` could overflow off the right or
  // bottom edge of the viewport when the sidebar is narrow or the window is
  // small.  We now measure the picker's own position after mount and flip its
  // alignment if it would clip.  A simple approach: check if `left-0` would
  // push the 288px wide picker past the viewport edge; if so use `right-0`.
  const [alignRight, setAlignRight] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8)  setAlignRight(true);
    if (rect.bottom > window.innerHeight - 8) setOpenUpward(true);
  }, []);

  return (
    <div
      ref={ref}
      className={`absolute z-50 w-72 bg-popover border border-border rounded-xl shadow-xl overflow-hidden animate-scale-in ${
        alignRight  ? 'right-0'    : 'left-0'
      } ${
        openUpward  ? 'bottom-full mb-1' : 'top-full mt-1'
      }`}
    >
      {/* Category tabs */}
      <div className="flex gap-1 px-2 pt-2 pb-1 border-b border-border overflow-x-auto">
        {EMOJI_CATEGORIES.map((cat, i) => (
          <button
            key={cat.label}
            onClick={() => setActiveTab(i)}
            className={`px-2 py-1 text-xs rounded-md whitespace-nowrap transition-colors ${
              i === activeTab
                ? 'bg-secondary font-medium'
                : 'text-muted-foreground hover:bg-secondary/60'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="p-2 grid grid-cols-8 gap-0.5 max-h-48 overflow-y-auto">
        {EMOJI_CATEGORIES[activeTab].emojis.map(emoji => (
          <button
            key={emoji}
            onClick={() => { onSelect(emoji); onClose(); }}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-secondary transition-colors text-lg active:scale-90"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
