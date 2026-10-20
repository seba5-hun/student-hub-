// "Assistente MYND" (Home → Personalizza): the student asks in words ("nascondi la citazione",
// "allenamento ogni martedì alle 18", "crea una versione per l'università") and the automatic AI
// answers with a reply plus a list of actions from a fixed set. The app checks every action and
// applies it to the data; nothing outside this list can be done, and everything can be undone.

import { UserData, Task, LabelKey, StudentKind, RepeatRule, createId, todayKey, parseDate, nextSubjectColor, compareTasks } from './store';
import { WIDGETS } from './homeWidgets';
import { makeProfileApi, PRESETS, KIND_ORDER, LABEL_KEYS } from './profile';
import { listLayouts, switchLayout, createLayout, updateActiveLayout, DEFAULT_LAYOUT_ID } from './layouts';
import { buildSeries, untilAfter, weekdayOf } from './recurrence';
import { BLOCK_KINDS, SECTION_ICONS, isBlockKind, makeBlock, makeApp, addWidget, addSection, customOf, MAX_APP_HTML, addInside, allBlocks, BASE_SECTIONS, updateBlock, takeBlock, setOriginal, isReplaced, orderMenu } from './custom';
import { CustomBlock } from './store';

export const SECTION_IDS = ['impegni', 'voti', 'timer', 'archivio', 'cosa-studiare', 'calendario', 'guida-ai'];
const DEFAULT_SECTION_NAMES: Record<string, string> = {
  home: 'Home', impegni: 'Impegni', voti: 'Voti', timer: 'Timer Studio', archivio: 'Archivio', 'cosa-studiare': 'Cosa studiare', calendario: 'Calendario', 'guida-ai': 'Guida Studio AI',
};
const WEEKDAYS = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

export type Action = Record<string, unknown> & { type: string };
export interface AssistantAnswer { reply: string; actions: Action[] }

// ---- What the AI knows about the app right now ----
export function describeState(data: UserData): string {
  const s = data.settings;
  const prof = makeProfileApi(s.profile);
  const order = [...(s.homeLayout?.order || []).filter(id => WIDGETS.some(w => w.id === id)), ...WIDGETS.map(w => w.id).filter(id => !(s.homeLayout?.order || []).includes(id))];
  const hiddenPanels = s.homeLayout?.hidden || [];
  const hiddenSections = s.hiddenSections || [];
  const today = todayKey();
  const upcoming = data.tasks.filter(t => !t.done && t.date >= today).sort(compareTasks).slice(0, 12);
  return [
    `Oggi è ${WEEKDAYS[weekdayOf(today)]} ${today}.`,
    `Versioni di MYND: ${listLayouts(s).map(l => `${l.name}${l.active ? ' (attiva)' : ''}${l.custom ? '' : ' [predefinita]'}`).join(', ')}.`,
    `Tipo di studente della versione attiva: ${prof.profile.kind} (${PRESETS[prof.profile.kind].title}).`,
    `Pannelli della Home in ordine: ${order.map((id, i) => `${i + 1}. ${id} = "${WIDGETS.find(w => w.id === id)?.label}"${hiddenPanels.includes(id) ? ' (nascosto)' : ''}`).join('; ')}.`,
    `Sezioni del menu: ${SECTION_IDS.map(id => `${id} = "${prof.section(id, DEFAULT_SECTION_NAMES[id])}"${hiddenSections.includes(id) ? ' (nascosta)' : ''}`).join('; ')}.`,
    `Nomi delle cose: ${LABEL_KEYS.filter(k => !SECTION_IDS.includes(k)).map(k => `${k} = "${prof.L(k)}"`).join('; ')}.`,
    `Materie: ${(s.subjects || []).map(x => `${x.name} (${x.color})`).join(', ') || 'nessuna'}.`,
    `Obiettivo settimanale di studio: ${s.weeklyGoal} ore.`,
    `Pannelli creati con i blocchi (sono nella Home, id "cw:…"): ${customOf(s).widgets.map(b => `cw:${b.id} = ${b.kind === 'app' ? 'mini-app' : b.kind} "${b.title}"`).join('; ') || 'nessuno'}.`,
    `Funzioni su misura già attive (mini-app): ${allApps(s).map(b => `"${b.title}" (id ${b.id}, ${placeOf(s, b.id).text}${b.config.write ? ', modifica i dati' : ''})${b.config.description ? `: ${String(b.config.description)}` : ''}`).join('; ') || 'nessuna'}.`,
    `Dentro le sezioni di MYND: ${Object.entries(customOf(s).inside || {}).filter(([, l]) => l.length).map(([k, l]) => `${k}: ${l.map(b => `${b.at === 'replace' ? 'AL POSTO DELLA SEZIONE' : b.at === 'above' ? 'sopra' : 'sotto'} ${b.kind === 'app' ? 'mini-app' : b.kind} "${b.title}" (id ${b.id})`).join(', ')}${isReplaced(s, k) ? '' : l.some(b => b.at === 'replace') ? ' [ora lo studente vede l\'originale]' : ''}`).join('; ') || 'niente'}.`,
    `Ordine del menu: ${orderMenu([...SECTION_IDS, ...customOf(s).sections.map(x => `cs:${x.id}`)].map(id => ({ id })), customOf(s).menu).map(x => { const cs = customOf(s).sections.find(y => `cs:${y.id}` === x.id); return cs ? `"${cs.name}"` : x.id; }).join(', ')}.`,
    `Sezioni create con i blocchi (nel menu): ${customOf(s).sections.map(x => `"${x.name}" (${x.blocks.map(b => `${b.kind} "${b.title}"`).join(', ') || 'vuota'})`).join('; ') || 'nessuna'}.`,
    `Prossimi impegni: ${upcoming.map(t => `${t.title} il ${t.date}${t.time ? ` alle ${t.time}` : ''}`).join('; ') || 'nessuno'}.`,
  ].join('\n');
}

// Every mini-app of the active version (Home and sections).
export function allApps(s: UserData['settings']): CustomBlock[] {
  return allBlocks(s).filter(b => b.kind === 'app');
}

// Where a block is, in words and as a section to open.
export function placeOf(s: UserData['settings'], id: string): { text: string; open?: string } {
  const c = customOf(s);
  if (c.widgets.some(b => b.id === id)) return { text: 'nella Home', open: 'home' };
  const sec = c.sections.find(x => x.blocks.some(b => b.id === id));
  if (sec) return { text: `nella sezione "${sec.name}"`, open: `cs:${sec.id}` };
  for (const [k, list] of Object.entries(c.inside || {})) {
    const b = list.find(x => x.id === id);
    if (b) return { text: `${b.at === 'replace' ? 'al posto di' : b.at === 'above' ? 'in cima a' : 'in fondo a'} ${k}`, open: k };
  }
  return { text: '' };
}

// The function on measure the student is talking about (from "Modifica con l'AI"), to change it.
export function focusNote(s: UserData['settings'], focus?: string): string {
  const b = focus ? allApps(s).find(x => x.id === focus) : undefined;
  return b ? `\n\nLO STUDENTE STA PARLANDO DELLA SUA FUNZIONE "${b.title}" (id ${b.id}, ${placeOf(s, b.id).text}${b.config.description ? `: ${String(b.config.description)}` : ''}${b.config.lastError ? `; ultimo errore: ${String(b.config.lastError)}` : ''}). Per cambiarla usa propose_custom con target_app "${b.id}".` : '';
}

// What the student's MYND has now (for the developer who builds the next function).
export function customSummary(s: UserData['settings']): string {
  const c = customOf(s);
  const apps = allApps(s).map(b => `- "${b.title}" (id ${b.id}) ${placeOf(s, b.id).text}${b.config.description ? `: ${String(b.config.description)}` : ''}`);
  const replaced = Object.entries(c.inside || {}).filter(([k]) => isReplaced(s, k)).map(([k]) => k);
  return [
    `Versione attiva: ${listLayouts(s).find(l => l.active)?.name || 'MYND'}.`,
    `Funzioni su misura già attive:\n${apps.join('\n') || '- nessuna'}`,
    `Sezioni di MYND sostituite: ${replaced.join(', ') || 'nessuna'}.`,
    `Sezioni create: ${c.sections.map(x => x.name).join(', ') || 'nessuna'}.`,
  ].join('\n');
}

export const ASSISTANT_SYSTEM = `Sei l'Assistente MYND: aiuti lo studente a organizzare e personalizzare l'app MYND parlando in italiano, in modo breve e amichevole (dagli del tu).
Puoi fare modifiche reali all'app, ma SOLO con le azioni elencate qui sotto. Rispondi SEMPRE e SOLO con un oggetto JSON, senza testo prima o dopo:
{"reply": "cosa hai fatto o la tua risposta, 1-3 frasi", "actions": [ ... ]}

AZIONI DISPONIBILI (usa esattamente questi nomi e campi):
- {"type":"set_weekly_goal","hours":15}  obiettivo di studio settimanale in ore (1-80)
- {"type":"hide_panel","panel":"quote"} / {"type":"show_panel","panel":"quote"}  pannelli della Home (usa gli id dello stato)
- {"type":"move_panel","panel":"upcoming","position":1}  posizione 1 = in alto
- {"type":"reset_home"}  Home e menu come all'inizio
- {"type":"hide_section","section":"voti"} / {"type":"show_section","section":"voti"}  sezioni del menu (id dello stato)
- {"type":"rename","key":"impegni","name":"Scadenze"}  rinomina una sezione o una "cosa" (chiavi: ${LABEL_KEYS.join(', ')}); il nome massimo 28 caratteri
- {"type":"set_student_kind","kind":"universita"}  tipo di studente: ${KIND_ORDER.join(', ')}
- {"type":"create_version","name":"Esami di gennaio","kind":"universita"}  crea e attiva una nuova versione di MYND
- {"type":"switch_version","name":"MYND"}  passa a una versione esistente ("MYND" = predefinita)
- {"type":"add_subject","name":"Fisica","color":"#83AFDF"}  color facoltativo, esadecimale
- {"type":"set_subject_color","name":"Fisica","color":"#E5484D"}
- {"type":"add_task","title":"Allenamento","date":"2026-10-21","time":"18:00","end_time":"19:30","subject":"Fisica","personal":true,"importance":3,"minutes":90,
   "repeat":{"freq":"weekly","days":[1,3],"interval":1,"until":"2027-06-10"}}
   date nel formato AAAA-MM-GG; time/end_time "HH:MM" facoltativi; personal true per impegni non di studio; importance 1-5 (3 normale, 5 massima);
   repeat facoltativo: freq daily|weekly|monthly, days solo per weekly con 0=lunedì … 6=domenica, until data finale (se non detta: fine dell'anno scolastico o 3 mesi).
- {"type":"add_note","text":"Portare la calcolatrice"}  aggiunge una riga alle note rapide
- {"type":"open_section","section":"calendario"}  apre una sezione dopo le modifiche (per le sezioni create usa il loro nome)

BLOCCHI DI MYND (per creare funzioni nuove senza programmare, con la grafica dell'app):
${BLOCK_KINDS.map(b => `- ${b.kind}: ${b.label}. ${b.hint}`).join('\n')}
- {"type":"add_widget","kind":"checklist","title":"Da fare oggi","config":{...},"position":1}  aggiunge un blocco come pannello della Home (position facoltativa, 1 = in alto)
- {"type":"add_section","name":"Benessere","icon":"heart","blocks":[{"kind":"habits","title":"Abitudini","config":{...}}]}  crea una nuova sezione nel menu fatta di blocchi; icone: ${SECTION_ICONS.join(', ')}
- {"type":"add_block","section":"Benessere","kind":"counter","title":"Acqua","config":{...}}  aggiunge un blocco a una sezione creata
- {"type":"add_block","section":"timer","position":"above","kind":"countdown","title":"…","config":{...}}  un blocco DENTRO una sezione di MYND (${SECTION_IDS.join(', ')}): position "above" (in cima), "below" (in fondo) o "replace" (al posto del contenuto)

SPOSTARE E RIORDINARE (nella versione dello studente tutto può andare dove vuole):
- {"type":"move_block","block":"titolo o id","place":"home"}  sposta un blocco o una mini-app: place = "home", il nome di una sezione creata, oppure una sezione di MYND con "position":"above"|"below"|"replace"
- {"type":"move_section","section":"timer","position":1}  ordine del menu (1 = subito dopo la Home); section = id di MYND o nome di una sezione creata
- {"type":"use_original","section":"timer","original":true}  mostra di nuovo la sezione originale di MYND al posto della versione dello studente (false = torna alla sua versione)
- {"type":"request_feature","text":"descrizione chiara della funzione richiesta"}  invia la richiesta agli sviluppatori di MYND

PERSONALIZZAZIONI SU MISURA (funzioni nuove che i blocchi non bastano a fare: quiz, flashcard, calcolatori, giochi di ripasso, diari, grafici, sezioni o Home rifatte da capo…).
Le costruisce il team MYND apposta per lo studente: tu raccogli l'idea, la rielabori e invii la richiesta. Ogni richiesta usa 1 personalizzazione del pacchetto (vedi PERSONALIZZAZIONI nello stato). Lo studente può chiederne quante vuole (finché ne ha) e rivoluzionare la sua app: sezioni nuove, una sezione di MYND rifatta, perfino la Home intera.
- {"type":"propose_custom","title":"Flashcard","place":"section","position":"","icon":"brain","uses_data":true,"writes_data":false,"target_app":""}
  Va insieme alla proposta scritta in "reply": l'app mostra sotto la proposta il pulsante "Conferma e invia" e, quando lo studente conferma, invia lei la richiesta al team (tu non devi fare altro).
  title: nome breve della funzione (max 40 caratteri).
  place: "section" (nuova sezione nel menu), "home" (pannello nella Home), oppure una sezione di MYND (${SECTION_IDS.join(', ')}) o "home" con "position": "replace" (rifà da capo quella sezione / tutta la Home), "above" (in cima) o "below" (in fondo).
  uses_data: true se deve leggere materie, impegni, voti o tempo di studio; writes_data: true se deve AGGIUNGERE tempo di studio, impegni, voti o note o spuntare impegni (non può mai cancellare).
  target_app: l'id di una funzione su misura che lo studente ha già (stato: "Funzioni su misura già attive") se vuole MODIFICARLA; vuoto per una funzione nuova.

REGOLE:
- Usa lo STATO ATTUALE qui sotto per id, nomi e date (calcola le date relative come "martedì prossimo" partendo da oggi).
- Se la richiesta è ambigua o manca un dato importante (es. la data di una verifica), non fare azioni: chiedi in "reply".
- MYND è uno spazio personalizzabile al 100%: nella sua versione lo studente può cambiare TUTTO e mettere ogni cosa dove vuole. Quando chiede una FUNZIONE NUOVA o di CAMBIARE come funziona una parte dell'app la realizzi tu.
- Se la richiesta riguarda una sezione che esiste già (es. "il calendario con la vista per settimana", "nei voti un grafico per materia"), la funzione va DENTRO quella sezione (place = quella sezione): "replace" se cambia il funzionamento (la sezione viene rifatta con tutte le funzioni utili dell'originale più quella nuova, con i dati collegati), "above"/"below" se aggiunge qualcosa. Prima prova le azioni gratuite se bastano davvero.
- Se bastano i blocchi usali (sono gratis e immediati: "tracker dell'acqua" → counter, "conto alla rovescia alla maturità" → countdown, "sezione sport" → add_section con habits, counter e tasks personal). Altrimenti è una PERSONALIZZAZIONE SU MISURA.
- Per una personalizzazione: fai le domande che servono per capire bene (al massimo 2-3 alla volta). Quando hai capito, in "reply" scrivi la proposta completa: cosa farà in 3-8 punti chiari e precisi (schermate, cosa succede a ogni tocco, quali dati usa o salva), dove andrà, che usa 1 personalizzazione del pacchetto, e chiudi con "Confermi?"; insieme metti l'azione propose_custom. Questa proposta è ciò che il team userà per costruirla: scrivi solo ciò che lo studente ha chiesto o accettato.
- Se dopo la proposta lo studente chiede cambiamenti, rifai la proposta aggiornata con un nuovo propose_custom.
- Se lo studente non ha personalizzazioni disponibili, non usare propose_custom: spiega che per altre funzioni su misura serve un pacchetto (può chiederlo dal pulsante "Richiedi un pacchetto" in alto). Prima suggerisci se si può fare gratis con i blocchi o le azioni normali.
- Blocchi, pannelli, menu, nomi, versioni, materie e impegni sono gratuiti e si applicano subito.
- Usa request_feature solo per ciò che nemmeno una funzione su misura può fare: contatti con altre persone (classifiche tra amici, chat, condivisione), invio di email, pagamenti, siti esterni, notifiche quando l'app è chiusa. Dillo allo studente.
- Le modifiche vanno sempre nella versione personale dello studente: la MYND di base resta com'è (l'app crea "La mia MYND" da sola se serve) e lo studente può tornare all'originale di una sezione quando vuole. Non dire mai che "non puoi modificare l'app": le funzioni nuove le proponi tu con propose_custom e l'app le invia al team.
- Se lo studente chiede qualcosa che riguarda solo l'uso dell'app, spiegalo in "reply".
- Non cancellare mai dati: non esistono azioni per eliminare.
- Al massimo 20 azioni per risposta. Se non serve nessuna azione usa "actions": [].`;

export interface ParsedAnswer extends AssistantAnswer { codes: Record<string, string> }

// The JSON reply and the code of the mini-apps written after it (<<<APP:id>>> … <<<END>>>).
export function parseAnswer(raw: string): ParsedAnswer {
  const codes: Record<string, string> = {};
  const text = raw.replace(/<<<APP:([\w-]+)>>>([\s\S]*?)(?:<<<END>>>|$)/g, (_, id: string, code: string) => {
    codes[id] = code.replace(/^\s*```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    return '';
  });
  return { ...parseJson(text), codes };
}

function parseJson(text: string): AssistantAnswer {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const raw = JSON.parse(match[0]);
      const actions = Array.isArray(raw.actions) ? raw.actions.filter((a: unknown) => a && typeof a === 'object' && typeof (a as Action).type === 'string').slice(0, 20) : [];
      return { reply: typeof raw.reply === 'string' ? raw.reply.trim() : '', actions };
    } catch { /* not JSON: plain answer */ }
  }
  return { reply: text.replace(/```(json)?/g, '').trim(), actions: [] };
}

// ---- Applying the actions ----
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(parseDate(v).getTime());
const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isColor = (v: string) => /^#[0-9a-f]{6}$/i.test(v);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export interface ApplyResult { data: UserData; done: string[]; skipped: string[]; navigate?: string; requests: string[]; apps: string[] }

export function applyActions(input: UserData, actions: Action[], codes: Record<string, string> = {}): ApplyResult {
  let data: UserData = input;
  const apps: string[] = [];   // the mini-apps created or changed (the next message is probably about them)
  const done: string[] = [];
  const skipped: string[] = [];
  let navigate: string | undefined;
  const requests: string[] = [];
  const settings = () => data.settings;
  const setSettings = (patch: Partial<UserData['settings']>) => { data = { ...data, settings: { ...data.settings, ...patch } }; };
  const panels = () => [...WIDGETS, ...customOf(settings()).widgets.map(b => ({ id: `cw:${b.id}`, label: b.title }))];
  const homeOrder = () => {
    const s = settings(), all = panels();
    return [...(s.homeLayout?.order || []).filter(id => all.some(w => w.id === id)), ...all.map(w => w.id).filter(id => !(s.homeLayout?.order || []).includes(id))];
  };
  const panelName = (id: string) => panels().find(w => w.id === id)?.label || id;
  const sectionName = (id: string) => makeProfileApi(settings().profile).section(id, DEFAULT_SECTION_NAMES[id] || id);
  const activeName = () => listLayouts(settings()).find(l => l.active)?.name || 'MYND';
  // The basic MYND stays as it is: new sections, panels and mini-apps go into the student's own version.
  const ownVersion = () => {
    if (activeName() !== 'MYND' || listLayouts(settings()).find(l => l.active)?.custom) return;
    const existing = listLayouts(settings()).find(l => l.custom && l.name === 'La mia MYND');
    data = { ...data, settings: existing ? switchLayout(settings(), existing.id) : createLayout(settings(), 'La mia MYND', settings().profile || { kind: 'superiori' }) };
    done.push(existing ? 'Sei passato a "La mia MYND", la tua versione personalizzata' : 'Creata "La mia MYND": la tua versione personalizzata (la MYND base resta com\'è)');
  };
  const appCode = (key: unknown) => {
    const code = codes[str(key, 40)] || '';
    return /<(script|div|body|html|main|section)[\s>]/i.test(code) ? code.slice(0, MAX_APP_HTML) : '';
  };
  const position = (v: unknown): 'above' | 'below' | 'replace' => (str(v) === 'replace' ? 'replace' : str(v) === 'below' ? 'below' : 'above');
  const findBlock = (key: string, appsOnly: boolean) => (appsOnly ? allApps(settings()) : allBlocks(settings())).find(b => b.id === key || same(b.title, key))
    || customOf(settings()).widgets.find(b => `cw:${b.id}` === key);

  for (const a of actions) {
    switch (a.type) {
      case 'set_weekly_goal': {
        const h = Math.round(num(a.hours));
        if (h >= 1 && h <= 80) { setSettings({ weeklyGoal: h }); done.push(`Obiettivo settimanale: ${h} ore`); } else skipped.push('obiettivo non valido');
        break;
      }
      case 'hide_panel': case 'show_panel': {
        const id = str(a.panel);
        if (!panels().some(w => w.id === id)) { skipped.push(`pannello "${id}"`); break; }
        const hidden = settings().homeLayout?.hidden || [];
        const next = a.type === 'hide_panel' ? [...new Set([...hidden, id])] : hidden.filter(h => h !== id);
        setSettings({ homeLayout: { order: homeOrder(), hidden: next } });
        done.push(`${a.type === 'hide_panel' ? 'Nascosto' : 'Mostrato'} il pannello "${panelName(id)}"`);
        break;
      }
      case 'move_panel': {
        const id = str(a.panel);
        if (!panels().some(w => w.id === id)) { skipped.push(`pannello "${id}"`); break; }
        const order = homeOrder().filter(x => x !== id);
        const pos = Math.max(1, Math.min(order.length + 1, Math.round(num(a.position)) || 1));
        order.splice(pos - 1, 0, id);
        setSettings({ homeLayout: { order, hidden: settings().homeLayout?.hidden || [] } });
        done.push(`"${panelName(id)}" spostato in posizione ${pos}`);
        break;
      }
      case 'reset_home': {
        setSettings({ homeLayout: { order: WIDGETS.map(w => w.id), hidden: [] }, hiddenSections: [] });
        done.push('Home e menu come all\'inizio');
        break;
      }
      case 'hide_section': case 'show_section': {
        const id = str(a.section);
        if (!SECTION_IDS.includes(id)) { skipped.push(`sezione "${id}"`); break; }
        const hidden = settings().hiddenSections || [];
        setSettings({ hiddenSections: a.type === 'hide_section' ? [...new Set([...hidden, id])] : hidden.filter(h => h !== id) });
        done.push(`${a.type === 'hide_section' ? 'Nascosta' : 'Mostrata'} la sezione "${sectionName(id)}"`);
        break;
      }
      case 'rename': {
        const key = str(a.key) as LabelKey, name = str(a.name, 28);
        if (!LABEL_KEYS.includes(key) || !name) { skipped.push('nome non valido'); break; }
        const profile = settings().profile || { kind: 'superiori' as StudentKind };
        const before = activeName();
        data = { ...data, settings: updateActiveLayout(settings(), before === 'MYND' ? 'La mia MYND' : before, { ...profile, labels: { ...profile.labels, [key]: name } }) };
        done.push(`Rinominato in "${name}"${before === 'MYND' && activeName() !== 'MYND' ? ` (nella nuova versione "${activeName()}")` : ''}`);
        break;
      }
      case 'set_student_kind': {
        const kind = str(a.kind) as StudentKind;
        if (!KIND_ORDER.includes(kind)) { skipped.push('tipo di studente non valido'); break; }
        const profile = settings().profile;
        const before = activeName();
        data = { ...data, settings: updateActiveLayout(settings(), before === 'MYND' ? PRESETS[kind].title : before, { ...profile, kind, labels: undefined, gradeScale: undefined }) };
        done.push(`Versione "${activeName()}": ${PRESETS[kind].title}`);
        break;
      }
      case 'create_version': {
        const kind = (KIND_ORDER.includes(str(a.kind) as StudentKind) ? str(a.kind) : 'superiori') as StudentKind;
        const name = str(a.name, 30) || PRESETS[kind].title;
        data = { ...data, settings: createLayout(settings(), name, { kind }) };
        done.push(`Creata e attivata la versione "${name}"`);
        break;
      }
      case 'switch_version': {
        const name = str(a.name, 30);
        const target = listLayouts(settings()).find(l => same(l.name, name)) || (same(name, 'predefinita') ? { id: DEFAULT_LAYOUT_ID, name: 'MYND' } : undefined);
        if (!target) { skipped.push(`versione "${name}"`); break; }
        data = { ...data, settings: switchLayout(settings(), target.id) };
        done.push(`Ora usi "${target.name}"`);
        break;
      }
      case 'add_subject': {
        const name = str(a.name, 40);
        const subjects = settings().subjects || [];
        if (!name) { skipped.push('materia senza nome'); break; }
        if (subjects.some(x => same(x.name, name))) { skipped.push(`"${name}" c'è già`); break; }
        const color = isColor(str(a.color)) ? str(a.color) : nextSubjectColor(subjects);
        setSettings({ subjects: [...subjects, { name, color }], hiddenSubjects: (settings().hiddenSubjects || []).filter(h => !same(h, name)) });
        done.push(`Aggiunta "${name}"`);
        break;
      }
      case 'set_subject_color': {
        const name = str(a.name, 40), color = str(a.color);
        const subjects = settings().subjects || [];
        if (!isColor(color) || !subjects.some(x => same(x.name, name))) { skipped.push(`colore di "${name}"`); break; }
        setSettings({ subjects: subjects.map(x => (same(x.name, name) ? { ...x, color } : x)) });
        done.push(`Nuovo colore per "${name}"`);
        break;
      }
      case 'add_task': {
        const title = str(a.title, 120), date = str(a.date);
        if (!title || !isDate(date)) { skipped.push(`impegno "${title || '?'}" senza data valida`); break; }
        const time = isTime(str(a.time)) ? str(a.time) : undefined;
        const endTime = time && isTime(str(a.end_time)) && str(a.end_time) > time ? str(a.end_time) : undefined;
        const imp = Math.round(num(a.importance));
        const minutes = Math.round(num(a.minutes));
        const subject = str(a.subject, 40);
        const personal = a.personal === true;
        const task: Task = {
          id: createId(), title, date, time, endTime,
          type: personal ? 'personale' : 'scolastico',
          importance: (imp >= 1 && imp <= 5 ? imp : 3) as Task['importance'],
          estimatedTime: minutes > 0 && minutes <= 600 ? minutes : 60,
          done: false,
          subject: !personal && subject ? subject : undefined,
        };
        const r = (a.repeat && typeof a.repeat === 'object' ? a.repeat : null) as Record<string, unknown> | null;
        let series: Task[] = [task];
        if (r && ['daily', 'weekly', 'monthly'].includes(str(r.freq))) {
          const freq = str(r.freq) as RepeatRule['freq'];
          const days = Array.isArray(r.days) ? (r.days as unknown[]).map(Number).filter(d => d >= 0 && d <= 6) : [];
          const prof = makeProfileApi(settings().profile);
          const until = isDate(str(r.until)) && str(r.until) >= date ? str(r.until) : (prof.termEnd(date) || untilAfter(date, 3, 'mesi'));
          const rule: RepeatRule = { freq, interval: Math.max(1, Math.min(4, Math.round(num(r.interval)) || 1)), days: freq === 'weekly' ? (days.length ? days : [weekdayOf(date)]) : undefined, until };
          series = buildSeries(task, rule);
        }
        data = { ...data, tasks: [...data.tasks, ...series] };
        const when = parseDate(date).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
        done.push(series.length > 1 ? `"${title}" ${series.length} volte, dal ${when}` : `"${title}" · ${when}${time ? ` ${time}` : ''}`);
        break;
      }
      case 'add_note': {
        const text = str(a.text, 500);
        if (!text) break;
        const notes = settings().notes || '';
        setSettings({ notes: notes ? `${notes}\n${text}` : text });
        done.push('Aggiunto alle note');
        break;
      }
      case 'open_section': {
        const id = str(a.section);
        const custom = customOf(settings()).sections.find(x => same(x.name, id) || `cs:${x.id}` === id);
        if (id === 'home' || SECTION_IDS.includes(id)) navigate = id;
        else if (custom) navigate = `cs:${custom.id}`;
        break;
      }
      case 'create_app': {
        const html = appCode(a.code);
        const title = str(a.title, 60) || 'Mini-app';
        if (!html) { skipped.push(`mini-app "${title}" senza codice valido`); break; }
        ownVersion();
        const writes = a.writes_data === true;
        const app = makeApp(title, html, a.uses_data === true || writes, str(a.description, 300), writes);
        apps.push(app.id);
        const place = str(a.place, 40);
        if (place === 'home' && str(a.position) !== 'replace') {
          data = addWidget(data, app, Math.round(num(a.position)) || undefined);
          done.push(`Nuova mini-app nella Home: "${title}"`);
          navigate = 'home';
        } else if (SECTION_IDS.includes(place) || place === 'home') {
          const at = position(a.position);
          data = addInside(data, place, app, at);
          navigate = place;
          done.push(at === 'replace' ? `${sectionName(place)} ora è la tua versione: "${title}" (l'originale resta a un tocco)` : `Mini-app "${title}" ${at === 'above' ? 'in cima a' : 'in fondo a'} ${sectionName(place)}`);
        } else {
          const res = addSection(data, title, str(a.icon), [app]);
          data = res.data;
          navigate = `cs:${res.section.id}`;
          done.push(`Nuova sezione nel menu con la mini-app "${title}"`);
        }
        if (writes) done.push('Può aggiungere dati (tempo di studio, impegni, voti, note): lo togli dal pulsante "Modifica" sulla mini-app');
        break;
      }
      case 'update_app': {
        const html = appCode(a.code);
        const key = str(a.app, 60);
        if (html) ownVersion();
        const target = findBlock(key, true);
        if (!target || !html) { skipped.push(`modifica di "${key}"`); break; }
        const writes = a.writes_data === true;
        data = updateBlock(data, target.id, b => ({
          ...b, title: str(a.title, 60) || b.title,
          config: { ...b.config, html, lastError: '', ...(str(a.description) ? { description: str(a.description, 300) } : {}),
            ...(typeof a.uses_data === 'boolean' ? { data: a.uses_data || writes } : {}),
            ...(writes ? { data: true, write: true, wantsWrite: true } : {}),
            history: [...((b.config.history as unknown[]) || []), { html: String(b.config.html || ''), at: new Date().toISOString() }].slice(-5) },
        }));
        apps.push(target.id);
        done.push(`Aggiornata la mini-app "${target.title}"`);
        const where = placeOf(settings(), target.id);
        if (where.open) navigate = where.open;
        if (where.open && BASE_SECTIONS.includes(where.open) && (target.at === 'replace')) data = setOriginal(data, where.open, false);
        break;
      }
      case 'move_block': {
        const key = str(a.block, 60);
        const target = findBlock(key, false);
        const place = str(a.place, 40);
        if (!target) { skipped.push(`spostamento di "${key}"`); break; }
        ownVersion();
        const taken = takeBlock(data, target.id);
        if (!taken.block) { skipped.push(`spostamento di "${key}"`); break; }
        const custom = customOf(taken.data.settings).sections.find(x => same(x.name, place) || `cs:${x.id}` === place);
        if (place === 'home') {
          data = addWidget(taken.data, taken.block, Math.round(num(a.home_position)) || undefined);
          navigate = 'home';
        } else if (SECTION_IDS.includes(place)) {
          data = addInside(taken.data, place, taken.block, position(a.position));
          navigate = place;
        } else if (custom) {
          const c = customOf(taken.data.settings);
          data = { ...taken.data, settings: { ...taken.data.settings, custom: { ...c, sections: c.sections.map(x => (x.id === custom.id ? { ...x, blocks: [...x.blocks, taken.block!] } : x)) } } };
          navigate = `cs:${custom.id}`;
        } else { skipped.push(`posto "${place}"`); break; }
        done.push(`"${target.title}" spostato ${placeOf(settings(), target.id).text}`);
        break;
      }
      case 'move_section': {
        const key = str(a.section, 40);
        const c0 = customOf(settings());
        const cs = c0.sections.find(x => same(x.name, key) || `cs:${x.id}` === key);
        const id = SECTION_IDS.includes(key) ? key : cs ? `cs:${cs.id}` : '';
        if (!id) { skipped.push(`sezione "${key}"`); break; }
        ownVersion();
        const c = customOf(settings());
        const all = orderMenu([...SECTION_IDS, ...c.sections.map(x => `cs:${x.id}`)].map(x => ({ id: x })), c.menu).map(x => x.id).filter(x => x !== id);
        const pos = Math.max(1, Math.min(all.length + 1, Math.round(num(a.position)) || 1));
        all.splice(pos - 1, 0, id);
        setSettings({ custom: { ...c, menu: all } });
        done.push(`"${cs ? cs.name : sectionName(id)}" in posizione ${pos} nel menu`);
        break;
      }
      case 'use_original': {
        const id = str(a.section, 40);
        if (!BASE_SECTIONS.includes(id)) { skipped.push(`sezione "${id}"`); break; }
        const original = a.original !== false;
        data = setOriginal(data, id, original);
        navigate = id;
        done.push(original ? `${sectionName(id)}: di nuovo l'originale di MYND (la tua versione resta salvata)` : `${sectionName(id)}: di nuovo la tua versione`);
        break;
      }
      case 'add_widget': {
        const kind = str(a.kind);
        if (!isBlockKind(kind)) { skipped.push(`blocco "${kind}"`); break; }
        ownVersion();
        const block = makeBlock(kind, str(a.title, 60), (a.config && typeof a.config === 'object' ? a.config : {}) as Record<string, unknown>);
        data = addWidget(data, block, Math.round(num(a.position)) || undefined);
        done.push(`Nuovo pannello nella Home: "${block.title}"`);
        break;
      }
      case 'add_section': {
        const name = str(a.name, 28);
        if (!name) { skipped.push('sezione senza nome'); break; }
        ownVersion();
        if (customOf(settings()).sections.some(x => same(x.name, name))) { skipped.push(`la sezione "${name}" c'è già`); break; }
        const blocks = (Array.isArray(a.blocks) ? a.blocks : []).slice(0, 12)
          .map(b => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>)
          .filter(b => isBlockKind(str(b.kind)))
          .map(b => makeBlock(str(b.kind) as Parameters<typeof makeBlock>[0], str(b.title, 60), (b.config && typeof b.config === 'object' ? b.config : {}) as Record<string, unknown>));
        const res = addSection(data, name, str(a.icon), blocks);
        data = res.data;
        navigate = `cs:${res.section.id}`;
        done.push(`Nuova sezione nel menu: "${res.section.name}"${blocks.length ? ` con ${blocks.length} ${blocks.length === 1 ? 'blocco' : 'blocchi'}` : ''}`);
        break;
      }
      case 'add_block': {
        const name = str(a.section, 28), kind = str(a.kind);
        if (!isBlockKind(kind) || kind === 'app') { skipped.push(`blocco in "${name}"`); break; }
        const block = makeBlock(kind, str(a.title, 60), (a.config && typeof a.config === 'object' ? a.config : {}) as Record<string, unknown>);
        if (SECTION_IDS.includes(name)) {
          ownVersion();
          const at = position(a.position);
          data = addInside(data, name, block, at);
          navigate = name;
          done.push(`Aggiunto "${block.title}" ${at === 'replace' ? 'al posto di' : at === 'above' ? 'in cima a' : 'in fondo a'} ${sectionName(name)}`);
          break;
        }
        const c = customOf(settings());
        const section = c.sections.find(x => same(x.name, name));
        if (!section) { skipped.push(`blocco in "${name}"`); break; }
        setSettings({ custom: { ...c, sections: c.sections.map(x => (x.id === section.id ? { ...x, blocks: [...x.blocks, block] } : x)) } });
        done.push(`Aggiunto "${block.title}" in "${section.name}"`);
        break;
      }
      case 'request_feature': {
        const text = str(a.text, 1500);
        if (text) requests.push(text);
        break;
      }
      default:
        skipped.push(`azione "${a.type}"`);
    }
  }
  return { data, done, skipped, navigate, requests, apps };
}
