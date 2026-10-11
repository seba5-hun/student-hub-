import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, MapPin, FileText, Image as ImageIcon, ExternalLink, Loader2, ZoomIn, ZoomOut, Sparkles, SearchX } from 'lucide-react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { SourceHit, splitSentences } from '../lib/sources';
import { terms } from '../lib/retrieval';
import { readKind, lightenPhoto } from '../lib/archiveText';
import { downloadArchiveFile, archiveFileUrl } from '../lib/supabase';
import { downloadFromDrive, hasDriveToken } from '../lib/googleDrive';
import { blobToBase64 } from '../lib/gemini';
import { locateInImage, canTranscribe } from '../lib/ai';

// "Mostra nei file": a window with the page of the file where the answer comes from, the exact
// passage highlighted on it, and the list of all the places found. PDFs with text are highlighted
// line by line; photos and scanned pages ask the free Gemini where the passage is on the image.

type Box = { x: number; y: number; w: number; h: number }; // percentages of the page

const blobs = new Map<string, Promise<Blob>>();
const pdfs = new Map<string, Promise<PDFDocumentProxy>>();

function fileBlob(hit: SourceHit): Promise<Blob> {
  const file = hit.item.file!;
  const key = file.path;
  if (!blobs.has(key)) {
    const p = file.drive
      ? (hasDriveToken() ? downloadFromDrive(file.drive.id) : Promise.reject(new Error('drive')))
      : downloadArchiveFile(file.path);
    p.catch(() => blobs.delete(key));
    blobs.set(key, p);
  }
  return blobs.get(key)!;
}

async function pdfDoc(hit: SourceHit): Promise<PDFDocumentProxy> {
  const key = hit.item.file!.path;
  if (!pdfs.has(key)) {
    const p = (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
      return pdfjs.getDocument({ data: new Uint8Array(await (await fileBlob(hit)).arrayBuffer()) }).promise;
    })();
    p.catch(() => pdfs.delete(key));
    pdfs.set(key, p);
  }
  return pdfs.get(key)!;
}

// Where Gemini found a passage on an image, remembered on this device (one request per passage).
function cachedLocate(key: string, run: () => Promise<[number, number, number, number] | null>): Promise<Box | null> {
  const id = `mynd_loc_${key}`;
  try {
    const saved = localStorage.getItem(id);
    if (saved) return Promise.resolve(saved === 'none' ? null : JSON.parse(saved));
  } catch { /* ignore */ }
  return run().then(b => {
    const box = b ? { x: b[1] / 10, y: b[0] / 10, w: (b[3] - b[1]) / 10, h: (b[2] - b[0]) / 10 } : null;
    try { localStorage.setItem(id, box ? JSON.stringify(box) : 'none'); } catch { /* ignore */ }
    return box;
  });
}

function hash(text: string): string {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

// Lines of a text PDF that contain the highlighted sentences: the runs of text pieces whose words
// are mostly words of those sentences.
async function textBoxes(page: PDFPageProxy, sentences: string[]): Promise<{ boxes: Box[]; hasText: boolean }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items = content.items.filter((i): i is typeof i & { str: string; transform: number[]; width: number } => 'str' in i);
  const hasText = items.map(i => i.str).join('').replace(/\s/g, '').length >= 40;
  if (!hasText) return { boxes: [], hasText };
  const target = new Set(terms(sentences.join(' ')));
  // 1: a line of the passage (at least two of its words and half of them); 0: too short to say
  // (spaces, page numbers, one-word titles): it neither starts nor breaks a run; -1: another text.
  const flags = items.map(i => {
    const t = terms(i.str);
    const hit = t.filter(w => target.has(w)).length;
    if (t.length < 2) return 0;
    return hit >= 2 && hit / t.length >= 0.5 ? 1 : -1;
  });
  // Runs of matching pieces, allowing up to two pieces that don't match in between.
  const runs: { from: number; to: number; words: number }[] = [];
  let cur: { from: number; to: number; words: number; misses: number } | null = null;
  items.forEach((it, i) => {
    if (flags[i] === 1) {
      const w = terms(it.str).filter(x => target.has(x)).length;
      if (cur && cur.misses <= 2) { cur.to = i; cur.words += w; cur.misses = 0; } else { if (cur) runs.push(cur); cur = { from: i, to: i, words: w, misses: 0 }; }
    } else if (flags[i] === -1 && cur) cur.misses++;
  });
  if (cur) runs.push(cur);
  const need = Math.max(3, Math.min(8, target.size * 0.25));
  const chosen = runs.filter(r => r.words >= need).sort((a, b) => b.words - a.words).slice(0, 4);
  const boxes: Box[] = [];
  for (const r of chosen) {
    for (let i = r.from; i <= r.to; i++) {
      const it = items[i];
      if (flags[i] !== 1) continue; // only the lines of the passage are marked
      const tx = pdfjs.Util.transform(viewport.transform, it.transform);
      const h = Math.hypot(tx[2], tx[3]);
      const box = { x: (tx[4] / viewport.width) * 100, y: ((tx[5] - h) / viewport.height) * 100, w: ((it.width * viewport.scale) / viewport.width) * 100, h: (h * 1.15 / viewport.height) * 100 };
      // Pieces on the same line become one band.
      const same = boxes.find(b => Math.abs(b.y - box.y) < box.h * 0.5 && box.x <= b.x + b.w + 2 && box.x + box.w >= b.x - 2);
      if (same) { const right = Math.max(same.x + same.w, box.x + box.w); same.x = Math.min(same.x, box.x); same.w = right - same.x; }
      else boxes.push(box);
    }
  }
  return { boxes, hasText };
}

function PageView({ hit }: { hit: SourceHit }) {
  const file = hit.item.file!;
  const kind = readKind(file);
  const [src, setSrc] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'drive' | 'error'>('loading');
  const [locating, setLocating] = useState(false);
  const [zoom, setZoom] = useState(1);
  const firstBox = useRef<HTMLDivElement>(null);
  const passage = hit.highlights.join(' ');

  useEffect(() => {
    let alive = true;
    let url = '';
    setState('loading'); setBoxes([]); setSrc(null); setLocating(false); setZoom(1);
    const locate = async (blob: Blob, mime: string, cacheKey: string) => {
      if (!canTranscribe() || !passage) return;
      setLocating(true);
      try {
        const light = await lightenPhoto(blob, mime);
        const box = await cachedLocate(cacheKey, async () => locateInImage(await blobToBase64(light.blob), light.mimeType, passage));
        if (alive && box) setBoxes([box]);
      } catch { /* the page is shown anyway, with the passage below */ }
      if (alive) setLocating(false);
    };
    (async () => {
      try {
        if (kind === 'pdf') {
          const doc = await pdfDoc(hit);
          const page = await doc.getPage(Math.min(Math.max(1, hit.pageIndex || 1), doc.numPages));
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(3, 1600 / Math.max(base.width, base.height)) });
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;
          const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('pagina'))), 'image/jpeg', 0.85));
          canvas.width = canvas.height = 0;
          if (!alive) return;
          url = URL.createObjectURL(blob);
          setSrc(url); setState('ready');
          const { boxes: found, hasText } = await textBoxes(page, hit.highlights);
          if (!alive) return;
          if (found.length) setBoxes(found);
          else if (!hasText) await locate(blob, 'image/jpeg', `${file.path}#${hit.pageIndex}#${hash(passage)}`);
        } else if (kind === 'image') {
          const blob = await fileBlob(hit);
          if (!alive) return;
          url = URL.createObjectURL(blob);
          setSrc(url); setState('ready');
          await locate(blob, blob.type || file.mimeType, `${file.path}#${hash(passage)}`);
        } else {
          setState('ready');
        }
      } catch (err) {
        if (alive) setState(err instanceof Error && err.message === 'drive' ? 'drive' : 'error');
      }
    })();
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [hit, kind, file.path, passage]);

  // On the phone the page is small: it zooms in by itself on the passage, then scrolls to it.
  useEffect(() => {
    if (!boxes.length) return;
    if (window.innerWidth < 640) setZoom(z => (z === 1 ? 1.8 : z));
  }, [boxes]);
  useEffect(() => {
    if (boxes.length) window.setTimeout(() => firstBox.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'start' }), 350);
  }, [boxes, zoom]);

  const openOriginal = async () => {
    if (file.drive?.webViewLink) { window.open(file.drive.webViewLink, '_blank', 'noopener'); return; }
    const win = window.open('', '_blank');
    try {
      const url = await archiveFileUrl(file.path);
      if (win) win.location.href = kind === 'pdf' && hit.pageIndex ? `${url}#page=${hit.pageIndex}` : url;
    } catch { win?.close(); }
  };

  if (kind === 'text') {
    return <ExcerptText hit={hit} big />;
  }

  return (
    <div className="relative h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        {kind === 'pdf' ? <FileText className="w-4 h-4 text-red-400 flex-shrink-0" /> : <ImageIcon className="w-4 h-4 text-pink-400 flex-shrink-0" />}
        <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{hit.item.name}</span>
        {hit.pageLabel && <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: 'var(--glass-well)', color: 'var(--text-muted)' }}>pag. {hit.pageLabel}</span>}
        <span className="flex-1" />
        {locating && <span className="text-xs inline-flex items-center gap-1.5 flex-shrink-0" style={{ color: 'var(--text-subtle)' }}><Loader2 className="w-3.5 h-3.5 animate-spin" /> <span className="hidden sm:inline">Cerco il punto esatto…</span></span>}
        <button onClick={() => setZoom(z => Math.max(1, z - 0.5))} disabled={zoom <= 1} aria-label="Rimpicciolisci" className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30" style={{ color: 'var(--text-muted)' }}><ZoomOut className="w-4 h-4" /></button>
        <button onClick={() => setZoom(z => Math.min(3, z + 0.5))} disabled={zoom >= 3} aria-label="Ingrandisci" className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30" style={{ color: 'var(--text-muted)' }}><ZoomIn className="w-4 h-4" /></button>
        <button onClick={openOriginal} aria-label="Apri il file originale" title="Apri il file originale" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ color: 'var(--text-muted)' }}><ExternalLink className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-5" style={{ background: 'var(--glass-well)' }}>
        {state === 'loading' && <div className="h-full min-h-[240px] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--brand-ring)' }} /></div>}
        {state === 'drive' && (
          <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center gap-3 px-6">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Questo file è nel tuo Google Drive: per vederlo qui ricollega Drive dall'Archivio, oppure aprilo direttamente.</p>
            <button onClick={openOriginal} className="btn-secondary h-10 px-4 text-sm inline-flex items-center gap-2"><ExternalLink className="w-4 h-4" /> Apri in Drive</button>
          </div>
        )}
        {state === 'error' && <p className="text-sm text-center py-16" style={{ color: 'var(--text-muted)' }}>Non riesco ad aprire il file adesso. Il punto è comunque qui accanto, evidenziato nel testo.</p>}
        {state === 'ready' && src && (
          <div className="relative mx-auto shadow-xl rounded-lg overflow-hidden bg-white transition-[width] duration-300" style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? 760 : undefined }}>
            <img src={src} alt={`${hit.item.name}${hit.pageLabel ? `, pagina ${hit.pageLabel}` : ''}`} className="block w-full h-auto select-none" draggable={false} />
            {boxes.map((b, i) => (
              <div key={i} ref={i === 0 ? firstBox : undefined} className="absolute rounded-[3px] pointer-events-none mynd-source-mark"
                style={{ left: `${b.x - 0.4}%`, top: `${b.y - 0.3}%`, width: `${b.w + 0.8}%`, height: `${b.h + 0.6}%` }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// The text of the page with the sentences of the answer marked.
function ExcerptText({ hit, big = false }: { hit: SourceHit; big?: boolean }) {
  const marked = useMemo(() => new Set(hit.highlights), [hit]);
  const firstMark = useRef<HTMLElement>(null);
  const parts = useMemo(() => {
    const sentences = splitSentences(hit.excerpt);
    if (big) return sentences;
    // In the list: the marked sentences with one sentence of context around them.
    const keep = new Set<number>();
    sentences.forEach((s, i) => { if (marked.has(s)) [i - 1, i, i + 1].forEach(k => k >= 0 && k < sentences.length && keep.add(k)); });
    const out: string[] = [];
    sentences.forEach((s, i) => { if (keep.has(i)) { if (out.length && !keep.has(i - 1)) out.push('…'); out.push(s); } });
    return out;
  }, [hit, big, marked]);
  useEffect(() => { if (big) firstMark.current?.scrollIntoView({ block: 'center' }); }, [big, hit]);
  let first = true;
  return (
    <div className={big ? 'h-full overflow-y-auto p-5 sm:p-8 text-[15px] leading-relaxed' : 'text-[13px] leading-relaxed'} style={{ color: 'var(--text-muted)' }}>
      {big && <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>{hit.item.name}{hit.pageLabel ? ` · pag. ${hit.pageLabel}` : ''}</p>}
      {parts.map((s, i) => {
        if (s === '…') return <span key={i}> … </span>;
        if (!marked.has(s)) return <span key={i}>{s} </span>;
        const ref = first ? firstMark : undefined;
        first = false;
        return <mark key={i} ref={ref} className="rounded px-0.5 mynd-source-text" style={{ color: 'var(--text)' }}>{s}</mark>;
      })}
    </div>
  );
}

export default function SourceViewer({ hits, onClose, onAsk }: {
  hits: SourceHit[] | null; // null: still searching
  onClose: () => void;
  onAsk?: (text: string) => void;
}) {
  const [active, setActive] = useState(0);
  useEffect(() => { setActive(0); }, [hits]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const hit = hits?.[active];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center md:p-6 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Dove si trova nei tuoi file" onClick={e => e.stopPropagation()}
        className="glass-float w-full h-full md:h-[min(92vh,900px)] md:max-w-6xl md:rounded-[28px] flex flex-col overflow-hidden animate-scale-in safe-top" style={{ borderRadius: undefined }}>
        <div className="flex items-center gap-3 px-4 sm:px-5 h-16 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="w-10 h-10 rounded-2xl glass-lens flex items-center justify-center flex-shrink-0" style={{ color: 'var(--brand-ring)' }}><MapPin className="w-5 h-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold" style={{ color: 'var(--text)' }}>Dove si trova</p>
            <p className="text-xs truncate" style={{ color: 'var(--text-subtle)' }}>
              {hits === null ? 'Cerco la risposta nei tuoi file…' : hits.length ? `${hits.length === 1 ? '1 punto' : `${hits.length} punti`} nei tuoi file` : 'Nessun punto trovato'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="w-11 h-11 rounded-full flex items-center justify-center" style={{ color: 'var(--text)' }}><X className="w-5 h-5" /></button>
        </div>

        {hits === null && <div className="flex-1 flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--brand-ring)' }} /></div>}

        {hits && !hits.length && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-8">
            <SearchX className="w-10 h-10" style={{ color: 'var(--text-subtle)' }} />
            <p className="text-base font-medium" style={{ color: 'var(--text)' }}>Questa risposta non viene dai tuoi file.</p>
            <p className="text-sm max-w-md" style={{ color: 'var(--text-muted)' }}>Non ho trovato queste informazioni nel materiale selezionato: probabilmente l'AI ha usato le sue conoscenze. Se il file c'è, controlla che sia "Letto dall'AI" nell'Archivio.</p>
          </div>
        )}

        {hits && hit && (
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
            <div className="h-[58vh] lg:h-auto lg:flex-[1.55] min-w-0 flex-shrink-0 lg:flex-shrink">
              <PageView hit={hit} />
            </div>
            <div className="lg:w-[400px] lg:overflow-y-auto p-3 sm:p-4 space-y-2.5 lg:border-l" style={{ borderColor: 'var(--border)' }}>
              {hits.map((h, i) => (
                <button key={`${h.item.id}-${h.pageIndex}-${i}`} onClick={() => setActive(i)} aria-pressed={i === active}
                  className={`w-full text-left rounded-2xl p-3.5 transition-all ${i === active ? 'glass-lens ring-2 ring-[var(--brand-ring)]' : 'hover:bg-white/5'}`}
                  style={i === active ? undefined : { background: 'var(--glass-well)' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center flex-shrink-0" style={{ background: i === active ? 'var(--brand-fill)' : 'var(--border)', color: i === active ? 'var(--on-brand)' : 'var(--text-muted)' }}>{i + 1}</span>
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{h.item.name}</span>
                    {h.pageLabel && <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-subtle)' }}>pag. {h.pageLabel}</span>}
                  </div>
                  <p className="text-xs italic mb-2 line-clamp-2" style={{ color: 'var(--text-subtle)' }}>Per: «{h.claims[0]}»{h.claims.length > 1 ? ` e altri ${h.claims.length - 1} punti` : ''}</p>
                  <ExcerptText hit={h} />
                </button>
              ))}
              {onAsk && hit && (
                <button onClick={() => onAsk(`Spiegami meglio questo passaggio di "${hit.item.name}"${hit.pageLabel ? ` (pag. ${hit.pageLabel})` : ''}: «${hit.highlights.join(' ').slice(0, 600)}»`)}
                  className="w-full mt-1 h-11 rounded-full text-sm font-medium inline-flex items-center justify-center gap-2 btn-secondary">
                  <Sparkles className="w-4 h-4" style={{ color: 'var(--brand-ring)' }} /> Spiegami meglio questo punto
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
