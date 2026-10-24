// Tools of a project (supabase/progetti_strumenti.sql): each one is a collection with its own fields,
// a way to show it and some sums. MYND AI composes them from these safe pieces for whatever the
// project needs; the examples below are only starting points.
import { supabase } from './supabase';
import { Member, ProjectsSetupError, memberName } from './projects';

export type FieldType = 'testo' | 'testo_lungo' | 'numero' | 'soldi' | 'data' | 'ora' | 'si_no' | 'scelta' | 'persona' | 'persone' | 'link' | 'email' | 'telefono' | 'valutazione';
export const FIELD_TYPES: { type: FieldType; label: string }[] = [
  { type: 'testo', label: 'Testo' }, { type: 'testo_lungo', label: 'Testo lungo' }, { type: 'numero', label: 'Numero' }, { type: 'soldi', label: 'Soldi' },
  { type: 'data', label: 'Data' }, { type: 'ora', label: 'Ora' }, { type: 'si_no', label: 'Sì / no' }, { type: 'scelta', label: 'Scelta tra opzioni' },
  { type: 'persona', label: 'Una persona' }, { type: 'persone', label: 'Più persone' }, { type: 'link', label: 'Link' }, { type: 'email', label: 'Email' },
  { type: 'telefono', label: 'Telefono' }, { type: 'valutazione', label: 'Voto da 1 a 5' },
];
const TYPES = new Set(FIELD_TYPES.map(f => f.type));

export interface ToolField { id: string; label: string; type: FieldType; options?: string[]; unit?: string; required?: boolean }
export type ToolView = 'lista' | 'checklist' | 'giorni';
// Which items a total looks at: only this month / this year (by a date field), only where a
// field has a value (e.g. "Pagato" is no → still to be paid).
export interface SumFilter { period?: 'mese' | 'anno'; date?: string; where?: { field: string; value: boolean | string } }
export type ToolSummary =
  | ({ kind: 'somma'; field: string; label?: string } & SumFilter)
  | ({ kind: 'conteggio'; label?: string; field?: string } & SumFilter)   // with `field` (si_no): how many are done
  | ({ kind: 'per_gruppo'; field: string; by: string; label?: string } & SumFilter)   // e.g. compenso per cliente
  | { kind: 'per_persona'; field: string; person: string; label?: string }
  | { kind: 'saldi'; amount: string; payer: string; between: string }
  | { kind: 'budget'; field: string; limit: number }
  | ({ kind: 'prodotto'; field: string; factor: number; byField?: string; label: string; unit?: string } & SumFilter);   // ore × 30, or ore × tariffa of each row
export interface ToolConfig { fields: ToolField[]; view: ToolView; groupBy?: string; sortBy?: string; sortDesc?: boolean; summaries: ToolSummary[]; itemName?: string; currency?: string }

export interface Tool { id: string; project_id: string; name: string; icon: string | null; description: string | null; config: ToolConfig; position: number; created_by: string | null; created_at: string; updated_at: string }
export interface ToolItem { id: string; tool_id: string; project_id: string; data: Record<string, unknown>; position: number; created_by: string | null; created_at: string; updated_at: string }
export interface ToolSpec { name: string; icon?: string; description?: string; config: ToolConfig }

// ───────────── Keeping whatever arrives (from the AI, from the database) within the safe pieces ─────────────

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'campo';
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const ICONS = ['list', 'wallet', 'calendar', 'map', 'clock', 'users', 'star', 'book', 'dumbbell', 'utensils', 'plane', 'home', 'briefcase', 'target', 'heart', 'cart', 'car', 'music', 'camera', 'gift', 'school', 'idea', 'chart', 'check', 'phone', 'bike', 'leaf', 'paw'];

export function cleanConfig(raw: unknown): ToolConfig {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const fields: ToolField[] = (Array.isArray(o.fields) ? o.fields : []).slice(0, 12).map((f): ToolField | null => {
    const x = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
    const label = str(x.label, 40);
    // A kind of field that does not exist is left out, never turned into something else.
    if (!label || (x.type !== undefined && !TYPES.has(x.type as FieldType))) return null;
    const type = (x.type as FieldType) || 'testo';
    let id = slug(str(x.id, 30) || label);
    while (seen.has(id)) id = `${id}_2`;
    seen.add(id);
    const field: ToolField = { id, label, type };
    if (type === 'scelta') field.options = [...new Set((Array.isArray(x.options) ? x.options : []).map(v => str(v, 40)).filter(Boolean))].slice(0, 15);
    if (type === 'numero' && str(x.unit, 15)) field.unit = str(x.unit, 15);
    if (x.required === true) field.required = true;
    return field;
  }).filter((f): f is ToolField => !!f);
  if (!fields.length || !['testo', 'testo_lungo'].includes(fields[0].type)) fields.unshift({ id: seen.has('nome') ? 'titolo' : 'nome', label: 'Nome', type: 'testo' });
  const has = (id: unknown, types?: FieldType[]) => typeof id === 'string' && fields.some(f => f.id === id && (!types || types.includes(f.type)));
  const num: FieldType[] = ['numero', 'soldi'];
  const filterOf = (x: Record<string, unknown>): SumFilter => {
    const f: SumFilter = {};
    if ((x.period === 'mese' || x.period === 'anno') && has(x.date, ['data'])) { f.period = x.period; f.date = x.date as string; }
    const w = x.where as Record<string, unknown> | undefined;
    if (w && has(w.field, ['si_no', 'scelta', 'persona']) && (typeof w.value === 'boolean' || (typeof w.value === 'string' && w.value.trim()))) f.where = { field: w.field as string, value: typeof w.value === 'string' ? w.value.trim().slice(0, 40) : w.value };
    return f;
  };
  const summaries: ToolSummary[] = (Array.isArray(o.summaries) ? o.summaries : []).slice(0, 8).map((s): ToolSummary | null => {
    const x = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    const label = str(x.label, 40) || undefined;
    switch (x.kind) {
      case 'somma': return has(x.field, num) ? { kind: 'somma', field: x.field as string, label, ...filterOf(x) } : null;
      case 'conteggio': return { kind: 'conteggio', label, ...(has(x.field, ['si_no']) ? { field: x.field as string } : {}), ...filterOf(x) };
      case 'per_gruppo': return has(x.field, num) && has(x.by, ['scelta', 'persona', 'si_no']) ? { kind: 'per_gruppo', field: x.field as string, by: x.by as string, label, ...filterOf(x) } : null;
      case 'per_persona': return has(x.field, num) && has(x.person, ['persona']) ? { kind: 'per_gruppo', field: x.field as string, by: x.person as string, label } : null;
      case 'saldi': return has(x.amount, ['soldi', 'numero']) && has(x.payer, ['persona']) && has(x.between, ['persone']) ? { kind: 'saldi', amount: x.amount as string, payer: x.payer as string, between: x.between as string } : null;
      case 'budget': return has(x.field, num) && Number(x.limit) > 0 ? { kind: 'budget', field: x.field as string, limit: Math.min(1e9, Number(x.limit)) } : null;
      case 'prodotto': {
        const byField = has(x.byField, num) && x.byField !== x.field ? x.byField as string : undefined;
        const factor = Number(x.factor);
        if (!has(x.field, num) || (!byField && (!Number.isFinite(factor) || factor === 0))) return null;
        return { kind: 'prodotto', field: x.field as string, factor: byField ? 1 : factor, ...(byField ? { byField } : {}), label: label || 'Totale', unit: str(x.unit, 10) || undefined, ...filterOf(x) };
      }
      default: return null;
    }
  }).filter((s): s is ToolSummary => !!s);
  // Expenses split between people make sense only with an amount and who paid.
  for (const sm of summaries) if (sm.kind === 'saldi') for (const id of [sm.amount, sm.payer]) { const f = fields.find(x => x.id === id); if (f) f.required = true; }
  const view: ToolView = o.view === 'checklist' && fields.some(f => f.type === 'si_no') ? 'checklist' : o.view === 'giorni' && fields.some(f => f.type === 'data') ? 'giorni' : 'lista';
  const out: ToolConfig = { fields, view, summaries };
  if (has(o.groupBy, ['scelta', 'persona', 'data', 'si_no'])) out.groupBy = o.groupBy as string;
  if (has(o.sortBy)) { out.sortBy = o.sortBy as string; out.sortDesc = o.sortDesc === true; }
  if (str(o.itemName, 30)) out.itemName = str(o.itemName, 30);
  if (/^[A-Z]{3}$/.test(str(o.currency, 3))) out.currency = str(o.currency, 3);
  return out;
}

export function cleanSpec(raw: unknown): ToolSpec | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = str(o.name, 60);
  if (!name) return null;
  return { name, icon: ICONS.includes(o.icon as string) ? (o.icon as string) : 'list', description: str(o.description, 300) || undefined, config: cleanConfig(o.config ?? o) };
}

// ───────────── Examples (starting points; the AI makes new ones for any need) ─────────────

export const TEMPLATES: (ToolSpec & { hint: string; group?: 'lavoro' | 'vita' })[] = [
  // ── For work (any freelance: designers, developers, photographers, consultants, makers…) ──
  { name: 'Lavori e clienti', icon: 'briefcase', group: 'lavoro', hint: 'Ogni lavoro con cliente, stato, compenso e consegna', description: 'I lavori, a che punto sono e quanto valgono.', config: {
    view: 'lista', itemName: 'lavoro', currency: 'EUR', groupBy: 'stato',
    fields: [{ id: 'lavoro', label: 'Lavoro', type: 'testo' }, { id: 'cliente', label: 'Cliente', type: 'scelta', options: [] }, { id: 'stato', label: 'Stato', type: 'scelta', options: ['Preventivo', 'Accettato', 'In corso', 'Consegnato', 'Pagato'] },
      { id: 'compenso', label: 'Compenso', type: 'soldi' }, { id: 'consegna', label: 'Consegna', type: 'data' }, { id: 'pagato', label: 'Pagato', type: 'si_no' }, { id: 'note', label: 'Note', type: 'testo_lungo' }],
    summaries: [{ kind: 'somma', field: 'compenso', label: 'Valore dei lavori' }, { kind: 'somma', field: 'compenso', label: 'Da incassare', where: { field: 'pagato', value: false } }, { kind: 'per_gruppo', field: 'compenso', by: 'cliente', label: 'Per cliente' }] } },
  { name: 'Ore e compensi', icon: 'clock', group: 'lavoro', hint: 'Ore lavorate, tariffa e quanto incassare', description: 'Le ore di lavoro e il compenso, con la tariffa di ogni lavoro.', config: {
    view: 'lista', itemName: 'sessione', currency: 'EUR', sortBy: 'data', sortDesc: true,
    fields: [{ id: 'attivita', label: 'Attività', type: 'testo' }, { id: 'data', label: 'Data', type: 'data', required: true }, { id: 'ore', label: 'Ore', type: 'numero', unit: 'h', required: true }, { id: 'cliente', label: 'Cliente', type: 'scelta', options: [] }, { id: 'tariffa', label: 'Tariffa oraria', type: 'soldi' }, { id: 'pagato', label: 'Pagato', type: 'si_no' }],
    summaries: [{ kind: 'somma', field: 'ore', label: 'Ore questo mese', period: 'mese', date: 'data' }, { kind: 'prodotto', field: 'ore', factor: 1, byField: 'tariffa', label: 'Compenso totale' }, { kind: 'prodotto', field: 'ore', factor: 1, byField: 'tariffa', label: 'Da incassare', where: { field: 'pagato', value: false } }] } },
  { name: 'Incassi', icon: 'chart', group: 'lavoro', hint: 'Fatture e pagamenti: incassato e da incassare', description: 'Quanto è entrato e quanto deve ancora entrare.', config: {
    view: 'lista', itemName: 'incasso', currency: 'EUR', sortBy: 'data', sortDesc: true,
    fields: [{ id: 'descrizione', label: 'Descrizione', type: 'testo' }, { id: 'cliente', label: 'Cliente', type: 'scelta', options: [] }, { id: 'importo', label: 'Importo', type: 'soldi', required: true }, { id: 'data', label: 'Data', type: 'data' }, { id: 'incassato', label: 'Incassato', type: 'si_no' }],
    summaries: [{ kind: 'somma', field: 'importo', label: 'Incassato questo mese', period: 'mese', date: 'data', where: { field: 'incassato', value: true } }, { kind: 'somma', field: 'importo', label: "Incassato quest'anno", period: 'anno', date: 'data', where: { field: 'incassato', value: true } }, { kind: 'somma', field: 'importo', label: 'Da incassare', where: { field: 'incassato', value: false } }, { kind: 'per_gruppo', field: 'importo', by: 'cliente', label: 'Per cliente' }] } },
  { name: 'Spese di lavoro', icon: 'cart', group: 'lavoro', hint: 'Software, attrezzatura, trasporti: quanto e cosa', description: 'Le spese del lavoro, per categoria.', config: {
    view: 'lista', itemName: 'spesa', currency: 'EUR', sortBy: 'data', sortDesc: true,
    fields: [{ id: 'cosa', label: 'Cosa', type: 'testo' }, { id: 'importo', label: 'Importo', type: 'soldi', required: true }, { id: 'data', label: 'Data', type: 'data' }, { id: 'categoria', label: 'Categoria', type: 'scelta', options: ['Software', 'Attrezzatura', 'Trasporti', 'Formazione', 'Altro'] }, { id: 'deducibile', label: 'Deducibile', type: 'si_no' }],
    summaries: [{ kind: 'somma', field: 'importo', label: "Spese quest'anno", period: 'anno', date: 'data' }, { kind: 'per_gruppo', field: 'importo', by: 'categoria', label: 'Per categoria' }, { kind: 'somma', field: 'importo', label: 'Deducibili', where: { field: 'deducibile', value: true } }] } },
  { name: 'Preventivi', icon: 'idea', group: 'lavoro', hint: 'Inviati, accettati, rifiutati', description: 'I preventivi e come sono andati.', config: {
    view: 'lista', itemName: 'preventivo', currency: 'EUR', groupBy: 'stato',
    fields: [{ id: 'preventivo', label: 'Preventivo', type: 'testo' }, { id: 'cliente', label: 'Cliente', type: 'scelta', options: [] }, { id: 'importo', label: 'Importo', type: 'soldi' }, { id: 'inviato', label: 'Inviato il', type: 'data' }, { id: 'stato', label: 'Stato', type: 'scelta', options: ['Da inviare', 'Inviato', 'Accettato', 'Rifiutato'] }],
    summaries: [{ kind: 'somma', field: 'importo', label: 'Accettati', where: { field: 'stato', value: 'Accettato' } }, { kind: 'somma', field: 'importo', label: 'In attesa', where: { field: 'stato', value: 'Inviato' } }] } },
  // ── For everything else ──
  { name: 'Spese condivise', group: 'vita', icon: 'wallet', hint: 'Chi ha pagato cosa e chi deve quanto a chi', description: 'Le spese del gruppo, divise tra chi partecipa.', config: {
    view: 'lista', itemName: 'spesa', currency: 'EUR', sortBy: 'data', sortDesc: true,
    fields: [{ id: 'cosa', label: 'Cosa', type: 'testo' }, { id: 'importo', label: 'Importo', type: 'soldi', required: true }, { id: 'pagato_da', label: 'Pagato da', type: 'persona', required: true }, { id: 'diviso_tra', label: 'Diviso tra', type: 'persone' }, { id: 'data', label: 'Data', type: 'data' }, { id: 'categoria', label: 'Categoria', type: 'scelta', options: ['Viaggio', 'Alloggio', 'Cibo', 'Attività', 'Altro'] }],
    summaries: [{ kind: 'somma', field: 'importo', label: 'Speso in tutto' }, { kind: 'saldi', amount: 'importo', payer: 'pagato_da', between: 'diviso_tra' }] } },
  { name: 'Programma', group: 'vita', icon: 'calendar', hint: 'Giorno per giorno, con orari e luoghi', description: 'Cosa succede e quando.', config: {
    view: 'giorni', itemName: 'momento',
    fields: [{ id: 'cosa', label: 'Cosa', type: 'testo' }, { id: 'data', label: 'Giorno', type: 'data', required: true }, { id: 'ora', label: 'Ora', type: 'ora' }, { id: 'dove', label: 'Dove', type: 'testo' }, { id: 'note', label: 'Note', type: 'testo_lungo' }],
    summaries: [] } },
  { name: 'Lista', group: 'vita', icon: 'check', hint: 'Cose da portare, comprare, ricordare', description: 'Una lista da spuntare, con chi se ne occupa.', config: {
    view: 'checklist', itemName: 'voce',
    fields: [{ id: 'cosa', label: 'Cosa', type: 'testo' }, { id: 'fatto', label: 'Fatto', type: 'si_no' }, { id: 'chi', label: 'Chi', type: 'persona' }],
    summaries: [{ kind: 'conteggio', field: 'fatto', label: 'Fatte' }] } },
  { name: 'Contatti', group: 'lavoro', icon: 'phone', hint: 'Clienti, fornitori, persone utili', description: 'Chi contattare e come.', config: {
    view: 'lista', itemName: 'contatto', groupBy: 'ruolo',
    fields: [{ id: 'nome', label: 'Nome', type: 'testo' }, { id: 'ruolo', label: 'Ruolo', type: 'scelta', options: ['Cliente', 'Fornitore', 'Collaboratore', 'Altro'] }, { id: 'telefono', label: 'Telefono', type: 'telefono' }, { id: 'email', label: 'Email', type: 'email' }, { id: 'note', label: 'Note', type: 'testo_lungo' }],
    summaries: [{ kind: 'conteggio', label: 'Contatti' }] } },
  { name: 'Posti e idee', group: 'vita', icon: 'map', hint: 'Ristoranti, luoghi, cose da provare, con voto', description: 'Posti e idee da provare, con il voto di chi c\'è stato.', config: {
    view: 'lista', itemName: 'posto', groupBy: 'tipo',
    fields: [{ id: 'nome', label: 'Nome', type: 'testo' }, { id: 'tipo', label: 'Tipo', type: 'scelta', options: ['Mangiare', 'Vedere', 'Fare', 'Dormire'] }, { id: 'dove', label: 'Dove', type: 'testo' }, { id: 'link', label: 'Link', type: 'link' }, { id: 'voto', label: 'Voto', type: 'valutazione' }, { id: 'fatto', label: 'Già fatto', type: 'si_no' }],
    summaries: [{ kind: 'conteggio', label: 'Posti' }] } },
];

// ───────────── People: project members or simple names (friends without MYND) ─────────────

export const personKey = (userId: string) => `u:${userId}`;
export function personLabel(v: string, members: Member[], me: string): string {
  if (v.startsWith('u:')) return memberName(members, v.slice(2), me) || 'Ex membro';
  return v.startsWith('n:') ? v.slice(2) : v;
}
// Everyone who can be chosen in a tool: the project's people and the names already used in it.
export function peopleOf(tool: Tool, items: ToolItem[], members: Member[]): string[] {
  const keys = members.map(m => personKey(m.user_id));
  const fieldIds = tool.config.fields.filter(f => f.type === 'persona' || f.type === 'persone').map(f => f.id);
  for (const it of items) for (const id of fieldIds) {
    const v = it.data[id];
    for (const x of Array.isArray(v) ? v : [v]) if (typeof x === 'string' && x && !keys.some(k => k.toLowerCase() === x.toLowerCase())) keys.push(x);
  }
  return keys;
}

const ME_WORDS = ['tu', 'io', 'me', 'me stesso', 'me stessa', 'myself'];
// One person is always the same key: "Marco" typed by hand is Marco of the project if he is in it,
// "io"/"tu" is the person writing, and "marco" is the same as "Marco".
export function resolvePerson(raw: string, people: string[], members: Member[], me: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith('u:')) return v.slice(0, 80);
  const name = (v.startsWith('n:') ? v.slice(2) : v).trim().slice(0, 40);
  if (!name) return null;
  const low = name.toLowerCase();
  if (me && ME_WORDS.includes(low)) return personKey(me);
  const member = members.find(m => [m.name, m.email?.split('@')[0], m.email].some(x => x && x.toLowerCase() === low));
  if (member) return personKey(member.user_id);
  return people.find(p => p.toLowerCase() === `n:${low}`) || `n:${name}`;
}

// A repayment ("Saldato", "Marco mi ha ridato 20 €"): it settles debts, it is not a new expense.
export const RIMBORSO = '_rimborso';
export function isRepayment(tool: Tool, it: ToolItem | { data: Record<string, unknown> }): boolean {
  if (it.data[RIMBORSO] === true) return true;
  // Made before repayments were marked: a "Rimborso" from one person to one other person.
  const s = tool.config.summaries.find(x => x.kind === 'saldi');
  if (!s || s.kind !== 'saldi') return false;
  const between = it.data[s.between];
  return String(it.data[tool.config.fields[0].id] ?? '').trim().toLowerCase() === 'rimborso' && Array.isArray(between) && between.length === 1;
}

// ───────────── Values ─────────────

export const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v.replace(',', '.'))) ? Number(v.replace(',', '.')) : 0);
export function money(v: number, currency = 'EUR'): string {
  try { return v.toLocaleString('it-IT', { style: 'currency', currency, minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }); }
  catch { return `${v.toFixed(2)} ${currency}`; }
}
export function formatValue(f: ToolField, v: unknown, cfg: ToolConfig, members: Member[], me: string): string {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return '';
  switch (f.type) {
    case 'soldi': return money(num(v), cfg.currency);
    case 'numero': return `${num(v).toLocaleString('it-IT')}${f.unit ? ` ${f.unit}` : ''}`;
    case 'data': return typeof v === 'string' ? new Date(v + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '';
    case 'si_no': return v === true ? f.label : '';
    case 'persona': return typeof v === 'string' ? personLabel(v, members, me) : '';
    case 'persone': return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(x => personLabel(x, members, me)).join(', ') : '';
    case 'valutazione': return '★'.repeat(Math.max(0, Math.min(5, Math.round(num(v)))));
    case 'link': try { return new URL(String(v)).hostname.replace(/^www\./, ''); } catch { return String(v); }
    default: return String(v);
  }
}

// What an item is called in lists: its first text field.
export const itemTitle = (tool: Tool, it: ToolItem) => String(it.data[tool.config.fields[0].id] || '').trim() || `(${tool.config.itemName || 'voce'} senza nome)`;

// ───────────── Sums ─────────────

export interface Transfer { from: string; to: string; amount: number }

// Who owes whom: each expense is paid by one person and split equally among the chosen people
// (everyone in the tool when none is chosen); the balances are settled with the fewest transfers.
export function balances(items: ToolItem[], s: Extract<ToolSummary, { kind: 'saldi' }>, everyone: string[]): { net: Map<string, number>; transfers: Transfer[] } {
  const net = new Map<string, number>();
  const add = (k: string, v: number) => net.set(k, (net.get(k) || 0) + v);
  for (const it of items) {
    const amount = num(it.data[s.amount]);
    const payer = it.data[s.payer];
    if (!amount || typeof payer !== 'string' || !payer) continue;
    const raw = it.data[s.between];
    const between = Array.isArray(raw) && raw.length ? raw.filter((x): x is string => typeof x === 'string') : everyone;
    if (!between.length) continue;
    add(payer, amount);
    for (const p of between) add(p, -amount / between.length);
  }
  const cents = [...net.entries()].map(([k, v]) => [k, Math.round(v * 100)] as [string, number]);
  const debtors = cents.filter(([, v]) => v < 0).map(([k, v]) => ({ k, v: -v })).sort((a, b) => b.v - a.v);
  const creditors = cents.filter(([, v]) => v > 0).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);
  const transfers: Transfer[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].v, creditors[j].v);
    if (pay > 0) transfers.push({ from: debtors[i].k, to: creditors[j].k, amount: pay / 100 });
    debtors[i].v -= pay; creditors[j].v -= pay;
    if (debtors[i].v <= 0) i++;
    if (creditors[j].v <= 0) j++;
  }
  return { net, transfers };
}

export interface SummaryResult { label: string; value: string; detail?: string[]; progress?: number; transfers?: Transfer[] }

export function computeSummary(tool: Tool, allItems: ToolItem[], s: ToolSummary, members: Member[], me: string): SummaryResult {
  const cfg = tool.config;
  // Repayments settle debts: they count for "chi deve a chi" only, never as spending or as items.
  const items = s.kind === 'saldi' ? allItems : allItems.filter(it => !isRepayment(tool, it));
  const field = (id: string) => cfg.fields.find(f => f.id === id)!;
  const fmt = (id: string, v: number) => (field(id).type === 'soldi' ? money(v, cfg.currency) : `${Math.round(v * 100) / 100}${field(id).unit ? ` ${field(id).unit}` : ''}`);
  const total = (id: string, list = items) => list.reduce((a, it) => a + num(it.data[id]), 0);
  // Only the items a filtered total looks at (this month, "Pagato" = no…).
  const pick = (f: SumFilter) => items.filter(it => {
    if (f.period && f.date) {
      const d = it.data[f.date];
      if (typeof d !== 'string') return false;
      const now = new Date().toISOString();
      if (d.slice(0, f.period === 'mese' ? 7 : 4) !== now.slice(0, f.period === 'mese' ? 7 : 4)) return false;
    }
    if (f.where) {
      const v = it.data[f.where.field];
      if (typeof f.where.value === 'boolean' ? (v === true) !== f.where.value : String(v ?? '').toLowerCase() !== String(f.where.value).toLowerCase()) return false;
    }
    return true;
  });
  const groupLabel = (by: string, v: unknown) => {
    const f = field(by);
    if (f.type === 'persona') return typeof v === 'string' && v ? personLabel(v, members, me) : 'Nessuno';
    if (f.type === 'si_no') return v === true ? f.label : `Non ${f.label.toLowerCase()}`;
    return typeof v === 'string' && v ? v : 'Senza';
  };
  switch (s.kind) {
    case 'somma': return { label: s.label || `Totale ${field(s.field).label.toLowerCase()}${filterText(cfg, s)}`, value: fmt(s.field, total(s.field, pick(s))) };
    case 'conteggio': {
      const list = pick(s);
      if (!s.field) return { label: s.label || `Voci${filterText(cfg, s)}`, value: String(list.length) };
      const done = list.filter(it => it.data[s.field!] === true).length;
      return { label: s.label || field(s.field).label, value: `${done} di ${list.length}`, progress: list.length ? done / list.length : 0 };
    }
    case 'per_gruppo': {
      const by = new Map<string, number>();
      for (const it of pick(s)) { const k = groupLabel(s.by, it.data[s.by]); by.set(k, (by.get(k) || 0) + num(it.data[s.field])); }
      const rows = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${fmt(s.field, v)}`);
      return { label: s.label || `${field(s.field).label} per ${field(s.by).label.toLowerCase()}${filterText(cfg, s)}`, value: rows.length ? `${rows.length} ${rows.length === 1 ? 'gruppo' : 'gruppi'}` : '—', detail: rows };
    }
    case 'per_persona': {
      const by = new Map<string, number>();
      for (const it of items) { const p = it.data[s.person]; if (typeof p === 'string' && p) by.set(p, (by.get(p) || 0) + num(it.data[s.field])); }
      const rows = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${personLabel(k, members, me)}: ${fmt(s.field, v)}`);
      return { label: s.label || `${field(s.field).label} per persona`, value: rows.length ? `${rows.length} ${rows.length === 1 ? 'persona' : 'persone'}` : '—', detail: rows };
    }
    case 'saldi': {
      const everyone = peopleOf(tool, items, members);
      const { transfers } = balances(items, s, everyone);
      return { label: 'Chi deve a chi', value: transfers.length ? `${transfers.length} ${transfers.length === 1 ? 'passaggio' : 'passaggi'}` : 'Tutti in pari', transfers };
    }
    case 'budget': {
      const spent = total(s.field);
      return { label: 'Budget', value: `${fmt(s.field, spent)} su ${fmt(s.field, s.limit)}`, progress: Math.min(1, spent / s.limit), detail: [spent > s.limit ? `Sforato di ${fmt(s.field, spent - s.limit)}` : `Restano ${fmt(s.field, s.limit - spent)}`] };
    }
    case 'prodotto': {
      const list = pick(s);
      const v = s.byField ? list.reduce((a, it) => a + num(it.data[s.field]) * num(it.data[s.byField!]), 0) : total(s.field, list) * s.factor;
      if (s.byField && field(s.byField).type === 'soldi') return { label: s.label, value: money(v, cfg.currency || 'EUR') };
      return { label: s.label, value: s.unit === '€' ? money(v, cfg.currency || 'EUR') : `${Math.round(v * 100) / 100}${s.unit ? ` ${s.unit}` : ''}` };
    }
  }
}

// "· questo mese", "· dove Pagato è no": what a filtered total looks at, in words.
export function filterText(cfg: ToolConfig, f: SumFilter): string {
  const parts: string[] = [];
  if (f.period) parts.push(f.period === 'mese' ? 'questo mese' : "quest'anno");
  if (f.where) {
    const w = cfg.fields.find(x => x.id === f.where!.field);
    if (w) parts.push(typeof f.where.value === 'boolean' ? `${f.where.value ? '' : 'non '}${w.label.toLowerCase()}` : `${w.label.toLowerCase()} ${f.where.value}`);
  }
  return parts.length ? ` · ${parts.join(', ')}` : '';
}

// Totals worth one tap, from the columns the tool has ("Totale compenso", "Compenso da incassare",
// "Ore questo mese", "Compenso per cliente", "Ore × tariffa"…), without the ones already there.
export function suggestSummaries(cfg: ToolConfig): { text: string; summary: ToolSummary }[] {
  const out: { text: string; summary: ToolSummary }[] = [];
  const nums = cfg.fields.filter(f => f.type === 'soldi' || f.type === 'numero');
  const money = cfg.fields.filter(f => f.type === 'soldi');
  const date = cfg.fields.find(f => f.type === 'data');
  const flags = cfg.fields.filter(f => f.type === 'si_no');
  const groups = cfg.fields.filter(f => f.type === 'scelta' || f.type === 'persona');
  const lc = (s: string) => s.toLowerCase();
  for (const n of nums) {
    out.push({ text: `Totale ${lc(n.label)}`, summary: { kind: 'somma', field: n.id } });
    if (date) {
      out.push({ text: `${n.label} questo mese`, summary: { kind: 'somma', field: n.id, label: `${n.label} questo mese`, period: 'mese', date: date.id } });
      out.push({ text: `${n.label} quest'anno`, summary: { kind: 'somma', field: n.id, label: `${n.label} quest'anno`, period: 'anno', date: date.id } });
    }
    for (const f of flags) {
      out.push({ text: `${n.label} non ${lc(f.label)}`, summary: { kind: 'somma', field: n.id, label: `${n.label} non ${lc(f.label)}`, where: { field: f.id, value: false } } });
      out.push({ text: `${n.label} ${lc(f.label)}`, summary: { kind: 'somma', field: n.id, label: `${n.label} ${lc(f.label)}`, where: { field: f.id, value: true } } });
    }
    for (const g of groups) out.push({ text: `${n.label} per ${lc(g.label)}`, summary: { kind: 'per_gruppo', field: n.id, by: g.id, label: `${n.label} per ${lc(g.label)}` } });
    if (n.type === 'numero') for (const m of money) out.push({ text: `${n.label} × ${lc(m.label)}`, summary: { kind: 'prodotto', field: n.id, factor: 1, byField: m.id, label: `${n.label} × ${lc(m.label)}` } });
    if (n.type === 'soldi') out.push({ text: `Budget massimo per ${lc(n.label)}`, summary: { kind: 'budget', field: n.id, limit: 1000 } });
  }
  for (const f of flags) out.push({ text: `Quanti ${lc(f.label)}`, summary: { kind: 'conteggio', field: f.id, label: f.label } });
  out.push({ text: 'Quante voci', summary: { kind: 'conteggio' } });
  const payer = cfg.fields.find(f => f.type === 'persona');
  const between = cfg.fields.find(f => f.type === 'persone');
  if (money[0] && payer && between) out.push({ text: 'Chi deve quanto a chi', summary: { kind: 'saldi', amount: money[0].id, payer: payer.id, between: between.id } });
  const key = (x: ToolSummary) => { const o = x as unknown as Record<string, unknown>; return JSON.stringify(Object.keys(o).filter(k => k !== 'label' && o[k] !== undefined).sort().map(k => [k, o[k]])); };
  const have = new Set(cfg.summaries.map(key));
  return out.filter(x => !have.has(key(x.summary)));
}

// The fields a total uses (deleting one of them removes the total).
export function summaryRefs(s: ToolSummary): string[] {
  const f = 'period' in s || 'where' in s ? [(s as SumFilter).date, (s as SumFilter).where?.field].filter((x): x is string => !!x) : [];
  switch (s.kind) {
    case 'saldi': return [s.amount, s.payer, s.between];
    case 'per_persona': return [s.field, s.person];
    case 'per_gruppo': return [s.field, s.by, ...f];
    case 'conteggio': return [...(s.field ? [s.field] : []), ...f];
    case 'prodotto': return [s.field, ...(s.byField ? [s.byField] : []), ...f];
    case 'budget': return [s.field];
    case 'somma': return [s.field, ...f];
  }
}

// What a total is, in words ("Totale compenso · questo mese"), for the editor and the AI.
export function summaryText(cfg: ToolConfig, s: ToolSummary): string {
  const l = (id: string) => cfg.fields.find(f => f.id === id)?.label.toLowerCase() || id;
  switch (s.kind) {
    case 'somma': return s.label || `Totale ${l(s.field)}${filterText(cfg, s)}`;
    case 'conteggio': return s.label || (s.field ? `Quanti con "${l(s.field)}"` : `Quante voci${filterText(cfg, s)}`);
    case 'per_gruppo': return s.label || `${l(s.field)} per ${l(s.by)}${filterText(cfg, s)}`;
    case 'per_persona': return s.label || `${l(s.field)} per persona`;
    case 'saldi': return 'Chi deve quanto a chi';
    case 'budget': return `Budget massimo ${s.limit}`;
    case 'prodotto': return s.label;
  }
}

// ───────────── Database ─────────────

function db() {
  if (!supabase) throw new Error('Supabase non configurato');
  return supabase;
}
type PgError = { code?: string; message?: string } | null;
function fail(error: PgError): never {
  const code = error?.code || '';
  if (code === 'PGRST205' || code === '42P01') throw new ProjectsSetupError('Per gli strumenti serve lo script "Strumenti dei progetti" su Supabase.');
  if (code === '42501') throw new Error('Non hai il permesso per questa modifica.');
  if (code === 'P0001' || code === '23514') throw new Error(error?.message?.startsWith('new row') ? 'Alcuni dati non sono validi o sono troppi.' : error?.message || 'Modifica non valida.');
  if (/fetch|network/i.test(error?.message || '')) throw new Error('Connessione assente: controlla internet e riprova.');
  throw new Error(error?.message || 'Qualcosa non ha funzionato. Riprova.');
}
const TOOL_COLS = 'id, project_id, name, icon, description, config, position, created_by, created_at, updated_at';
const ITEM_COLS = 'id, tool_id, project_id, data, position, created_by, created_at, updated_at';
const cleanTool = (t: Tool): Tool => ({ ...t, config: cleanConfig(t.config) });

// The tools of a project and their items ([] when the tools are not set up yet: `ready` says so).
export async function loadTools(projectId: string): Promise<{ ready: boolean; tools: Tool[]; items: ToolItem[] }> {
  const t = await db().from('prj_tools').select(TOOL_COLS).eq('project_id', projectId).order('position');
  if (t.error) { if (t.error.code === 'PGRST205' || t.error.code === '42P01') return { ready: false, tools: [], items: [] }; fail(t.error); }
  const i = await db().from('prj_tool_items').select(ITEM_COLS).eq('project_id', projectId).order('position').limit(20000);
  if (i.error) fail(i.error);
  return { ready: true, tools: ((t.data || []) as Tool[]).map(cleanTool), items: (i.data || []) as ToolItem[] };
}

export async function createTool(projectId: string, spec: ToolSpec, position: number): Promise<Tool> {
  const { data, error } = await db().from('prj_tools').insert({ project_id: projectId, name: spec.name, icon: spec.icon || 'list', description: spec.description || null, config: cleanConfig(spec.config), position }).select(TOOL_COLS).single();
  if (error) fail(error);
  return cleanTool(data as Tool);
}

export async function updateTool(id: string, patch: Partial<Pick<Tool, 'name' | 'icon' | 'description' | 'config' | 'position'>>): Promise<Tool> {
  const { data, error } = await db().from('prj_tools').update(patch.config ? { ...patch, config: cleanConfig(patch.config) } : patch).eq('id', id).select(TOOL_COLS).single();
  if (error) fail(error);
  return cleanTool(data as Tool);
}

export async function deleteTool(id: string): Promise<void> {
  const { error } = await db().from('prj_tools').delete().eq('id', id);
  if (error) fail(error);
}

export async function saveItem(tool: Tool, data: Record<string, unknown>, id?: string, position = 0): Promise<ToolItem> {
  const q = id
    ? db().from('prj_tool_items').update({ data }).eq('id', id)
    : db().from('prj_tool_items').insert({ tool_id: tool.id, project_id: tool.project_id, data, position });
  const res = await q.select(ITEM_COLS).single();
  if (res.error) fail(res.error);
  return res.data as ToolItem;
}

// Many items in one go (a list prepared by MYND AI): one request instead of one per item.
export async function saveItems(tool: Tool, datas: Record<string, unknown>[], startPosition = Date.now() / 1000): Promise<ToolItem[]> {
  if (!datas.length) return [];
  const rows = datas.slice(0, 200).map((data, i) => ({ tool_id: tool.id, project_id: tool.project_id, data, position: startPosition + i / 1000 }));
  const { data, error } = await db().from('prj_tool_items').insert(rows).select(ITEM_COLS);
  if (error) fail(error);
  return (data || []) as ToolItem[];
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await db().from('prj_tool_items').delete().eq('id', id);
  if (error) fail(error);
}

// Only the values that fit the tool's fields (what the AI or a form sends is checked here).
// opts.guess: items MYND AI imagined (a list it prepared): amounts, people and dates are never
// invented, so they are left empty for the person to fill in.
export function cleanItemData(cfg: ToolConfig, raw: Record<string, unknown>, people: string[], opts: { members?: Member[]; me?: string; guess?: boolean } = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const person = (v: unknown) => (typeof v === 'string' ? resolvePerson(v, people, opts.members || [], opts.me || '') : null);
  for (const f of cfg.fields) {
    const v = raw[f.id];
    if (v === undefined || v === null || v === '') continue;
    // Nothing done yet and nothing rated yet either: a guessed list starts unticked and unrated.
    if (opts.guess && ['soldi', 'persona', 'persone', 'data', 'ora', 'si_no', 'valutazione'].includes(f.type)) continue;
    switch (f.type) {
      case 'numero': case 'soldi': { const n = num(v); if (n || v === 0 || v === '0') out[f.id] = Math.round(n * 100) / 100; break; }
      case 'valutazione': { const n = Math.round(num(v)); if (n >= 1 && n <= 5) out[f.id] = n; break; }
      case 'si_no': out[f.id] = v === true || v === 'true' || v === 'sì' || v === 'si'; break;
      case 'data': if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) out[f.id] = v; break;
      case 'ora': if (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v)) out[f.id] = v.padStart(5, '0'); break;
      case 'scelta': if (typeof v === 'string' && v.trim()) out[f.id] = v.trim().slice(0, 40); break;
      case 'persona': { const p = person(v); if (p) out[f.id] = p; break; }
      case 'persone': { const list = (Array.isArray(v) ? v : [v]).map(person).filter((x): x is string => !!x); if (list.length) out[f.id] = [...new Set(list)].slice(0, 50); break; }
      case 'link': { const s = String(v).trim(); const u = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`; try { const p = new URL(u); if (p.protocol === 'https:' || p.protocol === 'http:') out[f.id] = p.toString(); } catch { /* not a link */ } break; }
      default: out[f.id] = String(v).slice(0, f.type === 'testo_lungo' ? 4000 : 300);
    }
  }
  if (raw[RIMBORSO] === true && !opts.guess) out[RIMBORSO] = true;
  return out;
}

// What makes no sense in an item, said plainly (null when it is fine). `warnings` are only doubts.
export function checkItem(cfg: ToolConfig, data: Record<string, unknown>): { error: string | null; warnings: string[] } {
  const warnings: string[] = [];
  for (const [i, f] of cfg.fields.entries()) {
    const v = data[f.id];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
    if (empty) { if (f.required || i === 0) return { error: `Manca: ${f.label.toLowerCase()}.`, warnings }; continue; }
    if (f.type === 'soldi') {
      const n = num(v);
      if (n <= 0) return { error: `${f.label}: dev'essere più di zero.`, warnings };
      if (n > 1_000_000) return { error: `${f.label}: l'importo sembra sbagliato (più di un milione).`, warnings };
    }
    if (f.type === 'numero') {
      const n = num(v);
      if (Math.abs(n) > 10_000_000) return { error: `${f.label}: il numero sembra sbagliato.`, warnings };
      if (n < 0 && f.unit) return { error: `${f.label}: non può essere negativo.`, warnings };
      if (f.unit && /^(h|ore)$/i.test(f.unit) && n > 24) warnings.push(`${f.label}: più di 24 ore in una volta, è giusto?`);
    }
    if (f.type === 'data' && typeof v === 'string') {
      const y = Number(v.slice(0, 4));
      if (y < 2000 || y > 2100) return { error: `${f.label}: controlla l'anno (${y}).`, warnings };
    }
  }
  return { error: null, warnings };
}

// The same item already there (an AI proposal repeated, a double tap): same values, repayment flag aside.
export function sameItem(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const norm = (d: Record<string, unknown>) => JSON.stringify(Object.keys(d).filter(k => k !== RIMBORSO).sort().map(k => [k, Array.isArray(d[k]) ? [...(d[k] as unknown[])].map(String).sort() : typeof d[k] === 'string' ? (d[k] as string).trim().toLowerCase() : d[k]]));
  return norm(a) === norm(b);
}
