/**
 * Local Dexie store for Sticky Notes (Google Keep-style).
 */
import Dexie, { type Table } from 'dexie';

export type NoteColor =
  | 'default' | 'yellow' | 'orange' | 'red' | 'pink'
  | 'purple' | 'blue' | 'teal' | 'green' | 'gray';

export interface StickyNote {
  id?: number;
  title: string;
  content: string;
  color: NoteColor;
  pinned: boolean;
  archived: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

class NotesDB extends Dexie {
  notes!: Table<StickyNote, number>;
  constructor() {
    super('workx-notes-db');
    this.version(1).stores({
      notes: '++id, pinned, archived, updatedAt, createdAt',
    });
  }
}

export const notesDb = new NotesDB();

export async function createNote(partial: Partial<StickyNote> = {}): Promise<number> {
  const now = Date.now();
  const n: StickyNote = {
    title: '',
    content: '',
    color: 'default',
    pinned: false,
    archived: false,
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
  return notesDb.notes.add(n);
}

export async function updateNote(id: number, patch: Partial<StickyNote>): Promise<void> {
  await notesDb.notes.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteNote(id: number): Promise<void> {
  await notesDb.notes.delete(id);
}

export async function listNotes(): Promise<StickyNote[]> {
  const all = await notesDb.notes.toArray();
  return all.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

export const NOTE_COLOR_STYLES: Record<NoteColor, { bg: string; ring: string; chip: string }> = {
  default: { bg: 'bg-card',          ring: 'ring-border',        chip: 'bg-muted' },
  yellow:  { bg: 'bg-yellow-100/80 dark:bg-yellow-500/15',  ring: 'ring-yellow-300/60',  chip: 'bg-yellow-300' },
  orange:  { bg: 'bg-orange-100/80 dark:bg-orange-500/15',  ring: 'ring-orange-300/60',  chip: 'bg-orange-300' },
  red:     { bg: 'bg-red-100/80 dark:bg-red-500/15',        ring: 'ring-red-300/60',     chip: 'bg-red-300' },
  pink:    { bg: 'bg-pink-100/80 dark:bg-pink-500/15',      ring: 'ring-pink-300/60',    chip: 'bg-pink-300' },
  purple:  { bg: 'bg-purple-100/80 dark:bg-purple-500/15',  ring: 'ring-purple-300/60',  chip: 'bg-purple-300' },
  blue:    { bg: 'bg-blue-100/80 dark:bg-blue-500/15',      ring: 'ring-blue-300/60',    chip: 'bg-blue-300' },
  teal:    { bg: 'bg-teal-100/80 dark:bg-teal-500/15',      ring: 'ring-teal-300/60',    chip: 'bg-teal-300' },
  green:   { bg: 'bg-green-100/80 dark:bg-green-500/15',    ring: 'ring-green-300/60',   chip: 'bg-green-300' },
  gray:    { bg: 'bg-gray-100/80 dark:bg-gray-500/15',      ring: 'ring-gray-300/60',    chip: 'bg-gray-400' },
};
