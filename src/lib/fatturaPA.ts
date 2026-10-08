// Italian electronic invoices (FatturaPA XML from the SDI) and bank exports (CSV), read without AI:
// the data is structured, so it is exact and free.

export interface ParsedInvoice {
  number: string | null;
  issue_date: string | null;
  due_date: string | null;
  seller: { name: string | null; vat: string | null };
  buyer: { name: string | null; vat: string | null };
  taxable: number | null;
  vat: number | null;
  total: number;
  description: string | null;
}

// A signed .p7m keeps the XML inside a binary envelope: cut out the part between the XML
// declaration and the closing tag.
export function xmlFromBytes(bytes: Uint8Array): string {
  const text = new TextDecoder('latin1').decode(bytes);
  const start = text.search(/<\?xml|<([a-zA-Z0-9]+:)?FatturaElettronica[\s>]/);
  const endMatch = /<\/([a-zA-Z0-9]+:)?FatturaElettronica>/.exec(text);
  if (start < 0 || !endMatch) return text;
  const xml = text.slice(start, endMatch.index + endMatch[0].length);
  // The envelope can split the XML in blocks with a few binary bytes between them: drop those.
  return xml.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

const local = (el: Element | Document, name: string): Element[] =>
  Array.from(el.getElementsByTagName('*')).filter(e => e.localName === name);
const first = (el: Element | Document, ...path: string[]): Element | null => {
  let cur: Element | Document | null = el;
  for (const p of path) {
    if (!cur) return null;
    cur = local(cur, p)[0] || null;
  }
  return cur as Element | null;
};
const text = (el: Element | Document, ...path: string[]) => first(el, ...path)?.textContent?.trim() || null;
const num = (s: string | null) => (s == null || s === '' ? null : Number(s.replace(',', '.')));

function partyName(el: Element | null): string | null {
  if (!el) return null;
  const denom = text(el, 'Denominazione');
  if (denom) return denom;
  const n = [text(el, 'Nome'), text(el, 'Cognome')].filter(Boolean).join(' ');
  return n || null;
}

export function parseFatturaPA(xml: string): ParsedInvoice[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Il file non è una fattura elettronica leggibile.');
  const header = first(doc, 'FatturaElettronicaHeader');
  if (!header) throw new Error('Il file non sembra una fattura elettronica (manca l’intestazione).');
  const seller = first(header, 'CedentePrestatore');
  const buyer = first(header, 'CessionarioCommittente');
  const vatOf = (el: Element | null) => {
    if (!el) return null;
    const id = first(el, 'IdFiscaleIVA');
    return id ? `${text(id, 'IdPaese') || ''}${text(id, 'IdCodice') || ''}` : text(el, 'CodiceFiscale');
  };
  const bodies = local(doc, 'FatturaElettronicaBody');
  if (!bodies.length) throw new Error('La fattura non contiene importi.');
  return bodies.map(body => {
    const gen = first(body, 'DatiGenerali', 'DatiGeneraliDocumento');
    const riepiloghi = local(body, 'DatiRiepilogo');
    const taxable = riepiloghi.reduce((n, r) => n + (num(text(r, 'ImponibileImporto')) || 0), 0);
    const vat = riepiloghi.reduce((n, r) => n + (num(text(r, 'Imposta')) || 0), 0);
    const totalDoc = num(gen ? text(gen, 'ImportoTotaleDocumento') : null);
    const dueDates = local(body, 'DataScadenzaPagamento').map(e => e.textContent?.trim() || '').filter(Boolean).sort();
    const lines = local(body, 'Descrizione').map(e => e.textContent?.trim()).filter(Boolean).slice(0, 3).join(' · ');
    return {
      number: gen ? text(gen, 'Numero') : null,
      issue_date: gen ? text(gen, 'Data') : null,
      due_date: dueDates[dueDates.length - 1] || null,
      seller: { name: partyName(first(seller as Element, 'Anagrafica')), vat: vatOf(first(seller as Element, 'DatiAnagrafici')) },
      buyer: { name: partyName(first(buyer as Element, 'Anagrafica')), vat: vatOf(first(buyer as Element, 'DatiAnagrafici')) },
      taxable: riepiloghi.length ? Math.round(taxable * 100) / 100 : null,
      vat: riepiloghi.length ? Math.round(vat * 100) / 100 : null,
      total: Math.round((totalDoc ?? taxable + vat) * 100) / 100,
      description: lines || null,
    };
  });
}

// ───────────── Movimenti bancari (CSV dell'home banking) ─────────────
export interface ParsedMovement { date: string; amount: number; description: string }

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted; }
    else if (ch === sep && !quoted) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}
function parseAmount(s: string): number | null {
  const t = s.replace(/[€\s]/g, '');
  if (!t) return null;
  // 1.234,56 (Italian) or 1,234.56 or 1234.56
  const it = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  const v = Number(it);
  return Number.isFinite(v) ? v : null;
}
function parseDate(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return null;
}

// Recognises the columns by name (data, importo / dare-avere, descrizione) in the usual Italian
// bank exports. Returns the rows it could read and how many it skipped.
export function parseBankCsv(raw: string): { rows: ParsedMovement[]; skipped: number } {
  const lines = raw.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('Il file è vuoto.');
  const sep = [';', ',', '\t'].map(s => [s, lines[0].split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  // The header can come after a few lines of bank details: take the first line that names a date.
  let h = lines.findIndex(l => /data/i.test(l));
  if (h < 0) h = 0;
  const cols = splitCsvLine(lines[h], sep).map(c => c.toLowerCase());
  const find = (...names: RegExp[]) => cols.findIndex(c => names.some(n => n.test(c)));
  const iDate = find(/data contabile/, /data operazione/, /^data/, /date/);
  const iAmount = find(/^importo/, /amount/, /^euro/);
  const iOut = find(/dare/, /uscite/, /addebit/);
  const iIn = find(/avere/, /entrate/, /accredit/);
  const iDesc = find(/descrizione/, /causale/, /description/, /dettagli/);
  if (iDate < 0 || (iAmount < 0 && iOut < 0 && iIn < 0)) throw new Error('Non trovo le colonne “Data” e “Importo” nel file.');
  const rows: ParsedMovement[] = [];
  let skipped = 0;
  for (const line of lines.slice(h + 1)) {
    const c = splitCsvLine(line, sep);
    const date = parseDate(c[iDate] || '');
    let amount: number | null = null;
    if (iAmount >= 0) amount = parseAmount(c[iAmount] || '');
    else {
      const out = parseAmount(c[iOut] || ''); const inn = parseAmount(c[iIn] || '');
      amount = (inn || 0) - Math.abs(out || 0);
      if (!out && !inn) amount = null;
    }
    if (!date || amount == null || amount === 0) { skipped++; continue; }
    rows.push({ date, amount: Math.round(amount * 100) / 100, description: (iDesc >= 0 ? c[iDesc] : '').slice(0, 300) });
  }
  return { rows, skipped };
}

// Simple categories from the description words; the user can change them.
export function guessCategory(desc: string, amount: number): string {
  const d = desc.toLowerCase();
  const rules: [RegExp, string][] = [
    [/carbur|eni|q8|ip |tamoil|pedagg|autostrad|telepass|treno|trenitalia|italo|volo|ryanair|easyjet|hotel|booking|airbnb|noleg/, 'Trasferte'],
    [/adobe|apple|google|microsoft|spotify|notion|canva|software|abbonament/, 'Software'],
    [/f24|agenzia entrate|inps|tribut/, 'Tasse e contributi'],
    [/commission|canone conto|spese conto|bollo/, 'Banca'],
    [/stipend|compens|collaborazion/, 'Compensi'],
    [/ristor|bar |pizzer|supermerc|conad|coop|esselunga/, 'Vitto'],
  ];
  for (const [re, cat] of rules) if (re.test(d)) return cat;
  return amount > 0 ? 'Entrate' : 'Altro';
}
