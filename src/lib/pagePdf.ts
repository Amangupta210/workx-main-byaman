/**
 * High-quality PDF export for an editor Page, including embedded images.
 * Renders a clean printable template with cover, body blocks, todos, code,
 * tables, and inline images (loaded from IndexedDB when stored as `idb:<id>`,
 * or fetched/decoded for http/data/blob URLs).
 */
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import type { Page, Block } from '@/types/editor';
import { loadMedia } from '@/lib/db';

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function prepareImage(src: string, maxPx = 1600): Promise<{ data: string; w: number; h: number } | null> {
  try {
    let dataUrl = src;
    if (src.startsWith('idb:')) {
      const blob = await loadMedia(src.slice(4));
      if (!blob) return null;
      dataUrl = await blobToDataUrl(blob);
    } else if (src.startsWith('blob:') || src.startsWith('http')) {
      const res = await fetch(src);
      const blob = await res.blob();
      dataUrl = await blobToDataUrl(blob);
    }
    const img = await loadImg(dataUrl);
    const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { data: canvas.toDataURL('image/jpeg', 0.92), w, h };
  } catch {
    return null;
  }
}

export async function exportPageAsPdf(page: Page, filename?: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 52;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (need: number) => {
    if (y + need > pageH - margin) { doc.addPage(); y = margin; }
  };

  // Cover
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(201, 160, 220);
  doc.text(`WORK X · ${format(new Date(), 'MMM d, yyyy').toUpperCase()}`, margin, y);
  y += 18;

  doc.setFont('times', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(28, 28, 38);
  const titleText = `${page.icon ? page.icon + '  ' : ''}${page.title || 'Untitled'}`;
  const titleLines = doc.splitTextToSize(titleText, contentW);
  for (const line of titleLines) { ensureSpace(32); doc.text(line, margin, y + 6); y += 32; }

  doc.setDrawColor(220, 215, 230);
  doc.setLineWidth(0.8);
  doc.line(margin, y + 2, pageW - margin, y + 2);
  y += 18;

  // Cover image
  if (page.coverImage) {
    const prep = await prepareImage(page.coverImage, 1800);
    if (prep) {
      const ratio = prep.h / prep.w;
      const drawW = contentW;
      const drawH = Math.min(drawW * ratio, 260);
      const finalW = drawH === 260 ? drawH / ratio : drawW;
      ensureSpace(drawH + 12);
      doc.addImage(prep.data, 'JPEG', margin + (contentW - finalW) / 2, y, finalW, drawH, undefined, 'FAST');
      y += drawH + 16;
    }
  }

  const writeText = (text: string, opts: { size?: number; font?: 'helvetica' | 'times'; style?: 'normal' | 'bold' | 'italic'; color?: [number, number, number]; lineH?: number; indent?: number } = {}) => {
    const { size = 11, font = 'helvetica', style = 'normal', color = [45, 45, 55], lineH = 15, indent = 0 } = opts;
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, contentW - indent);
    for (const line of lines) { ensureSpace(lineH); doc.text(line, margin + indent, y); y += lineH; }
  };

  const renderBlock = async (b: Block) => {
    switch (b.type) {
      case 'heading1':
        y += 8; writeText(stripHtml(b.content) || ' ', { size: 22, font: 'times', style: 'bold', color: [25, 25, 35], lineH: 26 }); y += 4; break;
      case 'heading2':
        y += 6; writeText(stripHtml(b.content) || ' ', { size: 17, font: 'times', style: 'bold', color: [35, 35, 50], lineH: 22 }); y += 3; break;
      case 'heading3':
        y += 4; writeText(stripHtml(b.content) || ' ', { size: 14, font: 'helvetica', style: 'bold', color: [55, 55, 75], lineH: 19 }); y += 2; break;
      case 'text':
        writeText(stripHtml(b.content) || ' '); y += 4; break;
      case 'todo': {
        const mark = b.checked ? '☑' : '☐';
        writeText(`${mark}  ${stripHtml(b.content)}`, { color: b.checked ? [140, 140, 155] : [45, 45, 55] }); y += 2; break;
      }
      case 'code': {
        ensureSpace(28);
        const lines = doc.splitTextToSize(b.content || ' ', contentW - 16);
        const blockH = lines.length * 13 + 16;
        ensureSpace(blockH);
        doc.setFillColor(245, 243, 250);
        doc.roundedRect(margin, y, contentW, blockH, 6, 6, 'F');
        doc.setFont('courier', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(60, 50, 90);
        let cy = y + 14;
        for (const line of lines) { doc.text(line, margin + 8, cy); cy += 13; }
        y += blockH + 8; break;
      }
      case 'divider':
        ensureSpace(16);
        doc.setDrawColor(225, 220, 235); doc.setLineWidth(0.6);
        doc.line(margin, y + 6, pageW - margin, y + 6);
        y += 16; break;
      case 'table': {
        const td = b.tableData; if (!td || !td.headers.length) break;
        const cols = td.headers.length;
        const colW = contentW / cols;
        const rowH = 22;
        ensureSpace(rowH * (td.rows.length + 1) + 8);
        // header
        doc.setFillColor(245, 240, 252);
        doc.rect(margin, y, contentW, rowH, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(60, 40, 90);
        td.headers.forEach((h, i) => doc.text(String(h).slice(0, 40), margin + i * colW + 6, y + 14));
        y += rowH;
        doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 50, 65);
        td.rows.forEach((row, ri) => {
          if (ri % 2 === 1) { doc.setFillColor(252, 250, 255); doc.rect(margin, y, contentW, rowH, 'F'); }
          row.forEach((cell, i) => doc.text(String(cell ?? '').slice(0, 60), margin + i * colW + 6, y + 14));
          y += rowH;
          ensureSpace(rowH);
        });
        doc.setDrawColor(225, 220, 235); doc.setLineWidth(0.4);
        y += 6; break;
      }
      case 'image': {
        if (!b.mediaUrl) break;
        const prep = await prepareImage(b.mediaUrl, 1800);
        if (!prep) { writeText('[image unavailable]', { style: 'italic', color: [150, 150, 165] }); break; }
        const ratio = prep.h / prep.w;
        const drawW = Math.min(contentW, 460);
        const drawH = Math.min(drawW * ratio, 360);
        const finalW = drawH === 360 ? drawH / ratio : drawW;
        ensureSpace(drawH + 12);
        const x = margin + (contentW - finalW) / 2;
        doc.addImage(prep.data, 'JPEG', x, y, finalW, drawH, undefined, 'FAST');
        if (b.content) {
          y += drawH + 6;
          writeText(stripHtml(b.content), { size: 9, style: 'italic', color: [130, 130, 145], lineH: 12 });
        } else {
          y += drawH + 10;
        }
        break;
      }
      case 'video':
      case 'audio': {
        writeText(`[${b.type}] ${b.mediaUrl || ''}`, { style: 'italic', color: [120, 120, 140] }); break;
      }
      default:
        writeText(stripHtml(b.content) || ' ');
    }
  };

  for (const b of page.blocks) {
    await renderBlock(b);
  }

  // Footers
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(170, 170, 180);
    doc.text(`Work X  —  ${page.title || 'Untitled'}  —  page ${p} / ${pages}`, pageW / 2, pageH - 22, { align: 'center' });
  }

  const safe = (page.title || 'untitled').replace(/[/\\:*?"<>|]/g, '-').trim() || 'untitled';
  doc.save(filename || `${safe}.pdf`);
}
