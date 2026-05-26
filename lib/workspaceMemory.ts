/**
 * Workspace memory — aggregates all locally stored data for AI context.
 */
import { loadAllPages } from './db';
import { aiDb } from './aiDb';
import type { Page } from '@/types/editor';

export interface WorkspaceSnapshot {
  pages: Page[];
  totalTodos: number;
  openTodos: number;
  voiceCount: number;
  summaryCount: number;
}

function pageToText(p: Page): string {
  const body = p.blocks
    .filter((b) => b.type !== 'divider' && b.content)
    .map((b) => {
      if (b.type === 'todo') return `- [${b.checked ? 'x' : ' '}] ${b.content}`;
      if (b.type.startsWith('heading')) return `## ${b.content}`;
      return b.content;
    })
    .join('\n');
  return `### Page: ${p.title || 'Untitled'} (id:${p.id.slice(0, 8)}, updated:${new Date(
    p.updatedAt,
  ).toISOString().slice(0, 10)})\n${body}`;
}

export async function getWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const pages = await loadAllPages();
  const transcripts = await aiDb.voiceTranscripts.toArray();
  const summaries = await aiDb.summaries.toArray();
  let total = 0;
  let open = 0;
  for (const p of pages) {
    for (const b of p.blocks) {
      if (b.type === 'todo') {
        total++;
        if (!b.checked) open++;
      }
    }
  }
  return {
    pages,
    totalTodos: total,
    openTodos: open,
    voiceCount: transcripts.length,
    summaryCount: summaries.length,
  };
}

/** Build a compact context string from the entire workspace. */
export async function buildWorkspaceContext(maxChars = 12000): Promise<string> {
  const snap = await getWorkspaceSnapshot();
  const transcripts = await aiDb.voiceTranscripts
    .orderBy('createdAt')
    .reverse()
    .limit(20)
    .toArray();

  const sortedPages = snap.pages
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const parts: string[] = [];
  parts.push(
    `# Workspace summary\nPages: ${snap.pages.length} | Todos: ${snap.openTodos} open / ${snap.totalTodos} total | Voice notes: ${snap.voiceCount}`,
  );

  if (transcripts.length) {
    parts.push(
      `\n## Recent voice transcripts\n` +
        transcripts
          .slice(0, 5)
          .map(
            (t) =>
              `- (${new Date(t.createdAt).toISOString().slice(0, 10)}) ${t.text.slice(0, 280)}`,
          )
          .join('\n'),
    );
  }

  for (const p of sortedPages) {
    const chunk = pageToText(p);
    const joined = parts.join('\n\n');
    if (joined.length + chunk.length > maxChars) break;
    parts.push(chunk);
  }

  return parts.join('\n\n');
}
