import React from 'react';
import { X, Type, Heading1, CheckSquare, Image, Video, Code, Minus, Music, Table } from 'lucide-react';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  { keys: ['/', ''], desc: 'Open slash command menu' },
  { keys: ['Enter'], desc: 'Create new block' },
  { keys: ['Backspace'], desc: 'Delete empty block' },
  { keys: ['↑', '↓'], desc: 'Navigate between blocks' },
  { keys: ['Ctrl', 'B'], desc: 'Bold text' },
  { keys: ['Ctrl', 'I'], desc: 'Italic text' },
  { keys: ['Ctrl', 'K'], desc: 'Search pages / Add link' },
];

const blockTypes = [
  { icon: <Type size={16} />, name: 'Text', desc: 'Plain paragraph text' },
  { icon: <Heading1 size={16} />, name: 'Headings', desc: 'H1, H2, H3 section headings' },
  { icon: <CheckSquare size={16} />, name: 'To-do', desc: 'Checkbox task items' },
  { icon: <Table size={16} />, name: 'Table', desc: 'Editable rows & columns' },
  { icon: <Image size={16} />, name: 'Image', desc: 'Upload or paste images' },
  { icon: <Video size={16} />, name: 'Video', desc: 'Embed YouTube videos' },
  { icon: <Music size={16} />, name: 'Audio', desc: 'Upload MP3 or audio files' },
  { icon: <Code size={16} />, name: 'Code', desc: 'Code snippet with syntax' },
  { icon: <Minus size={16} />, name: 'Divider', desc: 'Visual separator line' },
];

export default function AboutModal({ open, onClose }: AboutModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto bg-popover border border-border rounded-xl shadow-2xl animate-scale-in">
        <div className="sticky top-0 bg-popover flex items-center justify-between px-6 py-4 border-b border-border z-10">
          <div>
            <h2 className="text-lg font-semibold">Welcome to WorkX</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Your all-in-one workspace</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-6">
          <section>
            <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">Getting Started</h3>
            <div className="space-y-2 text-sm text-foreground/80 leading-relaxed">
              <p>WorkX is a block-based editor where everything is a block — text, headings, images, tables, audio, and more. Create pages from the sidebar, organize with nested pages, and find anything with search.</p>
              <p>Type <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs font-mono">/</kbd> anywhere to open the slash command menu. Select text to format it with <strong>bold</strong>, <em>italic</em>, colors, or links.</p>
              <p>Add a <strong>cover image</strong> to any page by hovering at the top of the editor. Upload images, audio files, or embed YouTube videos.</p>
            </div>
          </section>
          <section>
            <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">Block Types</h3>
            <div className="grid gap-2">
              {blockTypes.map(bt => (
                <div key={bt.name} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/50">
                  <span className="text-muted-foreground">{bt.icon}</span>
                  <div>
                    <span className="text-sm font-medium">{bt.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">{bt.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">Keyboard Shortcuts</h3>
            <div className="space-y-2">
              {shortcuts.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-foreground/80">{s.desc}</span>
                  <div className="flex items-center gap-1">
                    {s.keys.filter(Boolean).map((key, j) => (
                      <kbd key={j} className="px-1.5 py-0.5 bg-secondary rounded text-xs font-mono min-w-[24px] text-center">{key}</kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3 className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">Features</h3>
            <ul className="space-y-1.5 text-sm text-foreground/80">
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>Drag & drop blocks to reorder</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>Upload images, audio from device, paste, or drag & drop</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>Embed YouTube videos by pasting URLs</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>Rich text: bold, italic, text colors, and clickable links</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>Editable tables with add/remove rows & columns</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>Cover images for pages</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>Auto-save to local storage</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>Dark mode toggle</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>Export pages as Markdown</li>
              <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>Search across all pages (⌘K)</li>
            </ul>
          </section>
          <div className="pt-2 border-t border-border text-center">
            <p className="text-xs text-muted-foreground">
              Made with ❤️ by <a href="https://www.instagram.com/gupta_aman_1516" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Aman Gupta</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
