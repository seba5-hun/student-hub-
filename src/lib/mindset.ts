// MINDSET: the day planner that learns with the student. Everything is computed from a few
// one-tap logs (blocks done, sleep, phone, check-in, disruptions); nothing is ever forced.

import { createId, toDateKey } from './store';

export type Area = 'school' | 'study' | 'sport' | 'project' | 'recovery' | 'life' | 'travel' | 'meal' | 'sleep' | 'morning';
export type PriorityArea = 'school' | 'sport' | 'project';
export type BlockStatus = 'done' | 'min' | 'skipped' | 'excused';
export type HabitMark = 'full' | 'min';

export const AREAS: Record<Area, { label: string; color: string }> = {
  morning: { label: 'Mattino', color: '#fbbf24' },
  school: { label: 'Scuola', color: '#60a5fa' },
  study: { label: 'Studio', color: '#818cf8' },
  sport: { label: 'Sport', color: '#34d399' },
  project: { label: 'Progetto', color: '#f59e0b' },
  recovery: { label: 'Recupero', color: '#2dd4bf' },
  life: { label: 'Vita', color: '#f472b6' },
  travel: { label: 'Viaggio', color: '#94a3b8' },
  meal: { label: 'Pasto', color: '#fb923c' },
  sleep: { label: 'Sonno', color: '#a78bfa' },
};

export const PRIORITY_AREAS: { id: PriorityArea; label: string; example: string }[] = [
  { id: 'school', label: 'Scuola', example: 'Es. esercizi 31–40 e correggo gli errori' },
  { id: 'sport', label: 'Sport', example: 'Es. 2 ore di wingfoil, lavoro sulle virate' },
  { id: 'project', label: 'Progetto', example: 'Es. finisco la schermata di login' },
];

export interface Block { id: string; start: string; end: string; title: string; area: Area; auto?: boolean; subject?: string }
export interface DayType {
  id: string;
  name: string;
  emoji: string;
  blocks: Block[];
  // Weekend-style day: the alarm can ring a little later.
  relaxed?: boolean;
  // The morning deep work must end by this time (then breakfast, getting ready…).
  morningEnd: string;
  morningArea: 'project' | 'study';
}
export interface Habit { id: string; name: string; full: string; min: string }
export interface Priority { id: string; area: PriorityArea; text: string; done: boolean }
export interface Disruption { id: string; cause: string; external: boolean; minutes: number; at: string; blocks: string[] }
export interface FocusSession { id: string; start: string; minutes: number; task: string; area: PriorityArea | 'other'; rating?: number; interruptions: number; subject?: string }
export interface SleepLog { bed?: string; wake?: string; quality?: number } // local "YYYY-MM-DDTHH:MM"
export interface CheckIn { energy?: number; focus?: number; mood?: number; stress?: number }

export interface DeepWorkLog { kind: string; area: Area; note?: string; minutes?: number; skipped?: boolean; subject?: string }

export const DEEP_KINDS: { kind: string; area: Area }[] = [
  { kind: 'Progetto', area: 'project' },
  { kind: 'Studio', area: 'study' },
  { kind: 'Programmazione', area: 'project' },
  { kind: 'Business', area: 'project' },
  { kind: 'Lettura', area: 'recovery' },
  { kind: 'Creatività', area: 'project' },
];

export function deepWorkTitle(d: DeepWorkLog): string {
  return `Deep work · ${d.kind.toLowerCase()}${d.note ? `: ${d.note}` : ''}`;
}

export interface DayLog {
  dayType?: string;
  blocks?: Block[];           // the day's own copy, once a block has been edited
  status?: Record<string, BlockStatus>;
  priorities?: Priority[];
  disruptions?: Disruption[];
  sleep?: SleepLog;           // the night BEFORE this day
  alarm?: string;             // alarm chosen the evening before, "HH:MM"
  checkin?: CheckIn;
  phone?: number;             // screen time in minutes
  habits?: Record<string, HabitMark>;
  focus?: FocusSession[];
  morning?: string[];         // morning-start checklist items done
  deepWork?: DeepWorkLog;     // what the morning deep work was used for
}

export interface MindsetProfile {
  name: string;
  setupDone: boolean;
  sleepNeed: number;          // minutes of sleep wanted
  targetWake: string;         // final goal, e.g. "05:30"
  startWake: string;          // where the progression started
  stage: { wake: string; since: string }; // current step of the progressive alarm
  stepMinutes: number;
  stepDays: number;
  weekendLater: number;       // minutes later on relaxed days
  latestWake: string;         // school days: never later than this
  phoneGoal: number;          // minutes
  focusTarget: number;        // minutes of focus/study a day
}

export interface ActiveFocus { start: string; planned: number; pause: number; task: string; area: PriorityArea | 'other'; subject?: string; interruptions: number }

export interface CoachPlan {
  day: string;
  blocks: Block[];
  priorities: Partial<Record<PriorityArea, string>>;
}
export interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: string;
  plan?: CoachPlan;
  applied?: boolean;
  previous?: { blocks?: Block[]; priorities?: Priority[] }; // to undo an applied plan
}

export interface MindsetData {
  v: 1;
  profile: MindsetProfile;
  dayTypes: DayType[];
  week: string[];             // day type id for Sunday (0) … Saturday (6)
  habits: Habit[];
  days: Record<string, DayLog>;
  activeFocus?: ActiveFocus | null;
  coach?: CoachMessage[];
}

// ---------- time helpers ----------

export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
export const fromMin = (min: number): string => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const formatDuration = (min: number): string => {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  return h ? `${h}h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}m` : ''}` : `${m}m`;
};
export const addDays = (key: string, n: number): string => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
};
export const localStamp = (d: Date): string => `${toDateKey(d)}T${fromMin(d.getHours() * 60 + d.getMinutes())}`;
export const stampMinutes = (stamp: string): number => new Date(stamp).getTime() / 60000;
const roundUp5 = (min: number) => Math.ceil(min / 5) * 5;

// ---------- defaults: Sebastiano's week ----------

const b = (start: string, end: string, title: string, area: Area): Block => ({ id: createId(), start, end, title, area });

function schoolMorning(): Block[] {
  return [
    b('07:00', '07:30', 'Mi preparo', 'life'),
    b('07:30', '08:00', 'Colazione', 'meal'),
    b('08:00', '08:30', 'Verso scuola', 'travel'),
    b('08:30', '14:15', 'Scuola', 'school'),
  ];
}

export function defaultDayTypes(): DayType[] {
  return [
    {
      id: 'acqua', name: 'Acqua', emoji: '🌊', morningEnd: '07:00', morningArea: 'study',
      blocks: [
        ...schoolMorning(),
        b('14:15', '15:15', 'Viaggio allo spot · pranzo', 'travel'),
        b('15:15', '17:15', 'Allenamento in acqua', 'sport'),
        b('17:15', '18:15', 'Ritorno · podcast o ripasso audio', 'travel'),
        b('18:15', '18:45', 'Doccia e recupero', 'recovery'),
        b('18:45', '20:00', 'Studio', 'study'),
        b('20:00', '20:45', 'Cena in famiglia', 'life'),
      ],
    },
    {
      id: 'palestra', name: 'Palestra', emoji: '🏋️', morningEnd: '07:00', morningArea: 'project',
      blocks: [
        ...schoolMorning(),
        b('14:15', '15:15', 'Pranzo', 'meal'),
        b('15:15', '15:45', 'Pausa', 'recovery'),
        b('15:45', '17:45', 'Studio', 'study'),
        b('18:00', '19:30', 'Palestra', 'sport'),
        b('19:30', '20:00', 'Doccia e recupero', 'recovery'),
        b('20:00', '20:45', 'Cena in famiglia', 'life'),
      ],
    },
    {
      id: 'progetto', name: 'Progetto', emoji: '🚀', morningEnd: '07:00', morningArea: 'project',
      blocks: [
        ...schoolMorning(),
        b('14:15', '15:15', 'Pranzo', 'meal'),
        b('15:15', '15:45', 'Pausa', 'recovery'),
        b('15:45', '17:45', 'Studio', 'study'),
        b('18:00', '19:30', 'Progetto', 'project'),
        b('20:00', '20:45', 'Cena in famiglia', 'life'),
      ],
    },
    {
      id: 'weekend', name: 'Weekend attivo', emoji: '☀️', morningEnd: '08:30', morningArea: 'project', relaxed: true,
      blocks: [
        b('08:30', '09:00', 'Colazione', 'meal'),
        b('09:00', '10:30', 'Studio', 'study'),
        b('10:30', '12:30', 'Libero', 'life'),
        b('12:30', '13:30', 'Pranzo', 'meal'),
        b('14:00', '15:00', 'Viaggio allo spot', 'travel'),
        b('15:00', '17:00', 'Allenamento in acqua', 'sport'),
        b('17:00', '18:00', 'Ritorno', 'travel'),
        b('18:00', '20:00', 'Amici e tempo libero', 'life'),
        b('20:00', '20:45', 'Cena', 'life'),
      ],
    },
    {
      id: 'recupero', name: 'Recupero', emoji: '🔋', morningEnd: '08:30', morningArea: 'study', relaxed: true,
      blocks: [
        b('08:30', '09:00', 'Colazione', 'meal'),
        b('09:30', '10:30', 'Ripasso leggero', 'study'),
        b('10:30', '12:30', 'Libero', 'life'),
        b('12:30', '13:30', 'Pranzo in famiglia', 'life'),
        b('14:00', '17:00', 'Tempo libero e amici', 'life'),
        b('17:00', '17:30', 'Review della settimana e piano', 'project'),
        b('17:30', '20:00', 'Libero', 'life'),
        b('20:00', '20:45', 'Cena in famiglia', 'life'),
      ],
    },
    {
      id: 'gara', name: 'Gara', emoji: '🏆', morningEnd: '07:00', morningArea: 'study', relaxed: true,
      blocks: [
        b('07:00', '07:45', 'Colazione e preparazione', 'meal'),
        b('08:00', '17:00', 'Gara', 'sport'),
        b('17:00', '18:00', 'Recupero', 'recovery'),
        b('18:00', '20:00', 'Libero', 'life'),
        b('20:00', '20:45', 'Cena', 'life'),
      ],
    },
  ];
}

export function defaultMindset(): MindsetData {
  return {
    v: 1,
    profile: {
      name: 'Sebastiano',
      setupDone: false,
      sleepNeed: 8 * 60 + 15,
      targetWake: '05:30',
      startWake: '07:30',
      stage: { wake: '07:30', since: toDateKey(new Date()) },
      stepMinutes: 30,
      stepDays: 7,
      weekendLater: 60,
      latestWake: '07:30',
      phoneGoal: 4 * 60 + 30,
      focusTarget: 120,
    },
    dayTypes: defaultDayTypes(),
    // Sun, Mon … Sat: water and gym alternate, Sunday is for recovery.
    week: ['recupero', 'acqua', 'palestra', 'acqua', 'palestra', 'acqua', 'weekend'],
    habits: [
      { id: createId(), name: 'Idratazione', full: '2 litri', min: '1 litro' },
      { id: createId(), name: 'Mobilità', full: '15 minuti', min: '5 minuti' },
      { id: createId(), name: 'Lettura', full: '20 minuti', min: '5 pagine' },
      { id: createId(), name: 'Niente telefono a letto', full: 'Fuori dalla camera', min: 'Max 10 minuti' },
    ],
    days: {},
    activeFocus: null,
  };
}

export function normalizeMindset(raw: unknown): MindsetData | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const base = defaultMindset();
  const r = raw as Partial<MindsetData>;
  return {
    ...base,
    ...r,
    v: 1,
    profile: { ...base.profile, ...(r.profile || {}) },
    dayTypes: Array.isArray(r.dayTypes) && r.dayTypes.length ? r.dayTypes : base.dayTypes,
    week: Array.isArray(r.week) && r.week.length === 7 ? r.week : base.week,
    habits: Array.isArray(r.habits) ? r.habits : base.habits,
    days: r.days && typeof r.days === 'object' ? r.days : {},
  };
}

// ---------- the day ----------

export function withDay(m: MindsetData, key: string, fn: (log: DayLog) => DayLog): MindsetData {
  return { ...m, days: { ...m.days, [key]: fn(m.days[key] || {}) } };
}

export function dayTypeOf(m: MindsetData, key: string): DayType {
  const id = m.days[key]?.dayType || m.week[new Date(`${key}T12:00:00`).getDay()];
  return m.dayTypes.find(t => t.id === id) || m.dayTypes[0];
}

// Alarm for the morning of `key` from the progressive plan (relaxed days a bit later).
export function plannedAlarm(m: MindsetData, key: string): string {
  const type = dayTypeOf(m, key);
  return fromMin(toMin(m.profile.stage.wake) + (type.relaxed ? m.profile.weekendLater : 0));
}

export function alarmOf(m: MindsetData, key: string): string {
  return m.days[key]?.alarm || plannedAlarm(m, key);
}

// When to be in bed for the alarm (15 minutes to fall asleep).
export function bedtimeFor(m: MindsetData, wakeKey: string): string {
  return fromMin(toMin(alarmOf(m, wakeKey)) - m.profile.sleepNeed - 15);
}

// The day's timeline: the day type's blocks plus the parts that follow the sleep plan
// (wake-up, morning deep work, evening wind-down, bed).
export function blocksOf(m: MindsetData, key: string): Block[] {
  const log = m.days[key];
  if (log?.blocks) return [...log.blocks].sort((a, c) => toMin(a.start) - toMin(c.start));
  const type = dayTypeOf(m, key);
  const wake = toMin(alarmOf(m, key));
  const out: Block[] = [];
  out.push({ id: `${key}-wake`, start: fromMin(wake), end: fromMin(wake + 10), title: 'Sveglia · acqua e luce', area: 'morning', auto: true });
  const deepStart = wake + 10;
  const deepEnd = Math.min(toMin(type.morningEnd), deepStart + 90);
  if (deepEnd - deepStart >= 30) {
    const chosen = log?.deepWork && !log.deepWork.skipped ? log.deepWork : null;
    out.push({ id: `${key}-deep`, start: fromMin(deepStart), end: fromMin(deepEnd),
      title: chosen ? deepWorkTitle(chosen) : type.morningArea === 'project' ? 'Deep work · progetto' : 'Deep work · studio',
      area: chosen ? chosen.area : type.morningArea, subject: chosen?.subject, auto: true });
  }
  for (const block of type.blocks) {
    const s = toMin(block.start);
    const e = toMin(block.end);
    if (e <= wake + 10) continue; // before waking up
    out.push({ ...block, start: fromMin(Math.max(s, wake + 10)) });
  }
  const lastEnd = Math.max(...out.map(x => toMin(x.end)));
  const bed = toMin(bedtimeFor(m, addDays(key, 1)));
  const bedAbs = bed < 12 * 60 ? bed + 1440 : bed; // after midnight
  const windDown = Math.max(lastEnd, bedAbs - 30);
  if (windDown - lastEnd >= 15) out.push({ id: `${key}-free`, start: fromMin(lastEnd), end: fromMin(windDown), title: 'Tempo libero', area: 'life', auto: true });
  if (bedAbs > windDown) out.push({ id: `${key}-wind`, start: fromMin(windDown), end: fromMin(bedAbs), title: 'Routine serale · sveglia e telefono fuori', area: 'sleep', auto: true });
  out.push({ id: `${key}-bed`, start: fromMin(bedAbs), end: fromMin(bedAbs + 5), title: 'A letto', area: 'sleep', auto: true });
  return out;
}

// Minutes of a block on the 0-1440+ scale (blocks after midnight continue the day).
export function blockRange(block: Block): [number, number] {
  const s = toMin(block.start);
  let e = toMin(block.end);
  if (e <= s) e += 1440;
  return [s, e];
}

export function currentAndNext(blocks: Block[], now: Date): { current?: Block; next?: Block } {
  const n = now.getHours() * 60 + now.getMinutes();
  const current = blocks.find(x => { const [s, e] = blockRange(x); return n >= s && n < e; });
  const next = blocks.find(x => blockRange(x)[0] > n);
  return { current, next };
}

// ---------- sleep ----------

export function sleepMinutes(s?: SleepLog): number | null {
  if (!s?.bed || !s.wake) return null;
  const d = stampMinutes(s.wake) - stampMinutes(s.bed);
  return d > 0 && d < 16 * 60 ? d : null;
}

// Bed time "HH:MM" for the night before `wakeKey`: evening times belong to the day before.
export function bedStamp(wakeKey: string, hhmm: string): string {
  return `${toMin(hhmm) >= 12 * 60 ? addDays(wakeKey, -1) : wakeKey}T${hhmm}`;
}

// The morning a bedtime tap belongs to.
export function wakeKeyForBedtime(now: Date): string {
  const key = toDateKey(now);
  return now.getHours() >= 12 ? addDays(key, 1) : key;
}

// The alarm suggested at bedtime: the plan, unless it's too late for at least 7 hours of sleep.
export function suggestAlarm(m: MindsetData, now: Date): { alarm: string; note?: string; sleep: number } {
  const wakeKey = wakeKeyForBedtime(now);
  const planned = toMin(plannedAlarm(m, wakeKey));
  // Minutes relative to midnight of the waking day (the evening before is negative).
  const asleep = now.getHours() * 60 + now.getMinutes() + 15 - (wakeKey === toDateKey(now) ? 0 : 1440);
  const sleepWith = (when: number) => when - asleep;
  if (sleepWith(planned) >= m.profile.sleepNeed - 5) return { alarm: fromMin(planned), sleep: sleepWith(planned) };
  if (sleepWith(planned) >= 7 * 60) {
    return { alarm: fromMin(planned), sleep: sleepWith(planned), note: `Dormirai ${formatDuration(sleepWith(planned))}: un po' meno del tuo obiettivo.` };
  }
  const type = dayTypeOf(m, wakeKey);
  const latest = Math.max(planned, type.relaxed ? planned + 120 : toMin(m.profile.latestWake));
  const later = Math.min(Math.max(roundUp5(asleep + 7 * 60), planned), latest);
  return {
    alarm: fromMin(later),
    sleep: sleepWith(later),
    note: later > planned
      ? `Stasera sei in ritardo: ti propongo la sveglia alle ${fromMin(later)} per proteggere il sonno.`
      : `Stasera dormirai ${formatDuration(sleepWith(later))}: domani pomeriggio tieniti leggero e vai a letto prima.`,
  };
}

export interface Stats { avg: number | null; count: number }
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, c) => a + c, 0) / xs.length : null);

export function lastKeys(today: string, n: number, offset = 0): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, -i - offset));
}

export function sleepStats(m: MindsetData, today: string, n = 7, offset = 0) {
  const nights = lastKeys(today, n, offset).map(k => m.days[k]?.sleep).filter((s): s is SleepLog => !!s);
  const durations = nights.map(sleepMinutes).filter((x): x is number => x !== null);
  const wakes = nights.filter(s => s.wake).map(s => toMin(s.wake!.slice(11)));
  const beds = nights.filter(s => s.bed).map(s => { const v = toMin(s.bed!.slice(11)); return v < 12 * 60 ? v + 1440 : v; });
  const avgWake = mean(wakes);
  const spread = wakes.length >= 3 && avgWake !== null ? Math.sqrt(mean(wakes.map(w => (w - avgWake) ** 2))!) : null;
  return {
    nights: durations.length,
    avgSleep: mean(durations),
    avgWake,
    avgBed: mean(beds),
    spread,
    debt: durations.reduce((d, x) => d + Math.max(0, m.profile.sleepNeed - x), 0),
  };
}

// Waking earlier while sleeping less: time to move the bedtime, not the alarm.
export function sleepWarning(m: MindsetData, today: string): string | null {
  const now = sleepStats(m, today, 7);
  const before = sleepStats(m, today, 7, 7);
  if (now.nights < 4 || before.nights < 4 || now.avgWake === null || before.avgWake === null || now.avgSleep === null || before.avgSleep === null) return null;
  if (before.avgWake - now.avgWake >= 15 && before.avgSleep - now.avgSleep >= 20) {
    return 'Ti stai svegliando prima, ma stai dormendo meno. Anticipa l\'ora in cui vai a letto invece di accorciare il sonno.';
  }
  return null;
}

// The progressive alarm: the next step is proposed only after enough days with enough sleep.
export function wakeStep(m: MindsetData, today: string): { state: 'done' | 'wait' | 'data' | 'protect' | 'ready'; next?: string; message: string } {
  const p = m.profile;
  const cur = toMin(p.stage.wake);
  const target = toMin(p.targetWake);
  if (cur <= target) return { state: 'done', message: `Sei arrivato all'obiettivo: sveglia alle ${p.targetWake}. Ora conta la costanza.` };
  const next = fromMin(Math.max(target, cur - p.stepMinutes));
  const days = Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${p.stage.since}T12:00:00`).getTime()) / 86400000);
  if (days < p.stepDays) return { state: 'wait', next, message: `Gradino attuale: ${p.stage.wake}. Ancora ${p.stepDays - days} ${p.stepDays - days === 1 ? 'giorno' : 'giorni'} per abituarti, poi si passa alle ${next}.` };
  const s = sleepStats(m, today, 5);
  if (s.nights < 3 || s.avgSleep === null) return { state: 'data', next, message: 'Registra il sonno per almeno 3 notti: così capisco se sei pronto per il gradino successivo.' };
  if (s.avgSleep < p.sleepNeed - 30) {
    return { state: 'protect', next, message: `Dormi in media ${formatDuration(s.avgSleep)}: prima di anticipare la sveglia anticipa l'ora di andare a letto. Restiamo alle ${p.stage.wake}.` };
  }
  return { state: 'ready', next, message: `Ti stai adattando bene (${formatDuration(s.avgSleep)} di sonno in media). Pronto a passare alle ${next}?` };
}

// ---------- phone ----------

export function phoneStats(m: MindsetData, today: string) {
  const logged = Object.entries(m.days).filter(([, d]) => typeof d.phone === 'number').sort(([a], [c]) => a.localeCompare(c));
  const first = logged.slice(0, 7).map(([, d]) => d.phone!);
  const baseline = first.length >= 3 ? mean(first) : null;
  const week = lastKeys(today, 7).map(k => m.days[k]?.phone).filter((x): x is number => typeof x === 'number');
  const prevWeek = lastKeys(today, 7, 7).map(k => m.days[k]?.phone).filter((x): x is number => typeof x === 'number');
  const avg7 = mean(week);
  // Gradual goal: about 45 minutes less than last week, never below the final goal.
  const lastAvg = mean(prevWeek) ?? avg7 ?? baseline;
  const target = lastAvg === null ? m.profile.phoneGoal : Math.max(m.profile.phoneGoal, Math.round((lastAvg - 45) / 15) * 15);
  // Monday-Sunday of this week.
  const d = new Date(`${today}T12:00:00`);
  const monday = addDays(today, -((d.getDay() + 6) % 7));
  const thisWeek = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter(k => k <= today);
  const recovered = baseline === null ? null : thisWeek.reduce((sum, k) => {
    const v = m.days[k]?.phone;
    return typeof v === 'number' ? sum + Math.max(0, baseline - v) : sum;
  }, 0);
  return { today: m.days[today]?.phone ?? null, avg7, baseline, target, recovered, logged: logged.length };
}

// ---------- habits ----------

export function habitStreak(m: MindsetData, habitId: string, today: string) {
  // One missed day per week is forgiven (streak protection).
  const marked = (k: string) => !!m.days[k]?.habits?.[habitId];
  let streak = 0;
  let forgiven = 0;
  let k = marked(today) ? today : addDays(today, -1);
  for (let i = 0; i < 400; i++) {
    if (marked(k)) streak++;
    else if (forgiven < 1 + Math.floor(streak / 7) && marked(addDays(k, -1))) forgiven++;
    else break;
    k = addDays(k, -1);
  }
  const last30 = lastKeys(today, 30);
  const full = last30.filter(x => m.days[x]?.habits?.[habitId] === 'full').length;
  const min = last30.filter(x => m.days[x]?.habits?.[habitId] === 'min').length;
  return { streak, full, min, rate: Math.round(((full + min * 0.6) / 30) * 100) };
}

// ---------- disruptions ----------

export const CAUSES: { id: string; label: string; emoji: string; external: boolean }[] = [
  { id: 'scuola', label: 'Compiti o verifica in più', emoji: '📚', external: true },
  { id: 'vento', label: 'Niente vento / meteo', emoji: '🌬️', external: true },
  { id: 'allenamento', label: 'Allenamento spostato', emoji: '🔁', external: true },
  { id: 'famiglia', label: 'Famiglia / impegni', emoji: '👨‍👩‍👦', external: true },
  { id: 'trasporti', label: 'Trasporti / ritardi', emoji: '🚌', external: true },
  { id: 'salute', label: 'Malessere', emoji: '🤒', external: true },
  { id: 'stanchezza', label: 'Stanchezza', emoji: '😴', external: false },
  { id: 'telefono', label: 'Telefono / social', emoji: '📱', external: false },
  { id: 'rimandato', label: 'Ho rimandato', emoji: '⏳', external: false },
  { id: 'altro', label: 'Altro', emoji: '•', external: false },
];

export function disruptionPatterns(m: MindsetData, today: string) {
  const keys = lastKeys(today, 30);
  const all = keys.flatMap(k => (m.days[k]?.disruptions || []).map(d => ({ ...d, key: k })));
  const byCause = new Map<string, { count: number; minutes: number }>();
  const byWeekday = new Map<number, number>();
  for (const d of all) {
    const c = byCause.get(d.cause) || { count: 0, minutes: 0 };
    byCause.set(d.cause, { count: c.count + 1, minutes: c.minutes + d.minutes });
    const wd = new Date(`${d.key}T12:00:00`).getDay();
    byWeekday.set(wd, (byWeekday.get(wd) || 0) + 1);
  }
  const causes = [...byCause.entries()].map(([id, v]) => ({ id, ...v, info: CAUSES.find(c => c.id === id) })).sort((a, c) => c.count - a.count);
  const topDay = [...byWeekday.entries()].sort((a, c) => c[1] - a[1])[0];
  return { total: all.length, minutes: all.reduce((s, d) => s + d.minutes, 0), causes, topDay: topDay && topDay[1] >= 2 ? topDay : null };
}

// How much of the plan is really done, per day type: the base for realistic plans.
// A block whose time has passed counts as done, unless the student said otherwise (only on
// days the app was used: a day never opened stays without data).
export function effectiveStatus(m: MindsetData, key: string, block: Block, now: Date = new Date()): BlockStatus | undefined {
  const log = m.days[key];
  const explicit = log?.status?.[block.id];
  if (explicit) return explicit;
  if (!log && key !== toDateKey(now)) return undefined;
  const end = new Date(`${key}T00:00:00`).getTime() + blockRange(block)[1] * 60000;
  return now.getTime() >= end ? 'done' : undefined;
}

export function completionByType(m: MindsetData, today: string) {
  const out = new Map<string, { done: number; total: number }>();
  for (const k of lastKeys(today, 28, 1)) {
    if (!m.days[k]) continue;
    const type = dayTypeOf(m, k).id;
    const values = blocksOf(m, k).filter(x => COUNTED.includes(x.area)).map(x => effectiveStatus(m, k, x))
      .filter((s): s is BlockStatus => !!s && s !== 'excused');
    if (!values.length) continue;
    const cur = out.get(type) || { done: 0, total: 0 };
    cur.done += values.reduce((s, v) => s + (v === 'done' ? 1 : v === 'min' ? 0.6 : 0), 0);
    cur.total += values.length;
    out.set(type, cur);
  }
  return out;
}

// ---------- score ----------

const COUNTED: Area[] = ['school', 'study', 'sport', 'project', 'recovery', 'morning'];

export interface ScorePart { key: string; label: string; weight: number; value: number | null; detail: string }

export function scoreDay(m: MindsetData, key: string, now: Date = new Date()): { score: number | null; parts: ScorePart[] } {
  const log = m.days[key] || {};
  const p = m.profile;
  const blocks = blocksOf(m, key);
  const parts: ScorePart[] = [];

  const pr = log.priorities || [];
  parts.push({ key: 'priorities', label: 'Priorità', weight: 25, value: pr.length ? pr.filter(x => x.done).length / pr.length : null,
    detail: pr.length ? `${pr.filter(x => x.done).length} di ${pr.length} completate` : 'nessuna priorità' });

  const st = (x: Block) => effectiveStatus(m, key, x, now);
  const statuses = blocks.filter(x => COUNTED.includes(x.area)).map(st).filter((s): s is BlockStatus => !!s && s !== 'excused');
  parts.push({ key: 'plan', label: 'Piano', weight: 20,
    value: statuses.length ? statuses.reduce((s, v) => s + (v === 'done' ? 1 : v === 'min' ? 0.6 : 0), 0) / statuses.length : null,
    detail: statuses.length ? `${statuses.filter(s => s === 'done').length} attività fatte, ${statuses.filter(s => s === 'min').length} al minimo` : 'nessuna attività segnata' });

  const focusMin = (log.focus || []).reduce((s, f) => s + f.minutes, 0);
  const blockMin = blocks.filter(x => (x.area === 'study' || x.area === 'project') && (st(x) === 'done' || st(x) === 'min'))
    .reduce((s, x) => { const [a, c] = blockRange(x); return s + (c - a) * (st(x) === 'min' ? 0.5 : 1); }, 0);
  // Deep work logged on a morning without its own block (alarm still late) counts as focus too.
  const extra = log.deepWork && !log.deepWork.skipped && !blocks.some(b => b.id === `${key}-deep`) ? log.deepWork.minutes || 0 : 0;
  const deep = Math.max(focusMin, blockMin) + extra;
  const active = !!(pr.length || statuses.length || log.focus?.length);
  parts.push({ key: 'focus', label: 'Focus', weight: 15, value: active ? Math.min(1, deep / p.focusTarget) : null,
    detail: `${formatDuration(deep)} di ${formatDuration(p.focusTarget)}` });

  const slept = sleepMinutes(log.sleep);
  parts.push({ key: 'sleep', label: 'Sonno', weight: 20, value: slept === null ? null : slept >= p.sleepNeed - 10 ? 1 : Math.max(0, 1 - (p.sleepNeed - slept) / 180),
    detail: slept === null ? 'non registrato' : `${formatDuration(slept)} di ${formatDuration(p.sleepNeed)}` });

  const marks = log.habits || {};
  const anyHabit = Object.keys(marks).length > 0;
  parts.push({ key: 'habits', label: 'Abitudini', weight: 10,
    value: anyHabit && m.habits.length ? m.habits.reduce((s, h) => s + (marks[h.id] === 'full' ? 1 : marks[h.id] === 'min' ? 0.6 : 0), 0) / m.habits.length : null,
    detail: anyHabit ? `${Object.keys(marks).length} di ${m.habits.length}` : 'nessuna segnata' });

  const phone = log.phone;
  parts.push({ key: 'phone', label: 'Telefono', weight: 10,
    value: typeof phone !== 'number' ? null : phone <= p.phoneGoal ? 1 : Math.max(0, 1 - (phone - p.phoneGoal) / p.phoneGoal),
    detail: typeof phone !== 'number' ? 'non registrato' : `${formatDuration(phone)} (obiettivo ${formatDuration(p.phoneGoal)})` });

  const known = parts.filter(x => x.value !== null);
  const weight = known.reduce((s, x) => s + x.weight, 0);
  if (weight < 20) return { score: null, parts };
  return { score: Math.round((known.reduce((s, x) => s + x.weight * x.value!, 0) / weight) * 100), parts };
}

export function weekAverage(m: MindsetData, today: string): number | null {
  const scores = lastKeys(today, 7).map(k => scoreDay(m, k).score).filter((x): x is number => x !== null);
  return scores.length ? Math.round(mean(scores)!) : null;
}

// "Studiare matematica" → suggest something concrete.
export function vagueHint(text: string): string | null {
  const t = text.trim();
  if (t.length < 3) return null;
  const words = t.split(/\s+/).length;
  const generic = /^(studiare|studio|ripassare|ripasso|lavorare|lavoro|fare|allenarmi|allenamento|progetto|compiti|leggere)\b/i.test(t);
  if ((words <= 2 || generic) && !/\d/.test(t)) return 'Rendila concreta: cosa esattamente? Es. "esercizi 31–40 e correggo gli errori" invece di "studiare matematica".';
  return null;
}

export function greeting(now: Date): string {
  const h = now.getHours();
  return h < 5 ? 'Buonanotte' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
}

// ---------- sync with the Study Timer ----------

export interface SyncedSession { id: string; subject: string; duration: number; date: string }

// Study done in Mindset (study blocks and morning deep work with a subject) becomes sessions of the
// Study Timer, so it shows in its charts. Ids start with "mindset-": they are recomputed every time,
// so a block marked as skipped later disappears from the Timer too. Focus sessions already save
// their own session: a block they overlap is not counted twice.
export function mindsetStudySessions(m: MindsetData, now: Date = new Date(), since?: string): SyncedSession[] {
  const out: SyncedSession[] = [];
  for (const key of Object.keys(m.days).sort()) {
    if (key > toDateKey(now)) continue;
    const log = m.days[key];
    const focusStarts = (log.focus || []).filter(f => f.subject).map(f => toMin(f.start.slice(11)));
    for (const b of blocksOf(m, key)) {
      if (b.area !== 'study' || !b.subject) continue;
      const st = effectiveStatus(m, key, b, now);
      if (st !== 'done' && st !== 'min') continue;
      const [s, e] = blockRange(b);
      if (focusStarts.some(f => f >= s - 5 && f < e)) continue;
      const end = new Date(`${key}T00:00:00`);
      end.setMinutes(e);
      const date = end.toISOString();
      if (since && date < since) continue;
      out.push({ id: `mindset-${key}-${b.id}`, subject: b.subject, duration: Math.round((e - s) * (st === 'min' ? 0.5 : 1)), date });
    }
    const d = log.deepWork;
    if (d && !d.skipped && d.area === 'study' && d.subject && d.minutes && !blocksOf(m, key).some(b => b.id === `${key}-deep`)) {
      const date = new Date(`${key}T08:00:00`).toISOString();
      if (!since || date >= since) out.push({ id: `mindset-${key}-deepwork`, subject: d.subject, duration: d.minutes, date });
    }
  }
  return out;
}
