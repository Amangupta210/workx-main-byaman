/**
 * Export sticky notes as a clean printable PDF or a plain-text bundle.
 *
 * Both exporters accept an optional `onProgress(pct, label)` callback so the
 * UI can show a progress indicator while many notes are being formatted.
 */
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import type { StickyNote } from '@/lib/notesDb';

export type ExportProgress = (pct: number, label?: string) => void;

export function exportNotesToTxt(
  notes: StickyNote[],
  filename = 'sticky-notes.txt',
  onProgress?: ExportProgress,
) {
  if (!notes.length) throw new Error('No notes to export');
  onProgress?.(5, 'Formatting…');
  const sep = '\n' + '─'.repeat(60) + '\n';
  const parts = notes.map((n, i) => {
    const head = [
      n.title ? `# ${n.title}` : '# (untitled)',
      `Updated: ${format(new Date(n.updatedAt), 'MMM d, yyyy HH:mm')}`,
      n.pinned ? 'Pinned: yes' : null,
      n.archived ? 'Archived: yes' : null,
      n.tags?.length ? `Tags: ${n.tags.map((t) => '#' + t).join(' ')}` : null,
    ].filter(Boolean).join('\n');
    onProgress?.(5 + Math.round(((i + 1) / notes.length) * 85), `Note ${i + 1}/${notes.length}`);
    return `${head}\n\n${n.content || ''}`.trimEnd();
  });
  const body = `STICKY NOTES — ${notes.length} note${notes.length === 1 ? '' : 's'} — ${format(new Date(), 'MMM d, yyyy')}\n${sep}${parts.join(sep)}\n`;
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  onProgress?.(95, 'Saving…');
  triggerDownload(blob, filename);
  onProgress?.(100, 'Done');
}

export function exportNotesToPdf(
  notes: StickyNote[],
  filename = 'sticky-notes.pdf',
  onProgress?: ExportProgress,
) {
  if (!notes.length) throw new Error('No notes to export');
  onProgress?.(2, 'Preparing PDF…');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (need: number) => {
    if (y + need > pageH - margin) { doc.addPage(); y = margin; }
  };

  // Cover
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(40, 30, 60);
  doc.text('STICKY NOTES', margin, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(120, 120, 140);
  doc.text(`${notes.length} note${notes.length === 1 ? '' : 's'} · ${format(new Date(), 'MMM d, yyyy')}`, margin, y + 30);
  doc.setDrawColor(201, 160, 220);
  doc.setLineWidth(1.1);
  doc.line(margin, y + 44, pageW - margin, y + 44);
  y += 70;

  const sorted = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);

  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i];
    ensureSpace(80);

    // Meta line
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(201, 160, 220);
    const meta = [
      format(new Date(n.updatedAt), 'EEE · MMM d, yyyy'),
      n.pinned ? 'PINNED' : null,
      n.archived ? 'ARCHIVED' : null,
    ].filter(Boolean).join('   ·   ').toUpperCase();
    doc.text(meta, margin, y);
    y += 14;

    // Title
    if (n.title) {
      doc.setFont('times', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(30, 30, 40);
      const tl = doc.splitTextToSize(n.title, contentW);
      for (const line of tl) { ensureSpace(22); doc.text(line, margin, y + 4); y += 22; }
    }

    // Body
    if (n.content?.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(45, 45, 55);
      const lines = doc.splitTextToSize(n.content.trim(), contentW);
      const lineH = 15;
      for (const line of lines) { ensureSpace(lineH); doc.text(line, margin, y); y += lineH; }
      y += 4;
    }

    // Tags
    if (n.tags?.length) {
      ensureSpace(16);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(140, 120, 180);
      doc.text(n.tags.map((t) => `#${t}`).join('   '), margin, y);
      y += 14;
    }

    // Divider between notes
    if (i < sorted.length - 1) {
      ensureSpace(20);
      doc.setDrawColor(230, 225, 235);
      doc.setLineWidth(0.5);
      doc.line(margin, y + 4, pageW - margin, y + 4);
      y += 22;
    }
    onProgress?.(5 + Math.round(((i + 1) / sorted.length) * 88), `Note ${i + 1}/${sorted.length}`);
  }

  // Footers
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(170, 170, 180);
    doc.text(`Work X · Sticky Notes  —  page ${p} / ${pages}`, pageW / 2, pageH - 20, { align: 'center' });
  }

  onProgress?.(96, 'Saving…');
  doc.save(filename);
  onProgress?.(100, 'Done');
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
