// Turns archive files (PDFs, photos of book pages, notes) into plain text the AI tutor can read.
// Text PDFs and text files are read in the browser; photos and scanned PDFs are transcribed by Gemini.

import { ArchiveFile, ArchiveItem } from './store';
import { downloadArchiveFile, uploadArchiveText } from './supabase';
import { downloadFromDrive } from './googleDrive';
import { generateContent, blobToBase64 } from './gemini';

type ReadKind = 'text' | 'pdf' | 'image' | 'unsupported';

// Formats Gemini accepts inline.
const GEMINI_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
// Requests are limited to ~20 MB and base64 adds a third.
const AI_INLINE_LIMIT = 14 * 1024 * 1024;

export class MissingApiKeyError extends Error {
  constructor() {
    super('Per leggere foto e PDF scansionati serve la API key di Gemini: configurala nella Guida Studio AI.');
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

async function pdfTextLayer(blob: Blob): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map(item => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
    pages.push(`--- Pagina ${i} ---\n${text}`);
  }
  await doc.destroy();
  return { text: pages.join('\n\n'), pages: doc.numPages };
}

const TRANSCRIBE_PROMPT =
  'Trascrivi fedelmente tutto il testo presente in questo file (appunti, pagine di libro, slide, esercizi). ' +
  'Mantieni titoli, elenchi e struttura. Scrivi le formule in modo leggibile (es. x^2, radice di 2). ' +
  'Se ci sono grafici, schemi, tabelle o immagini, descrivili brevemente tra [parentesi quadre]. ' +
  'Se il testo è scritto a mano fai del tuo meglio. Se ci sono più pagine, separale con "--- Pagina N ---". ' +
  'Non aggiungere commenti o introduzioni: solo la trascrizione.';

async function transcribeWithGemini(blob: Blob, mimeType: string, apiKey: string): Promise<string> {
  if (!apiKey) throw new MissingApiKeyError();
  if (blob.size > AI_INLINE_LIMIT) {
    throw new Error('File troppo grande perché l\'AI lo legga (massimo 14 MB). Dividilo in parti più piccole, ad esempio un capitolo per file.');
  }
  const data = await blobToBase64(blob);
  return generateContent(apiKey, [
    { role: 'user', parts: [{ inline_data: { mime_type: mimeType, data } }, { text: TRANSCRIBE_PROMPT }] },
  ], { temperature: 0.1, maxOutputTokens: 32768 });
}

async function extractText(blob: Blob, file: ArchiveFile, apiKey: string): Promise<string> {
  const kind = readKind(file);
  if (kind === 'text') return (await blob.text()).trim();
  if (kind === 'image') return transcribeWithGemini(blob, imageMime(file), apiKey);
  if (kind === 'pdf') {
    const { text, pages } = await pdfTextLayer(blob);
    const letters = text.replace(/--- Pagina \d+ ---|\s/g, '').length;
    // A PDF with (almost) no text layer is a scan: let Gemini read the images.
    if (letters >= pages * 40) return text;
    return transcribeWithGemini(blob, 'application/pdf', apiKey);
  }
  throw new Error('Formato non leggibile dall\'AI');
}

const transcriptCache = new Map<string, string>();

// Reads the file, saves its transcription next to it and returns the updated file info.
// The transcription of a Google Drive file is small and stays in the app (user's folder).
export async function analyzeArchiveFile(item: ArchiveItem, apiKey: string, userId: string): Promise<ArchiveFile> {
  const file = item.file!;
  if (readKind(file) === 'unsupported') {
    return { ...file, textStatus: 'unsupported', textError: undefined };
  }
  const blob = file.drive ? await downloadFromDrive(file.drive.id) : await downloadArchiveFile(file.path);
  const text = await extractText(blob, file, apiKey);
  if (!text) throw new Error('Non ho trovato testo in questo file.');
  const textPath = file.drive ? `${userId}/drive-${file.drive.id}.txt` : `${file.path}.txt`;
  await uploadArchiveText(textPath, text);
  transcriptCache.set(textPath, text);
  return { ...file, textPath, textStatus: 'done', textError: undefined };
}

export async function loadTranscript(textPath: string): Promise<string> {
  const cached = transcriptCache.get(textPath);
  if (cached !== undefined) return cached;
  const text = await (await downloadArchiveFile(textPath)).text();
  transcriptCache.set(textPath, text);
  return text;
}
