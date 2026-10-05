// Joins photos into a single, much lighter PDF, entirely in the browser: every photo is
// shrunk and re-saved as JPEG, then placed on its own page (no extra library needed).

export type PdfQuality = 'alta' | 'media' | 'leggera';

export const PDF_QUALITIES: { id: PdfQuality; label: string; note: string; maxSide: number; jpeg: number }[] = [
  { id: 'alta', label: 'Alta', note: 'testo nitidissimo', maxSide: 2200, jpeg: 0.8 },
  { id: 'media', label: 'Media', note: 'consigliata', maxSide: 1700, jpeg: 0.7 },
  { id: 'leggera', label: 'Leggera', note: 'pesa pochissimo', maxSide: 1200, jpeg: 0.6 },
];

interface Page { bytes: Uint8Array; width: number; height: number }

async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    // Some browsers only decode certain formats (e.g. HEIC on Safari) through <img>.
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

async function compress(blob: Blob, maxSide: number, quality: number): Promise<Page> {
  const image = await decode(blob);
  const w0 = 'naturalWidth' in image ? image.naturalWidth : image.width;
  const h0 = 'naturalHeight' in image ? image.naturalHeight : image.height;
  if (!w0 || !h0) throw new Error('Immagine vuota');
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const width = Math.max(1, Math.round(w0 * scale));
  const height = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // transparent PNGs get a white page instead of a black one
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  if ('close' in image) image.close();
  const jpeg = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Compressione non riuscita'))), 'image/jpeg', quality));
  canvas.width = canvas.height = 0; // frees the memory right away on phones
  return { bytes: new Uint8Array(await jpeg.arrayBuffer()), width, height };
}

function buildPdf(pages: Page[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === 'string' ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string, stream?: Uint8Array) => {
    offsets[id] = length;
    push(`${id} 0 obj\n${body}\n`);
    if (stream) {
      push('stream\n');
      push(stream);
      push('\nendstream\n');
    }
    push('endobj\n');
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  // 1 = catalog, 2 = page list, then 3 objects per page: image, drawing, page.
  const pageId = (i: number) => 3 + i * 3 + 2;
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach((p, i) => {
    const imageId = 3 + i * 3;
    // The longest side of every page is as long as an A4 sheet (842 pt).
    const k = 842 / Math.max(p.width, p.height);
    const w = (p.width * k).toFixed(2);
    const h = (p.height * k).toFixed(2);
    object(imageId, `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>`, p.bytes);
    const draw = enc.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
    object(imageId + 1, `<< /Length ${draw.length} >>`, draw);
    object(imageId + 2, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${imageId + 1} 0 R >>`);
  });

  const count = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

// Returns the PDF and the positions of the photos that could not be opened (left out).
export async function imagesToPdf(
  images: (Blob | (() => Promise<Blob>))[],
  quality: PdfQuality,
  onProgress?: (done: number, total: number) => void,
): Promise<{ pdf: Blob; skipped: number[] }> {
  const preset = PDF_QUALITIES.find(q => q.id === quality) || PDF_QUALITIES[1];
  const pages: Page[] = [];
  const skipped: number[] = [];
  for (let i = 0; i < images.length; i++) {
    try {
      const source = images[i];
      const blob = typeof source === 'function' ? await source() : source;
      pages.push(await compress(blob, preset.maxSide, preset.jpeg));
    } catch (err) {
      console.error('PDF page error:', err);
      skipped.push(i);
    }
    onProgress?.(i + 1, images.length);
  }
  if (!pages.length) throw new Error('Non sono riuscito ad aprire nessuna delle foto (le foto HEIC dell\'iPhone si aprono solo da Safari).');
  return { pdf: buildPdf(pages), skipped };
}
