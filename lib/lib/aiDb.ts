/**
 * Dexie-backed local store for AI features.
 */
import Dexie, { type Table } from 'dexie';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id?: number;
  role: ChatRole;
  content: string;
  createdAt: number;
  pageId: string | null;
}

export interface SummaryRecord {
  id?: number;
  pageId: string;
  pageTitle: string;
  summary: string;
  createdAt: number;
}

export interface GeneratedTaskRecord {
  id?: number;
  pageId: string;
  tasks: string[];
  createdAt: number;
}

export interface SettingsRecord {
  id: 'ollama';
  baseUrl: string;
  model: string;
}

export interface VoiceTranscriptRecord {
  id?: number;
  pageId: string | null;
  text: string;
  durationMs?: number;
  createdAt: number;
}

export type TaskPriority = 'low' | 'med' | 'high';
export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export interface RichTaskRecord {
  id?: number;
  pageId: string | null;
  blockId?: string | null;
  title: string;
  due?: number | null;
  reminderMinsBefore?: number | null;
  priority: TaskPriority;
  labels: string[];
  recurrence: Recurrence;
  completed: boolean;
  createdAt: number;
}

export interface CalendarEventRecord {
  id?: number;
  title: string;
  description?: string;
  start: number;
  end: number;
  allDay?: boolean;
  color?: string;
  pageId?: string | null;
  createdAt: number;
}

class AIDatabase extends Dexie {
  chatMessages!: Table<ChatMessage, number>;
  summaries!: Table<SummaryRecord, number>;
  generatedTasks!: Table<GeneratedTaskRecord, number>;
  settings!: Table<SettingsRecord, string>;
  voiceTranscripts!: Table<VoiceTranscriptRecord, number>;
  richTasks!: Table<RichTaskRecord, number>;
  events!: Table<CalendarEventRecord, number>;

  constructor() {
    super('workx-ai-db');
    this.version(1).stores({
      chatMessages: '++id, createdAt',
      summaries: '++id, pageId, createdAt',
      generatedTasks: '++id, pageId, createdAt',
    });
    this.version(2)
      .stores({
        chatMessages: '++id, createdAt, pageId',
        summaries: '++id, pageId, createdAt',
        generatedTasks: '++id, pageId, createdAt',
        settings: 'id',
      })
      .upgrade(async (tx) => {
        await tx
          .table<ChatMessage>('chatMessages')
          .toCollection()
          .modify((m) => {
            if (m.pageId === undefined) m.pageId = null;
          });
      });
    this.version(3).stores({
      chatMessages: '++id, createdAt, pageId',
      summaries: '++id, pageId, createdAt',
      generatedTasks: '++id, pageId, createdAt',
      settings: 'id',
      voiceTranscripts: '++id, pageId, createdAt',
    });
    // v4 — rich tasks + calendar events
    this.version(4).stores({
      chatMessages: '++id, createdAt, pageId',
      summaries: '++id, pageId, createdAt',
      generatedTasks: '++id, pageId, createdAt',
      settings: 'id',
      voiceTranscripts: '++id, pageId, createdAt',
      richTasks: '++id, pageId, due, priority, completed, createdAt',
      events: '++id, start, end, pageId, createdAt',
    });
  }
}

export const aiDb = new AIDatabase();

export async function addChatMessage(
  msg: Omit<ChatMessage, 'id' | 'createdAt'> & { createdAt?: number },
) {
  return aiDb.chatMessages.add({ createdAt: Date.now(), ...msg });
}

export async function clearChatMessages(pageId: string | null) {
  if (pageId === null) {
    await aiDb.chatMessages.filter((m) => m.pageId === null).delete();
  } else {
    await aiDb.chatMessages.where('pageId').equals(pageId).delete();
  }
}

export async function getChatMessages(pageId: string | null): Promise<ChatMessage[]> {
  const all =
    pageId === null
      ? await aiDb.chatMessages.filter((m) => m.pageId === null).toArray()
      : await aiDb.chatMessages.where('pageId').equals(pageId).toArray();
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function addSummary(rec: Omit<SummaryRecord, 'id' | 'createdAt'>) {
  return aiDb.summaries.add({ ...rec, createdAt: Date.now() });
}

export async function addGeneratedTasks(rec: Omit<GeneratedTaskRecord, 'id' | 'createdAt'>) {
  return aiDb.generatedTasks.add({ ...rec, createdAt: Date.now() });
}

export async function addVoiceTranscript(rec: Omit<VoiceTranscriptRecord, 'id' | 'createdAt'>) {
  return aiDb.voiceTranscripts.add({ ...rec, createdAt: Date.now() });
}

export async function getAllVoiceTranscripts(): Promise<VoiceTranscriptRecord[]> {
  return aiDb.voiceTranscripts.orderBy('createdAt').reverse().toArray();
}

/* ───────── Settings ───────── */

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
export const DEFAULT_OLLAMA_MODEL = 'mistral:latest';

export async function getOllamaSettings(): Promise<{ baseUrl: string; model: string }> {
  const rec = await aiDb.settings.get('ollama');
  return {
    baseUrl: rec?.baseUrl?.trim() || DEFAULT_OLLAMA_URL,
    model: rec?.model?.trim() || DEFAULT_OLLAMA_MODEL,
  };
}

export async function setOllamaSettings(baseUrl: string, model: string) {
  await aiDb.settings.put({
    id: 'ollama',
    baseUrl: baseUrl.trim() || DEFAULT_OLLAMA_URL,
    model: model.trim() || DEFAULT_OLLAMA_MODEL,
  });
}

/* ───────── Rich tasks ───────── */

export async function addRichTask(rec: Omit<RichTaskRecord, 'id' | 'createdAt'>) {
  return aiDb.richTasks.add({ ...rec, createdAt: Date.now() });
}

export async function updateRichTask(id: number, patch: Partial<RichTaskRecord>) {
  return aiDb.richTasks.update(id, patch);
}

export async function deleteRichTask(id: number) {
  return aiDb.richTasks.delete(id);
}

export async function getAllRichTasks(): Promise<RichTaskRecord[]> {
  return aiDb.richTasks.orderBy('createdAt').toArray();
}

/* ───────── Calendar events ───────── */

export async function addEvent(rec: Omit<CalendarEventRecord, 'id' | 'createdAt'>) {
  return aiDb.events.add({ ...rec, createdAt: Date.now() });
}

export async function updateEvent(id: number, patch: Partial<CalendarEventRecord>) {
  return aiDb.events.update(id, patch);
}

export async function deleteEvent(id: number) {
  return aiDb.events.delete(id);
}
