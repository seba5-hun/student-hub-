// Chooses which parts of the study material to send with a question. When everything fits it
// is all sent; otherwise the passages that best match the question are picked (a simple
// keyword search, done in the browser), so even AIs with small limits get the right pages.

export interface MaterialDoc { name: string; subject: string; topic: string; text: string }

export interface Selection { text: string; filesUsed: number; filesTotal: number; partial: boolean }

const CHUNK = 1400;

const STOPWORDS = new Set((
  'il lo la i gli le un uno una di a da in con su per tra fra e ed o od ma se che chi cui non piu più come quando dove ' +
  'del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle ' +
  'sul sullo sulla sui sugli sulle col coi questo questa questi queste quello quella quelli quelle sono era erano essere ' +
  'ha hanno ho hai abbiamo avere fare fai fa mi ti ci vi si me te lui lei noi voi loro suo sua suoi sue mio mia tuo tua ' +
  'anche ancora poi cosa cos quale quali quanto tutto tutti molto poco dopo prima sempre mai già gia solo ogni ' +
  'spiegami spiega dimmi fammi fai parlami riassumi riassunto materiale selezionato file domanda risposta grazie ciao ' +
  'the and of to in is are what how why'
).split(/\s+/));

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Words reduced to a short root, so "rivoluzione", "rivoluzionari" and "rivoluzionario" match.
function terms(text: string): string[] {
  return (normalize(text).match(/[a-z0-9]+/g) || [])
    .filter(w => w.length >= 3 && !STOPWORDS.has(w))
    .map(w => (w.length > 6 ? w.slice(0, 6) : w));
}

interface Chunk { doc: number; index: number; text: string; score: number }

function splitDoc(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (const para of text.split(/\n{2,}|(?=--- Pagina \d+ ---)/)) {
    if (current && current.length + para.length > CHUNK) {
      parts.push(current);
      current = '';
    }
    if (para.length > CHUNK * 1.5) {
      for (let i = 0; i < para.length; i += CHUNK) parts.push(para.slice(i, i + CHUNK));
    } else {
      current += (current ? '\n\n' : '') + para;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function header(doc: MaterialDoc): string {
  return `\n\n===== FILE: "${doc.name}" (Materia: ${doc.subject} > Argomento: ${doc.topic}) =====\n`;
}

export function selectMaterial(docs: MaterialDoc[], question: string, budget: number): Selection {
  const full = docs.map(d => header(d) + d.text).join('');
  if (full.length <= budget) {
    return { text: full, filesUsed: docs.length, filesTotal: docs.length, partial: false };
  }

  const chunks: Chunk[] = [];
  docs.forEach((d, doc) => splitDoc(d.text).forEach((text, index) => chunks.push({ doc, index, text, score: 0 })));

  // BM25-like score of each passage for the words of the question (and of the file names).
  const query = [...new Set(terms(question))];
  const chunkTerms = chunks.map(c => terms(`${docs[c.doc].name} ${c.text}`));
  const avgLen = chunkTerms.reduce((n, t) => n + t.length, 0) / Math.max(1, chunkTerms.length);
  const df = new Map<string, number>();
  query.forEach(q => df.set(q, chunkTerms.filter(t => t.includes(q)).length));
  chunks.forEach((c, i) => {
    const t = chunkTerms[i];
    c.score = query.reduce((sum, q) => {
      const tf = t.filter(w => w === q).length;
      if (!tf) return sum;
      const idf = Math.log(1 + (chunks.length - (df.get(q) || 0) + 0.5) / ((df.get(q) || 0) + 0.5));
      return sum + idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * t.length / avgLen));
    }, 0);
  });

  const picked = new Set<number>();
  let used = 0;
  const room = (i: number) => chunks[i].text.length + 8;
  const ranked = chunks.map((c, i) => i).filter(i => chunks[i].score > 0).sort((a, b) => chunks[b].score - chunks[a].score);
  for (const i of ranked) {
    if (used + room(i) > budget * 0.85) break;
    picked.add(i);
    used += room(i);
    // The passage right after often completes the explanation.
    const next = i + 1;
    if (chunks[next]?.doc === chunks[i].doc && !picked.has(next) && used + room(next) <= budget * 0.85) {
      picked.add(next);
      used += room(next);
    }
  }
  // Generic requests ("riassumi", "interrogami") or leftover space: cover every file evenly.
  for (let round = 0; used < budget * 0.85; round++) {
    let added = false;
    docs.forEach((_, doc) => {
      const i = chunks.findIndex(c => c.doc === doc && c.index === round);
      if (i >= 0 && !picked.has(i) && used + room(i) <= budget * 0.85) {
        picked.add(i);
        used += room(i);
        added = true;
      }
    });
    if (!added && !chunks.some(c => c.index === round)) break;
    if (!added && round > 2000) break;
  }

  let text = '';
  let filesUsed = 0;
  docs.forEach((d, doc) => {
    const parts = chunks.filter((c, i) => c.doc === doc && picked.has(i)).sort((a, b) => a.index - b.index);
    if (!parts.length) return;
    filesUsed++;
    text += header(d) + parts.map((c, k) => (k > 0 && c.index !== parts[k - 1].index + 1 ? '[…]\n' : '') + c.text).join('\n');
  });
  return { text, filesUsed, filesTotal: docs.length, partial: true };
}
