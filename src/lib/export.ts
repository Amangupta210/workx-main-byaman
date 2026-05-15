import type { Page, Block } from '@/types/editor';

function blockToMarkdown(block: Block): string {
  // Strip HTML tags with inline-formatting preserved as Markdown
  const toMd = (html: string) =>
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i>(.*?)<\/i>/gi, '*$1*')
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      .replace(/<[^>]*>/g, '');

  const text = toMd(block.content);

  switch (block.type) {
    case 'heading1': return `# ${text}`;
    case 'heading2': return `## ${text}`;
    case 'heading3': return `### ${text}`;
    case 'todo':     return `- [${block.checked ? 'x' : ' '}] ${text}`;
    case 'code':     return '```\n' + block.content + '\n```';
    case 'divider':  return '---';
    case 'image':    return block.mediaUrl ? `![image](${block.mediaUrl})` : '';
    case 'video':    return block.mediaUrl ? `[Video](${block.mediaUrl})` : '';
    // BUG FIXED: audio blocks fell through to `default` which returned an empty
    // string (audio blocks have no text content, so stripping HTML gave "").
    // Now they export as a labelled placeholder so the export isn't silent.
    case 'audio':    return block.mediaUrl ? `[Audio](${block.mediaUrl})` : '';
    // BUG FIXED: table blocks had no case at all, so tables were silently
    // dropped from every Markdown export.  Now we render them as a standard
    // GFM table (pipe-separated headers + separator row + data rows).
    case 'table': {
      const td = block.tableData;
      if (!td || td.headers.length === 0) return '';
      const header    = '| ' + td.headers.join(' | ') + ' |';
      const separator = '| ' + td.headers.map(() => '---').join(' | ') + ' |';
      const rows      = td.rows.map(r => '| ' + r.join(' | ') + ' |');
      return [header, separator, ...rows].join('\n');
    }
    default: return text;
  }
}

export function pageToMarkdown(page: Page): string {
  const lines: string[] = [`# ${page.title || 'Untitled'}`, ''];
  for (const block of page.blocks) {
    const md = blockToMarkdown(block);
    if (md) {
      lines.push(md);
      lines.push('');
    }
  }
  return lines.join('\n');
}

export function exportPageAsMarkdown(page: Page) {
  const md   = pageToMarkdown(page);
  const blob = new Blob([md], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  // BUG FIXED: filename could contain characters invalid in file systems
  // (e.g. slashes, colons) if the page title had them.  Sanitise first.
  a.download = `${(page.title || 'untitled').replace(/[/\\:*?"<>|]/g, '-')}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
