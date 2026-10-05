// Turns archive files (PDFs, photos of book pages, notes) into plain text the AI tutor can read.
// Text PDFs and text files are read in the browser; photos and scanned PDFs are transcribed by the AI.

import { ArchiveFile, ArchiveItem } from './store';
import { downloadArchiveFile, uploadArchiveText } from './supabase';
import { downloadFromDrive } from './googleDrive';
import { blobToBase64 } from './gemini';
import { canTranscribe, transcribeFile } from './ai';
import type { PDFPageProxy } from 'pdfjs-dist';

type ReadKind = 'text' | 'pdf' | 'image' | 'unsupported';

// Image formats the AI can read.
const GEMINI_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
// Requests to the AI are limited to ~20 MB and base64 adds a third: heavier photos are shrunk.
const AI_INLINE_LIMIT = 14 * 1024 * 1024;

export class MissingApiKeyError extends Error {
  constructor() {
    super('Per leggere foto e PDF scansionati serve la chiave Gemini (gratis): configurala nella Guida Studio AI. Le AI a pagamento non vengono usate per leggere i file.');
  }
}

function extension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function readKind(file: Pick<ArchiveFile, 'mimeType' | 'originalName'>): ReadKind {
  const ext = extension(file.originalName);
  const mime = file.mimeType.toLowerCase();
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('text/') || ['txt', 'md', 'csv'].includes(ext)) return 'text';
  if (GEMINI_IMAGE_TYPES.includes(mime) || ['png', 'jpg', 'jpeg', 'webp', 'heic', 'heif'].includes(ext)) return 'image';
  return 'unsupported';
}

function imageMime(file: Pick<ArchiveFile, 'mimeType' | 'originalName'>): string {
  if (GEMINI_IMAGE_TYPES.includes(file.mimeType)) return file.mimeType;
  const ext = extension(file.originalName);
  return ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
}

const TRANSCRIBE_PROMPT =
  'Trascrivi fedelmente tutto il testo presente in questo file (appunti, pagine di libro, slide, esercizi). ' +
  'Mantieni titoli, elenchi e struttura. Scrivi le formule in modo leggibile (es. x^2, radice di 2). ' +
  'Se ci sono grafici, schemi, tabelle o immagini, descrivili brevemente tra [parentesi quadre]. ' +
  'Se il testo è scritto a mano fai del tuo meglio. Se ci sono più pagine, separale con "--- Pagina N ---". ' +
  'Non aggiungere commenti o introduzioni: solo la trascrizione.';

// For photos: the page number printed on the page (top or bottom corner), on a first line of its own.
const PAGE_PROMPT = 'Nella PRIMA riga scrivi soltanto "PAGINA: " seguito dal numero di pagina stampato sul foglio ' +
  '(di solito in un angolo in alto o in basso; se si vedono due pagine scrivi entrambe, es. "PAGINA: 24-25"). ' +
  'Se il numero non si vede scrivi "PAGINA: -". Poi, dalla riga successiva, la trascrizione. ';

function splitPage(text: string): { text: string; page?: string } {
  const match = /^\s*\**PAGINA\**\s*:\s*([^\n]*)\n?/i.exec(text);
  if (!match) return { text };
  const value = match[1].replace(/[*_`]/g, '').trim();
  const page = /^\d{1,4}(\s*[-–]\s*\d{1,4})?$/.test(value) ? value.replace(/\s*[-–]\s*/, '-') : undefined;
  return { text: text.slice(match[0].length).trim(), page };
}

async function transcribeWithAI(blob: Blob, mimeType: string, withPage = false, onWait?: (seconds: number) => void): Promise<string> {
  if (!canTranscribe()) throw new MissingApiKeyError();
  // No size limit for the student: a photo too heavy for the AI is shrunk first (PDFs are
  // already sent one page at a time, each a light image).
  if (blob.size > AI_INLINE_LIMIT && mimeType.startsWith('image/')) {
    const { shrinkImage } = await import('./imagesToPdf');
    blob = await shrinkImage(blob);
    mimeType = 'image/jpeg';
    if (blob.size > AI_INLINE_LIMIT) blob = await shrinkImage(blob, 1600, 0.7);
  }
  if (blob.size > AI_INLINE_LIMIT) {
    throw new Error('Questo file è troppo pesante perché l\'AI lo legga così com\'è.');
  }
  const data = await blobToBase64(blob);
  return transcribeFile(data, mimeType, withPage ? PAGE_PROMPT + TRANSCRIBE_PROMPT : TRANSCRIBE_PROMPT, onWait);
}

// Progress of the PDFs being read ("3/12" pages), shown next to the file in the archive.
export const readingProgress = new Map<string, string>();
function setProgress(key: string, value: string | null) {
  if (value === null) readingProgress.delete(key);
  else readingProgress.set(key, value);
  window.dispatchEvent(new Event('archive-progress'));
}

// Pages already transcribed, kept until the whole PDF is done: "riprova" restarts from where it stopped.
const pageCache = new Map<string, string>();

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// The free Gemini tier allows about 10 requests a minute: pages start at least 6 s apart.
let nextPageSlot = 0;
async function pageSlot() {
  const now = Date.now();
  const at = Math.max(now, nextPageSlot);
  nextPageSlot = at + 6000;
  if (at > now) await wait(at - now);
}

async function renderPage(page: PDFPageProxy): Promise<Blob> {
  const base = page.getViewport({ scale: 1 });
  // About 1700 px on the long side: sharp enough to read, light enough to send.
  const viewport = page.getViewport({ scale: Math.min(4, 1700 / Math.max(base.width, base.height)) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Pagina non convertita'))), 'image/jpeg', 0.82));
  canvas.width = canvas.height = 0;
  return blob;
}

// Pages with real text are read directly; scanned pages (photos) are sent to the AI one at a
// time, so long PDFs never hit the AI's size or answer limits.
async function readPdf(blob: Blob, key: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const total = doc.numPages;
  const out: string[] = [];
  const scanned: number[] = [];
  try {
    for (let i = 1; i <= total; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map(item => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
        .join('')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
      if (text.replace(/\s/g, '').length >= 40) out[i] = `--- Pagina ${i} ---\n${text}`;
      else scanned.push(i);
    }
    if (scanned.length && !canTranscribe()) throw new MissingApiKeyError();
    let done = total - scanned.length;
    if (scanned.length) setProgress(key, `${done}/${total}`);
    const readPage = async (i: number): Promise<string> => {
      const cacheKey = `${key}#${i}`;
      const cached = pageCache.get(cacheKey);
      if (cached !== undefined) return cached;
      const image = await renderPage(await doc.getPage(i));
      let lastError: unknown;
      // Busy servers and free-tier limits usually pass in a few seconds.
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await wait(attempt * 5000);
        try {
          await pageSlot();
          const onWait = (seconds: number) => setProgress(key, `${done}/${total} · limite gratuito di Gemini, riprendo tra ${seconds} s`);
          const { text, page } = splitPage(await transcribeWithAI(image, 'image/jpeg', true, onWait));
          setProgress(key, `${done}/${total}`);
          const pageText = `--- Pagina ${page || i} ---\n${text}`;
          pageCache.set(cacheKey, pageText);
          return pageText;
        } catch (err) {
          if (err instanceof MissingApiKeyError) throw err;
          lastError = err;
        }
      }
      const reason = lastError instanceof Error ? lastError.message : String(lastError);
      throw new Error(`Non sono riuscito a leggere la pagina ${i} di ${total}: ${reason} Premi "riprova": le pagine già lette non vengono rifatte.`);
    };
    // Two pages at a time: about twice as fast, still within the free limits.
    let next = 0;
    let failure: unknown = null;
    const worker = async () => {
      while (failure === null && next < scanned.length) {
        const i = scanned[next++];
        try {
          out[i] = await readPage(i);
          setProgress(key, `${++done}/${total}`);
        } catch (err) {
          if (failure === null) failure = err;
        }
      }
    };
    await Promise.all([worker(), worker()]);
    if (failure !== null) throw failure;
  } finally {
    setProgress(key, null);
    await doc.destroy();
  }
  for (let i = 1; i <= total; i++) pageCache.delete(`${key}#${i}`);
  return out.filter(Boolean).join('\n\n');
}

async function extractText(blob: Blob, file: ArchiveFile): Promise<string> {
  const kind = readKind(file);
  if (kind === 'text') return (await blob.text()).trim();
  if (kind === 'image') return transcribeWithAI(blob, imageMime(file), true);
  if (kind === 'pdf') return readPdf(blob, file.path);
  throw new Error('Formato non leggibile dall\'AI');
}

const transcriptCache = new Map<string, string>();

// Reads the file, saves its transcription next to it and returns the updated file info.
// The transcription of a Google Drive file is small and stays in the app (user's folder).
export async function analyzeArchiveFile(item: ArchiveItem, userId: string): Promise<ArchiveFile> {
  const file = item.file!;
  if (readKind(file) === 'unsupported') {
    return { ...file, textStatus: 'unsupported', textError: undefined };
  }
  const blob = file.drive ? await downloadFromDrive(file.drive.id) : await downloadArchiveFile(file.path);
  const raw = await extractText(blob, file);
  const { text, page } = readKind(file) === 'image' ? splitPage(raw) : { text: raw, page: undefined };
  if (!text) throw new Error('Non ho trovato testo in questo file.');
  const textPath = file.drive ? `${userId}/drive-${file.drive.id}.txt` : `${file.path}.txt`;
  await uploadArchiveText(textPath, text);
  transcriptCache.set(textPath, text);
  return { ...file, textPath, textStatus: 'done', textError: undefined, pageLabel: page };
}

export async function loadTranscript(textPath: string): Promise<string> {
  const cached = transcriptCache.get(textPath);
  if (cached !== undefined) return cached;
  const text = await (await downloadArchiveFile(textPath)).text();
  transcriptCache.set(textPath, text);
  return text;
}
