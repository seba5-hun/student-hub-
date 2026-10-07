// Mindset Coach: what the AI knows (Mindset + study data) and how its day plans are read back.

import {
  MindsetData, Block, Area, AREAS, CoachPlan, dayWithTasks, dayTypeOf, alarmOf, bedtimeFor, addDays, effectiveStatus,
  sleepMinutes, scoreDay, phoneStats, sleepStats, formatDuration, CAUSES, toMin, fromMin,
} from './mindset';
import { Task, Grade, StudySession, getSubjectAverages, createId, toDateKey } from './store';

export interface StudyInfo { tasks: Task[]; grades: Grade[]; sessions: StudySession[]; subjects: string[]; weeklyGoal: number }


export const COACH_SYSTEM = `Sei il Mindset Coach di Sebastiano, uno studente-atleta (scuola, wingfoil agonistico, palestra, progetti personali).
Parli in italiano, in modo diretto, concreto e breve. Usi SEMPRE i suoi dati reali (te li do sotto): orari, impegni, verifiche, voti, sonno, telefono, imprevisti.

Regole:
- Niente motivazione vuota, niente prediche, niente sensi di colpa. Mai "devi impegnarti di più". Preferisci: "Hai 2h15 libere stasera: la priorità è la verifica di matematica di domani, sposta il progetto a sabato".
- Il sonno è performance: non proporre mai di dormire meno delle ore che si è dato. Si sveglia prima chi va a letto prima.
- Non proporre allenamenti in più se è stanco o dopo giornate pesanti; dopo una gara serve recupero.
- Costanza prima di intensità: piani realistici, con pause e un po' di margine. Se una giornata è piena, togli qualcosa invece di comprimere.
- Non fare diagnosi mediche.
- Se mancano dati per rispondere bene, fai UNA domanda precisa.

Quando ti chiede di organizzare/programmare/riorganizzare una giornata (oggi o domani), oltre a una spiegazione breve (massimo 5 righe) scrivi il piano in un blocco così:
\`\`\`piano
{"giorno":"AAAA-MM-GG","attivita":[{"inizio":"HH:MM","fine":"HH:MM","titolo":"...","area":"..."}],"priorita":{"scuola":"...","sport":"...","progetto":"..."}}
\`\`\`
- "area" è una di: morning, school, study, sport, project, recovery, life, travel, meal, sleep.
- Metti TUTTA la giornata dal risveglio (o da adesso, se è oggi) fino a "A letto" all'ora giusta per il sonno. Tieni gli impegni fissi (scuola, allenamenti, pasti in famiglia) a meno che lui dica che cambiano.
- Inserisci SEMPRE gli impegni personali di quel giorno (visite, appuntamenti…): quelli con orario al loro orario, quelli senza orario in uno spazio libero adatto. Usa lo stesso nome dell'impegno.
- Le priorità sono 3 al massimo, concrete (es. "esercizi 31–40 e correggo gli errori"), e puoi lasciarne fuori una.
- Il piano NON si applica da solo: lui lo vede e decide se applicarlo. Non dire che l'hai già inserito.`;

const AREA_ALIASES: Record<string, Area> = {
  mattino: 'morning', scuola: 'school', studio: 'study', sport: 'sport', allenamento: 'sport', progetto: 'project',
  recupero: 'recovery', vita: 'life', libero: 'life', viaggio: 'travel', pasto: 'meal', sonno: 'sleep',
};

const hhmm = (v: unknown): string | null => {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(v ?? '').trim());
  if (m && +m[1] === 24 && +m[2] === 0) return '00:00'; // "24:00" = midnight
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
};

// Takes the ```piano``` block out of the answer and turns it into blocks for the day.
export function parsePlan(reply: string, today: string): { text: string; plan?: CoachPlan } {
  // One fenced block at a time: the plan is the one that contains "attivita".
  const match = [...reply.matchAll(/```[a-z]*\s*(\{[\s\S]*?\})\s*```/gi)].find(x => x[1].includes('"attivita"'));
  if (!match) return { text: reply.trim() };
  const text = reply.replace(match[0], '').replace(/\n{3,}/g, '\n\n').trim();
  try {
    const raw = JSON.parse(match[1]);
    const day = /^\d{4}-\d{2}-\d{2}$/.test(raw.giorno) ? raw.giorno : today;
    const blocks: Block[] = (Array.isArray(raw.attivita) ? raw.attivita : [])
      .map((a: Record<string, unknown>): Block | null => {
        const start = hhmm(a.inizio);
        const end = hhmm(a.fine) || (start ? fromMin(toMin(start) + 30) : null);
        const title = String(a.titolo || '').trim().slice(0, 80);
        if (!start || !end || !title) return null;
        const areaRaw = String(a.area || '').toLowerCase();
        const area = (areaRaw in AREAS ? areaRaw : AREA_ALIASES[areaRaw] || 'life') as Area;
        return { id: createId(), start, end, title, area };
      })
      .filter((b: Block | null): b is Block => !!b)
      .sort((x: Block, y: Block) => toMin(x.start) - toMin(y.start));
    const pr = raw.priorita && typeof raw.priorita === 'object' ? raw.priorita : {};
    const priorities: CoachPlan['priorities'] = {};
    if (pr.scuola) priorities.school = String(pr.scuola).slice(0, 120);
    if (pr.sport) priorities.sport = String(pr.sport).slice(0, 120);
    if (pr.progetto) priorities.project = String(pr.progetto).slice(0, 120);
    if (!blocks.length) return { text: text || reply.trim() };
    return { text, plan: { day, blocks, priorities } };
  } catch {
    return { text: reply.trim() };
  }
}

const dayName = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

function describeDay(m: MindsetData, key: string, now: Date, tasks: Task[]): string {
  const type = dayTypeOf(m, key);
  const log = m.days[key] || {};
  const lines = dayWithTasks(m, key, tasks).blocks.map(b => {
    const st = effectiveStatus(m, key, b, now);
    return `  ${b.start}-${b.end} ${b.title} [${b.taskId ? 'impegno' : b.area}${b.subject ? `, ${b.subject}` : ''}]${st ? ` (${{ done: 'fatto', min: 'minimo', skipped: 'saltato', excused: 'saltato per imprevisto' }[st]})` : ''}`;
  });
  const pr = (log.priorities || []).map(p => `  - ${p.area}: ${p.text}${p.done ? ' (fatta)' : ''}`);
  const dis = (log.disruptions || []).map(d => `  - imprevisto: ${CAUSES.find(c => c.id === d.cause)?.label || d.cause}, ${formatDuration(d.minutes)}${d.external ? ' (non dipendeva da lui)' : ''}`);
  return [`${dayName(key)} (${key}) · giornata "${type.name}" · sveglia ${alarmOf(m, key)}`, ...lines, ...(pr.length ? ['  Priorità:', ...pr] : []), ...dis].join('\n');
}

export function buildCoachContext(m: MindsetData, study: StudyInfo, now: Date = new Date()): string {
  const today = toDateKey(now);
  const tomorrow = addDays(today, 1);
  const p = m.profile;
  const out: string[] = [];
  out.push(`ADESSO: ${dayName(today)}, ore ${fromMin(now.getHours() * 60 + now.getMinutes())}.`);
  out.push(`PROFILO: sonno desiderato ${formatDuration(p.sleepNeed)}; sveglia progressiva al gradino ${p.stage.wake} (obiettivo ${p.targetWake}); stasera a letto alle ${bedtimeFor(m, tomorrow)} per la sveglia delle ${alarmOf(m, tomorrow)}; obiettivo telefono ${formatDuration(p.phoneGoal)}/giorno; focus/studio ${formatDuration(p.focusTarget)}/giorno.`);
  const week = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'].map((d, i) => `${d}: ${m.dayTypes.find(t => t.id === m.week[i])?.name || '?'}`).join(', ');
  out.push(`SETTIMANA TIPO: ${week}.`);
  out.push(`\nOGGI:\n${describeDay(m, today, now, study.tasks)}`);
  out.push(`\nDOMANI:\n${describeDay(m, tomorrow, now, study.tasks)}`);

  // Last 7 days.
  const recent: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const k = addDays(today, -i);
    const d = m.days[k];
    if (!d) continue;
    const s = scoreDay(m, k, now).score;
    const slept = sleepMinutes(d.sleep);
    const ck = d.checkin;
    recent.push(`  ${k} (${dayTypeOf(m, k).name}): punteggio ${s ?? '–'}, sonno ${slept !== null ? formatDuration(slept) : '–'}, telefono ${typeof d.phone === 'number' ? formatDuration(d.phone) : '–'}`
      + (ck ? `, energia ${ck.energy ?? '–'} focus ${ck.focus ?? '–'} umore ${ck.mood ?? '–'} stress ${ck.stress ?? '–'}` : '')
      + ((d.disruptions || []).length ? `, imprevisti: ${(d.disruptions || []).map(x => CAUSES.find(c => c.id === x.cause)?.label || x.cause).join(', ')}` : '')
      + ((d.focus || []).length ? `, focus ${formatDuration((d.focus || []).reduce((a, f) => a + f.minutes, 0))}` : ''));
  }
  out.push(`\nULTIMI 7 GIORNI:\n${recent.length ? recent.join('\n') : '  nessun dato ancora'}`);
  const sl = sleepStats(m, today);
  const ph = phoneStats(m, today);
  out.push(`MEDIE: sonno ${sl.avgSleep !== null ? formatDuration(sl.avgSleep) : '–'}, debito di sonno 7 gg ${formatDuration(sl.debt)}; telefono ${ph.avg7 !== null ? formatDuration(ph.avg7) : '–'} (obiettivo della settimana ${formatDuration(ph.target)}).`);
  out.push(`ABITUDINI: ${m.habits.map(h => `${h.name} (completa: ${h.full}, minimo: ${h.min})`).join('; ') || 'nessuna'}.`);

  // Study side.
  const upcoming = study.tasks
    .filter(t => !t.done && t.date >= today && t.date <= addDays(today, 14))
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    .slice(0, 15)
    .map(t => `  ${t.date}${t.time ? ` ${t.time}` : ''} · ${t.title}${t.subject ? ` (${t.subject})` : ''} · importanza ${t.importance}/5 · stima ${t.estimatedTime} min`);
  out.push(`\nIMPEGNI E VERIFICHE (prossimi 14 giorni):\n${upcoming.length ? upcoming.join('\n') : '  nessuno'}`);
  const avgs = getSubjectAverages(study.grades);
  const avgText = Object.entries(avgs).sort((a, b) => a[1] - b[1]).map(([s, v]) => `${s} ${v}`).join(', ');
  out.push(`MEDIE VOTI: ${avgText || 'nessun voto'}.`);
  const since = addDays(today, -7);
  const bySubject = new Map<string, number>();
  study.sessions.filter(s => s.date.slice(0, 10) >= since).forEach(s => bySubject.set(s.subject, (bySubject.get(s.subject) || 0) + s.duration));
  out.push(`STUDIO ULTIMI 7 GIORNI (Timer): ${[...bySubject.entries()].map(([s, v]) => `${s} ${formatDuration(v)}`).join(', ') || 'nessuna sessione'}; obiettivo settimanale ${study.weeklyGoal}h.`);
  if (study.subjects.length) out.push(`MATERIE: ${study.subjects.join(', ')}.`);
  return out.join('\n');
}
