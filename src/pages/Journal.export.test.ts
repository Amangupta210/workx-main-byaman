/**
 * End-to-end smoke test for Journal PDF export covering:
 *  - Single-day scope
 *  - All-pages scope
 *  - Online and offline Ollama states (export must not depend on Ollama)
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const pingMock = vi.fn(async () => false);
vi.mock('@/lib/ollama', () => ({
  pingOllama: () => pingMock(),
  askAI: vi.fn(async () => ''),
  summarizeNote: vi.fn(async () => ''),
  translateText: vi.fn(async (t: string) => t),
  rewriteText: vi.fn(async (t: string) => t),
  generateStickyNotes: vi.fn(async () => []),
  OllamaError: class extends Error {},
}));

// Stub media loader — exporter handles missing photos gracefully.
vi.mock('@/lib/db', () => ({
  saveMedia: vi.fn(async () => 'm1'),
  loadMedia: vi.fn(async () => null),
}));

vi.mock('jspdf', () => {
  const saveSpy = vi.fn();
  class FakeDoc {
    internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } };
    setFont() {} setFontSize() {} setTextColor() {} setDrawColor() {} setLineWidth() {}
    text() {} line() {} addPage() {} addImage() {} setPage() {}
    splitTextToSize(t: string) { return Array.isArray(t) ? t : [t]; }
    getNumberOfPages() { return 1; }
    save = saveSpy;
  }
  return { jsPDF: FakeDoc, __saveSpy: saveSpy };
});

import { exportEntriesToPdf } from '@/lib/journalPdf';
import type { JournalEntry } from '@/lib/journalDb';

const entry = (over: Partial<JournalEntry>): JournalEntry => ({
  id: 1, date: Date.UTC(2025, 0, 1), dateKey: '2025-01-01', title: 't', content: 'c',
  mood: 'happy', tags: [], photos: [], reflection: '',
  createdAt: 1, updatedAt: 1, ...over,
});

beforeEach(() => { pingMock.mockReset(); });

describe('Journal PDF export', () => {
  it('exports a single day (online)', async () => {
    pingMock.mockResolvedValue(true);
    const mod = await import('jspdf') as unknown as { __saveSpy: ReturnType<typeof vi.fn> };
    mod.__saveSpy.mockClear();
    await exportEntriesToPdf([entry({ id: 1, date: Date.UTC(2025, 0, 1) })], 'day.pdf');
    expect(mod.__saveSpy).toHaveBeenCalledWith('day.pdf');
  });

  it('exports all entries (offline Ollama)', async () => {
    pingMock.mockResolvedValue(false);
    const mod = await import('jspdf') as unknown as { __saveSpy: ReturnType<typeof vi.fn> };
    mod.__saveSpy.mockClear();
    const entries: JournalEntry[] = [
      entry({ id: 1, date: Date.UTC(2025, 0, 1), title: 'one' }),
      entry({ id: 2, date: Date.UTC(2025, 0, 2), title: 'two' }),
      entry({ id: 3, date: Date.UTC(2025, 0, 3), title: 'three' }),
    ];
    await exportEntriesToPdf(entries, 'all.pdf');
    expect(mod.__saveSpy).toHaveBeenCalledWith('all.pdf');
  });

  it('throws on empty selection (UI surfaces a clear error)', async () => {
    await expect(exportEntriesToPdf([])).rejects.toThrow();
  });
});
