// MYND Business: what the company needs to know, computed with explainable rules (no AI).
// The AI only phrases things and reads documents; numbers and priorities come from here.
import { Contract, ContractTerm, Person, Project, Task, nextDue, projectHealth, everyLabel } from './business';
import { BizSnapshot, BizEvent, Invoice } from './businessData';

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (key: string, n: number) => { const d = new Date(key + 'T00:00:00'); d.setDate(d.getDate() + n); return dayKey(d); };
export const diffDays = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00') - Date.parse(from + 'T00:00:00')) / 86400000);
export const eur = (v: number) => v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// ───────────── Cosa richiede attenzione ─────────────
export interface Attention { id: string; score: number; title: string; why: string; area: 'progetti' | 'clienti' | 'finanza' | 'team' | 'agenda'; targetId?: string }

export function attentionList(s: BizSnapshot, today: string, myPersonId: string | null): Attention[] {
  const out: Attention[] = [];
  const cp = (id: string | null) => s.clients.find(c => c.id === id);
  // Invoices: ours not paid, theirs to pay.
  for (const inv of s.invoices.filter(i => i.status === 'aperta' && i.due_date)) {
    const days = diffDays(today, inv.due_date!);
    const who = cp(inv.counterparty_id)?.name || inv.counterparty_name || 'senza nome';
    if (inv.direction === 'emessa' && days < 0) out.push({ id: `inv-${inv.id}`, score: 90 + Math.min(-days, 30), area: 'finanza', targetId: inv.id, title: `Fattura ${inv.number || ''} a ${who} scaduta da ${-days} giorni`, why: `${eur(inv.total)} da incassare: conviene sollecitare oggi.` });
    if (inv.direction === 'ricevuta' && days >= 0 && days <= 7) out.push({ id: `inv-${inv.id}`, score: 70 - days, area: 'finanza', targetId: inv.id, title: `Da pagare a ${who} ${days === 0 ? 'oggi' : `entro ${days} giorni`}`, why: `${eur(inv.total)}, fattura ${inv.number || ''}.` });
    if (inv.direction === 'ricevuta' && days < 0) out.push({ id: `inv-${inv.id}`, score: 85, area: 'finanza', targetId: inv.id, title: `Pagamento a ${who} in ritardo di ${-days} giorni`, why: `${eur(inv.total)}: evita penali e mantieni il rapporto.` });
  }
  // Projects at risk.
  for (const p of s.projects.filter(x => x.status === 'attivo')) {
    const h = projectHealth(p, s.tasks.filter(t => t.project_id === p.id), today);
    if (h.score < 70) out.push({ id: `prj-${p.id}`, score: 100 - h.score, area: 'progetti', targetId: p.id, title: `${p.name} è a rischio (${h.score}/100)`, why: h.notes.join(' · ') });
  }
  // My tasks late or due today.
  for (const t of s.tasks.filter(x => x.status !== 'fatto' && x.due_date && x.due_date <= today && (!myPersonId || x.assignee_person_id === myPersonId))) {
    const late = diffDays(t.due_date!, today);
    const where = [s.projects.find(p => p.id === t.project_id)?.name, s.people.find(p => p.id === t.assignee_person_id)?.name].filter(Boolean).join(' · ');
    out.push({ id: `task-${t.id}`, score: late > 0 ? 75 + Math.min(late, 20) : 65, area: 'progetti', targetId: t.project_id || undefined, title: late > 0 ? `“${t.title}” è in ritardo di ${late} ${late === 1 ? 'giorno' : 'giorni'}` : `“${t.title}” scade oggi`,
      why: `${where || 'Compito'}${t.importance >= 4 ? ' · importante' : ''}${late > 0 ? ': chiudilo o sposta la data.' : '.'}` });
  }
  // Contract obligations close, contracts to cancel, rights over the limit.
  for (const term of s.terms) {
    const c = s.contracts.find(x => x.id === term.contract_id);
    if (!c || c.status !== 'attivo') continue;
    const due = nextDue(term, c, today);
    const who = cp(c.counterparty_id)?.name || '';
    if (due && term.party === 'noi' && term.kind === 'obbligo') {
      const days = diffDays(today, due);
      if (days <= 7) out.push({ id: `term-${term.id}`, score: 72 - days * 2, area: 'clienti', targetId: c.counterparty_id, title: `${who}: ${term.description}`, why: `Obbligo del contratto, ${days <= 0 ? 'da fare oggi' : `entro ${days} giorni`}.` });
    }
    if (due && term.party === 'controparte' && term.kind === 'obbligo' && diffDays(today, due) < 0) {
      out.push({ id: `term-${term.id}`, score: 70, area: 'clienti', targetId: c.counterparty_id, title: `${who} non ha ancora: ${term.description}`, why: `Era dovuto il ${due.split('-').reverse().slice(0, 2).join('/')}.` });
    }
    if (term.quota != null && term.used > term.quota) out.push({ id: `quota-${term.id}`, score: 55, area: 'clienti', targetId: c.counterparty_id, title: `${who}: ${term.description} oltre il limite (${term.used}/${term.quota})`, why: 'Quello che supera il contratto va fatturato a parte.' });
  }
  for (const c of s.contracts.filter(x => x.status === 'attivo' && x.auto_renew && x.end_date && x.notice_days != null)) {
    const cancelBy = addDays(c.end_date!, -c.notice_days!);
    const days = diffDays(today, cancelBy);
    if (days >= 0 && days <= 30) out.push({ id: `renew-${c.id}`, score: 60 + (30 - days), area: 'clienti', targetId: c.counterparty_id, title: `${c.title}: decidi se rinnovarlo entro ${days} giorni`, why: `Si rinnova da solo; per non rinnovarlo va disdetto entro il ${cancelBy.split('-').reverse().slice(0, 2).join('/')}.` });
  }
  // People overloaded this week.
  for (const l of teamLoad(s.people, s.tasks, today).filter(x => x.ratio > 1.1)) {
    out.push({ id: `load-${l.person.id}`, score: 50 + Math.min(30, Math.round((l.ratio - 1) * 50)), area: 'team', title: `${l.person.name} ha troppo lavoro questa settimana`, why: `${l.hours} h di compiti su ${l.capacity} h disponibili: sposta qualcosa.` });
  }
  const seen = new Set<string>();
  return out.filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true))).sort((a, b) => b.score - a.score);
}

// ───────────── Agenda: eventi veri + scadenze ricavate ─────────────
export interface AgendaItem { id: string; date: string; time: string | null; title: string; kind: string; detail: string; source: 'evento' | 'compito' | 'obbligo' | 'fattura' | 'contratto' | 'progetto'; ref?: string }

export function agendaItems(s: BizSnapshot, from: string, to: string): AgendaItem[] {
  const items: AgendaItem[] = [];
  const cp = (id: string | null) => s.clients.find(c => c.id === id)?.name;
  for (const e of s.events) {
    const d = new Date(e.starts_at);
    const key = dayKey(d);
    if (key < from || key > to) continue;
    items.push({ id: `ev-${e.id}`, date: key, time: e.all_day ? null : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, title: e.title, kind: e.kind,
      detail: [cp(e.counterparty_id), e.location].filter(Boolean).join(' · '), source: 'evento', ref: e.id });
  }
  for (const t of s.tasks.filter(x => x.status !== 'fatto' && x.due_date && x.due_date >= from && x.due_date <= to)) {
    const who = s.people.find(p => p.id === t.assignee_person_id)?.name;
    items.push({ id: `tk-${t.id}`, date: t.due_date!, time: null, title: t.title, kind: 'compito', detail: [s.projects.find(p => p.id === t.project_id)?.name, who].filter(Boolean).join(' · '), source: 'compito', ref: t.id });
  }
  for (const term of s.terms) {
    const c = s.contracts.find(x => x.id === term.contract_id);
    if (!c || c.status !== 'attivo') continue;
    // Every repetition in the window, not only the next one.
    let due = nextDue(term, c, from);
    for (let i = 0; due && due <= to && i < 60; i++) {
      if (due < from) break; // a one-off date already past: it belongs to "Attenzione", not to the agenda
      items.push({ id: `tm-${term.id}-${due}`, date: due, time: null, title: term.description, kind: term.kind === 'obbligo' ? 'obbligo' : 'diritto',
        detail: `${cp(c.counterparty_id) || ''} · ${term.party === 'noi' ? 'tocca a noi' : `tocca a ${cp(c.counterparty_id) || 'loro'}`}${term.every_n ? ` · ${everyLabel(term.every_n, term.every_unit)}` : ''}`, source: 'obbligo', ref: c.counterparty_id });
      if (!term.every_n) break;
      due = nextDue(term, c, addDays(due, 1));
    }
  }
  for (const inv of s.invoices.filter(i => i.status === 'aperta' && i.due_date && i.due_date >= from && i.due_date <= to)) {
    items.push({ id: `iv-${inv.id}`, date: inv.due_date!, time: null, title: `${inv.direction === 'emessa' ? 'Incasso' : 'Pagamento'} fattura ${inv.number || ''}`.trim(), kind: 'pagamento',
      detail: `${cp(inv.counterparty_id) || inv.counterparty_name || ''} · ${eur(inv.total)}`, source: 'fattura', ref: inv.id });
  }
  for (const c of s.contracts.filter(x => x.status === 'attivo' && x.end_date)) {
    const cancelBy = c.auto_renew && c.notice_days != null ? addDays(c.end_date!, -c.notice_days) : null;
    if (cancelBy && cancelBy >= from && cancelBy <= to) items.push({ id: `cb-${c.id}`, date: cancelBy, time: null, title: `Ultimo giorno per disdire “${c.title}”`, kind: 'scadenza', detail: cp(c.counterparty_id) || '', source: 'contratto', ref: c.counterparty_id });
    if (c.end_date! >= from && c.end_date! <= to) items.push({ id: `ce-${c.id}`, date: c.end_date!, time: null, title: `Fine contratto “${c.title}”`, kind: 'scadenza', detail: cp(c.counterparty_id) || '', source: 'contratto', ref: c.counterparty_id });
  }
  for (const p of s.projects.filter(x => x.status === 'attivo' && x.deadline && x.deadline >= from && x.deadline <= to)) {
    items.push({ id: `pd-${p.id}`, date: p.deadline!, time: null, title: `Scadenza progetto ${p.name}`, kind: 'consegna', detail: cp(p.counterparty_id) || '', source: 'progetto', ref: p.id });
  }
  return items.sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
}

// ───────────── Carico del team ─────────────
export interface Load { person: Person; hours: number; capacity: number; ratio: number; open: number; late: number }
export function teamLoad(people: Person[], tasks: Task[], today: string): Load[] {
  const weekEnd = addDays(today, 6);
  return people.filter(p => p.active).map(p => {
    const mine = tasks.filter(t => t.assignee_person_id === p.id && t.status !== 'fatto');
    const thisWeek = mine.filter(t => !t.due_date || t.due_date <= weekEnd);
    const hours = Math.round(thisWeek.reduce((n, t) => n + (t.estimate_minutes || 60), 0) / 6) / 10;
    const capacity = p.availability?.hours_week || 40;
    return { person: p, hours, capacity, ratio: hours / capacity, open: mine.length, late: mine.filter(t => t.due_date && t.due_date < today).length };
  });
}

// ───────────── Chi è più adatto a un compito ─────────────
export interface Match { person: Person; score: number; reasons: string[] }
const words = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 3);

// Skills declared in the profile, how free the person is this week, similar work already done.
// Data about the work, not judgements on the person.
export function matchPeople(title: string, people: Person[], tasks: Task[], today: string): Match[] {
  const tw = new Set(words(title));
  const loads = teamLoad(people, tasks, today);
  return people.filter(p => p.active && p.role !== 'esterno').map(p => {
    const reasons: string[] = [];
    let skill = 0;
    for (const s of p.skills || []) {
      const hit = words(s.name).some(w => [...tw].some(x => x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))));
      if (hit) { skill = Math.max(skill, s.level); reasons.push(`${s.name} ${s.level}/5`); }
    }
    const similar = tasks.filter(t => t.assignee_person_id === p.id && t.status === 'fatto' && words(t.title).some(w => tw.has(w))).length;
    if (similar) reasons.push(`${similar} ${similar === 1 ? 'compito simile già fatto' : 'compiti simili già fatti'}`);
    const l = loads.find(x => x.person.id === p.id)!;
    const free = Math.max(0, Math.round(l.capacity - l.hours));
    reasons.push(free > 0 ? `${free} h libere questa settimana` : 'settimana piena');
    const score = Math.round(Math.min(100, 30 + skill * 11 + Math.min(similar, 3) * 5 + Math.max(-25, Math.min(20, (1 - l.ratio) * 20))));
    return { person: p, score, reasons };
  }).sort((a, b) => b.score - a.score);
}

// ───────────── Cassa ─────────────
export interface CashPoint { day: number; date: string; balance: number }
export interface CashForecast {
  balance: number | null; balanceDate: string | null; receivable: number; payable: number; overdueIn: number;
  points: CashPoint[]; lowest: CashPoint | null; notes: string[];
}
// Starting from the balance entered (or 0), adds the invoices still open on their due date.
// Overdue receivables are counted 7 days from today: an estimate, said as such.
export function cashForecast(balance: number | null, balanceDate: string | null, invoices: Invoice[], today: string, horizon = 90): CashForecast {
  const open = invoices.filter(i => i.status === 'aperta');
  const receivable = open.filter(i => i.direction === 'emessa').reduce((n, i) => n + i.total, 0);
  const payable = open.filter(i => i.direction === 'ricevuta').reduce((n, i) => n + i.total, 0);
  const overdueIn = open.filter(i => i.direction === 'emessa' && i.due_date && i.due_date < today).reduce((n, i) => n + i.total, 0);
  const moves: Record<string, number> = {};
  for (const i of open) {
    const when = !i.due_date ? addDays(today, 30) : i.due_date < today ? (i.direction === 'emessa' ? addDays(today, 7) : today) : i.due_date;
    moves[when] = (moves[when] || 0) + (i.direction === 'emessa' ? i.total : -i.total);
  }
  let b = balance ?? 0;
  const points: CashPoint[] = [];
  for (let d = 0; d <= horizon; d++) {
    const key = addDays(today, d);
    b += moves[key] || 0;
    points.push({ day: d, date: key, balance: Math.round(b) });
  }
  const lowest = points.reduce<CashPoint | null>((m, p) => (!m || p.balance < m.balance ? p : m), null);
  const notes: string[] = [];
  if (balance == null) notes.push('Saldo di partenza non inserito: la curva parte da 0.');
  if (overdueIn) notes.push(`${eur(overdueIn)} di fatture scadute contate come incassate tra 7 giorni (stima).`);
  if (lowest && lowest.balance < 0) notes.push(`Possibile tensione di cassa il ${lowest.date.split('-').reverse().slice(0, 2).join('/')}.`);
  return { balance, balanceDate, receivable, payable, overdueIn, points, lowest, notes };
}

// ───────────── Insights ─────────────
export interface Insight { id: string; title: string; value: string; why: string; tone: 'buono' | 'attenzione' | 'neutro' }
export function insights(s: BizSnapshot, today: string): Insight[] {
  const out: Insight[] = [];
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const issued = s.invoices.filter(i => i.direction === 'emessa' && i.status !== 'annullata' && (i.issue_date || today) >= yearStart);
  const revenue = issued.reduce((n, i) => n + i.total, 0);
  if (revenue > 0) {
    const byClient: Record<string, number> = {};
    for (const i of issued) { const k = s.clients.find(c => c.id === i.counterparty_id)?.name || i.counterparty_name || 'Altri'; byClient[k] = (byClient[k] || 0) + i.total; }
    const sorted = Object.entries(byClient).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 3).reduce((n, [, v]) => n + v, 0);
    const share = Math.round((top / revenue) * 100);
    out.push({ id: 'conc', title: `${Math.min(3, sorted.length)} ${sorted.length === 1 ? 'cliente fa' : 'clienti fanno'} il ${share}% del fatturato`, value: eur(revenue),
      why: share >= 60 ? `Dipendi molto da pochi nomi: se ${sorted[0][0]} si ferma, perdi il ${Math.round((sorted[0][1] / revenue) * 100)}% delle entrate. Vale la pena cercarne altri.` : 'Le entrate sono ben distribuite: nessun cliente pesa troppo.',
      tone: share >= 60 ? 'attenzione' : 'buono' });
  }
  const costs = s.transactions.filter(t => t.amount < 0 && t.date >= addDays(today, -30));
  if (costs.length) {
    const byCat: Record<string, number> = {};
    for (const t of costs) byCat[t.category || 'Altro'] = (byCat[t.category || 'Altro'] || 0) - t.amount;
    const [cat, val] = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    const total = Object.values(byCat).reduce((n, v) => n + v, 0);
    out.push({ id: 'costs', title: `${cat}: la spesa più alta del mese`, value: eur(val), why: `Su ${eur(total)} di uscite negli ultimi 30 giorni, il ${Math.round((val / total) * 100)}% è ${cat.toLowerCase()}.`, tone: 'neutro' });
  }
  for (const p of s.projects.filter(x => x.budget && x.status !== 'annullato')) {
    const spent = s.invoices.filter(i => i.project_id === p.id && i.direction === 'ricevuta').reduce((n, i) => n + i.total, 0);
    const earned = s.invoices.filter(i => i.project_id === p.id && i.direction === 'emessa').reduce((n, i) => n + i.total, 0);
    if (spent > (p.budget || 0) * 0.8) out.push({ id: `bud-${p.id}`, title: `${p.name}: speso il ${Math.round((spent / p.budget!) * 100)}% del budget`, value: `${eur(spent)} / ${eur(p.budget!)}`, why: spent > p.budget! ? 'Il progetto è oltre il budget: rivedi i costi o il prezzo.' : 'Sei vicino al limite: controlla le prossime spese.', tone: 'attenzione' });
    else if (earned > 0 && spent > 0) out.push({ id: `mar-${p.id}`, title: `${p.name}: margine ${Math.round(((earned - spent) / earned) * 100)}%`, value: eur(earned - spent), why: `Fatturati ${eur(earned)}, spesi ${eur(spent)}.`, tone: earned > spent ? 'buono' : 'attenzione' });
  }
  const weekAgo = addDays(today, -7);
  const doneWeek = s.tasks.filter(t => t.status === 'fatto' && t.completed_at && t.completed_at.slice(0, 10) >= weekAgo).length;
  const late = s.tasks.filter(t => t.status !== 'fatto' && t.due_date && t.due_date < today).length;
  const open = s.tasks.filter(t => t.status !== 'fatto').length;
  if (open || doneWeek) out.push({ id: 'pace', title: late ? `${late} ${late === 1 ? 'compito in ritardo' : 'compiti in ritardo'} su ${open} aperti` : 'Nessun compito in ritardo', value: `${doneWeek} fatti in 7 giorni`,
    why: late ? `Il ${Math.round((late / Math.max(open, 1)) * 100)}% del lavoro aperto è già oltre la scadenza: meglio rivedere date o priorità.` : 'Il ritmo regge: le scadenze sono rispettate.', tone: late ? 'attenzione' : 'buono' });
  const loads = teamLoad(s.people, s.tasks, today).filter(l => l.open);
  if (loads.length > 1) {
    const max = loads.reduce((a, b) => (a.ratio > b.ratio ? a : b));
    const min = loads.reduce((a, b) => (a.ratio < b.ratio ? a : b));
    if (max.ratio - min.ratio > 0.5) out.push({ id: 'balance', title: `Carico sbilanciato: ${max.person.name} al ${Math.round(max.ratio * 100)}%`, value: `${min.person.name} al ${Math.round(min.ratio * 100)}%`, why: 'Spostare un compito riduce il rischio di ritardi senza aggiungere ore.', tone: 'attenzione' });
  }
  return out;
}

// ───────────── Automazioni (girano quando l'app è aperta) ─────────────
export interface AutomationTemplate { template: string; name: string; when: string; then: string }
export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  { template: 'obbligo_ricorrente', name: 'Obblighi dei contratti → compiti', when: 'Un obbligo nostro scade entro 7 giorni', then: 'Crea il compito per chi se ne occupa (una volta per scadenza)' },
  { template: 'rinnovo_contratto', name: 'Rinnovo tacito in arrivo → promemoria', when: 'Mancano 30 giorni all’ultimo giorno per disdire', then: 'Crea un compito per il titolare: decidere se rinnovare' },
  { template: 'fattura_scaduta', name: 'Fattura non incassata → sollecito', when: 'Una nostra fattura è scaduta da 3 giorni', then: 'Crea il compito “Sollecitare il pagamento” per chi segue la finanza' },
  { template: 'progetto_rischio', name: 'Progetto a rischio → avviso', when: 'La salute di un progetto scende sotto 60', then: 'Avvisa il capo progetto con un compito “Rivedere il piano”' },
];

export interface AutoTask { key: string; title: string; assignee: string | null; due: string; projectId: string | null; template: string }

// Tasks the active automations would create now. Each carries a key, written in the task's notes,
// so the same thing is never created twice.
export function automationTasks(active: string[], s: BizSnapshot, today: string, ownerPersonId: string | null): AutoTask[] {
  const out: AutoTask[] = [];
  const has = (key: string) => s.tasks.some(t => (t.notes || '').includes(`[auto:${key}]`));
  const cp = (id: string | null) => s.clients.find(c => c.id === id)?.name || '';
  const finance = s.people.find(p => p.role === 'finanza' && p.active)?.id || ownerPersonId;
  if (active.includes('obbligo_ricorrente')) {
    for (const term of s.terms.filter(t => t.party === 'noi' && t.kind === 'obbligo')) {
      const c: Contract | undefined = s.contracts.find(x => x.id === term.contract_id);
      if (!c || c.status !== 'attivo') continue;
      const due = nextDue(term, c, today);
      if (!due || diffDays(today, due) > 7) continue;
      const key = `obbligo:${term.id}:${due}`;
      if (!has(key)) out.push({ key, template: 'obbligo_ricorrente', title: `${cp(c.counterparty_id)}: ${term.description}`, assignee: term.owner_person_id || ownerPersonId, due, projectId: null });
    }
  }
  if (active.includes('rinnovo_contratto')) {
    for (const c of s.contracts.filter(x => x.status === 'attivo' && x.auto_renew && x.end_date && x.notice_days != null)) {
      const cancelBy = addDays(c.end_date!, -c.notice_days!);
      const days = diffDays(today, cancelBy);
      const key = `rinnovo:${c.id}:${c.end_date}`;
      if (days >= 0 && days <= 30 && !has(key)) out.push({ key, template: 'rinnovo_contratto', title: `Decidere se rinnovare “${c.title}” (${cp(c.counterparty_id)})`, assignee: ownerPersonId, due: cancelBy, projectId: null });
    }
  }
  if (active.includes('fattura_scaduta')) {
    for (const i of s.invoices.filter(x => x.direction === 'emessa' && x.status === 'aperta' && x.due_date && diffDays(x.due_date, today) >= 3)) {
      const key = `sollecito:${i.id}`;
      if (!has(key)) out.push({ key, template: 'fattura_scaduta', title: `Sollecitare il pagamento della fattura ${i.number || ''} (${cp(i.counterparty_id) || i.counterparty_name || ''})`, assignee: finance, due: today, projectId: i.project_id });
    }
  }
  if (active.includes('progetto_rischio')) {
    for (const p of s.projects.filter((x: Project) => x.status === 'attivo')) {
      const h = projectHealth(p, s.tasks.filter((t: Task) => t.project_id === p.id), today);
      const key = `rischio:${p.id}:${today.slice(0, 7)}`;
      if (h.score < 60 && !has(key)) out.push({ key, template: 'progetto_rischio', title: `Rivedere il piano di ${p.name} (salute ${h.score}/100)`, assignee: p.owner_person_id || ownerPersonId, due: today, projectId: p.id });
    }
  }
  return out;
}

// ICS file of the agenda for Google, Apple and Outlook Calendar.
export function agendaICS(items: AgendaItem[], orgName: string): string {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MYND Business//IT', `X-WR-CALNAME:${esc(`MYND · ${orgName}`)}`];
  for (const it of items) {
    const d = it.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${it.id}@mynd`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`);
    if (it.time) lines.push(`DTSTART;TZID=Europe/Rome:${d}T${it.time.replace(':', '')}00`);
    else lines.push(`DTSTART;VALUE=DATE:${d}`);
    lines.push(`SUMMARY:${esc(it.title)}`);
    if (it.detail) lines.push(`DESCRIPTION:${esc(it.detail)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export type { BizEvent, ContractTerm };
