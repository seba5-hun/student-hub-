// "Assistente MYND" (Home → Personalizza): the student asks in words ("nascondi la citazione",
// "allenamento ogni martedì alle 18", "crea una versione per l'università") and the automatic AI
// answers with a reply plus a list of actions from a fixed set. The app checks every action and
// applies it to the data; nothing outside this list can be done, and everything can be undone.

import { UserData, Task, LabelKey, StudentKind, RepeatRule, createId, todayKey, parseDate, nextSubjectColor, compareTasks } from './store';
import { WIDGETS } from './homeWidgets';
import { makeProfileApi, PRESETS, KIND_ORDER, LABEL_KEYS } from './profile';
import { listLayouts, switchLayout, createLayout, updateActiveLayout, DEFAULT_LAYOUT_ID } from './layouts';
import { buildSeries, untilAfter, weekdayOf } from './recurrence';

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
    `Prossimi impegni: ${upcoming.map(t => `${t.title} il ${t.date}${t.time ? ` alle ${t.time}` : ''}`).join('; ') || 'nessuno'}.`,
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
- {"type":"open_section","section":"calendario"}  apre una sezione dopo le modifiche

REGOLE:
- Usa lo STATO ATTUALE qui sotto per id, nomi e date (calcola le date relative come "martedì prossimo" partendo da oggi).
- Se la richiesta è ambigua o manca un dato importante (es. la data di una verifica), non fare azioni: chiedi in "reply".
- Se lo studente chiede qualcosa che le azioni non permettono, spiegalo in "reply" e suggerisci come farlo a mano nell'app.
- Non cancellare mai dati: non esistono azioni per eliminare.
- Al massimo 20 azioni per risposta. Se non serve nessuna azione usa "actions": [].`;

export function parseAnswer(text: string): AssistantAnswer {
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

export interface ApplyResult { data: UserData; done: string[]; skipped: string[]; navigate?: string }

export function applyActions(input: UserData, actions: Action[]): ApplyResult {
  let data: UserData = input;
  const done: string[] = [];
  const skipped: string[] = [];
  let navigate: string | undefined;
  const settings = () => data.settings;
  const setSettings = (patch: Partial<UserData['settings']>) => { data = { ...data, settings: { ...data.settings, ...patch } }; };
  const homeOrder = () => {
    const s = settings();
    return [...(s.homeLayout?.order || []).filter(id => WIDGETS.some(w => w.id === id)), ...WIDGETS.map(w => w.id).filter(id => !(s.homeLayout?.order || []).includes(id))];
  };
  const panelName = (id: string) => WIDGETS.find(w => w.id === id)?.label || id;
  const sectionName = (id: string) => makeProfileApi(settings().profile).section(id, DEFAULT_SECTION_NAMES[id] || id);
  const activeName = () => listLayouts(settings()).find(l => l.active)?.name || 'MYND';

  for (const a of actions) {
    switch (a.type) {
      case 'set_weekly_goal': {
        const h = Math.round(num(a.hours));
        if (h >= 1 && h <= 80) { setSettings({ weeklyGoal: h }); done.push(`Obiettivo settimanale: ${h} ore`); } else skipped.push('obiettivo non valido');
        break;
      }
      case 'hide_panel': case 'show_panel': {
        const id = str(a.panel);
        if (!WIDGETS.some(w => w.id === id)) { skipped.push(`pannello "${id}"`); break; }
        const hidden = settings().homeLayout?.hidden || [];
        const next = a.type === 'hide_panel' ? [...new Set([...hidden, id])] : hidden.filter(h => h !== id);
        setSettings({ homeLayout: { order: homeOrder(), hidden: next } });
        done.push(`${a.type === 'hide_panel' ? 'Nascosto' : 'Mostrato'} il pannello "${panelName(id)}"`);
        break;
      }
      case 'move_panel': {
        const id = str(a.panel);
        if (!WIDGETS.some(w => w.id === id)) { skipped.push(`pannello "${id}"`); break; }
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
        if (id === 'home' || SECTION_IDS.includes(id)) navigate = id;
        break;
      }
      default:
        skipped.push(`azione "${a.type}"`);
    }
  }
  return { data, done, skipped, navigate };
}
