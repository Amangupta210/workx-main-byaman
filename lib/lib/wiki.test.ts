import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchWiki, formatWikiContext, isNetworkOnline } from './wiki';

const searchPayload = {
  query: {
    search: [
      { title: 'Pomodoro Technique', snippet: 'A <span>time</span> management method' },
      { title: 'Deep work', snippet: 'Focused work' },
    ],
  },
};
const extractPayload = {
  query: {
    pages: {
      '1': { title: 'Pomodoro Technique', extract: 'The Pomodoro Technique uses 25-minute intervals.' },
      '2': { title: 'Deep work', extract: 'Deep work is distraction-free concentration.' },
    },
  },
};

function mockFetch(sequence: unknown[]) {
  let i = 0;
  const fn = vi.fn(async () => ({ ok: true, json: async () => sequence[i++] }));
  (globalThis as any).fetch = fn;
  return fn;
}

describe('wiki search grounding', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      configurable: true,
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('reports network status', () => {
    expect(isNetworkOnline()).toBe(true);
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
    expect(isNetworkOnline()).toBe(false);
  });

  it('returns hits with extracts and urls when online', async () => {
    const fetchMock = mockFetch([searchPayload, extractPayload]);
    const hits = await searchWiki('pomodoro', 2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(hits).toHaveLength(2);
    expect(hits[0].title).toBe('Pomodoro Technique');
    expect(hits[0].snippet).toBe('A time management method'); // html stripped
    expect(hits[0].extract).toContain('25-minute');
    expect(hits[0].url).toBe('https://en.wikipedia.org/wiki/Pomodoro_Technique');
  });

  it('makes no network calls when offline', async () => {
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
    const fetchMock = mockFetch([searchPayload, extractPayload]);
    expect(await searchWiki('pomodoro')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('degrades to no context on API failure', async () => {
    (globalThis as any).fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    expect(await searchWiki('pomodoro')).toEqual([]);
  });

  it('ignores empty queries', async () => {
    const fetchMock = mockFetch([searchPayload]);
    expect(await searchWiki('   ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('formats a citable context block', async () => {
    mockFetch([searchPayload, extractPayload]);
    const ctx = formatWikiContext(await searchWiki('pomodoro', 2));
    expect(ctx).toContain('[1] Pomodoro Technique');
    expect(ctx).toContain('[2] Deep work');
    expect(ctx).toContain('en.wikipedia.org/wiki/Deep_work');
    expect(formatWikiContext([])).toBe('');
  });
});
