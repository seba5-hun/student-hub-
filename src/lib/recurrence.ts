// Repeated tasks, like the iPhone calendar: "ogni martedì e giovedì", "ogni 2 settimane",
// "ogni mese il giorno 2", for a number of weeks or months or until a date. The occurrences are
// created as tasks of their own when the series is saved.

import { Task, RepeatRule, createId, parseDate, toDateKey } from './store';

export const MAX_OCCURRENCES = 250;
const WEEKDAYS = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
export const WEEKDAY_SHORT = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

// 0 = Monday … 6 = Sunday.
export const weekdayOf = (key: string) => (parseDate(key).getDay() + 6) % 7;

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// The dates of the series, the first one included (when it matches the rule), in order.
export function occurrences(start: string, rule: RepeatRule): string[] {
  const first = parseDate(start);
  const until = parseDate(rule.until);
  const interval = Math.max(1, Math.round(rule.interval) || 1);
  const out: string[] = [];
  if (until < first) return [start];
  if (rule.freq === 'daily') {
    for (let d = first; d <= until && out.length < MAX_OCCURRENCES; d = addDays(d, interval)) out.push(toDateKey(d));
  } else if (rule.freq === 'weekly') {
    const days = rule.days?.length ? [...new Set(rule.days)].sort() : [weekdayOf(start)];
    const monday = addDays(first, -weekdayOf(start));
    for (let week = monday; week <= until && out.length < MAX_OCCURRENCES; week = addDays(week, 7 * interval)) {
      for (const wd of days) {
        const d = addDays(week, wd);
        if (d >= first && d <= until && out.length < MAX_OCCURRENCES) out.push(toDateKey(d));
      }
    }
  } else {
    // Same day of the month; months without that day (31, 30, 29 February) are skipped.
    const day = first.getDate();
    for (let m = 0; out.length < MAX_OCCURRENCES; m += interval) {
      const d = new Date(first.getFullYear(), first.getMonth() + m, day);
      if (d > until) break;
      if (d.getDate() === day) out.push(toDateKey(d));
    }
  }
  return out.length ? out : [start];
}

const joinIt = (items: string[]) => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;

// "Ogni martedì e giovedì", "Ogni 2 settimane, il lunedì", "Ogni mese, il giorno 2", "Ogni giorno".
export function describeRepeat(rule: RepeatRule, start: string): string {
  const n = Math.max(1, rule.interval || 1);
  if (rule.freq === 'daily') return n === 1 ? 'Ogni giorno' : `Ogni ${n} giorni`;
  if (rule.freq === 'monthly') {
    const day = parseDate(start).getDate();
    return `${n === 1 ? 'Ogni mese' : `Ogni ${n} mesi`}, il giorno ${day}`;
  }
  const days = rule.days?.length ? [...new Set(rule.days)].sort() : [weekdayOf(start)];
  if (days.length === 7 && n === 1) return 'Ogni giorno';
  if (days.join() === '0,1,2,3,4' && n === 1) return 'Ogni giorno feriale';
  const names = joinIt(days.map(d => WEEKDAYS[d]));
  return n === 1 ? `Ogni ${names}` : `Ogni ${n} settimane, il ${names}`;
}

// End of the school year: 10 June (of this school year).
export function schoolYearEnd(from: string): string {
  const d = parseDate(from);
  const year = d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear(); // from July: next June
  return `${year}-06-10`;
}

export function untilAfter(start: string, amount: number, unit: 'settimane' | 'mesi'): string {
  const d = parseDate(start);
  const n = Math.max(1, Math.round(amount) || 1);
  const end = unit === 'settimane' ? addDays(d, 7 * n - 1) : addDays(new Date(d.getFullYear(), d.getMonth() + n, d.getDate()), -1);
  return toDateKey(end);
}

const daysBetween = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
const shift = (key: string, n: number) => toDateKey(addDays(parseDate(key), n));

// One task for every date of the series (the first keeps the id of `base`, if it has one).
export function buildSeries(base: Task, rule: RepeatRule, seriesId = createId()): Task[] {
  const span = base.endDate ? daysBetween(base.date, base.endDate) : 0;
  return occurrences(base.date, rule).map((date, i) => ({
    ...base,
    id: i === 0 && base.id ? base.id : createId(),
    date,
    endDate: base.endDate ? shift(date, span) : undefined,
    done: false, autoDone: undefined, keepOpen: undefined, cancelled: undefined, movedFrom: undefined,
    seriesId, repeat: rule,
  }));
}

// The occurrences of the series from `task` on (the task itself included).
export const isSameOrLater = (t: Task, task: Task) => !!task.seriesId && t.seriesId === task.seriesId && (t.date >= task.date || t.id === task.id);

// In lists of tasks to do, a series counts once: only its next occurrence is kept (the order stays).
export function nextOfEachSeries(tasks: Task[]): Task[] {
  const next = new Map<string, Task>();
  tasks.forEach(t => { if (t.seriesId && (!next.has(t.seriesId) || t.date < next.get(t.seriesId)!.date)) next.set(t.seriesId, t); });
  return tasks.filter(t => !t.seriesId || next.get(t.seriesId) === t);
}
