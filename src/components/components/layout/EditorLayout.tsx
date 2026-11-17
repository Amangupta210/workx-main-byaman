import React, { useEffect } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { useUIStore } from '@/stores/uiStore';
import AppSidebar from './AppSidebar';
import Topbar from './Topbar';
import BlockEditor from '@/components/editor/BlockEditor';
import SearchModal from '@/components/editor/SearchModal';
import InlineToolbar from '@/components/editor/InlineToolbar';
import MobileToolbar from '@/components/editor/MobileToolbar';
import { useIsMobile } from '@/hooks/use-mobile';
import AIPanel from '@/components/ai/AIPanel';

export default function EditorLayout() {
  const { initialize } = useEditorStore();
  const { setSidebarOpen } = useUIStore();
  const isMobile = useIsMobile();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile, setSidebarOpen]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <BlockEditor />
      </div>
      <SearchModal />
      <InlineToolbar />
      {isMobile && <MobileToolbar />}
      <AIPanel />
    </div>
  );
}
