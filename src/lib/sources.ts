// "Mostra nei file": finds where an answer of the Guida Studio AI comes from in the student's files.
// Everything happens in the browser, without asking the AI again: the answer is cut into its
// statements, every statement is compared with the pages of the transcriptions (same word roots
// as the material search), and for each page found the sentences that support it are marked.

import { ArchiveItem } from './store';
import { terms } from './retrieval';

export interface SourceDoc { item: ArchiveItem; text: string }

export interface SourceHit {
  item: ArchiveItem;
  // Page of the file (1 = first) when it is a PDF; the printed number shown to the student.
  pageIndex: number | null;
  pageLabel: string | null;
  excerpt: string;          // text of that page (or part of the file)
  highlights: string[];     // sentences of the excerpt that support the answer, in order
  claims: string[];         // pieces of the answer found there
  score: number;
}

interface Segment { doc: number; pageIndex: number | null; pageLabel: string | null; text: string; sentences: string[]; terms: Set<string>[] }

const PAGE_MARK = /^--- Pagina ([^\n]*?) ---\s*$/gm;
const CHUNK = 1600;

// The transcription of a PDF has a "--- Pagina N ---" line before every page, in the order of the
// file (N is the number printed on the page when the AI could read it).
function segmentsOf(text: string, doc: number, item: ArchiveItem): Omit<Segment, 'sentences' | 'terms'>[] {
  const marks = [...text.matchAll(PAGE_MARK)];
  if (marks.length) {
    return marks.map((m, k) => ({
      doc, pageIndex: k + 1, pageLabel: m[1].trim() || String(k + 1),
      text: text.slice(m.index! + m[0].length, k + 1 < marks.length ? marks[k + 1].index : undefined).trim(),
    })).filter(s => s.text);
  }
  const label = item.file?.pageLabel || null;
  if (text.length <= CHUNK * 1.5) return [{ doc, pageIndex: null, pageLabel: label, text: text.trim() }];
  // Long text files: parts of about one page, cut at a paragraph.
  const out: Omit<Segment, 'sentences' | 'terms'>[] = [];
  let current = '';
  for (const para of text.split(/\n{2,}/)) {
    if (current && current.length + para.length > CHUNK) { out.push({ doc, pageIndex: null, pageLabel: label, text: current }); current = ''; }
    current += (current ? '\n\n' : '') + para;
  }
  if (current.trim()) out.push({ doc, pageIndex: null, pageLabel: label, text: current });
  return out;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?;:»"])\s+(?=[A-ZÀ-Ý«"(\d])/)
    .map(s => s.replace(/^[\s\-*•·#>]+/, '').trim())
    .filter(s => s.length >= 12);
}

// The statements of the answer: its lines and sentences, without headings, greetings and very short bits.
function claimsOf(answer: string): string[] {
  return answer
    .split('\n')
    .filter(line => !/^\s*#{1,4}\s/.test(line))
    .flatMap(line => splitSentences(line.replace(/\*\*/g, '')))
    .filter(s => terms(s).length >= 3);
}

// File names and pages the AI mentioned («dal file "Capitolo 3", pag. 12»).
function citations(text: string): { names: string[]; pages: string[] } {
  const names = [...text.matchAll(/file\s+[«"“]([^»"”]+)[»"”]/gi)].map(m => m[1].trim().toLowerCase());
  const pages = [...text.matchAll(/\bpag(?:ina|\.)?\s*(\d{1,4})/gi)].map(m => m[1]);
  return { names, pages };
}

export function findSources(answer: string, docs: SourceDoc[], max = 5): SourceHit[] {
  const segments: Segment[] = docs.flatMap((d, i) => segmentsOf(d.text, i, d.item)).map(s => {
    const sentences = splitSentences(s.text);
    return { ...s, sentences, terms: sentences.map(x => new Set(terms(x))) };
  });
  if (!segments.length) return [];

  // How rare each word root is among the pages: rare words ("Bastiglia") count more than common ones.
  const df = new Map<string, number>();
  segments.forEach(s => new Set(s.terms.flatMap(t => [...t])).forEach(w => df.set(w, (df.get(w) || 0) + 1)));
  const idf = (w: string) => Math.log(1 + segments.length / (df.get(w) || 0.5));

  const cited = citations(answer);
  const groups = new Map<Segment, { claims: string[]; sentences: Map<number, number>; score: number }>();

  for (const claim of claimsOf(answer)) {
    const words = [...new Set(terms(claim))].filter(w => df.has(w));
    if (words.length < 2) continue;
    const total = words.reduce((n, w) => n + idf(w), 0);
    const local = citations(claim);
    let best: { seg: Segment; sentences: number[]; score: number } | null = null;
    for (const seg of segments) {
      const name = docs[seg.doc].item.name.toLowerCase();
      const boost = (local.names.includes(name) ? 1.4 : cited.names.includes(name) ? 1.15 : 1)
        * (!seg.pageLabel ? 1 : local.pages.includes(seg.pageLabel) ? 1.4 : cited.pages.includes(seg.pageLabel) ? 1.1 : 1);
      for (let i = 0; i < seg.terms.length; i++) {
        // A statement often spans two sentences of the book: one sentence, or two in a row (a bit less).
        const t = seg.terms[i], next = seg.terms[i + 1];
        const one = words.reduce((n, w) => n + (t.has(w) ? idf(w) : 0), 0) / total;
        const two = next ? (words.reduce((n, w) => n + (t.has(w) || next.has(w) ? idf(w) : 0), 0) / total) * 0.9 : 0;
        const pair = two > one && words.some(w => next?.has(w) && !t.has(w));
        const score = (pair ? two : one) * boost;
        if (!best || score > best.score) best = { seg, sentences: pair ? [i, i + 1] : [i], score };
      }
    }
    // At least about a third of the statement's meaningful words must be in the passage.
    const found = best as { seg: Segment; sentences: number[]; score: number } | null;
    if (!found || found.score < 0.34) continue;
    const { seg, sentences, score } = found;
    const g = groups.get(seg) || { claims: [] as string[], sentences: new Map<number, number>(), score: 0 };
    g.claims.push(claim);
    sentences.forEach(i => g.sentences.set(i, Math.max(g.sentences.get(i) || 0, score)));
    g.score += score;
    groups.set(seg, g);
  }

  return [...groups.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, max)
    .map(([seg, g]) => ({
      item: docs[seg.doc].item,
      pageIndex: seg.pageIndex,
      pageLabel: seg.pageLabel,
      excerpt: seg.text,
      highlights: [...g.sentences.keys()].sort((a, b) => a - b).map(i => seg.sentences[i]),
      claims: g.claims,
      score: g.score,
    }));
}
