// Study sessions grouped by week (Monday to Sunday), month and year.
import { StudySession } from './store';

export type PeriodKind = 'week' | 'month' | 'year';

export interface Period { start: Date; end: Date; label: string }

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// offset 0 = the current week/month/year, -1 = the previous one, ...
export function periodOf(kind: PeriodKind, offset: number, now: Date = new Date()): Period {
  if (kind === 'week') {
    const start = startOfWeek(now);
    start.setDate(start.getDate() + offset * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const last = new Date(end.getTime() - 1);
    const label = start.getMonth() === last.getMonth()
      ? `${start.getDate()}–${last.getDate()} ${MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`
      : `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} – ${last.getDate()} ${MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`;
    return { start, end, label };
  }
  if (kind === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return { start, end, label: `${MONTHS[start.getMonth()].replace(/^./, c => c.toUpperCase())} ${start.getFullYear()}` };
  }
  const start = new Date(now.getFullYear() + offset, 0, 1);
  return { start, end: new Date(start.getFullYear() + 1, 0, 1), label: String(start.getFullYear()) };
}

export function sessionsIn(sessions: StudySession[], period: Period): StudySession[] {
  const from = period.start.getTime();
  const to = period.end.getTime();
  return sessions.filter(s => {
    const t = new Date(s.date).getTime();
    return t >= from && t < to;
  });
}

export function minutesBySubject(sessions: StudySession[]): { name: string; minutes: number }[] {
  const map: Record<string, number> = {};
  sessions.forEach(s => { map[s.subject] = (map[s.subject] || 0) + s.duration; });
  return Object.entries(map).map(([name, minutes]) => ({ name, minutes })).sort((a, b) => b.minutes - a.minutes);
}

// One bar per day (week, month) or per month (year), with the minutes of each subject.
export interface Bucket { label: string; minutes: number; bySubject: Record<string, number> }

export function bucketsOf(kind: PeriodKind, period: Period, sessions: StudySession[]): Bucket[] {
  const buckets: Bucket[] = [];
  if (kind === 'year') {
    for (let m = 0; m < 12; m++) buckets.push({ label: MONTHS_SHORT[m], minutes: 0, bySubject: {} });
  } else {
    const days = Math.round((period.end.getTime() - period.start.getTime()) / 86400000);
    for (let i = 0; i < days; i++) {
      const d = new Date(period.start);
      d.setDate(d.getDate() + i);
      buckets.push({ label: kind === 'week' ? `${WEEKDAYS_SHORT[i]} ${d.getDate()}` : String(d.getDate()), minutes: 0, bySubject: {} });
    }
  }
  sessionsIn(sessions, period).forEach(s => {
    const d = new Date(s.date);
    const index = kind === 'year'
      ? d.getMonth()
      : Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - period.start.getTime()) / 86400000 + 0.5);
    const b = buckets[index];
    if (!b) return;
    b.minutes += s.duration;
    b.bySubject[s.subject] = (b.bySubject[s.subject] || 0) + s.duration;
  });
  return buckets;
}
