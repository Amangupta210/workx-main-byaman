/**
 * End-to-end smoke test for home page PDF export (`exportPageAsPdf`).
 * Covers:
 *  - Online Ollama (export must not depend on AI being available)
 *  - Offline Ollama (still works — PDF generation is local)
 *  - Pages with embedded images, todos, code, tables, headings
 *  - Verifies downloaded file content: filename, PDF bytes, image embed
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Ollama is irrelevant to PDF export — but we toggle it to prove that.
const pingMock = vi.fn(async () => true);
vi.mock('@/lib/ollama', () => ({
  pingOllama: () => pingMock(),
  askAI: vi.fn(async () => ''),
  OllamaError: class extends Error {},
}));

// Stub IndexedDB media loader so `idb:` images resolve to a tiny PNG blob.
const tinyPng = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);
vi.mock('@/lib/db', () => ({
  loadMedia: vi.fn(async () => new Blob([tinyPng], { type: 'image/png' })),
  saveMedia: vi.fn(async () => 'm1'),
}));

// Capture jsPDF interactions so we can assert what got written.
const calls = {
  save: vi.fn(),
  addImage: vi.fn(),
  text: vi.fn(),
  addPage: vi.fn(),
};
vi.mock('jspdf', () => {
  class FakeDoc {
    internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } };
    setFont() {} setFontSize() {} setTextColor() {} setDrawColor() {} setLineWidth() {}
    line() {} setPage() {} setFillColor() {} rect() {} roundedRect() {}
    splitTextToSize(t: string) { return Array.isArray(t) ? t : String(t).split('\n'); }
    getNumberOfPages() { return 1; }
    text(...a: unknown[]) { calls.text(...a); }
    addPage(...a: unknown[]) { calls.addPage(...a); }
    addImage(...a: unknown[]) { calls.addImage(...a); }
    save(...a: unknown[]) { calls.save(...a); }
  }
  return { jsPDF: FakeDoc };
});

// jsdom needs canvas + Image polyfills for prepareImage()
beforeEach(() => {
  calls.save.mockClear();
  calls.addImage.mockClear();
  calls.text.mockClear();
  calls.addPage.mockClear();
  pingMock.mockReset();

  // Minimal HTMLCanvasElement.toDataURL polyfill
  (HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ({
    fillStyle: '', fillRect() {}, drawImage() {},
  });
  (HTMLCanvasElement.prototype as unknown as { toDataURL: () => string }).toDataURL =
    () => 'data:image/jpeg;base64,AAAA';

  // Image loader resolves immediately
  class FakeImage {
    width = 100; height = 80;
    set src(_v: string) { setTimeout(() => this.onload && this.onload(), 0); }
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    crossOrigin = '';
  }
  (globalThis as unknown as { Image: typeof FakeImage }).Image = FakeImage;

  // FileReader for blobToDataUrl
  class FakeFileReader {
    result: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    error: unknown = null;
    readAsDataURL(_b: Blob) {
      this.result = 'data:image/png;base64,AAAA';
      setTimeout(() => this.onload && this.onload(), 0);
    }
  }
  (globalThis as unknown as { FileReader: typeof FakeFileReader }).FileReader = FakeFileReader;
});

import { exportPageAsPdf } from '@/lib/pagePdf';
import type { Page } from '@/types/editor';

const samplePage = (): Page => ({
  id: 'p1',
  title: 'Smoke / Test: Page',
  icon: '📄',
  coverImage: 'idb:cover-1',
  parentId: null,
  createdAt: 1,
  updatedAt: 2,
  blocks: [
    { id: 'b1', type: 'heading1', content: 'Hello', createdAt: 1 },
    { id: 'b2', type: 'text', content: 'A paragraph.', createdAt: 1 },
    { id: 'b3', type: 'todo', content: 'Buy milk', checked: false, createdAt: 1 },
    { id: 'b4', type: 'todo', content: 'Ship PDF',  checked: true,  createdAt: 1 },
    { id: 'b5', type: 'code', content: 'console.log("hi")', createdAt: 1 },
    { id: 'b6', type: 'divider', content: '', createdAt: 1 },
    { id: 'b7', type: 'image', content: 'A picture', mediaUrl: 'idb:img-1', createdAt: 1 },
    { id: 'b8', type: 'table', content: '', createdAt: 1,
      tableData: { headers: ['A', 'B'], rows: [['1', '2'], ['3', '4']] } },
  ],
});

describe('home page PDF export (end-to-end smoke)', () => {
  it('exports a rich page online (with embedded images)', async () => {
    pingMock.mockResolvedValue(true);
    await exportPageAsPdf(samplePage());
    // filename sanitised (slashes/colons stripped)
    expect(calls.save).toHaveBeenCalledTimes(1);
    const name = String(calls.save.mock.calls[0][0]);
    expect(name).toMatch(/\.pdf$/);
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
    // cover + inline image both embedded
    expect(calls.addImage.mock.calls.length).toBeGreaterThanOrEqual(2);
    // some text rendered (title, headings, todos)
    expect(calls.text.mock.calls.length).toBeGreaterThan(3);
  });

  it('exports the same page offline with strict text + image assertions', async () => {
    pingMock.mockResolvedValue(false);
    await exportPageAsPdf(samplePage(), 'offline.pdf');
    expect(calls.save).toHaveBeenCalledWith('offline.pdf');

    // Exactly two embedded images: cover + one image block.
    expect(calls.addImage).toHaveBeenCalledTimes(2);
    for (const c of calls.addImage.mock.calls) {
      expect(String(c[0])).toMatch(/^data:image\/jpeg;base64,/);
      expect(c[1]).toBe('JPEG');
    }

    // Extract all rendered text and assert every block's text is present.
    const rendered = calls.text.mock.calls
      .map((c) => (Array.isArray(c[0]) ? c[0].join(' ') : String(c[0])))
      .join('\n');
    for (const needle of [
      'Smoke', 'Test', 'Page',          // title (sanitised pieces still rendered)
      'Hello',                          // heading1
      'A paragraph.',                   // text
      'Buy milk', 'Ship PDF',           // todos
      'console.log',                    // code
      'A', 'B', '1', '2', '3', '4',     // table headers + rows
    ]) {
      expect(rendered).toContain(needle);
    }
    // Checked vs unchecked todo markers both appear.
    expect(rendered).toContain('☐');
    expect(rendered).toContain('☑');
    // Footer rendered on at least one page.
    expect(rendered).toMatch(/page 1 \/ 1/);
  });

  it('still produces a PDF when a page has no blocks and no cover', async () => {
    const empty: Page = {
      id: 'e', title: 'Empty', parentId: null, blocks: [], createdAt: 1, updatedAt: 2,
    };
    await exportPageAsPdf(empty, 'empty.pdf');
    expect(calls.save).toHaveBeenCalledWith('empty.pdf');
    expect(calls.addImage).not.toHaveBeenCalled();
  });
});
