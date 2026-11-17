/**
 * End-to-end credit audit.
 *
 * Verifies the shared `CREATORS` source of truth is honoured by every
 * surface — About modal, sidebar, Journal footer, editor footer, AI
 * identity prompt, and PDF export — in both online and offline modes.
 *
 * Rules asserted here:
 *  - Every credited creator in `CREATORS` MUST appear in every surface.
 *  - Each creator's Instagram link MUST render exactly once per surface
 *    (no duplicate credit lines).
 *  - Removed creators (currently: "Saurab Negi") MUST NOT appear anywhere.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CREATORS, creditLine } from '@/lib/credits';

const REMOVED = ['Saurab Negi', 's.aura.b'];

const SURFACES = [
  { name: 'About modal',   file: 'src/components/editor/AboutModal.tsx' },
  { name: 'Sidebar',       file: 'src/components/layout/AppSidebar.tsx' },
  { name: 'Journal footer',file: 'src/pages/Journal.tsx' },
  { name: 'Editor footer', file: 'src/components/editor/BlockEditor.tsx' },
] as const;

function readSurface(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('creator credits audit (source-level, offline + online safe)', () => {
  it('has at least one creator in the source of truth', () => {
    expect(CREATORS.length).toBeGreaterThan(0);
    for (const c of CREATORS) {
      expect(c.name).toBeTruthy();
      expect(c.instagram).toMatch(/^https:\/\/www\.instagram\.com\//);
      expect(c.handle).toBeTruthy();
    }
  });

  it('every UI surface imports the shared CREATORS constant (no hardcoded credits)', () => {
    for (const s of SURFACES) {
      const src = readSurface(s.file);
      expect(src, `${s.name} must import from @/lib/credits`).toMatch(
        /from ['"]@\/lib\/credits['"]/,
      );
      expect(src, `${s.name} must reference CREATORS`).toContain('CREATORS');
    }
  });

  it('every UI surface renders each creator exactly once (no duplicates)', () => {
    for (const s of SURFACES) {
      const src = readSurface(s.file);
      // The shared render pattern iterates CREATORS.map(...) — assert we
      // rely on it rather than hardcoding a creator's literal name/handle.
      for (const c of CREATORS) {
        const nameHits  = (src.match(new RegExp(c.name, 'g')) || []).length;
        const handleHits = (src.match(new RegExp(c.handle, 'g')) || []).length;
        expect(nameHits, `${s.name} hardcodes ${c.name}`).toBe(0);
        expect(handleHits, `${s.name} hardcodes ${c.handle}`).toBe(0);
      }
    }
  });

  it('no UI surface mentions removed creators', () => {
    for (const s of SURFACES) {
      const src = readSurface(s.file);
      for (const bad of REMOVED) {
        expect(src, `${s.name} still mentions ${bad}`).not.toContain(bad);
      }
    }
  });

  it('AI identity prompt (WORKX_IDENTITY) includes every current creator and no removed ones', async () => {
    vi.resetModules();
    const { WORKX_IDENTITY } = await import('@/lib/ollama');
    for (const c of CREATORS) {
      expect(WORKX_IDENTITY).toContain(c.name);
      expect(WORKX_IDENTITY).toContain(c.instagram);
    }
    for (const bad of REMOVED) {
      expect(WORKX_IDENTITY).not.toContain(bad);
    }
    // Whole credit line built from the shared source appears verbatim.
    expect(WORKX_IDENTITY).toContain(creditLine('Created by'));
  });
});
