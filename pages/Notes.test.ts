/**
 * Smoke tests for the Sticky Notes module — covers create / pin / unpin /
 * archive / restore / edit / delete, offline AI queueing with dedupe + retry,
 * and TXT/PDF export shape.
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
  translateText: vi.fn(async (t: string) => t),
  rewriteText: vi.fn(async (t: string) => t),
}));

// jsPDF runs in jsdom — mock the save side-effect so it doesn't try DOM downloads.
vi.mock('jspdf', () => {
  const out: { save: ReturnType<typeof vi.fn> } = { save: vi.fn() };
  class FakeDoc {
    internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } };
    setFont() {} setFontSize() {} setTextColor() {} setDrawColor() {} setLineWidth() {}
    text() {} line() {} addPage() {} setPage() {}
    splitTextToSize(t: string) { return [t]; }
    getNumberOfPages() { return 1; }
    save = out.save;
  }
  return { jsPDF: FakeDoc, __saveSpy: out };
});

import { notesDb, createNote, updateNote, deleteNote, listNotes } from '@/lib/notesDb';
import {
  enqueue, drain, clearQueue, registerHandler, queueSize, getQueue, failedSize, retryJob, removeJob,
} from '@/lib/aiQueue';
import { exportNotesToPdf, exportNotesToTxt } from '@/lib/notesExport';

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

    await updateNote(id, { pinned: false, archived: true });
    expect((await listNotes()).filter((n) => n.archived)).toHaveLength(1);

    await updateNote(id, { archived: false, title: 'Edited' });
    expect((await listNotes())[0].title).toBe('Edited');

    await deleteNote(id);
    expect(await listNotes()).toHaveLength(0);
  });

  it('sorts by title and updated', async () => {
    await createNote({ title: 'Bravo' });
    await new Promise((r) => setTimeout(r, 2));
    await createNote({ title: 'Alpha' });
    expect((await listNotes('title')).map((n) => n.title)).toEqual(['Alpha', 'Bravo']);
    expect((await listNotes('updated'))[0].title).toBe('Alpha');
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

  it('de-duplicates identical jobs to avoid duplicate sticky notes on replay', async () => {
    pingMock.mockResolvedValue(false);
    const j1 = enqueue('note-generate', { prompt: 'one' });
    const j2 = enqueue('note-generate', { prompt: 'one' });   // duplicate
    const j3 = enqueue('note-generate', { prompt: 'two' });   // distinct
    expect(j1.id).toBe(j2.id);
    expect(j3.id).not.toBe(j1.id);
    expect(queueSize()).toBe(2);
  });

  it('replays jobs when Ollama comes back online, with no duplicates', async () => {
    pingMock.mockResolvedValue(true);
    const calls: string[] = [];
    registerHandler('note-generate', async (p) => { calls.push((p as { prompt: string }).prompt); });
    enqueue('note-generate', { prompt: 'one' });
    enqueue('note-generate', { prompt: 'one' });  // deduped
    enqueue('note-generate', { prompt: 'two' });
    const res = await drain();
    expect(res.done).toBe(2);
    expect(calls.sort()).toEqual(['one', 'two']);
    expect(queueSize()).toBe(0);
  });

  it('marks jobs failed after repeated handler errors and supports retry/remove', async () => {
    pingMock.mockResolvedValue(true);
    let attempts = 0;
    registerHandler('flaky', async () => { attempts++; throw new Error('boom'); });
    const job = enqueue('flaky', { x: 1 });
    await drain(); await drain(); await drain();
    expect(attempts).toBeGreaterThanOrEqual(3);
    expect(failedSize()).toBe(1);
    // Retry resets attempts; remove drops it from queue.
    retryJob(job.id);
    expect(getQueue().find((j) => j.id === job.id)?.status).toBe('pending');
    removeJob(job.id);
    expect(getQueue()).toHaveLength(0);
  });
});

describe('Notes export', () => {
  it('exports TXT with the selected notes and triggers a download', async () => {
    const parts: string[] = [];
    const OriginalBlob = global.Blob;
    // @ts-expect-error — test stub
    global.Blob = function (chunks: BlobPart[]) { parts.push(chunks.map(String).join('')); return new OriginalBlob(chunks); };
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();

    const notes = [
      { id: 1, title: 'A', content: 'first', color: 'default', pinned: false, archived: false, tags: ['t'], createdAt: 1, updatedAt: 2 },
      { id: 2, title: 'B', content: 'second', color: 'default', pinned: true, archived: false, tags: [], createdAt: 1, updatedAt: 3 },
    ] as Parameters<typeof exportNotesToTxt>[0];

    exportNotesToTxt(notes, 'out.txt');
    const text = parts.join('');
    expect(text).toContain('STICKY NOTES — 2 notes');
    expect(text).toContain('# A');
    expect(text).toContain('# B');
    expect(text).toContain('first');
    expect(text).toContain('second');

    global.Blob = OriginalBlob;
  });

  it('PDF export invokes jsPDF save with the requested filename', async () => {
    const mod = await import('jspdf') as unknown as { __saveSpy: { save: ReturnType<typeof vi.fn> } };
    mod.__saveSpy.save.mockClear();
    exportNotesToPdf(
      [{ id: 1, title: 'A', content: 'body', color: 'default', pinned: false, archived: false, tags: [], createdAt: 1, updatedAt: 2 }],
      'notes.pdf',
    );
    expect(mod.__saveSpy.save).toHaveBeenCalledWith('notes.pdf');
  });

  it('throws on empty export so the UI can show a clear error', () => {
    expect(() => exportNotesToTxt([])).toThrow();
    expect(() => exportNotesToPdf([])).toThrow();
  });

  it('TXT export contains ONLY the selected scope, not unrelated notes', async () => {
    const captured: string[] = [];
    const OriginalBlob = global.Blob;
    // @ts-expect-error — test stub
    global.Blob = function (chunks: BlobPart[]) { captured.push(chunks.map(String).join('')); return new OriginalBlob(chunks); };
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();

    const all = [
      { id: 1, title: 'Mon', content: 'monday-body', color: 'default', pinned: false, archived: false, tags: [], createdAt: 1, updatedAt: 1 },
      { id: 2, title: 'Tue', content: 'tuesday-body', color: 'default', pinned: false, archived: false, tags: [], createdAt: 2, updatedAt: 2 },
      { id: 3, title: 'Wed', content: 'wednesday-body', color: 'default', pinned: false, archived: false, tags: [], createdAt: 3, updatedAt: 3 },
    ] as Parameters<typeof exportNotesToTxt>[0];

    exportNotesToTxt([all[1]], 'tue.txt');
    const singleText = captured.pop() ?? '';
    expect(singleText).toContain('# Tue');
    expect(singleText).toContain('tuesday-body');
    expect(singleText).not.toContain('monday-body');
    expect(singleText).not.toContain('wednesday-body');
    expect(singleText).toContain('STICKY NOTES — 1 note ');

    exportNotesToTxt(all, 'all.txt');
    const allText = captured.pop() ?? '';
    expect(allText).toContain('monday-body');
    expect(allText).toContain('tuesday-body');
    expect(allText).toContain('wednesday-body');
    expect(allText).toContain('STICKY NOTES — 3 notes');

    global.Blob = OriginalBlob;
  });

  it('reports progress 0→100 via the optional callback (for the UI progress bar)', () => {
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    const pcts: number[] = [];
    exportNotesToTxt(
      [
        { id: 1, title: 'A', content: 'a', color: 'default', pinned: false, archived: false, tags: [], createdAt: 1, updatedAt: 1 },
        { id: 2, title: 'B', content: 'b', color: 'default', pinned: false, archived: false, tags: [], createdAt: 2, updatedAt: 2 },
      ] as Parameters<typeof exportNotesToTxt>[0],
      'p.txt',
      (pct) => pcts.push(pct),
    );
    expect(pcts[0]).toBeLessThanOrEqual(10);
    expect(pcts[pcts.length - 1]).toBe(100);
    for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeGreaterThanOrEqual(pcts[i - 1]);
  });

  it('selected-scope export matches in both online and offline Ollama modes', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    const captured: string[] = [];
    const OriginalBlob = global.Blob;
    // @ts-expect-error — test stub
    global.Blob = function (chunks: BlobPart[]) { captured.push(chunks.map(String).join('')); return new OriginalBlob(chunks); };

    const scope = [
      { id: 10, title: 'Selected', content: 'only-this', color: 'default', pinned: false, archived: false, tags: [], createdAt: 1, updatedAt: 1 },
    ] as Parameters<typeof exportNotesToTxt>[0];

    pingMock.mockResolvedValue(true);
    exportNotesToTxt(scope, 'sel-online.txt');
    pingMock.mockResolvedValue(false);
    exportNotesToTxt(scope, 'sel-offline.txt');

    expect(captured).toHaveLength(2);
    // Exports are pure (don't touch Ollama) — content must be identical.
    expect(captured[0]).toBe(captured[1]);
    expect(captured[0]).toContain('only-this');

    global.Blob = OriginalBlob;
  });
});
