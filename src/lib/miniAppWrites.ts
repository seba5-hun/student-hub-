import { UserData, Task, Grade, createId, parseDate } from './store';

// What a mini-app may change in the student's data, through `window.mynd` (only if the student
// lets it: "Modifica: sì"). Everything is checked here, in MYND, never trusted from the mini-app:
// only adding study time, tasks, grades and notes, and ticking tasks. Nothing can be deleted.

export type WriteResult = { data: UserData; result: unknown } | { error: string };

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(parseDate(v).getTime());
const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// `id` is the id of what gets added (given from outside so that a second run gives the same result).
export function applyWrite(data: UserData, type: string, payload: unknown, id = createId()): WriteResult {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  switch (type) {
    // Study time (counts in the Home, the statistics and "Cosa studiare" like the Timer's).
    case 'addSession': {
      const subject = str(p.subject, 60) || 'Studio';
      const minutes = Math.round(Number(p.minutes));
      if (!(minutes >= 1 && minutes <= 600)) return { error: 'minutes deve essere tra 1 e 600' };
      const day = str(p.date, 10);
      const when = isDate(day) ? new Date(`${day}T12:00:00`) : new Date();
      const session = { id, subject, duration: minutes, date: when.toISOString() };
      return { data: { ...data, sessions: [...data.sessions, session] }, result: { id: session.id } };
    }
    case 'addTask': {
      const title = str(p.title, 120), date = str(p.date, 10);
      if (!title || !isDate(date)) return { error: 'servono title e date (AAAA-MM-GG)' };
      const time = str(p.time, 5), end = str(p.endTime, 5);
      const importance = Math.min(5, Math.max(1, Math.round(Number(p.importance) || 3))) as Task['importance'];
      const task: Task = {
        id, title, date, type: p.personal === true ? 'personale' : 'scolastico', importance,
        estimatedTime: Math.min(600, Math.max(0, Math.round(Number(p.minutes) || 0))), done: false,
        ...(isTime(time) ? { time } : {}), ...(isTime(end) ? { endTime: end } : {}),
        ...(str(p.subject, 60) ? { subject: str(p.subject, 60) } : {}),
      };
      return { data: { ...data, tasks: [...data.tasks, task] }, result: { id: task.id } };
    }
    case 'setTaskDone': {
      const target = str(p.id, 80);
      if (!data.tasks.some(t => t.id === target)) return { error: 'impegno non trovato' };
      const done = p.done !== false;
      return { data: { ...data, tasks: data.tasks.map(t => (t.id === target ? { ...t, done, autoDone: false, ...(done ? {} : { keepOpen: true }) } : t)) }, result: true };
    }
    case 'addGrade': {
      const subject = str(p.subject, 60), date = str(p.date, 10) || new Date().toISOString().slice(0, 10);
      const scale = ([10, 30, 100].includes(Number(p.scale)) ? Number(p.scale) : 10) as 10 | 30 | 100;
      const value = Number(p.value);
      if (!subject || !isDate(date) || !(value >= 0 && value <= scale)) return { error: `servono subject, value (0-${scale}) e date` };
      const grade: Grade = { id, subject, value: Math.round(value * 100) / 100, description: str(p.description, 120), date, ...(scale !== 10 ? { scale } : {}) };
      return { data: { ...data, grades: [...data.grades, grade] }, result: { id: grade.id } };
    }
    case 'addNote': {
      const text = str(p.text, 500);
      if (!text) return { error: 'serve text' };
      const notes = data.settings.notes ? `${data.settings.notes}\n${text}` : text;
      return { data: { ...data, settings: { ...data.settings, notes: notes.slice(-20000) } }, result: true };
    }
  }
  return { error: `operazione sconosciuta: ${type}` };
}

export const WRITE_TYPES = ['addSession', 'addTask', 'setTaskDone', 'addGrade', 'addNote'];
