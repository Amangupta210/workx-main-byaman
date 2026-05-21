/**
 * Clean PDF export for journal entries.
 * Renders a minimal printable template with photos at high quality.
 */
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { loadMedia } from '@/lib/db';
import { moodMeta, type JournalEntry } from '@/lib/journalDb';

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Re-encode an image so its longest edge fits maxPx while keeping good quality.
 * Keeps PDF size reasonable while staying crisp on print.
 */
async function prepareImage(blob: Blob, maxPx = 1600): Promise<{ data: string; w: number; h: number; fmt: 'JPEG' | 'PNG' }> {
  const url = await blobToDataUrl(blob);
  const img = await loadImage(url);
  const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const data = canvas.toDataURL('image/jpeg', 0.92);
  return { data, w, h, fmt: 'JPEG' };
}

export async function exportEntriesToPdf(entries: JournalEntry[], filename = 'work-x-days.pdf') {
  if (!entries.length) throw new Error('No entries to export');
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
  doc.setFontSize(28);
  doc.setTextColor(40, 30, 60);
  doc.text('WORK X · DAYS', margin, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(120, 120, 140);
  doc.text(`Private journal export · ${format(new Date(), 'MMM d, yyyy')}`, margin, y + 32);
  doc.text(`${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`, margin, y + 48);
  doc.setDrawColor(201, 160, 220);
  doc.setLineWidth(1.2);
  doc.line(margin, y + 60, pageW - margin, y + 60);
  y += 84;

  const sorted = [...entries].sort((a, b) => a.date - b.date);

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (i > 0) { doc.addPage(); y = margin; }

    // Date header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(201, 160, 220);
    doc.text(format(new Date(e.date), 'EEEE · MMM d, yyyy').toUpperCase(), margin, y);
    y += 16;

    // Title
    if (e.title) {
      doc.setFont('times', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(30, 30, 40);
      const titleLines = doc.splitTextToSize(e.title, contentW);
      doc.text(titleLines, margin, y + 6);
      y += titleLines.length * 24 + 6;
    }

    // Mood pill
    const m = moodMeta(e.mood);
    if (m) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(90, 90, 110);
      doc.text(`${m.emoji}  ${m.label}`, margin, y + 6);
      y += 18;
    }

    // Divider
    doc.setDrawColor(230, 225, 235);
    doc.setLineWidth(0.6);
    doc.line(margin, y, pageW - margin, y);
    y += 16;

    // Body
    if (e.content?.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(45, 45, 55);
      const lines = doc.splitTextToSize(e.content.trim(), contentW);
      const lineH = 15;
      for (const line of lines) {
        ensureSpace(lineH);
        doc.text(line, margin, y);
        y += lineH;
      }
      y += 8;
    }

    // Reflection
    if (e.reflection?.trim()) {
      ensureSpace(40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(120, 100, 160);
      doc.text('REFLECTION', margin, y);
      y += 14;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(11);
      doc.setTextColor(60, 60, 80);
      const rl = doc.splitTextToSize(e.reflection.trim(), contentW);
      for (const line of rl) { ensureSpace(15); doc.text(line, margin, y); y += 15; }
      y += 8;
    }

    // Tags
    if (e.tags?.length) {
      ensureSpace(18);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(140, 120, 180);
      doc.text(e.tags.map((t) => `#${t}`).join('   '), margin, y);
      y += 18;
    }

    // Photos
    if (e.photos?.length) {
      ensureSpace(40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(120, 100, 160);
      doc.text('PHOTOS', margin, y);
      y += 14;

      const gap = 8;
      const cols = 2;
      const cellW = (contentW - gap * (cols - 1)) / cols;
      let col = 0;
      let rowStartY = y;
      let rowMaxH = 0;

      for (const id of e.photos) {
        try {
          const blob = await loadMedia(id);
          if (!blob) continue;
          const prep = await prepareImage(blob, 1600);
          const ratio = prep.h / prep.w;
          const drawW = cellW;
          const drawH = Math.min(cellW * ratio, 280);
          const finalW = drawH === 280 ? drawH / ratio : drawW;
          const x = margin + col * (cellW + gap) + (cellW - finalW) / 2;

          if (rowStartY + drawH > pageH - margin) {
            doc.addPage();
            y = margin;
            rowStartY = y;
            rowMaxH = 0;
            col = 0;
          }

          doc.addImage(prep.data, prep.fmt, x, rowStartY, finalW, drawH, undefined, 'FAST');
          rowMaxH = Math.max(rowMaxH, drawH);
          col++;
          if (col >= cols) {
            col = 0;
            rowStartY += rowMaxH + gap;
            y = rowStartY;
            rowMaxH = 0;
          }
        } catch {
          // skip broken image
        }
      }
      if (col !== 0) { y = rowStartY + rowMaxH + gap; }
    }

    // Footer page number
    const pageNum = doc.getNumberOfPages();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(170, 170, 180);
    doc.text(`Work X · Days  —  page ${pageNum}`, pageW / 2, pageH - 20, { align: 'center' });
  }

  doc.save(filename);
}
