import React, { useCallback, useRef } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import BlockComponent from './BlockComponent';
import SlashCommandMenu from './SlashCommandMenu';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AnimatePresence } from 'framer-motion';
import type { Block } from '@/types/editor';
import { saveMedia } from '@/lib/db';
import { Image, X } from 'lucide-react';

function SortableBlock({ block, index }: { block: Block; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <BlockComponent
        block={block}
        index={index}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

export default function BlockEditor() {
  const activePage = useEditorStore(s => s.activePage());
  const { updatePageTitle, moveBlock, addBlock, updatePageCover } = useEditorStore();
  const coverInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !activePage) return;
    const oldIndex = activePage.blocks.findIndex(b => b.id === active.id);
    const newIndex = activePage.blocks.findIndex(b => b.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) moveBlock(oldIndex, newIndex);
  }, [activePage, moveBlock]);

  const handleCoverUpload = async (file: File) => {
    if (!activePage) return;
    const mediaId = crypto.randomUUID();
    await saveMedia(mediaId, file);
    updatePageCover(activePage.id, `idb:${mediaId}`);
  };

  if (!activePage) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p className="text-lg">Select or create a page to get started</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto editor-mobile-pad">
      {/* Cover image */}
      {activePage.coverImage ? (
        <CoverImage coverUrl={activePage.coverImage} pageId={activePage.id} />
      ) : (
        <div className="max-w-[var(--editor-max-width)] mx-auto px-6 md:px-12 pt-6">
          {/*
           * BUG FIXED: "Add cover" button was opacity-0 hover:opacity-100 — invisible on
           * mobile (no hover).  Changed to a subtle always-visible muted style.
           */}
          <button
            onClick={() => coverInputRef.current?.click()}
            className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors flex items-center gap-1"
          >
            <Image size={12} /> Add cover
          </button>
          <input
            ref={coverInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f); }}
          />
        </div>
      )}

      <div className="max-w-[var(--editor-max-width)] mx-auto px-6 md:px-12 py-8">
        {/* Page title */}
        <div className="mb-8">
          <input
            type="text" value={activePage.title}
            onChange={(e) => updatePageTitle(activePage.id, e.target.value)}
            className="w-full text-4xl font-bold outline-none bg-transparent placeholder:text-muted-foreground/30"
            placeholder="Untitled"
            style={{ lineHeight: '1.15' }}
          />
        </div>

        {/* Blocks */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={activePage.blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
            <AnimatePresence mode="popLayout">
              {activePage.blocks.map((block, i) => (
                <SortableBlock key={block.id} block={block} index={i} />
              ))}
            </AnimatePresence>
          </SortableContext>
        </DndContext>

        {/* Click below all blocks to focus/create the last block */}
        <div
          className="min-h-[200px] cursor-text"
          onClick={() => {
            const lastBlock = activePage.blocks[activePage.blocks.length - 1];
            if (lastBlock && lastBlock.content === '' && lastBlock.type === 'text') {
              useEditorStore.getState().setFocusedBlock(lastBlock.id);
            } else {
              addBlock(lastBlock?.id);
            }
          }}
        />
      </div>

      <SlashCommandMenu />

      {/* Footer */}
      <div className="max-w-[var(--editor-max-width)] mx-auto px-6 md:px-12 pb-8 text-center">
        <p className="text-xs text-muted-foreground/40">
          Made by{' '}
          <a
            href="https://www.instagram.com/gupta_aman_1516"
            target="_blank" rel="noopener noreferrer"
            className="hover:text-muted-foreground transition-colors underline decoration-muted-foreground/20 hover:decoration-muted-foreground/40"
          >
            Aman Gupta
          </a>
        </p>
      </div>
    </div>
  );
}

// ── CoverImage ─────────────────────────────────────────────────────────────────
function CoverImage({ coverUrl, pageId }: { coverUrl: string; pageId: string }) {
  const { updatePageCover } = useEditorStore();
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
  // BUG FIXED: stale closure — original cleanup read objectUrl which is always
  // null on first render, so revokeObjectURL was never called → memory leak.
  // Ref always holds the latest URL so cleanup runs correctly.
  const objectUrlRef = React.useRef<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (coverUrl.startsWith('idb:')) {
      const mediaId = coverUrl.replace('idb:', '');
      import('@/lib/db').then(({ loadMedia }) => {
        loadMedia(mediaId).then(blob => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            setObjectUrl(url);
            objectUrlRef.current = url;
          }
        });
      });
    }
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [coverUrl]);

  const src = objectUrl || coverUrl;

  const handleReplace = async (file: File) => {
    const mediaId = crypto.randomUUID();
    const { saveMedia } = await import('@/lib/db');
    await saveMedia(mediaId, file);
    updatePageCover(pageId, `idb:${mediaId}`);
  };

  return (
    <div className="relative w-full h-48 md:h-56 group/cover overflow-hidden">
      <img src={src} alt="" className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/20" />
      <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover/cover:opacity-100 transition-opacity">
        <button
          onClick={() => coverInputRef.current?.click()}
          className="px-2.5 py-1 bg-card/80 backdrop-blur-sm text-xs font-medium rounded-md hover:bg-card transition-colors shadow-sm border border-border/50"
        >
          Change cover
        </button>
        <button
          onClick={() => updatePageCover(pageId, '')}
          className="p-1 bg-card/80 backdrop-blur-sm rounded-md hover:bg-destructive hover:text-destructive-foreground transition-colors shadow-sm border border-border/50"
        >
          <X size={14} />
        </button>
      </div>
      <input
        ref={coverInputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReplace(f); }}
      />
    </div>
  );
}
