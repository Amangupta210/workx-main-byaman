import React from 'react';
import { useEditorStore } from '@/stores/editorStore';
import {
  Type, Heading1, Heading2, CheckSquare, Image, Code, Minus, Video,
  Bold, Italic, Link, Music, Table,
} from 'lucide-react';
import type { BlockType } from '@/types/editor';

export default function MobileToolbar() {
  const { addBlock, focusedBlockId } = useEditorStore();
  const activePage = useEditorStore(s => s.activePage());

  const items: { type: BlockType; icon: React.ReactNode; label: string }[] = [
    { type: 'text',    icon: <Type size={18} />,       label: 'Text'  },
    { type: 'heading1',icon: <Heading1 size={18} />,   label: 'H1'    },
    { type: 'heading2',icon: <Heading2 size={18} />,   label: 'H2'    },
    { type: 'todo',    icon: <CheckSquare size={18} />, label: 'Todo'  },
    { type: 'table',   icon: <Table size={18} />,      label: 'Table' },
    { type: 'image',   icon: <Image size={18} />,      label: 'Image' },
    { type: 'audio',   icon: <Music size={18} />,      label: 'Audio' },
    { type: 'video',   icon: <Video size={18} />,      label: 'Video' },
    { type: 'code',    icon: <Code size={18} />,       label: 'Code'  },
    { type: 'divider', icon: <Minus size={18} />,      label: 'Line'  },
  ];

  const formatItems = [
    { action: 'bold',   icon: <Bold size={18} />,   label: 'Bold'   },
    { action: 'italic', icon: <Italic size={18} />, label: 'Italic' },
    { action: 'link',   icon: <Link size={18} />,   label: 'Link'   },
  ];

  const handleAdd = (type: BlockType) => {
    const lastBlockId =
      focusedBlockId || activePage?.blocks[activePage.blocks.length - 1]?.id;
    addBlock(lastBlockId, type);
  };

  const handleFormat = (action: string) => {
    if (action === 'link') {
      const raw = prompt('Enter URL:');
      if (!raw?.trim()) return;

      // BUG FIXED: URL was used verbatim without normalisation.  Pasting a bare
      // domain like "example.com" created a relative link that resolved to
      // /example.com on the same origin.  Now we prefix https:// when missing.
      let url = raw.trim();
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

      document.execCommand('createLink', false, url);

      // BUG FIXED: old code searched only anchorNode's parent chain for an <a>
      // tag, which fails if execCommand wrapped multiple text nodes.  Instead,
      // scan the whole contenteditable element for all new links (consistent
      // with how BlockComponent handles it).
      const sel = window.getSelection();
      if (sel?.anchorNode) {
        const container =
          sel.anchorNode instanceof HTMLElement
            ? sel.anchorNode
            : sel.anchorNode.parentElement;
        container?.closest('[contenteditable]')?.querySelectorAll('a').forEach(a => {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        });
        container?.closest('[contenteditable]')?.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else {
      document.execCommand(action);
      // Persist the formatting change via the store
      const sel = window.getSelection();
      if (sel?.anchorNode) {
        const el =
          sel.anchorNode instanceof HTMLElement
            ? sel.anchorNode.closest('[contenteditable]')
            : sel.anchorNode.parentElement?.closest('[contenteditable]');
        el?.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  };

  if (!activePage) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom md:hidden">
      <div className="flex overflow-x-auto gap-0.5 px-2 py-2 scrollbar-none">
        {formatItems.map(item => (
          <button
            key={item.action}
            onClick={() => handleFormat(item.action)}
            className="flex flex-col items-center justify-center min-w-[44px] h-11 rounded-lg text-muted-foreground hover:bg-secondary active:scale-95 transition-all"
          >
            {item.icon}
            <span className="text-[10px] mt-0.5">{item.label}</span>
          </button>
        ))}
        <div className="w-px bg-border mx-1 self-stretch my-2" />
        {items.map(item => (
          <button
            key={item.type}
            onClick={() => handleAdd(item.type)}
            className="flex flex-col items-center justify-center min-w-[44px] h-11 rounded-lg text-muted-foreground hover:bg-secondary active:scale-95 transition-all"
          >
            {item.icon}
            <span className="text-[10px] mt-0.5">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
