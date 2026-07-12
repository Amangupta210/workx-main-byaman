/**
 * Single source of truth for creator credits.
 * Every UI surface (About modal, sidebar, Journal footer, editor footer)
 * and every export (PDF, TXT, AI identity) MUST read from here so credits
 * stay consistent everywhere.
 */
export interface Creator {
  name: string;
  instagram: string; // full https URL
  handle: string;    // @-less handle
}

export const CREATORS: readonly Creator[] = [
  {
    name: 'Aman Gupta',
    instagram: 'https://www.instagram.com/gupta_aman_1516',
    handle: 'gupta_aman_1516',
  },
] as const;

/** Plain-text credit line, safe for PDFs, TXT exports and AI prompts. */
export function creditLine(prefix = 'Made by'): string {
  const names = CREATORS.map(c => `${c.name} (Instagram: ${c.instagram})`).join(' & ');
  return `${prefix} ${names}`;
}

/** Just the names, joined. */
export function creditNames(): string {
  return CREATORS.map(c => c.name).join(' & ');
}
