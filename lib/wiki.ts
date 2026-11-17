/**
 * Wikipedia search grounding for the local AI.
 *
 * Only used when the AI is online (Ollama reachable AND the browser has
 * network). Everything degrades silently to "no context" when offline so the
 * offline-first flows keep working.
 */

export interface WikiHit {
  title: string;
  snippet: string;
  extract: string;
  url: string;
}

const API = 'https://en.wikipedia.org/w/api.php';

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
}

export function isNetworkOnline(): boolean {
  return typeof navigator === 'undefined' ? false : navigator.onLine !== false;
}

async function getJson(params: Record<string, string>, signal?: AbortSignal) {
  const url = `${API}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  signal?.addEventListener('abort', () => ctrl.abort());
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Search Wikipedia and return the top hits with short extracts. */
export async function searchWiki(
  query: string,
  limit = 3,
  signal?: AbortSignal,
): Promise<WikiHit[]> {
  const q = query.trim();
  if (!q || !isNetworkOnline()) return [];
  try {
    const search = await getJson(
      { action: 'query', list: 'search', srsearch: q, srlimit: String(limit) },
      signal,
    );
    const results: { title: string; snippet: string }[] = search?.query?.search ?? [];
    if (!results.length) return [];

    const titles = results.map((r) => r.title);
    const extracts = await getJson(
      {
        action: 'query',
        prop: 'extracts',
        exintro: '1',
        explaintext: '1',
        redirects: '1',
        titles: titles.join('|'),
      },
      signal,
    );
    const pages: Record<string, { title: string; extract?: string }> =
      extracts?.query?.pages ?? {};
    const byTitle = new Map(
      Object.values(pages).map((p) => [p.title, (p.extract ?? '').slice(0, 1200)]),
    );

    return results.map((r) => ({
      title: r.title,
      snippet: stripHtml(r.snippet ?? ''),
      extract: byTitle.get(r.title) ?? '',
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
    }));
  } catch {
    return [];
  }
}

/** Format hits as a compact grounding block for the local model. */
export function formatWikiContext(hits: WikiHit[]): string {
  if (!hits.length) return '';
  const body = hits
    .map(
      (h, i) =>
        `[${i + 1}] ${h.title} — ${h.url}\n${(h.extract || h.snippet).replace(/\s+/g, ' ').trim()}`,
    )
    .join('\n\n');
  return `Wikipedia reference material (retrieved just now — use it for facts, cite sources as [1], [2] when you rely on them):\n\n${body}`;
}
