// MYND Business Coach: turns what the user writes (a new client, an email, a contract) into a
// plan of concrete actions, and applies or undoes it. The AI never writes to the database by
// itself: it proposes, a person applies, everything stays in the activity log as "AI".
import {
  Person, Project, saveCounterparty, saveContact, saveContract, saveTerm, saveProject, saveTask, nextDue, projectHealth, KIND_LABEL,
  CpKind, EveryUnit,
} from './business';
import { supabase } from './supabase';
import { BizSnapshot, PlanAction, AppliedRow, saveEvent, saveInvoice, tagAI, EventKind } from './businessData';
import { attentionList, cashForecast, eur, addDays, diffDays } from './businessIntel';
import { canTranscribe, transcribeFile } from './ai';

const short = (id: string) => id.slice(0, 8);

// ───────────── Il contesto: l'azienda in poche righe ─────────────
export function buildBizContext(s: BizSnapshot, orgName: string, today: string, me: Person | null, cash: number | null, extra = ''): string {
  const L: string[] = [];
  const weekday = new Date(today + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  L.push(`OGGI: ${weekday} (${today}). Azienda: ${orgName}. Chi scrive: ${me ? `${me.name} (${me.role})` : 'un membro del team'}.`);
  L.push('', 'TEAM:');
  for (const p of s.people.filter(x => x.active)) {
    L.push(`- ${p.name} #${short(p.id)} · ${p.role}${p.job_title ? ` · ${p.job_title}` : ''}${p.skills?.length ? ` · competenze: ${p.skills.map(k => `${k.name} ${k.level}/5`).join(', ')}` : ''}${p.availability?.hours_week ? ` · ${p.availability.hours_week} h/sett` : ''}`);
  }
  L.push('', 'CLIENTI, PARTNER, FORNITORI:');
  if (!s.clients.length) L.push('- nessuno');
  for (const c of s.clients) {
    L.push(`- ${c.name} #${short(c.id)} · ${KIND_LABEL[c.kind]} · importanza ${c.importance}${c.sector ? ` · ${c.sector}` : ''}${c.payment_terms_days != null ? ` · paga a ${c.payment_terms_days} gg` : ''}`);
    for (const k of s.contracts.filter(x => x.counterparty_id === c.id)) {
      L.push(`  · contratto “${k.title}” #${short(k.id)} ${k.status}, ${k.start_date || '?'} → ${k.end_date || '?'}${k.auto_renew ? `, rinnovo tacito, preavviso ${k.notice_days ?? '?'} gg` : ''}${k.value != null ? `, valore ${eur(Number(k.value))}` : ''}`);
      for (const t of s.terms.filter(x => x.contract_id === k.id)) {
        const due = nextDue(t, k, today);
        L.push(`    - ${t.party === 'noi' ? 'NOI' : c.name} ${t.kind}: ${t.description}${t.every_n ? ` (ogni ${t.every_n} ${t.every_unit})` : ''}${due ? `, prossima ${due}` : ''}${t.quota != null ? `, usati ${t.used}/${t.quota}` : ''}`);
      }
    }
  }
  L.push('', 'PROGETTI:');
  if (!s.projects.length) L.push('- nessuno');
  for (const p of s.projects) {
    const tasks = s.tasks.filter(t => t.project_id === p.id);
    const h = projectHealth(p, tasks, today);
    L.push(`- ${p.name} #${short(p.id)} · ${p.status} · salute ${h.score}/100 (${h.notes.join('; ')})${p.deadline ? ` · scadenza ${p.deadline}` : ''}${p.budget != null ? ` · budget ${eur(Number(p.budget))}` : ''}${p.counterparty_id ? ` · cliente ${s.clients.find(c => c.id === p.counterparty_id)?.name || ''}` : ''}${p.owner_person_id ? ` · capo ${s.people.find(x => x.id === p.owner_person_id)?.name || ''}` : ''}`);
  }
  const open = s.tasks.filter(t => t.status !== 'fatto').slice(0, 40);
  L.push('', `COMPITI APERTI (${s.tasks.filter(t => t.status !== 'fatto').length}):`);
  for (const t of open) {
    L.push(`- ${t.title} #${short(t.id)} · ${s.people.find(p => p.id === t.assignee_person_id)?.name || 'nessuno'}${t.due_date ? ` · scade ${t.due_date}` : ''} · importanza ${t.importance}${t.estimate_minutes ? ` · ${t.estimate_minutes} min` : ''}${t.project_id ? ` · ${s.projects.find(p => p.id === t.project_id)?.name || ''}` : ''}`);
  }
  const upcoming = s.events.filter(e => e.starts_at.slice(0, 10) >= today && e.starts_at.slice(0, 10) <= addDays(today, 30));
  L.push('', 'AGENDA PROSSIMI 30 GIORNI:');
  if (!upcoming.length) L.push('- niente');
  for (const e of upcoming) L.push(`- ${new Date(e.starts_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} ${e.title} (${e.kind})${e.location ? ` · ${e.location}` : ''}`);
  if (s.invoices.length) {
    const f = cashForecast(cash, null, s.invoices, today, 60);
    L.push('', `FINANZA: saldo ${cash != null ? eur(cash) : 'non inserito'} · da incassare ${eur(f.receivable)} · da pagare ${eur(f.payable)} · minimo previsto 60 gg ${f.lowest ? `${eur(f.lowest.balance)} il ${f.lowest.date}` : '-'}`);
    for (const i of s.invoices.filter(x => x.status === 'aperta')) {
      L.push(`- fattura ${i.direction} ${i.number || ''} ${s.clients.find(c => c.id === i.counterparty_id)?.name || i.counterparty_name || ''} ${eur(i.total)} scade ${i.due_date || '?'}${i.due_date && i.due_date < today ? ' (SCADUTA)' : ''}`);
    }
  }
  const att = attentionList(s, today, null).slice(0, 6);
  if (att.length) { L.push('', 'COSA RICHIEDE ATTENZIONE (calcolato):'); for (const a of att) L.push(`- ${a.title}: ${a.why}`); }
  if (s.documents.length) { L.push('', 'DOCUMENTI:'); for (const d of s.documents.slice(0, 20)) L.push(`- ${d.name} (${d.kind})${d.summary ? `: ${d.summary}` : ''}`); }
  if (extra) L.push('', 'MATERIALE ALLEGATO DALL’UTENTE:', extra);
  return L.join('\n');
}

// ───────────── Le istruzioni del Coach ─────────────
export const BIZ_COACH_SYSTEM = `Sei il Coach di MYND Business: il braccio destro del titolare di una piccola azienda. Parli italiano, in modo diretto e concreto, frasi brevi, niente premesse.

Il tuo compito principale è RISPARMIARE LAVORO: quando l'utente ti dà informazioni (un nuovo cliente, un'email, un contratto, una fattura, una riunione, un cambio di programma) trasformale in AZIONI già pronte, così non deve compilare nulla. Rispondi alle domande usando solo i dati nel contesto; se un dato manca, dillo.

Quando proponi modifiche, scrivi prima 1-3 frasi di spiegazione e poi UN SOLO blocco esattamente così:
\`\`\`azioni
{"titolo": "breve titolo", "azioni": [ ... ]}
\`\`\`
Ogni azione è un oggetto {"tipo": ..., "rif": "x1" (facoltativo, per collegare azioni successive), "dati": {...}} con questi tipi:
- "cliente": dati {nome, tipo: cliente|partner|fornitore, importanza: A|B|C, settore, ragione_sociale, piva, cf, pec, sdi, indirizzo, sito, pagamento_giorni, note}
- "referente": "cliente": rif o #id o nome; dati {nome, ruolo, email, telefono}
- "contratto": "cliente"; dati {titolo, inizio, fine, rinnovo_tacito: true|false, preavviso_giorni, valore, note}
- "termine" (obbligo o diritto del contratto): "contratto": rif o #id; dati {chi: noi|controparte, tipo: obbligo|diritto, descrizione, ogni_n, ogni_unita: giorni|settimane|mesi|anni, scadenza, quante_volte, responsabile: nome persona, estratto: frase del contratto}
- "progetto": "cliente" facoltativo; dati {nome, obiettivo, inizio, scadenza, budget, capo: nome persona}
- "compito": "progetto" facoltativo (rif o #id); dati {titolo, responsabile: nome persona, scadenza, durata_min, importanza: 1-5, note}
- "evento" (riunione, appuntamento, consegna, scadenza, pagamento): "cliente" e "progetto" facoltativi; dati {titolo, tipo: riunione|appuntamento|consegna|scadenza|pagamento|altro, inizio: "AAAA-MM-GGTHH:MM" o "AAAA-MM-GG" se tutto il giorno, fine, luogo, persone: [nomi]}
- "fattura": "cliente" facoltativo; dati {direzione: emessa|ricevuta, numero, data, scadenza, controparte_nome, imponibile, iva, totale}
- "modifica_progetto": "progetto": #id; dati {scadenza, stato: attivo|in_pausa|completato|annullato, budget}
- "modifica_compito": "compito": #id; dati {scadenza, responsabile, stato: da_fare|in_corso|fatto, importanza}

Regole:
- Date sempre AAAA-MM-GG, calcolate da OGGI ("tra due settimane", "venerdì", "fine mese").
- Per elementi già esistenti usa il loro #id del contesto; non creare doppioni (se il cliente esiste già, collega a lui).
- Da un contratto ricava TUTTI gli obblighi e i diritti, di entrambe le parti, con ricorrenza e scadenze, e i compiti per il primo mese.
- Per ogni obbligo nostro scegli il responsabile più adatto per competenze e carico. Assegna i compiti alle persone del team per nome.
- Se manca un dato importante, proponi comunque quello che puoi e chiedi solo l'essenziale in una riga.
- Se l'utente fa solo una domanda, rispondi senza blocco azioni.`;

// ───────────── Leggere la risposta ─────────────
export interface ParsedPlan { title: string; actions: PlanAction[] }
export function parseCoachReply(reply: string): { text: string; plan: ParsedPlan | null } {
  const m = /```\s*azioni\s*([\s\S]*?)```/i.exec(reply) || /```(?:json)?\s*(\{[\s\S]*"azioni"[\s\S]*?\})\s*```/i.exec(reply);
  if (!m) return { text: reply.trim(), plan: null };
  const text = reply.replace(m[0], '').trim();
  let raw = m[1].trim();
  const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  try {
    const obj = JSON.parse(raw.replace(/,\s*([}\]])/g, '$1'));
    const list = Array.isArray(obj) ? obj : obj.azioni;
    if (!Array.isArray(list)) return { text, plan: null };
    const valid = ['cliente', 'referente', 'contratto', 'termine', 'progetto', 'compito', 'evento', 'fattura', 'modifica_progetto', 'modifica_compito'];
    const actions = list.filter((a: PlanAction) => a && valid.includes(a.tipo)).map((a: PlanAction) => ({ ...a, dati: a.dati || {}, on: true }));
    return { text, plan: actions.length ? { title: String(obj.titolo || 'Proposta del Coach'), actions } : null };
  } catch {
    return { text: text || reply, plan: null };
  }
}

// ───────────── Descrivere un'azione in una riga ─────────────
const s = (v: unknown) => (v == null ? '' : String(v).trim());
const dateIt = (v: unknown) => { const t = s(v); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10).split('-').reverse().join('/') + (t.length > 10 ? ` ${t.slice(11, 16)}` : '') : t; };

export function describeAction(a: PlanAction, snap: BizSnapshot): { label: string; text: string } {
  const d = a.dati;
  switch (a.tipo) {
    case 'cliente': return { label: 'Nuovo cliente', text: [s(d.nome), s(d.tipo), s(d.settore)].filter(Boolean).join(' · ') };
    case 'referente': return { label: 'Referente', text: [s(d.nome), s(d.ruolo), s(d.email)].filter(Boolean).join(' · ') };
    case 'contratto': return { label: 'Contratto', text: [s(d.titolo), d.inizio || d.fine ? `${dateIt(d.inizio)} → ${dateIt(d.fine)}` : '', d.valore ? eur(Number(d.valore)) : '', d.rinnovo_tacito ? 'rinnovo tacito' : ''].filter(Boolean).join(' · ') };
    case 'termine': return { label: `${s(d.chi) === 'controparte' ? 'Loro' : 'Noi'} · ${s(d.tipo) || 'obbligo'}`, text: [s(d.descrizione), d.ogni_n ? `ogni ${d.ogni_n} ${s(d.ogni_unita)}` : '', d.scadenza ? `entro ${dateIt(d.scadenza)}` : '', d.quante_volte ? `${d.quante_volte} volte` : '', d.responsabile ? `→ ${s(d.responsabile)}` : ''].filter(Boolean).join(' · ') };
    case 'progetto': return { label: 'Progetto', text: [s(d.nome), d.scadenza ? `entro ${dateIt(d.scadenza)}` : '', d.budget ? eur(Number(d.budget)) : '', d.capo ? `guida ${s(d.capo)}` : ''].filter(Boolean).join(' · ') };
    case 'compito': return { label: 'Compito', text: [s(d.titolo), d.responsabile ? `→ ${s(d.responsabile)}` : '', d.scadenza ? dateIt(d.scadenza) : ''].filter(Boolean).join(' · ') };
    case 'evento': return { label: s(d.tipo) ? s(d.tipo)[0].toUpperCase() + s(d.tipo).slice(1) : 'Evento', text: [s(d.titolo), dateIt(d.inizio), s(d.luogo)].filter(Boolean).join(' · ') };
    case 'fattura': return { label: s(d.direzione) === 'emessa' ? 'Fattura emessa' : 'Fattura ricevuta', text: [s(d.numero), s(d.controparte_nome), d.totale ? eur(Number(d.totale)) : '', d.scadenza ? `scade ${dateIt(d.scadenza)}` : ''].filter(Boolean).join(' · ') };
    case 'modifica_progetto': {
      const p = findById(snap.projects, a.progetto);
      return { label: 'Modifica progetto', text: [p?.name || a.progetto, d.scadenza ? `scadenza → ${dateIt(d.scadenza)}` : '', d.stato ? `stato → ${s(d.stato)}` : '', d.budget ? `budget → ${eur(Number(d.budget))}` : ''].filter(Boolean).join(' · ') };
    }
    case 'modifica_compito': {
      const t = findById(snap.tasks, a.compito);
      return { label: 'Modifica compito', text: [t?.title || a.compito, d.scadenza ? `scadenza → ${dateIt(d.scadenza)}` : '', d.responsabile ? `→ ${s(d.responsabile)}` : '', d.stato ? `stato → ${s(d.stato)}` : ''].filter(Boolean).join(' · ') };
    }
  }
}

// ───────────── Applicare e annullare ─────────────
function findById<T extends { id: string }>(list: T[], ref?: string): T | undefined {
  const r = (ref || '').replace(/^#/, '').trim();
  return r.length >= 6 ? list.find(x => x.id.startsWith(r)) : undefined;
}
const norm = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function personId(people: Person[], name: unknown): string | null {
  const n = norm(s(name));
  if (!n) return null;
  const p = people.find(x => norm(x.name) === n) || people.find(x => norm(x.name).split(' ')[0] === n.split(' ')[0]) || findById(people, s(name));
  return p?.id || null;
}
const dateOrNull = (v: unknown) => (/^\d{4}-\d{2}-\d{2}/.test(s(v)) ? s(v).slice(0, 10) : null);
const numOrNull = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^\d,.-]/g, '').replace(',', '.')); return v == null || v === '' || !Number.isFinite(n) ? null : n; };
function toIso(v: unknown): { iso: string; allDay: boolean } | null {
  const t = s(v);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) return { iso: new Date(t.slice(0, 16)).toISOString(), allDay: false };
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return { iso: new Date(t + 'T09:00').toISOString(), allDay: true };
  return null;
}
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(s(v) as T) ? (s(v) as T) : fallback);

export async function applyPlan(orgId: string, actions: PlanAction[], snap: BizSnapshot): Promise<AppliedRow[]> {
  const refs: Record<string, string> = {};
  const applied: AppliedRow[] = [];
  const created = (table: string, id: string, rif?: string) => { applied.push({ table, id, kind: 'creato' }); if (rif) refs[rif] = id; return id; };
  const resolve = (ref: string | undefined, list: { id: string; name?: string; title?: string }[]): string | null => {
    if (!ref) return null;
    if (refs[ref]) return refs[ref];
    const byId = findById(list, ref);
    if (byId) return byId.id;
    const n = norm(ref);
    return list.find(x => norm(x.name || x.title || '') === n)?.id || null;
  };
  const order = ['cliente', 'referente', 'contratto', 'termine', 'progetto', 'compito', 'evento', 'fattura', 'modifica_progetto', 'modifica_compito'];
  const todo = actions.filter(a => a.on !== false).sort((a, b) => order.indexOf(a.tipo) - order.indexOf(b.tipo));
  try {
    for (const a of todo) {
      const d = a.dati;
      const cpId = resolve(a.cliente, snap.clients);
      const prjId = resolve(a.progetto, snap.projects);
      if (a.tipo === 'cliente') {
        const existing = snap.clients.find(c => norm(c.name) === norm(s(d.nome)));
        if (existing) { if (a.rif) refs[a.rif] = existing.id; continue; }
        const id = await saveCounterparty(orgId, {
          kind: pick<CpKind>(d.tipo, ['cliente', 'partner', 'fornitore'], 'cliente'), name: s(d.nome) || 'Nuovo cliente', importance: pick(d.importanza, ['A', 'B', 'C'] as const, 'B'),
          sector: s(d.settore) || null, legal_name: s(d.ragione_sociale) || null, vat: s(d.piva) || null, tax_code: s(d.cf) || null, pec: s(d.pec) || null,
          sdi_code: s(d.sdi) || null, address: s(d.indirizzo) || null, website: s(d.sito) || null,
          payment_terms_days: numOrNull(d.pagamento_giorni) == null ? null : Math.max(0, Math.min(365, Math.round(numOrNull(d.pagamento_giorni)!))), notes: s(d.note) || null,
        });
        created('biz_counterparties', id, a.rif);
      } else if (a.tipo === 'referente') {
        if (!cpId) throw new Error(`Non trovo il cliente del referente ${s(d.nome)}.`);
        created('biz_contacts', await saveContact(orgId, cpId, { name: s(d.nome) || 'Referente', role: s(d.ruolo) || null, email: s(d.email) || null, phone: s(d.telefono) || null }));
      } else if (a.tipo === 'contratto') {
        if (!cpId) throw new Error(`Non trovo il cliente del contratto “${s(d.titolo)}”.`);
        const id = await saveContract(orgId, cpId, {
          title: s(d.titolo) || 'Contratto', start_date: dateOrNull(d.inizio), end_date: dateOrNull(d.fine), auto_renew: d.rinnovo_tacito === true || s(d.rinnovo_tacito) === 'true',
          notice_days: numOrNull(d.preavviso_giorni), value: numOrNull(d.valore), status: 'attivo', notes: s(d.note) || null,
        });
        created('biz_contracts', id, a.rif);
      } else if (a.tipo === 'termine') {
        const kId = resolve(a.contratto, snap.contracts);
        if (!kId) throw new Error(`Non trovo il contratto per “${s(d.descrizione)}”.`);
        const n = numOrNull(d.ogni_n);
        const id = await saveTerm(orgId, kId, {
          party: pick(d.chi, ['noi', 'controparte'] as const, 'noi'), kind: pick(d.tipo, ['obbligo', 'diritto'] as const, 'obbligo'), description: s(d.descrizione) || 'Obbligo',
          every_n: n && n >= 1 ? Math.min(366, Math.round(n)) : null, every_unit: n ? pick<EveryUnit>(d.ogni_unita, ['giorni', 'settimane', 'mesi', 'anni'], 'mesi') : null,
          due_date: dateOrNull(d.scadenza), quota: numOrNull(d.quante_volte), used: 0, owner_person_id: personId(snap.people, d.responsabile), source_excerpt: s(d.estratto) || null,
        });
        created('biz_contract_terms', id);
      } else if (a.tipo === 'progetto') {
        const id = await saveProject(orgId, {
          name: s(d.nome) || 'Nuovo progetto', objective: s(d.obiettivo) || null, counterparty_id: cpId, owner_person_id: personId(snap.people, d.capo),
          start_date: dateOrNull(d.inizio), deadline: dateOrNull(d.scadenza), budget: numOrNull(d.budget), status: 'attivo',
        });
        created('biz_projects', id, a.rif);
      } else if (a.tipo === 'compito') {
        const id = await saveTask(orgId, {
          title: s(d.titolo) || 'Compito', notes: s(d.note) || null, project_id: prjId, assignee_person_id: personId(snap.people, d.responsabile),
          due_date: dateOrNull(d.scadenza), estimate_minutes: numOrNull(d.durata_min), importance: Math.max(1, Math.min(5, Math.round(numOrNull(d.importanza) || 3))),
        });
        created('biz_tasks', id, a.rif);
      } else if (a.tipo === 'evento') {
        const start = toIso(d.inizio);
        if (!start) throw new Error(`Manca la data di “${s(d.titolo)}”.`);
        const end = toIso(d.fine);
        const people = Array.isArray(d.persone) ? (d.persone as unknown[]).map(x => personId(snap.people, x)).filter((x): x is string => !!x) : [];
        const id = await saveEvent(orgId, {
          title: s(d.titolo) || 'Evento', kind: pick<EventKind>(d.tipo, ['riunione', 'appuntamento', 'consegna', 'scadenza', 'pagamento', 'altro'], 'appuntamento'),
          starts_at: start.iso, ends_at: end?.iso || null, all_day: start.allDay, location: s(d.luogo) || null, counterparty_id: cpId, project_id: prjId,
          person_ids: people, notes: null, source: 'ai',
        });
        created('biz_events', id, a.rif);
      } else if (a.tipo === 'fattura') {
        const total = numOrNull(d.totale);
        if (total == null) throw new Error('Manca il totale della fattura.');
        const id = await saveInvoice(orgId, {
          direction: pick(d.direzione, ['emessa', 'ricevuta'] as const, 'ricevuta'), number: s(d.numero) || null, issue_date: dateOrNull(d.data), due_date: dateOrNull(d.scadenza),
          counterparty_id: cpId, counterparty_name: cpId ? null : s(d.controparte_nome) || null, project_id: prjId, taxable: numOrNull(d.imponibile), vat: numOrNull(d.iva),
          total, status: 'aperta', source: 'ai',
        });
        created('biz_invoices', id, a.rif);
      } else if (a.tipo === 'modifica_progetto') {
        const p = findById(snap.projects, a.progetto) || snap.projects.find(x => x.id === prjId);
        if (!p) throw new Error('Non trovo il progetto da modificare.');
        const patch: Partial<Project> = {};
        if (dateOrNull(d.scadenza)) patch.deadline = dateOrNull(d.scadenza);
        if (s(d.stato)) patch.status = pick(d.stato, ['attivo', 'in_pausa', 'completato', 'annullato'] as const, p.status);
        if (numOrNull(d.budget) != null) patch.budget = numOrNull(d.budget);
        const before = Object.fromEntries(Object.keys(patch).map(k => [k, (p as unknown as Record<string, unknown>)[k]]));
        await saveProject(orgId, { ...stripProject(p), ...patch }, p.id);
        applied.push({ table: 'biz_projects', id: p.id, kind: 'modificato', before });
      } else if (a.tipo === 'modifica_compito') {
        const t = findById(snap.tasks, a.compito);
        if (!t) throw new Error('Non trovo il compito da modificare.');
        const patch: Record<string, unknown> = {};
        if (dateOrNull(d.scadenza)) patch.due_date = dateOrNull(d.scadenza);
        if (s(d.responsabile)) patch.assignee_person_id = personId(snap.people, d.responsabile);
        if (s(d.stato)) { patch.status = pick(d.stato, ['da_fare', 'in_corso', 'fatto'] as const, t.status); patch.completed_at = patch.status === 'fatto' ? new Date().toISOString() : null; }
        if (numOrNull(d.importanza) != null) patch.importance = Math.max(1, Math.min(5, Math.round(numOrNull(d.importanza)!)));
        const before = Object.fromEntries(Object.keys(patch).map(k => [k, (t as unknown as Record<string, unknown>)[k]]));
        await rawUpdate('biz_tasks', t.id, patch);
        applied.push({ table: 'biz_tasks', id: t.id, kind: 'modificato', before });
      }
    }
  } catch (err) {
    // Nothing half-done: what was created is removed again.
    await undoApplied(applied).catch(() => {});
    throw err;
  }
  await tagAI(orgId, applied.map(a => a.id)).catch(() => {});
  return applied;
}

function stripProject(p: Project) {
  const { id: _id, org_id: _org, ...rest } = p;
  void _id; void _org;
  return rest;
}

async function rawUpdate(table: string, id: string, patch: Record<string, unknown>): Promise<void> {
  if (!supabase) throw new Error('Supabase non configurato');
  const { error } = await supabase.from(table).update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function undoApplied(applied: AppliedRow[]): Promise<void> {
  if (!supabase) throw new Error('Supabase non configurato');
  for (const row of [...applied].reverse()) {
    const q = row.kind === 'creato'
      ? supabase.from(row.table).delete().eq('id', row.id)
      : supabase.from(row.table).update(row.before || {}).eq('id', row.id);
    const { error } = await q;
    if (error && !/0 rows|not found/i.test(error.message)) throw new Error(error.message);
  }
}

// ───────────── Leggere un documento per il Coach ─────────────
export async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Text of a PDF or a photo (read by the free Gemini), or of a text/email file.
export async function readDocumentText(file: File, onWait?: (s: number) => void): Promise<string> {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('text/') || /\.(txt|eml|md|csv)$/.test(name)) return (await file.text()).slice(0, 60000);
  if (file.type === 'application/pdf' || /\.pdf$/.test(name) || file.type.startsWith('image/')) {
    if (!canTranscribe()) throw new Error('Per leggere PDF e foto serve la chiave gratuita di Gemini (impostazioni della Guida Studio AI).');
    const mime = file.type || (name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    return (await transcribeFile(await fileToBase64(file), mime,
      'Trascrivi fedelmente tutto il testo di questo documento (contratto, fattura, email o altro), mantenendo numeri, date, importi e numerazione degli articoli. Niente commenti.', onWait)).slice(0, 60000);
  }
  throw new Error('Formato non supportato: usa PDF, foto, testo o la fattura XML.');
}

// Days until an item, for short Italian phrases.
export const inDays = (today: string, key: string) => { const n = diffDays(today, key); return n === 0 ? 'oggi' : n === 1 ? 'domani' : n < 0 ? `${-n} giorni fa` : `tra ${n} giorni`; };
