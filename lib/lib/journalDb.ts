/**
 * Local Dexie store for the Journal / Journey module.
 * One entry per calendar day (`dateKey` = YYYY-MM-DD).
 */
import Dexie, { type Table } from 'dexie';

export type Mood =
  | 'amazing' | 'happy' | 'good' | 'calm' | 'grateful'
  | 'okay' | 'tired' | 'anxious' | 'low' | 'sad' | 'angry' | 'bad';

export interface JournalEntry {
  id?: number;
  dateKey: string;        // YYYY-MM-DD (local)
  date: number;           // ms timestamp of that day's start
  title?: string;         // optional entry title
  content: string;        // free-form journal text
  reflection: string;     // "what went well / what to improve"
  mood: Mood | null;
  tags: string[];
  photos?: string[];      // IndexedDB media ids (in workx-db/media store)
  updatedAt: number;
  createdAt: number;
}

class JournalDB extends Dexie {
  entries!: Table<JournalEntry, number>;
  constructor() {
    super('workx-journal-db');
    this.version(1).stores({
      entries: '++id, &dateKey, date, mood, updatedAt',
    });
    this.version(2)
      .stores({ entries: '++id, &dateKey, date, mood, updatedAt' })
      .upgrade(async (tx) => {
        await tx.table<JournalEntry>('entries').toCollection().modify((e) => {
          if (e.title === undefined) e.title = '';
          if (!Array.isArray(e.photos)) e.photos = [];
        });
      });
  }
}

export const journalDb = new JournalDB();

export function todayKey(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfDayMs(d: Date = new Date()): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export async function getOrCreateEntry(d: Date = new Date()): Promise<JournalEntry> {
  const key = todayKey(d);
  const found = await journalDb.entries.where('dateKey').equals(key).first();
  if (found) return found;
  const now = Date.now();
  const id = await journalDb.entries.add({
    dateKey: key,
    date: startOfDayMs(d),
    content: '',
    reflection: '',
    mood: null,
    tags: [],
    createdAt: now,
    updatedAt: now,
  });
  return (await journalDb.entries.get(id))!;
}

export async function saveEntry(id: number, patch: Partial<JournalEntry>) {
  await journalDb.entries.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteEntry(id: number) {
  await journalDb.entries.delete(id);
}

export const MOODS: { value: Mood; label: string; emoji: string; color: string }[] = [
  { value: 'amazing',  label: 'Amazing',  emoji: '🤩', color: '#10b981' },
  { value: 'happy',    label: 'Happy',    emoji: '😄', color: '#22c55e' },
  { value: 'good',     label: 'Good',     emoji: '🙂', color: '#3b82f6' },
  { value: 'calm',     label: 'Calm',     emoji: '😌', color: '#06b6d4' },
  { value: 'grateful', label: 'Grateful', emoji: '🥰', color: '#ec4899' },
  { value: 'okay',     label: 'Okay',     emoji: '😐', color: '#a78bfa' },
  { value: 'tired',    label: 'Tired',    emoji: '😴', color: '#94a3b8' },
  { value: 'anxious',  label: 'Anxious',  emoji: '😰', color: '#eab308' },
  { value: 'low',      label: 'Low',      emoji: '😕', color: '#f59e0b' },
  { value: 'sad',      label: 'Sad',      emoji: '😢', color: '#6366f1' },
  { value: 'angry',    label: 'Angry',    emoji: '😡', color: '#dc2626' },
  { value: 'bad',      label: 'Bad',      emoji: '😣', color: '#ef4444' },
];

export function moodMeta(m: Mood | null) {
  return MOODS.find((x) => x.value === m) ?? null;
}
