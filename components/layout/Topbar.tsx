import React, { useState } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { useUIStore } from '@/stores/uiStore';
import { Menu, Search, Moon, Sun, Download, Sparkles, ListChecks, FileText, Mic, Wand2 } from 'lucide-react';
import { exportPageAsMarkdown } from '@/lib/export';
import { useAIStore } from '@/stores/aiStore';
import VoiceRecorder from '@/components/voice/VoiceRecorder';
import AIPageCreator from '@/components/ai/AIPageCreator';
import ClockStatus from '@/components/layout/ClockStatus';

export default function Topbar() {
  const activePage = useEditorStore(s => s.activePage());
  const { sidebarOpen, toggleSidebar, setSearchOpen, theme, toggleTheme, toggleAIPanel, setAIPanelOpen } = useUIStore();
  const { summarizePage, generateTasksForPage, loading } = useAIStore();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [pageCreatorOpen, setPageCreatorOpen] = useState(false);

  const noteText = activePage?.blocks
    .filter(b => b.type !== 'divider')
    .map(b => b.content)
    .filter(Boolean)
    .join('\n') ?? '';
  const canRunAI = Boolean(activePage && noteText.trim());

  const runSummarize = () => {
    if (!activePage || !canRunAI) return;
    setAIPanelOpen(true);
    summarizePage(activePage.id, activePage.title || 'Untitled', noteText);
  };
  const runGenerateTasks = () => {
    if (!activePage || !canRunAI) return;
    setAIPanelOpen(true);
    generateTasksForPage(activePage.id, activePage.title || 'Untitled', noteText);
  };

  return (
    <header className="h-11 flex items-center justify-between px-3 border-b border-border bg-card shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {!sidebarOpen && (
          <button onClick={toggleSidebar} className="p-1.5 rounded hover:bg-secondary text-muted-foreground transition-colors">
            <Menu size={16} />
          </button>
        )}
        {activePage && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
            <span>{activePage.icon}</span>
            <span className="truncate">{activePage.title || 'Untitled'}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <ClockStatus />
        {activePage && (
          <>
            <button
              onClick={runSummarize}
              disabled={!canRunAI || loading}
              className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-40"
              title="Summarize with AI"
            >
              <FileText size={14} />
              <span>Summarize</span>
            </button>
            <button
              onClick={runGenerateTasks}
              disabled={!canRunAI || loading}
              className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-40"
              title="Generate tasks from note"
            >
              <ListChecks size={14} />
              <span>Generate Tasks</span>
            </button>
          </>
        )}
        <button
          onClick={() => setSearchOpen(true)}
          className="p-1.5 rounded hover:bg-secondary text-muted-foreground transition-colors"
          title="Search (⌘K)"
        >
          <Search size={15} />
        </button>
        {activePage && (
          <button
            onClick={() => activePage && exportPageAsMarkdown(activePage)}
            className="p-1.5 rounded hover:bg-secondary text-muted-foreground transition-colors"
            title="Export as Markdown"
          >
            <Download size={15} />
          </button>
        )}
        <button
          onClick={() => setVoiceOpen(true)}
          className="p-1.5 rounded hover:bg-secondary text-muted-foreground transition-colors"
          title="Voice note (speech-to-text)"
        >
          <Mic size={15} />
        </button>
        <button
          onClick={() => setPageCreatorOpen(true)}
          className="p-1.5 rounded hover:bg-secondary text-muted-foreground transition-colors"
          title="Create page with AI"
        >
          <Wand2 size={15} />
        </button>
        <button
          onClick={toggleAIPanel}
          className="p-1.5 rounded hover:bg-secondary text-muted-foreground transition-colors"
          title="Toggle AI Assistant"
        >
          <Sparkles size={15} />
        </button>
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded hover:bg-secondary text-muted-foreground transition-colors"
          title="Toggle theme"
        >
          {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
        </button>
      </div>
      <VoiceRecorder open={voiceOpen} onClose={() => setVoiceOpen(false)} />
      <AIPageCreator open={pageCreatorOpen} onClose={() => setPageCreatorOpen(false)} />
    </header>
  );
}
