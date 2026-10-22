// MYND AI for Performance: a first plan from a description, and answers about a project based
// only on its real data. The AI never changes anything by itself: it proposes, the person applies.
import { Member, PTask, Project, ProjectKind, Resource, ProjectUpdate, STATUS_LABEL, TASK_STATUS_LABEL, TaskStatus, byPosition, lateness, memberName, progressOf } from './projects';
import { FIELD_TYPES, ICONS, Tool, ToolItem, ToolSpec, cleanItemData, cleanSpec, computeSummary, formatValue, itemTitle, personLabel, peopleOf } from './tools';

// The safe pieces MYND AI composes tools from (the same for the plan and for a single tool).
export const TOOL_BLOCKS = `UNO STRUMENTO è una raccolta su misura: {"name": "nome breve", "icon": "${ICONS.join(' | ')}", "description": "a cosa serve, 1 frase",
 "config": {"fields": [{"id": "id_breve", "label": "Etichetta", "type": "tipo", "options": ["solo per scelta"], "unit": "solo per numero, es. km, h, kg"}],
  "view": "lista | checklist (serve un campo si_no) | giorni (serve un campo data)",
  "groupBy": "id di un campo scelta/persona/data (facoltativo)", "sortBy": "id campo (facoltativo)", "sortDesc": true/false,
  "itemName": "come si chiama una voce, es. spesa, tappa, cliente", "currency": "EUR (se ci sono soldi)",
  "summaries": [calcoli, facoltativi]}}
Tipi di campo: ${FIELD_TYPES.map(f => `${f.type} (${f.label.toLowerCase()})`).join(', ')}. Il PRIMO campo è sempre di testo (il nome della voce). Massimo 12 campi.
Calcoli: {"kind":"somma","field":"id numero/soldi","label":"..."} · {"kind":"conteggio","field":"id si_no (facoltativo)","label":"..."} ·
 {"kind":"per_persona","field":"id numero/soldi","person":"id persona"} · {"kind":"saldi","amount":"id soldi","payer":"id persona","between":"id persone"} (chi deve quanto a chi) ·
 {"kind":"budget","field":"id soldi","limit":1000} · {"kind":"prodotto","field":"id numero","factor":30,"label":"Compenso (30 €/h)","unit":"€"}.
I campi persona/persone accettano le persone del progetto o semplici nomi (amici senza MYND).`;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (v: unknown): string | null => {
  if (typeof v !== 'string' || !DATE.test(v)) return null;
  const d = new Date(v + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : v;
};
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const short = (id: string) => id.slice(0, 8);

function weekday(today: string): string {
  return new Date(today + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// The first JSON object in an answer (with or without ```json fences).
function extractJson(reply: string): unknown {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = fenced ? fenced[1] : reply;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

// ───────────── A plan from a description ─────────────

export interface PlanTask { title: string; description: string; phase: string; due_date: string | null; subtasks: string[] }
export interface ProjectPlan { name: string; kind: ProjectKind; goal: string; due_date: string | null; phases: string[]; tasks: PlanTask[]; tools: ToolSpec[]; questions: string[] }

export function planSystem(today: string): string {
  return `Sei MYND AI, l'assistente della sezione Performance di MYND: aiuti una persona a trasformare un'idea in un progetto concreto. Oggi è ${weekday(today)} (${today}).

La persona descrive cosa vuole realizzare. Tu proponi una prima pianificazione, che lei potrà modificare.
Rispondi SOLO con un oggetto JSON, senza testo prima o dopo, in questo formato:
{"name": "nome breve del progetto (max 60 caratteri)",
 "kind": "personale" oppure "lavoro",
 "goal": "il risultato da raggiungere, in 1-2 frasi",
 "due_date": "AAAA-MM-GG" oppure null,
 "phases": ["Fase 1", "Fase 2"],
 "tasks": [{"title": "attività concreta", "description": "dettaglio utile o stringa vuota", "phase": "una delle fasi oppure stringa vuota", "due_date": "AAAA-MM-GG" oppure null, "subtasks": ["passaggio", "passaggio"]}],
 "tools": [strumenti su misura, vedi sotto],
 "questions": ["domanda breve per capire meglio cosa serve"]}

STRUMENTI: oltre alle attività, ogni progetto può avere gli strumenti che servono davvero a QUEL progetto, scelti da te in base a cosa ha descritto la persona. Esempi (solo esempi, ogni progetto è diverso):
- viaggio con amici → spese condivise con saldi, programma giorno per giorno, posti da vedere, lista bagagli;
- freelance → ore e compensi, clienti, preventivi; una band → scaletta, date dei concerti, cassa comune;
- allenamento per una maratona → uscite con km e tempi, totale km; trasloco → scatoloni per stanza, spese, contatti;
- tesi → fonti con autore e link, capitoli con stato; ristorante → fornitori, ordini, turni.
Proponi da 0 a 4 strumenti, solo se utili: meglio pochi e giusti. Non duplicare le attività (quelle esistono già).
${TOOL_BLOCKS}

Regole:
- Italiano, frasi brevi. Attività concrete che iniziano con un verbo (es. "Prenotare i voli").
- Da 4 a 15 attività, nell'ordine in cui conviene farle. Sottoattività solo quando aiutano davvero (massimo 6).
- "kind": "lavoro" per lavoro, azienda, clienti, team professionali; altrimenti "personale".
- "phases": solo per progetti lunghi o di lavoro (es. Ricerca, Progettazione, Sviluppo, Test, Lancio); per progetti semplici lascia [].
- Scadenze SOLO se giustificate da quello che ha scritto la persona (es. "a giugno", "entro 6 mesi"), mai inventate e mai nel passato.
- Non inventare fatti (prezzi, nomi, prenotazioni già fatte).
- "questions": da 0 a 3 domande brevi SOLO se le risposte cambierebbero gli strumenti o il piano (es. "Dividete le spese tra voi?", "Lavori a ore o a progetto?", "Quanti siete?"). Se è tutto chiaro, lascia [].
- Se il messaggio contiene RISPOSTE a domande precedenti, usale e non rifare le stesse domande.`;
}

export function parsePlan(reply: string, today: string): ProjectPlan | null {
  const raw = extractJson(reply) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') return null;
  const phases = Array.isArray(raw.phases) ? raw.phases.map(p => str(p, 80)).filter(Boolean).slice(0, 10) : [];
  const future = (v: unknown) => { const d = validDate(v); return d && d >= today ? d : null; };
  const tasks: PlanTask[] = (Array.isArray(raw.tasks) ? raw.tasks : []).slice(0, 30).map((t): PlanTask | null => {
    const o = (t && typeof t === 'object' ? t : { title: t }) as Record<string, unknown>;
    const title = str(o.title, 300);
    if (!title) return null;
    const phase = str(o.phase, 80);
    return {
      title,
      description: str(o.description, 1000),
      phase: phases.includes(phase) ? phase : '',
      due_date: future(o.due_date),
      subtasks: (Array.isArray(o.subtasks) ? o.subtasks : []).map(s => str(s, 300)).filter(Boolean).slice(0, 8),
    };
  }).filter((t): t is PlanTask => !!t);
  if (!tasks.length && !(Array.isArray(raw.tools) && raw.tools.length)) return null;
  return {
    name: str(raw.name, 120),
    kind: raw.kind === 'lavoro' ? 'lavoro' : 'personale',
    goal: str(raw.goal, 2000),
    due_date: future(raw.due_date),
    phases: phases.filter(p => tasks.some(t => t.phase === p)),
    tasks,
    tools: (Array.isArray(raw.tools) ? raw.tools : []).slice(0, 6).map(cleanSpec).filter((t): t is ToolSpec => !!t),
    questions: (Array.isArray(raw.questions) ? raw.questions : []).map(q => str(q, 300)).filter(Boolean).slice(0, 6),
  };
}

// ───────────── One tool for a need described in words ─────────────

export function toolSystem(p: Project, existing: Tool[]): string {
  return `Sei MYND AI. Crei UNO strumento su misura per il progetto "${p.name}" (${p.kind})${p.description ? `: ${p.description}` : ''}.
Strumenti già presenti: ${existing.map(t => t.name).join(', ') || 'nessuno'} (non duplicarli).
La persona descrive cosa le serve; tu rispondi SOLO con l'oggetto JSON dello strumento, senza testo prima o dopo.
${TOOL_BLOCKS}
Scegli campi, vista e calcoli che servono davvero: semplice da usare dal telefono, etichette in italiano.`;
}

export function parseTool(reply: string): ToolSpec | null {
  const raw = extractJson(reply) as Record<string, unknown> | null;
  if (!raw) return null;
  return cleanSpec(raw.tool && typeof raw.tool === 'object' ? raw.tool : raw);
}

// ───────────── Questions about a project ─────────────

export type AIAction =
  | { type: 'add_task'; title: string; description?: string; due_date?: string | null; phase?: string | null; subtasks?: string[] }
  | { type: 'add_subtasks'; task_id: string; titles: string[] }
  | { type: 'set_due'; task_id: string; due_date: string | null }
  | { type: 'set_status'; task_id: string; status: TaskStatus }
  | { type: 'set_phases'; phases: string[] }
  | { type: 'update_project'; description?: string; due_date?: string | null; kind?: ProjectKind }
  | { type: 'add_tool'; tool: ToolSpec }
  | { type: 'add_item'; tool_id: string; values: Record<string, unknown> };

export function projectContext(p: Project, tasks: PTask[], members: Member[], resources: Resource[], updates: ProjectUpdate[], today: string, me: string, tools: Tool[] = [], items: ToolItem[] = []): string {
  const L: string[] = [];
  const prog = progressOf(tasks);
  const { late, overdue } = lateness(p, tasks, today);
  L.push(`OGGI: ${weekday(today)} (${today}).`);
  L.push(`PROGETTO: ${p.name} · tipo ${p.kind} · stato ${STATUS_LABEL[p.status]}${late ? ' · IN RITARDO' : ''}${p.due_date ? ` · scadenza ${p.due_date}` : ' · nessuna scadenza'}`);
  L.push(`OBIETTIVO: ${p.description || '(non scritto)'}`);
  L.push(`AVANZAMENTO: ${prog.total ? `${prog.done} su ${prog.total} attività completate (${prog.pct}%)` : 'nessuna attività'}${overdue.length ? ` · ${overdue.length} in ritardo` : ''}`);
  if (p.phases.length) L.push(`FASI: ${p.phases.join(' → ')}`);
  L.push(`PERSONE: ${members.map(m => `${memberName(members, m.user_id, me)} (${m.role})`).join(', ') || 'solo tu'}`);
  L.push('', 'ATTIVITÀ (id tra #):');
  const top = tasks.filter(t => !t.parent_id).sort(byPosition);
  if (!top.length) L.push('- nessuna');
  for (const t of top) {
    const who = memberName(members, t.assignee_id, me);
    L.push(`- #${short(t.id)} ${t.title} · ${TASK_STATUS_LABEL[t.status]}${t.due_date ? ` · scade ${t.due_date}` : ''}${t.phase ? ` · fase ${t.phase}` : ''}${who ? ` · ${who}` : ''}${t.description ? ` · ${t.description.slice(0, 200)}` : ''}`);
    for (const s of tasks.filter(x => x.parent_id === t.id).sort(byPosition)) L.push(`    · #${short(s.id)} ${s.title} · ${TASK_STATUS_LABEL[s.status]}`);
  }
  const notes = resources.filter(r => r.kind === 'nota');
  const links = resources.filter(r => r.kind !== 'nota');
  if (notes.length) {
    L.push('', 'NOTE:');
    let budget = 12000;
    for (const n of notes) {
      const body = (n.body || '').slice(0, Math.max(0, Math.min(1500, budget)));
      budget -= body.length;
      L.push(`- ${n.title}: ${body}`);
    }
  }
  if (links.length) { L.push('', 'LINK E DOCUMENTI:'); for (const r of links) L.push(`- ${r.title}: ${r.url}`); }
  if (tools.length) {
    L.push('', 'STRUMENTI DEL PROGETTO (id tra #; per add_item usa gli id dei campi):');
    let budget = 15000;
    for (const t of tools) {
      const mine = items.filter(i => i.tool_id === t.id);
      L.push(`- #${short(t.id)} ${t.name} · campi: ${t.config.fields.map(f => `${f.id} (${f.type}${f.options?.length ? `: ${f.options.join('/')}` : ''})`).join(', ')}`);
      const people = peopleOf(t, mine, members);
      if (people.length) L.push(`  persone selezionabili: ${people.map(k => `${personLabel(k, members, me)} = "${k}"`).join(', ')}`);
      for (const s of t.config.summaries) {
        const r = computeSummary(t, mine, s, members, me);
        L.push(`  ${r.label}: ${r.value}${r.transfers?.length ? ` (${r.transfers.map(x => `${personLabel(x.from, members, me)} → ${personLabel(x.to, members, me)} ${x.amount.toFixed(2)}`).join('; ')})` : ''}${r.detail?.length ? ` (${r.detail.join('; ')})` : ''}`);
      }
      for (const it of mine.slice(-60)) {
        const line = `    · ${itemTitle(t, it)}: ${t.config.fields.slice(1).map(f => { const v = formatValue(f, it.data[f.id], t.config, members, me); return v ? `${f.label} ${v}` : ''; }).filter(Boolean).join(', ')}`;
        if (budget - line.length < 0) { L.push('    · …'); break; }
        budget -= line.length; L.push(line);
      }
    }
  }
  if (updates.length) {
    L.push('', 'ULTIMI AGGIORNAMENTI (dal più recente):');
    for (const u of updates.slice(0, 15)) L.push(`- ${u.at.slice(0, 10)} ${memberName(members, u.actor_id, me) || 'Qualcuno'} ${u.text}`);
  }
  return L.join('\n');
}

export const PROJECT_AI_SYSTEM = `Sei MYND AI dentro un progetto della sezione Performance di MYND. Aiuti a pianificare, a capire le priorità e a superare gli ostacoli.
Parli italiano, in modo diretto e concreto, frasi brevi, niente premesse. Usa elenchi quando servono.

Ti basi SOLO sui dati del progetto che ricevi qui sotto: non inventare attività completate, scadenze, persone o informazioni che non ci sono. Se un dato manca, dillo e suggerisci di aggiungerlo.

Se è utile creare o cambiare qualcosa, alla fine della risposta aggiungi UN blocco così (solo se serve):
\`\`\`azioni
[{"type": "add_task", "title": "...", "description": "...", "due_date": "AAAA-MM-GG o null", "phase": "fase esistente o null", "subtasks": ["..."]},
 {"type": "add_subtasks", "task_id": "id di 8 caratteri", "titles": ["...", "..."]},
 {"type": "set_due", "task_id": "id", "due_date": "AAAA-MM-GG o null"},
 {"type": "set_status", "task_id": "id", "status": "da_fare | in_corso | fatto"},
 {"type": "set_phases", "phases": ["...", "..."]},
 {"type": "update_project", "description": "...", "due_date": "AAAA-MM-GG o null", "kind": "personale | lavoro"},
 {"type": "add_tool", "tool": {strumento su misura, vedi sotto}},
 {"type": "add_item", "tool_id": "id di 8 caratteri", "values": {"id_campo": valore}}]
\`\`\`
Le modifiche vengono mostrate alla persona, che decide se applicarle. Non proporre mai di eliminare qualcosa: se serve, spiega cosa eliminare e lascia che lo faccia lei.
Per "dividi in passaggi più piccoli" usa add_subtasks sull'attività giusta.
Se la persona racconta qualcosa che va in uno strumento (es. "ho pagato 40 € di cena per tutti", "oggi 3 ore per il cliente Rossi"), proponi add_item con i valori giusti; per le persone usa i valori tra virgolette indicati nei dati.
Se al progetto serve uno strumento che non c'è (es. tenere i conti, un programma, una lista, qualcosa di specifico), proponi add_tool.
${TOOL_BLOCKS}`;

export const OVERVIEW_AI_SYSTEM = `Sei MYND AI nella panoramica della sezione Performance di MYND: vedi tutti i progetti della persona.
Parli italiano, diretto e concreto, frasi brevi. Ti basi SOLO sui dati qui sotto, senza inventare nulla.
Aiuti a decidere da cosa partire, a vedere cosa è in ritardo e cosa sta per scadere. Qui non proponi modifiche: se serve, suggerisci di aprire il progetto e chiedere lì.`;

export function overviewContext(projects: Project[], tasks: PTask[], today: string): string {
  const L: string[] = [`OGGI: ${weekday(today)} (${today}).`, '', 'PROGETTI ATTIVI:'];
  const active = projects.filter(p => !p.archived_at && p.status !== 'completato');
  if (!active.length) L.push('- nessuno');
  for (const p of active) {
    const mine = tasks.filter(t => t.project_id === p.id);
    const prog = progressOf(mine);
    const { late } = lateness(p, mine, today);
    L.push(`- ${p.name} · ${p.kind} · ${STATUS_LABEL[p.status]}${late ? ' · IN RITARDO' : ''}${p.due_date ? ` · scade ${p.due_date}` : ''} · ${prog.total ? `${prog.done}/${prog.total} fatte` : 'nessuna attività'}`);
    for (const t of mine.filter(x => !x.parent_id && x.status !== 'fatto').sort(byPosition).slice(0, 12)) {
      L.push(`    · ${t.title} · ${TASK_STATUS_LABEL[t.status]}${t.due_date ? ` · scade ${t.due_date}` : ''}`);
    }
  }
  const done = projects.filter(p => !p.archived_at && p.status === 'completato');
  if (done.length) L.push('', `COMPLETATI: ${done.map(p => p.name).join(', ')}`);
  return L.join('\n');
}

// The answer without the actions block, and the actions that make sense for this project.
export function parseActions(reply: string, tasks: PTask[], project: Project, tools: Tool[] = []): { text: string; actions: AIAction[] } {
  const m = reply.match(/```azioni\s*([\s\S]*?)```/i);
  const text = reply.replace(/```azioni[\s\S]*?(```|$)/i, '').trim();
  if (!m) return { text, actions: [] };
  let raw: unknown;
  try { raw = JSON.parse(m[1].trim()); } catch { return { text, actions: [] }; }
  const list = Array.isArray(raw) ? raw : [raw];
  const task = (id: unknown) => (typeof id === 'string' && id.length >= 6 ? tasks.find(t => t.id.startsWith(id.replace(/^#/, ''))) : undefined);
  const date = (v: unknown) => (v === null || v === 'null' ? null : validDate(v));
  const actions: AIAction[] = [];
  for (const a of list.slice(0, 30)) {
    if (!a || typeof a !== 'object') continue;
    const o = a as Record<string, unknown>;
    if (o.type === 'add_task' && str(o.title, 300)) {
      const phase = str(o.phase, 80);
      actions.push({ type: 'add_task', title: str(o.title, 300), description: str(o.description, 1000), due_date: date(o.due_date), phase: project.phases.includes(phase) ? phase : null,
        subtasks: (Array.isArray(o.subtasks) ? o.subtasks : []).map(s => str(s, 300)).filter(Boolean).slice(0, 8) });
    } else if (o.type === 'add_subtasks') {
      const t = task(o.task_id);
      const titles = (Array.isArray(o.titles) ? o.titles : []).map(s => str(s, 300)).filter(Boolean).slice(0, 10);
      if (t && !t.parent_id && titles.length) actions.push({ type: 'add_subtasks', task_id: t.id, titles });
    } else if (o.type === 'set_due') {
      const t = task(o.task_id);
      const d = date(o.due_date);
      if (t && (d !== null || o.due_date === null || o.due_date === 'null') && d !== t.due_date) actions.push({ type: 'set_due', task_id: t.id, due_date: d });
    } else if (o.type === 'set_status') {
      const t = task(o.task_id);
      if (t && (o.status === 'da_fare' || o.status === 'in_corso' || o.status === 'fatto') && o.status !== t.status) actions.push({ type: 'set_status', task_id: t.id, status: o.status });
    } else if (o.type === 'set_phases') {
      const phases = (Array.isArray(o.phases) ? o.phases : []).map(s => str(s, 80)).filter(Boolean).slice(0, 10);
      if (phases.length) actions.push({ type: 'set_phases', phases });
    } else if (o.type === 'update_project') {
      const out: Extract<AIAction, { type: 'update_project' }> = { type: 'update_project' };
      if (typeof o.description === 'string' && o.description.trim()) out.description = str(o.description, 4000);
      if ('due_date' in o) { const d = date(o.due_date); if (d !== null || o.due_date === null) out.due_date = d; }
      if (o.kind === 'personale' || o.kind === 'lavoro') out.kind = o.kind;
      if (Object.keys(out).length > 1) actions.push(out);
    } else if (o.type === 'add_tool') {
      const spec = cleanSpec(o.tool);
      if (spec) actions.push({ type: 'add_tool', tool: spec });
    } else if (o.type === 'add_item') {
      const id = typeof o.tool_id === 'string' ? o.tool_id.replace(/^#/, '') : '';
      const t = id.length >= 6 ? tools.find(x => x.id.startsWith(id)) : undefined;
      if (t && o.values && typeof o.values === 'object') actions.push({ type: 'add_item', tool_id: t.id, values: o.values as Record<string, unknown> });
    }
  }
  return { text, actions };
}

// "Aggiunge l'attività …", for the list of proposed changes.
export function describeAction(a: AIAction, tasks: PTask[], tools: Tool[] = [], members: Member[] = [], me = '', items: ToolItem[] = []): string {
  const t = 'task_id' in a ? tasks.find(x => x.id === a.task_id) : undefined;
  const d = (v: string | null | undefined) => (v ? new Date(v + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : 'nessuna');
  switch (a.type) {
    case 'add_task': return `Aggiunge l'attività “${a.title}”${a.due_date ? `, entro il ${d(a.due_date)}` : ''}${a.subtasks?.length ? ` con ${a.subtasks.length} passaggi` : ''}`;
    case 'add_subtasks': return `Divide “${t?.title}” in ${a.titles.length} passaggi: ${a.titles.join(', ')}`;
    case 'set_due': return `Scadenza di “${t?.title}”: ${d(a.due_date)}`;
    case 'set_status': return `“${t?.title}” diventa ${TASK_STATUS_LABEL[a.status].toLowerCase()}`;
    case 'set_phases': return `Organizza il progetto in fasi: ${a.phases.join(' → ')}`;
    case 'add_tool': return `Aggiunge lo strumento “${a.tool.name}” (${a.tool.config.fields.map(f => f.label).join(', ')})`;
    case 'add_item': {
      const tool = tools.find(x => x.id === a.tool_id);
      if (!tool) return 'Aggiunge una voce';
      const data = cleanItemData(tool.config, a.values, peopleOf(tool, items.filter(x => x.tool_id === tool.id), members));
      const rest = tool.config.fields.slice(1).map(f => { const v = formatValue(f, data[f.id], tool.config, members, me); return v ? `${f.label.toLowerCase()} ${v}` : ''; }).filter(Boolean);
      return `In “${tool.name}” aggiunge “${String(data[tool.config.fields[0].id] || 'voce')}”${rest.length ? `: ${rest.join(', ')}` : ''}`;
    }
    case 'update_project': return [a.description && 'Aggiorna l\'obiettivo', a.due_date !== undefined && `Scadenza del progetto: ${d(a.due_date)}`, a.kind && `Diventa un progetto ${a.kind === 'lavoro' ? 'di lavoro' : 'personale'}`].filter(Boolean).join(' · ');
  }
}
