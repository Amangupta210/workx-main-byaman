/**
 * Smoke tests for the Sticky Notes module — covers create / pin / unpin /
 * archive / restore / edit / delete and offline AI queueing.
 *
 * These run in jsdom against `fake-indexeddb` so we can exercise Dexie
 * without a browser.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Ollama before importing modules that read it.
const pingMock = vi.fn(async () => false);
vi.mock('@/lib/ollama', () => ({
  pingOllama: () => pingMock(),
  askAI: vi.fn(async () => 'AI reply'),
  summarizeNote: vi.fn(async () => 'summary'),
  generateStickyNotes: vi.fn(async () => [{ title: 'N1', content: 'c1' }]),
  OllamaError: class extends Error {},
}));

import { notesDb, createNote, updateNote, deleteNote, listNotes } from '@/lib/notesDb';
import { enqueue, drain, clearQueue, registerHandler, queueSize } from '@/lib/aiQueue';

beforeEach(async () => {
  await notesDb.notes.clear();
  clearQueue();
  pingMock.mockReset();
});

describe('Notes CRUD', () => {
  it('creates, pins, archives, edits, deletes', async () => {
    const id = await createNote({ title: 'Hello', content: 'World', tags: ['a'] });
    let list = await listNotes();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Hello');

    await updateNote(id, { pinned: true });
    list = await listNotes('smart');
    expect(list[0].pinned).toBe(true);

    await updateNote(id, { pinned: false });
    expect((await listNotes())[0].pinned).toBe(false);

    await updateNote(id, { archived: true });
    const active = (await listNotes()).filter((n) => !n.archived);
    const archived = (await listNotes()).filter((n) => n.archived);
    expect(active).toHaveLength(0);
    expect(archived).toHaveLength(1);

    await updateNote(id, { archived: false, title: 'Edited' });
    expect((await listNotes())[0].title).toBe('Edited');

    await deleteNote(id);
    expect(await listNotes()).toHaveLength(0);
  });

  it('sorts by title and updated', async () => {
    await createNote({ title: 'Bravo' });
    await new Promise((r) => setTimeout(r, 2));
    await createNote({ title: 'Alpha' });
    const byTitle = await listNotes('title');
    expect(byTitle.map((n) => n.title)).toEqual(['Alpha', 'Bravo']);
    const byUpdated = await listNotes('updated');
    expect(byUpdated[0].title).toBe('Alpha');
  });
});

describe('AI offline queue', () => {
  it('drains nothing when Ollama is offline', async () => {
    pingMock.mockResolvedValue(false);
    enqueue('note-generate', { prompt: 'x' });
    const res = await drain();
    expect(res).toEqual({ done: 0, failed: 0 });
    expect(queueSize()).toBe(1);
  });

  it('replays jobs when Ollama comes back online', async () => {
    pingMock.mockResolvedValue(true);
    const calls: string[] = [];
    registerHandler('note-generate', async (p) => { calls.push((p as { prompt: string }).prompt); });
    enqueue('note-generate', { prompt: 'one' });
    enqueue('note-generate', { prompt: 'two' });
    const res = await drain();
    expect(res.done).toBe(2);
    expect(calls).toEqual(['one', 'two']);
    expect(queueSize()).toBe(0);
  });
});
