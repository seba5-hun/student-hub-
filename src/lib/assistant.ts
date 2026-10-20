// "Assistente MYND" (Home → Personalizza): the student asks in words ("nascondi la citazione",
// "allenamento ogni martedì alle 18", "crea una versione per l'università") and the automatic AI
// answers with a reply plus a list of actions from a fixed set. The app checks every action and
// applies it to the data; nothing outside this list can be done, and everything can be undone.

import { UserData, Task, LabelKey, StudentKind, RepeatRule, createId, todayKey, parseDate, nextSubjectColor, compareTasks } from './store';
import { WIDGETS } from './homeWidgets';
import { makeProfileApi, PRESETS, KIND_ORDER, LABEL_KEYS } from './profile';
import { listLayouts, switchLayout, createLayout, updateActiveLayout, DEFAULT_LAYOUT_ID } from './layouts';
import { buildSeries, untilAfter, weekdayOf } from './recurrence';
import { BLOCK_KINDS, SECTION_ICONS, isBlockKind, makeBlock, makeApp, addWidget, addSection, customOf, MAX_APP_HTML, addInside, allBlocks, updateBlock, takeBlock, setOriginal, isReplaced, orderMenu } from './custom';
import { CustomBlock } from './store';

export const SECTION_IDS = ['impegni', 'voti', 'timer', 'archivio', 'cosa-studiare', 'calendario', 'guida-ai'];
const DEFAULT_SECTION_NAMES: Record<string, string> = {
  impegni: 'Impegni', voti: 'Voti', timer: 'Timer Studio', archivio: 'Archivio', 'cosa-studiare': 'Cosa studiare', calendario: 'Calendario', 'guida-ai': 'Guida Studio AI',
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
    `Mini-app create: ${allApps(s).map(b => `"${b.title}" (id ${b.id}, ${placeOf(s, b.id).text}${b.config.write ? ', modifica i dati' : ''})${b.config.description ? `: ${String(b.config.description)}` : ''}`).join('; ') || 'nessuna'}.`,
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
function placeOf(s: UserData['settings'], id: string): { text: string; open?: string } {
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

// The code of the mini-apps the conversation is about (the one being edited, the last one made,
// the ones named in the message), so the AI can change them without starting from zero.
export function appContext(s: UserData['settings'], focus: string[], text: string, maxChars = 60000): string {
  const apps = allApps(s);
  const lower = text.toLowerCase();
  const chosen = apps.filter(b => focus.includes(b.id) || (b.title.length > 2 && lower.includes(b.title.toLowerCase())));
  let left = maxChars;
  const parts: string[] = [];
  for (const b of chosen) {
    const html = String(b.config.html || '');
    if (html.length > left) continue;
    left -= html.length;
    const err = b.config.lastError ? `\nUltimo errore segnalato: ${String(b.config.lastError)}` : '';
    parts.push(`CODICE ATTUALE DELLA MINI-APP "${b.title}" (id ${b.id}, dati dello studente: ${b.config.data ? 'sì' : 'no'}):${err}\n<<<CODE>>>\n${html}\n<<<FINE>>>`);
  }
  return parts.length ? `\n\n${parts.join('\n\n')}\nPer modificarla usa update_app con l'id e riscrivi il codice COMPLETO (non solo le parti cambiate), mantenendo i dati salvati compatibili.` : '';
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

MINI-APP = PERSONALIZZAZIONI SU MISURA (per tutto ciò che i blocchi non bastano a fare: quiz, flashcard, calcolatori, giochi di ripasso, diari, tabelle, grafici, sezioni rifatte…).
Sono a pacchetti: ogni mini-app nuova o modifica di una mini-app usa una personalizzazione del pacchetto dello studente (vedi PERSONALIZZAZIONI nello stato). Non viene attivata subito: diventa una richiesta che lo studente invia al team MYND con un pulsante; il team controlla che sia sicura e la attiva solo nel suo account, di solito entro un giorno.
- {"type":"create_app","title":"Flashcard","place":"section","icon":"brain","code":"A1","uses_data":true,"writes_data":false,"description":"mazzi di flashcard per materia con punteggio"}
  place: "section" (nuova sezione del menu), "home" (pannello della Home) oppure una sezione di MYND (${SECTION_IDS.join(', ')}) con "position": "replace" (prende il posto del contenuto della sezione: la sezione diventa la versione dello studente), "above" o "below";
  uses_data true se deve leggere materie, impegni o voti; writes_data true se deve anche AGGIUNGERE dati (tempo di studio, impegni, voti, note) o spuntare impegni.
- {"type":"update_app","app":"Flashcard","code":"A1","description":"…","writes_data":true}  sostituisce il codice di una mini-app esistente (app = titolo o id)
Il codice NON va nel JSON: scrivilo DOPO il JSON, tra i segni <<<APP:A1>>> e <<<END>>> (A1 = il valore di "code").
Come scrivere il codice di una mini-app:
- Una sola pagina HTML completa e funzionante, con <style> e <script> dentro; niente librerie o risorse esterne (non vengono caricate), niente alert/prompt.
- Testi in italiano, chiari. Deve stare bene da telefono a computer (layout fluido, niente larghezze fisse sopra 320px).
- Grafica MYND già pronta: usa le classi card, well, btn, btn-secondary, btn-danger, input, chip, row, col, grid, bar (con <i style="width:40%">), big, muted, subtle, lime, ok, bad, e le variabili CSS var(--text), var(--text-muted), var(--brand-ring), var(--brand-fill), var(--border), var(--glass-well), var(--area-scuola)… Lo sfondo resta trasparente. Non cambiare font o colori di base.
- Salvataggio: all'avvio const saved = await mynd.load() (null la prima volta); a ogni modifica await mynd.save(stato) (un oggetto JSON, massimo ~200 KB). Non usare localStorage.
- Dati dello studente (solo se uses_data è true): const d = await mynd.data() → { today, subjects:[{name,color}], tasks:[{title,date,time,subject,done,type,importance}], grades:[{subject,value,scale,date,description}], studyMinutes:[{subject,minutes,date}] } (null se lo studente non lo permette: gestiscilo). Sono solo da leggere.
- mynd.today() restituisce la data di oggi "AAAA-MM-GG". mynd.open("calendario") apre una sezione.
- Scrivere nei dati (solo se writes_data è true; ogni funzione restituisce una Promise e lancia un errore se i dati non vanno bene: usa try/catch e mostra un messaggio):
  await mynd.addSession({subject:"Matematica", minutes:50})  tempo di studio: conta nella Home, nelle statistiche e in "Cosa studiare" come quello del Timer
  await mynd.addTask({title:"Verifica", date:"AAAA-MM-GG", time:"HH:MM", subject:"Storia", personal:false, importance:3, minutes:60})
  await mynd.setTaskDone({id:"…", done:true})  (gli id arrivano da mynd.data().tasks)
  await mynd.addGrade({subject:"Fisica", value:7.5, scale:10, date:"AAAA-MM-GG", description:"Interrogazione"})
  await mynd.addNote({text:"…"})
  Non si può cancellare nulla. Al massimo 30 scritture al minuto.
- Codice completo e corretto, senza puntini o parti da completare.

REGOLE:
- Usa lo STATO ATTUALE qui sotto per id, nomi e date (calcola le date relative come "martedì prossimo" partendo da oggi).
- Se la richiesta è ambigua o manca un dato importante (es. la data di una verifica), non fare azioni: chiedi in "reply".
- MYND è uno spazio personalizzabile al 100%: nella sua versione lo studente può cambiare TUTTO e mettere ogni cosa dove vuole. Quando chiede una FUNZIONE NUOVA o di CAMBIARE come funziona una parte dell'app la realizzi tu.
- Se la richiesta riguarda una sezione che esiste già (es. "il calendario con la vista per settimana", "nei voti un grafico per materia"), la modifica va DENTRO quella sezione, non in una sezione nuova: se cambia il funzionamento crea una mini-app con place = quella sezione e position "replace" che rifà la sezione per intero con la modifica (tutte le funzioni utili dell'originale più quella nuova) e tiene i dati collegati (es. un timer salva il tempo con mynd.addSession, così Home e statistiche continuano a funzionare); se aggiunge solo qualcosa usa "above" o "below". Prima prova le azioni esistenti se bastano davvero.
- Se non è chiaro dove lo studente vuole una cosa, chiediglielo nella proposta (es. "La metto nella Home o dentro il Timer?"). Se bastano i blocchi usali (sono più semplici: "tracker dell'acqua" → counter, "conto alla rovescia alla maturità" → countdown, "sezione sport" → add_section con habits, counter e tasks personal). Altrimenti crei una MINI-APP.
- Per una mini-app PRIMA proponi: in "reply" descrivi in 2-5 punti brevi cosa farà e dove la metti, ricorda che usa 1 personalizzazione del pacchetto e chiedi "Va bene così?", senza azioni. Quando lo studente conferma (sì, ok, va bene, procedi…) scrivi create_app/update_app con il codice e in "reply" digli di toccare "Invia per l'approvazione" qui sotto. Nel campo "description" scrivi per il team una descrizione chiara e completa di cosa fa (3-6 frasi).
- Se lo studente non ha personalizzazioni disponibili, non scrivere codice: proponi l'idea e spiega che per attivarla serve un pacchetto di personalizzazioni (può chiederlo dal pulsante "Richiedi un pacchetto" in alto). Prima suggerisci se si può fare gratis con i blocchi o le azioni normali.
- Blocchi, pannelli, menu, nomi, versioni, materie e impegni sono gratuiti e si applicano subito.
- Usa request_feature solo per ciò che una mini-app non può fare: contatti con altre persone (classifiche tra amici, chat, condivisione), invio di email, pagamenti, siti esterni, notifiche quando l'app è chiusa. Dillo allo studente.
- Le modifiche vanno sempre nella versione personale dello studente: la MYND di base resta com'è (l'app crea "La mia MYND" da sola se serve) e lo studente può tornare all'originale di una sezione quando vuole. Non dire mai che "non puoi modificare il codice".
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
        if (place === 'home') {
          data = addWidget(data, app, Math.round(num(a.position)) || undefined);
          done.push(`Nuova mini-app nella Home: "${title}"`);
          navigate = 'home';
        } else if (SECTION_IDS.includes(place)) {
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
        if (where.open && SECTION_IDS.includes(where.open) && (target.at === 'replace')) data = setOriginal(data, where.open, false);
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
        if (!SECTION_IDS.includes(id)) { skipped.push(`sezione "${id}"`); break; }
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
