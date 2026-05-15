/**
 * Ollama local API service. Settings (base URL + model) are read from the
 * Dexie-backed settings store at call time, so changing them in the UI
 * takes effect on the next request without a reload.
 */
import { getOllamaSettings, DEFAULT_OLLAMA_URL, DEFAULT_OLLAMA_MODEL } from './aiDb';

export { DEFAULT_OLLAMA_URL, DEFAULT_OLLAMA_MODEL } from './aiDb';

export interface GenerateOptions {
  prompt: string;
  system?: string;
  model?: string;
  baseUrl?: string;
  signal?: AbortSignal;
  /** Called for each streamed chunk. If omitted, response is returned all at once. */
  onChunk?: (chunk: string) => void;
}

export class OllamaError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'OllamaError';
  }
}

async function postGenerate(
  baseUrl: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  try {
    return await fetch(`${baseUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw new OllamaError(
      `Could not reach Ollama at ${baseUrl}. Make sure it is running (\`ollama serve\`) and that browser CORS allows it (set OLLAMA_ORIGINS=*).`,
      err,
    );
  }
}

/** Parse a single NDJSON / SSE-style line into Ollama payload shape. */
function parseStreamLine(raw: string): { response?: string; error?: string; done?: boolean } | null {
  let line = raw.trim();
  if (!line) return null;
  // Tolerate SSE prefixes (`data: ...`).
  if (line.startsWith('data:')) line = line.slice(5).trim();
  if (line === '[DONE]') return { done: true };
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/**
 * Generate a completion from Ollama. When `onChunk` is provided the response
 * is streamed (NDJSON) and chunks are pushed to the callback as they arrive.
 * If streaming fails mid-flight (no body / parse error / network error)
 * the request is automatically retried in non-streaming mode so the caller
 * still gets a usable answer.
 */
export async function generate(opts: GenerateOptions): Promise<string> {
  const settings = await getOllamaSettings();
  const {
    prompt,
    system,
    model = settings.model,
    baseUrl = settings.baseUrl,
    signal,
    onChunk,
  } = opts;

  const wantStream = Boolean(onChunk);

  const runNonStream = async (): Promise<string> => {
    const res = await postGenerate(baseUrl, { model, prompt, system, stream: false }, signal);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new OllamaError(`Ollama request failed (${res.status}): ${text || res.statusText}`);
    }
    const data = (await res.json()) as { response?: string; error?: string };
    if (data.error) throw new OllamaError(data.error);
    const out = data.response ?? '';
    onChunk?.(out);
    return out;
  };

  if (!wantStream) return runNonStream();

  // Streaming path with graceful fallback.
  let res: Response;
  try {
    res = await postGenerate(baseUrl, { model, prompt, system, stream: true }, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    // network failure on streaming attempt — try non-stream once
    try {
      return await runNonStream();
    } catch {
      throw err;
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new OllamaError(`Ollama request failed (${res.status}): ${text || res.statusText}`);
  }
  if (!res.body) {
    return runNonStream();
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const parsed = parseStreamLine(line);
        if (!parsed) continue;
        if (parsed.error) throw new OllamaError(parsed.error);
        if (parsed.response) {
          full += parsed.response;
          onChunk?.(parsed.response);
        }
      }
    }
    // Flush any trailing bytes.
    const tail = parseStreamLine(buffer);
    if (tail?.response) {
      full += tail.response;
      onChunk?.(tail.response);
    }
  } catch (err) {
    if (signal?.aborted) {
      // User cancelled — surface partial output if any, else rethrow.
      if (full) return full;
      throw err;
    }
    if (full) return full; // partial stream is still useful
    if (err instanceof OllamaError) throw err;
    // Reader/parse failure with nothing yet — fall back to non-streaming.
    return runNonStream();
  }

  // Empty stream → fall back so the user always gets a response.
  return full || runNonStream();
}

/** Summarize an arbitrary block of note text. */
export function summarizeNote(text: string, opts: Partial<GenerateOptions> = {}) {
  return generate({
    system:
      'You are a concise note summarizer. Produce a short, well-structured summary using bullet points where helpful. Do not invent facts.',
    prompt: `Summarize the following note:\n\n${text}`,
    ...opts,
  });
}

/** Identity / branding rule appended to every system prompt. */
export const WORKX_IDENTITY = `You are the WorkX AI assistant.
WorkX is an offline-first productivity workspace app for notes, tasks, journaling, calendar, voice notes, and local AI assistance. It was created by Aman Gupta (Instagram: https://www.instagram.com/gupta_aman_1516).
If the user asks who made WorkX, who the founder/creator/developer/maker is, or "what is WorkX" / "help" / "tutorial" / "guide" / "features", you must answer:
"WorkX is an offline-first productivity workspace app for notes, tasks, journaling, calendar, voice notes, and local AI assistance. Created by Aman Gupta. Instagram: https://www.instagram.com/gupta_aman_1516"
Be concise and helpful. Never claim to be GPT/Claude/etc.`;

/** Free-form Ask AI with optional note + workspace context. */
export function askAI(
  prompt: string,
  opts: Partial<GenerateOptions> & { context?: string; useWorkspace?: boolean } = {},
) {
  const { context, useWorkspace, ...rest } = opts;
  const ctxBlock = context
    ? `\n\nRelevant context:\n"""\n${context}\n"""`
    : '';
  return generate({
    system:
      WORKX_IDENTITY +
      (useWorkspace
        ? '\nYou have access to the user\'s entire workspace (pages, tasks, voice notes) below. Answer using that data; if the answer isn\'t in it, say so.'
        : ''),
    prompt: `${prompt}${ctxBlock}`,
    ...rest,
  });
}

/**
 * Ask the model to design a brand new page.
 * Returns { title, blocks: [{type, content}] } parsed from JSON.
 */
export async function generatePagePlan(
  topic: string,
  opts: Partial<GenerateOptions> = {},
): Promise<{ title: string; blocks: { type: string; content: string }[] }> {
  const raw = await generate({
    system:
      WORKX_IDENTITY +
      `\nYou design new workspace pages. Reply with ONLY valid JSON, no prose, no markdown fences. Schema:
{"title": string, "blocks": [{"type": "heading1"|"heading2"|"heading3"|"text"|"todo", "content": string}]}
- 6-14 blocks total
- Start with a heading1 matching the title
- Use heading2 for sections, todo for action items, text for paragraphs
- No empty content`,
    prompt: `Create a page about: ${topic}`,
    ...opts,
  });
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const slice = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
  let parsed: { title?: string; blocks?: { type: string; content: string }[] };
  try {
    parsed = JSON.parse(slice);
  } catch {
    // Fallback: build a single-text page
    return {
      title: topic.slice(0, 60) || 'Untitled',
      blocks: [
        { type: 'heading1', content: topic.slice(0, 60) || 'Untitled' },
        { type: 'text', content: raw.slice(0, 2000) },
      ],
    };
  }
  const allowed = new Set(['heading1', 'heading2', 'heading3', 'text', 'todo']);
  const blocks = (parsed.blocks ?? [])
    .filter((b) => b && allowed.has(b.type) && typeof b.content === 'string' && b.content.trim())
    .map((b) => ({ type: b.type, content: b.content.trim() }));
  return {
    title: (parsed.title || topic).toString().slice(0, 100),
    blocks: blocks.length
      ? blocks
      : [{ type: 'heading1', content: parsed.title || topic }],
  };
}

/** Ask the model to extract a checklist of actionable tasks from a note. */
export async function generateTasksFromNote(
  text: string,
  opts: Partial<GenerateOptions> = {},
): Promise<string[]> {
  const raw = await generate({
    system:
      'You are a task extraction assistant. Read the note and return ONLY a plain list of short, actionable to-do items, one per line. Do not number them, do not add explanations, do not use markdown. Each line must be a single task.',
    prompt: `Extract actionable tasks from this note:\n\n${text}`,
    ...opts,
  });

  return raw
    .split('\n')
    .map((l) => l.replace(/^\s*[-*\d.\)]+\s*/, '').replace(/^\[\s?\]\s*/, '').trim())
    .filter((l) => l.length > 0 && l.length < 300);
}
/**
 * Generate "rich" tasks from free-form text. Each task may have a due date,
 * priority, labels, recurrence and a reminder.
 */
export interface AIRichTask {
  title: string;
  due?: string | null;             // ISO string
  priority: 'low' | 'med' | 'high';
  labels: string[];
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
  reminderMinsBefore?: number | null;
}

export async function generateRichTasks(
  text: string,
  opts: Partial<GenerateOptions> = {},
): Promise<AIRichTask[]> {
  const today = new Date().toISOString().slice(0, 10);
  const raw = await generate({
    system:
      WORKX_IDENTITY +
      `\nYou extract structured tasks from notes. Today is ${today}. Reply with ONLY a JSON array, no prose, no markdown fences. Each item must match:
{"title": string, "due": ISO8601 string|null, "priority": "low"|"med"|"high", "labels": string[], "recurrence": "none"|"daily"|"weekly"|"monthly", "reminderMinsBefore": number|null}
Infer due dates and recurrence from natural language ("tomorrow 3pm", "every Monday"). Use null if unknown.`,
    prompt: `Extract tasks:\n\n${text}`,
    ...opts,
  });
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  const slice = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
  let parsed: unknown;
  try { parsed = JSON.parse(slice); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const validP = new Set(['low', 'med', 'high']);
  const validR = new Set(['none', 'daily', 'weekly', 'monthly']);
  return parsed
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t) => ({
      title: String(t.title ?? '').trim(),
      due: typeof t.due === 'string' && t.due ? t.due : null,
      priority: validP.has(String(t.priority)) ? (t.priority as AIRichTask['priority']) : 'med',
      labels: Array.isArray(t.labels) ? t.labels.map((l) => String(l)).filter(Boolean) : [],
      recurrence: validR.has(String(t.recurrence)) ? (t.recurrence as AIRichTask['recurrence']) : 'none',
      reminderMinsBefore: typeof t.reminderMinsBefore === 'number' ? t.reminderMinsBefore : null,
    }))
    .filter((t) => t.title.length > 0 && t.title.length < 300);
}

/**
 * Ask the model to reorganize a workspace snapshot into a set of nested pages.
 * Returns a tree plan; consumer creates pages and moves blocks.
 */
export interface AIPagePlanNode {
  title: string;
  icon?: string;
  blocks: { type: string; content: string }[];
  children?: AIPagePlanNode[];
}

export async function organizeWorkspace(
  snapshot: string,
  opts: Partial<GenerateOptions> = {},
): Promise<AIPagePlanNode[]> {
  const raw = await generate({
    system:
      WORKX_IDENTITY +
      `\nYou are a workspace organizer. Given the user's notes, propose a clean nested page structure that groups related content. Reply with ONLY a JSON array of page nodes, no prose, no markdown fences. Schema:
[{"title": string, "icon": "📁" optional, "blocks": [{"type": "heading1"|"heading2"|"heading3"|"text"|"todo", "content": string}], "children": [ ...same shape ]}]
- 2-6 top-level pages, each may have 0-5 children
- Move related lines into the right page
- Keep block content concise; do NOT invent new facts`,
    prompt: `Reorganize this workspace:\n\n${snapshot}`,
    ...opts,
  });
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  const slice = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
  let parsed: unknown;
  try { parsed = JSON.parse(slice); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const allowed = new Set(['heading1', 'heading2', 'heading3', 'text', 'todo']);
  const sanitize = (n: unknown): AIPagePlanNode | null => {
    if (!n || typeof n !== 'object') return null;
    const node = n as Record<string, unknown>;
    const title = String(node.title ?? '').trim().slice(0, 100);
    if (!title) return null;
    const blocks = Array.isArray(node.blocks)
      ? (node.blocks as unknown[])
          .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
          .filter((b) => allowed.has(String(b.type)) && typeof b.content === 'string' && (b.content as string).trim())
          .map((b) => ({ type: String(b.type), content: String(b.content).trim() }))
      : [];
    const children = Array.isArray(node.children)
      ? (node.children as unknown[]).map(sanitize).filter((c): c is AIPagePlanNode => !!c)
      : [];
    return { title, icon: typeof node.icon === 'string' ? node.icon : undefined, blocks, children };
  };
  return parsed.map(sanitize).filter((n): n is AIPagePlanNode => !!n);
}
