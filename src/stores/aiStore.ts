import { create } from 'zustand';
import {
  generate,
  summarizeNote,
  generateTasksFromNote,
  askAI,
  generatePagePlan,
  generateRichTasks,
  organizeWorkspace as aiOrganizeWorkspace,
  type AIPagePlanNode,
  WORKX_IDENTITY,
  OllamaError,
} from '@/lib/ollama';
import {
  addChatMessage,
  clearChatMessages,
  getChatMessages,
  addSummary,
  addGeneratedTasks,
  addRichTask,
  type ChatMessage,
} from '@/lib/aiDb';
import { useEditorStore } from '@/stores/editorStore';
import { buildWorkspaceContext } from '@/lib/workspaceMemory';

export interface PendingTaskBatch {
  pageId: string;
  pageTitle: string;
  tasks: string[];
  /** Tasks have already been auto-added to the page; "Save" re-adds them. */
  alreadySaved: boolean;
  /** IDs of the blocks created by the most recent auto-save. Used for Undo. */
  blockIds: string[];
}

interface AIState {
  scopePageId: string | null;
  messages: ChatMessage[];
  loading: boolean;
  pendingTasks: PendingTaskBatch | null;
  abortController: AbortController | null;
  workspaceMemory: boolean;

  loadForPage: (pageId: string | null) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  askPrompt: (
    text: string,
    opts?: { includePage?: boolean; includeWorkspace?: boolean },
  ) => Promise<void>;
  clearChat: () => Promise<void>;
  summarizePage: (pageId: string, pageTitle: string, content: string) => Promise<void>;
  generateTasksForPage: (pageId: string, pageTitle: string, content: string) => Promise<void>;
  createPageFromAI: (topic: string, parentId?: string | null) => Promise<void>;
  createRichTasksFromActivePage: () => Promise<void>;
  organizeWorkspace: () => Promise<void>;
  reSaveTasks: () => void;
  undoLastTaskInsert: () => void;
  stop: () => void;
  setPendingTasks: (b: PendingTaskBatch | null) => void;
  setWorkspaceMemory: (on: boolean) => void;
}

function makeMsg(role: ChatMessage['role'], content: string, pageId: string | null): ChatMessage {
  return { role, content, createdAt: Date.now(), pageId };
}

function appendTasksToPage(pageId: string, tasks: string[]): string[] {
  const ed = useEditorStore.getState();
  if (ed.activePageId !== pageId) ed.setActivePage(pageId);
  // setActivePage updates state synchronously via zustand; safe to addBlock now.
  const ids = tasks.map((t) => useEditorStore.getState().addBlock(undefined, 'todo', t));
  useEditorStore.getState().markRecentBlocks(ids);
  return ids;
}

export const useAIStore = create<AIState>((set, get) => ({
  scopePageId: null,
  messages: [],
  loading: false,
  pendingTasks: null,
  abortController: null,
  workspaceMemory: false,

  loadForPage: async (pageId) => {
    if (get().scopePageId === pageId && get().messages.length > 0) {
      // already loaded; still refresh from DB to catch external writes
    }
    const msgs = await getChatMessages(pageId);
    set({ scopePageId: pageId, messages: msgs, pendingTasks: null });
  },

  sendMessage: async (text) => {
    const trimmed = text.trim();
    if (!trimmed || get().loading) return;
    const pageId = get().scopePageId;

    const userMsg = makeMsg('user', trimmed, pageId);
    set((s) => ({ messages: [...s.messages, userMsg], loading: true }));
    await addChatMessage(userMsg);

    const placeholder = makeMsg('assistant', '', pageId);
    set((s) => ({ messages: [...s.messages, placeholder] }));

    const controller = new AbortController();
    set({ abortController: controller });
    try {
      let acc = '';
      await generate({
        prompt: trimmed,
        signal: controller.signal,
        onChunk: (c) => {
          acc += c;
          set((s) => {
            const msgs = [...s.messages];
            msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: acc };
            return { messages: msgs };
          });
        },
      });
      await addChatMessage({ role: 'assistant', content: acc, pageId });
    } catch (err) {
      const aborted = controller.signal.aborted;
      const message = aborted
        ? '⏹️ Stopped.'
        : err instanceof OllamaError
        ? err.message
        : 'Something went wrong contacting the AI.';
      set((s) => {
        const msgs = [...s.messages];
        const last = msgs[msgs.length - 1];
        msgs[msgs.length - 1] = {
          ...last,
          content: aborted && last.content ? `${last.content}\n\n${message}` : aborted ? message : `⚠️ ${message}`,
        };
        return { messages: msgs };
      });
      if (aborted) {
        const last = get().messages[get().messages.length - 1];
        if (last) await addChatMessage({ role: 'assistant', content: last.content, pageId });
      }
    } finally {
      set({ loading: false, abortController: null });
    }
  },

  clearChat: async () => {
    const pageId = get().scopePageId;
    await clearChatMessages(pageId);
    set({ messages: [] });
  },

  summarizePage: async (pageId, pageTitle, content) => {
    if (get().loading) return;
    const userMsg = makeMsg('user', `Summarize note: "${pageTitle}"`, pageId);
    const placeholder = makeMsg('assistant', '', pageId);
    set((s) => ({ messages: [...s.messages, userMsg, placeholder], loading: true }));
    await addChatMessage(userMsg);

    const controller = new AbortController();
    set({ abortController: controller });
    try {
      let acc = '';
      await summarizeNote(content, {
        signal: controller.signal,
        onChunk: (c) => {
          acc += c;
          set((s) => {
            const msgs = [...s.messages];
            msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: acc };
            return { messages: msgs };
          });
        },
      });
      await addChatMessage({ role: 'assistant', content: acc, pageId });
      await addSummary({ pageId, pageTitle, summary: acc });
    } catch (err) {
      const aborted = controller.signal.aborted;
      const message = aborted
        ? '⏹️ Stopped.'
        : err instanceof OllamaError
        ? err.message
        : 'Could not summarize this note.';
      set((s) => {
        const msgs = [...s.messages];
        const last = msgs[msgs.length - 1];
        msgs[msgs.length - 1] = {
          ...last,
          content: aborted && last.content ? `${last.content}\n\n${message}` : aborted ? message : `⚠️ ${message}`,
        };
        return { messages: msgs };
      });
    } finally {
      set({ loading: false, abortController: null });
    }
  },

  generateTasksForPage: async (pageId, pageTitle, content) => {
    if (get().loading) return;
    const userMsg = makeMsg('user', `Generate tasks from: "${pageTitle}"`, pageId);
    const placeholder = makeMsg('assistant', 'Thinking…', pageId);
    set((s) => ({ messages: [...s.messages, userMsg, placeholder], loading: true }));
    await addChatMessage(userMsg);

    const controller = new AbortController();
    set({ abortController: controller });
    try {
      const tasks = await generateTasksFromNote(content, { signal: controller.signal });

      let blockIds: string[] = [];
      if (tasks.length > 0) {
        // Auto-save into the existing Tasks section immediately.
        blockIds = appendTasksToPage(pageId, tasks);
        await addGeneratedTasks({ pageId, tasks });
      }

      const summary =
        tasks.length === 0
          ? 'No actionable tasks found in this note.'
          : `✅ Added ${tasks.length} task${tasks.length === 1 ? '' : 's'} to "${pageTitle}":\n\n${tasks
              .map((t) => `• ${t}`)
              .join('\n')}`;

      set((s) => {
        const msgs = [...s.messages];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: summary };
        return {
          messages: msgs,
          pendingTasks: tasks.length
            ? { pageId, pageTitle, tasks, alreadySaved: true, blockIds }
            : null,
        };
      });
      await addChatMessage({ role: 'assistant', content: summary, pageId });
    } catch (err) {
      const aborted = controller.signal.aborted;
      const message = aborted
        ? '⏹️ Stopped.'
        : err instanceof OllamaError
        ? err.message
        : 'Could not generate tasks.';
      set((s) => {
        const msgs = [...s.messages];
        msgs[msgs.length - 1] = {
          ...msgs[msgs.length - 1],
          content: aborted ? message : `⚠️ ${message}`,
        };
        return { messages: msgs };
      });
    } finally {
      set({ loading: false, abortController: null });
    }
  },

  reSaveTasks: () => {
    const batch = get().pendingTasks;
    if (!batch) return;
    const ids = appendTasksToPage(batch.pageId, batch.tasks);
    set({ pendingTasks: { ...batch, alreadySaved: true, blockIds: ids } });
  },

  undoLastTaskInsert: () => {
    const batch = get().pendingTasks;
    if (!batch || !batch.blockIds.length) return;
    useEditorStore.getState().removeBlocks(batch.pageId, batch.blockIds);
    set({ pendingTasks: { ...batch, alreadySaved: false, blockIds: [] } });
  },

  stop: () => {
    const c = get().abortController;
    if (c) c.abort();
  },

  setPendingTasks: (b) => set({ pendingTasks: b }),
  setWorkspaceMemory: (on) => set({ workspaceMemory: on }),

  askPrompt: async (text, opts = {}) => {
    const trimmed = text.trim();
    if (!trimmed || get().loading) return;
    const includePage = opts.includePage ?? true;
    const includeWorkspace = opts.includeWorkspace ?? get().workspaceMemory;
    const pageId = get().scopePageId;

    const userMsg = makeMsg('user', trimmed, pageId);
    const placeholder = makeMsg('assistant', '', pageId);
    set((s) => ({ messages: [...s.messages, userMsg, placeholder], loading: true }));
    await addChatMessage(userMsg);

    let context = '';
    if (includeWorkspace) {
      try { context = await buildWorkspaceContext(); } catch {}
    } else if (includePage && pageId) {
      const page = useEditorStore.getState().pages.find(p => p.id === pageId);
      if (page) {
        context =
          `Current page: ${page.title || 'Untitled'}\n` +
          page.blocks
            .filter(b => b.type !== 'divider' && b.content)
            .map(b => (b.type === 'todo' ? `- [${b.checked ? 'x' : ' '}] ${b.content}` : b.content))
            .join('\n');
      }
    }

    const controller = new AbortController();
    set({ abortController: controller });
    try {
      let acc = '';
      await askAI(trimmed, {
        context,
        useWorkspace: includeWorkspace,
        signal: controller.signal,
        onChunk: (c) => {
          acc += c;
          set((s) => {
            const msgs = [...s.messages];
            msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: acc };
            return { messages: msgs };
          });
        },
      });
      await addChatMessage({ role: 'assistant', content: acc, pageId });
    } catch (err) {
      const aborted = controller.signal.aborted;
      const message = aborted
        ? '⏹️ Stopped.'
        : err instanceof OllamaError
        ? err.message
        : 'Something went wrong contacting the AI.';
      set((s) => {
        const msgs = [...s.messages];
        const last = msgs[msgs.length - 1];
        msgs[msgs.length - 1] = {
          ...last,
          content: aborted && last.content ? `${last.content}\n\n${message}` : `⚠️ ${message}`,
        };
        return { messages: msgs };
      });
    } finally {
      set({ loading: false, abortController: null });
    }
  },

  createPageFromAI: async (topic, parentId) => {
    if (get().loading) return;
    const pageId = get().scopePageId;
    const userMsg = makeMsg('user', `Create a new page: ${topic}`, pageId);
    const placeholder = makeMsg('assistant', 'Designing your new page…', pageId);
    set((s) => ({ messages: [...s.messages, userMsg, placeholder], loading: true }));
    await addChatMessage(userMsg);

    const controller = new AbortController();
    set({ abortController: controller });
    try {
      const plan = await generatePagePlan(topic, { signal: controller.signal });
      const newId = useEditorStore.getState().addPageWithBlocks(
        plan.title,
        plan.blocks,
        parentId ?? null,
      );
      const summary = `📄 Created page "${plan.title}" with ${plan.blocks.length} block${plan.blocks.length === 1 ? '' : 's'}.`;
      set((s) => {
        const msgs = [...s.messages];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: summary };
        return { messages: msgs };
      });
      await addChatMessage({ role: 'assistant', content: summary, pageId });
      // Switch to the new page so user sees it
      useEditorStore.getState().setActivePage(newId);
    } catch (err) {
      const aborted = controller.signal.aborted;
      const message = aborted
        ? '⏹️ Stopped.'
        : err instanceof OllamaError
        ? err.message
        : 'Could not create the page.';
      set((s) => {
        const msgs = [...s.messages];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: `⚠️ ${message}` };
        return { messages: msgs };
      });
    } finally {
      set({ loading: false, abortController: null });
    }
  },

  createRichTasksFromActivePage: async () => {
    if (get().loading) return;
    const ed = useEditorStore.getState();
    const page = ed.activePage();
    if (!page) return;
    const pageId = page.id;
    const pageTitle = page.title || 'Untitled';
    const content = page.blocks
      .filter((b) => b.type !== 'divider' && b.content)
      .map((b) => b.content)
      .join('\n');
    if (!content.trim()) return;

    const userMsg = makeMsg('user', `Create scheduled tasks from "${pageTitle}"`, pageId);
    const placeholder = makeMsg('assistant', 'Planning tasks…', pageId);
    set((s) => ({ messages: [...s.messages, userMsg, placeholder], loading: true }));
    await addChatMessage(userMsg);

    const controller = new AbortController();
    set({ abortController: controller });
    try {
      const tasks = await generateRichTasks(content, { signal: controller.signal });
      // Sort by priority (high first) then by due time
      const prioRank = { high: 0, med: 1, low: 2 } as const;
      const sorted = tasks
        .slice()
        .sort((a, b) => {
          const p = prioRank[a.priority] - prioRank[b.priority];
          if (p !== 0) return p;
          const at = a.due ? Date.parse(a.due) : Infinity;
          const bt = b.due ? Date.parse(b.due) : Infinity;
          return at - bt;
        });

      // Insert as todo blocks on the page (with annotation) and persist as RichTask
      const blockIds: string[] = [];
      for (const t of sorted) {
        const meta: string[] = [];
        if (t.due) meta.push(`📅 ${new Date(t.due).toLocaleString()}`);
        if (t.priority !== 'med') meta.push(t.priority === 'high' ? '⚡ high' : '· low');
        if (t.recurrence !== 'none') meta.push(`🔁 ${t.recurrence}`);
        if (t.labels.length) meta.push(...t.labels.map((l) => `#${l}`));
        const text = meta.length ? `${t.title}  —  ${meta.join('  ')}` : t.title;
        if (ed.activePageId !== pageId) ed.setActivePage(pageId);
        const id = useEditorStore.getState().addBlock(undefined, 'todo', text);
        blockIds.push(id);
        await addRichTask({
          pageId,
          blockId: id,
          title: t.title,
          due: t.due ? Date.parse(t.due) : null,
          reminderMinsBefore: t.reminderMinsBefore ?? null,
          priority: t.priority,
          labels: t.labels,
          recurrence: t.recurrence,
          completed: false,
        });
      }
      useEditorStore.getState().markRecentBlocks(blockIds);

      const summary = sorted.length
        ? `✅ Added ${sorted.length} scheduled task${sorted.length === 1 ? '' : 's'} to "${pageTitle}", arranged by priority & due date. They will appear on the Calendar page.`
        : 'No actionable tasks found.';
      set((s) => {
        const msgs = [...s.messages];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: summary };
        return { messages: msgs };
      });
      await addChatMessage({ role: 'assistant', content: summary, pageId });
    } catch (err) {
      const aborted = controller.signal.aborted;
      const message = aborted
        ? '⏹️ Stopped.'
        : err instanceof OllamaError
        ? err.message
        : 'Could not create scheduled tasks.';
      set((s) => {
        const msgs = [...s.messages];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: `⚠️ ${message}` };
        return { messages: msgs };
      });
    } finally {
      set({ loading: false, abortController: null });
    }
  },

  organizeWorkspace: async () => {
    if (get().loading) return;
    const pageId = get().scopePageId;
    const userMsg = makeMsg('user', 'Organize my workspace into nested pages', pageId);
    const placeholder = makeMsg('assistant', 'Reading your notes and planning a structure…', pageId);
    set((s) => ({ messages: [...s.messages, userMsg, placeholder], loading: true }));
    await addChatMessage(userMsg);

    const controller = new AbortController();
    set({ abortController: controller });
    try {
      const snap = await buildWorkspaceContext(10000);
      const plan = await aiOrganizeWorkspace(snap, { signal: controller.signal });
      if (!plan.length) {
        const m = 'The model returned no organization plan. Try again with more notes.';
        set((s) => {
          const msgs = [...s.messages];
          msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: m };
          return { messages: msgs };
        });
        return;
      }
      const ed = useEditorStore.getState();
      const created: string[] = [];
      const createTree = (nodes: AIPagePlanNode[], parentId: string | null) => {
        for (const n of nodes) {
          const id = ed.addPageWithBlocks(n.title, n.blocks, parentId, n.icon);
          created.push(n.title);
          if (n.children?.length) createTree(n.children, id);
        }
      };
      createTree(plan, null);

      const summary = `🗂 Organized your workspace into ${created.length} new page${created.length === 1 ? '' : 's'}:\n${created.map((t) => `• ${t}`).join('\n')}`;
      set((s) => {
        const msgs = [...s.messages];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: summary };
        return { messages: msgs };
      });
      await addChatMessage({ role: 'assistant', content: summary, pageId });
    } catch (err) {
      const aborted = controller.signal.aborted;
      const message = aborted
        ? '⏹️ Stopped.'
        : err instanceof OllamaError
        ? err.message
        : 'Could not organize workspace.';
      set((s) => {
        const msgs = [...s.messages];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: `⚠️ ${message}` };
        return { messages: msgs };
      });
    } finally {
      set({ loading: false, abortController: null });
    }
  },
}));

// keep WORKX_IDENTITY referenced so tree-shakers don't drop the brand string in tests
void WORKX_IDENTITY;