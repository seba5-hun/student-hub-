import { v4 as uuidv4 } from 'uuid';

// Types
export interface Task {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  type: 'scolastico' | 'personale';
  importance: 1 | 2 | 3 | 4 | 5;
  estimatedTime: number;
  done: boolean;
  subject?: string;
  googleCalendarId?: string;
}

export interface Grade {
  id: string;
  subject: string;
  value: number;
  description: string;
  date: string;
}

export interface StudySession {
  id: string;
  subject: string;
  duration: number;
  date: string;
}

// A file uploaded to Supabase Storage. The AI reads it through `textPath`: a plain-text
// transcription saved next to the file, so the chat doesn't have to re-read PDFs and photos.
export interface ArchiveFile {
  path: string;
  mimeType: string;
  size: number;
  originalName: string;
  textPath?: string;
  textStatus?: 'pending' | 'done' | 'unsupported' | 'error';
  textError?: string;
}

export interface ArchiveItem {
  id: string;
  subject: string;
  topic: string;
  name: string;
  link?: string;
  file?: ArchiveFile;
}

// A school subject chosen by the student, with the color used for it in the app.
export interface SubjectDef {
  name: string;
  color: string;
}

export interface UserSettings {
  darkMode: boolean;
  weeklyGoal: number;
  colorTheme: string;
  notes: string;
  subjects?: SubjectDef[];
  // Subjects removed from the list that still appear in old grades/sessions: not re-added.
  hiddenSubjects?: string[];
  // Home dashboard: order of the panels and the ones the student has hidden.
  homeLayout?: { order: string[]; hidden: string[] };
  // Menu sections the student has hidden.
  hiddenSections?: string[];
}

// Every subject name used anywhere in the data (grades, study sessions, tasks, archive).
export function usedSubjectNames(data: UserData): string[] {
  const names = [
    ...data.grades.map(g => g.subject),
    ...data.sessions.map(s => s.subject),
    ...data.tasks.map(t => t.subject || ''),
    ...data.archive.map(a => a.subject),
  ].map(n => n.trim()).filter(Boolean);
  const unique: string[] = [];
  for (const n of names) if (!unique.some(u => u.toLowerCase() === n.toLowerCase())) unique.push(n);
  return unique;
}

export const SUBJECT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#3b82f6', '#a855f7'];

// First palette color not used yet by the given subjects (cycles when all are taken).
export function nextSubjectColor(subjects: SubjectDef[]): string {
  const used = subjects.map(s => s.color.toLowerCase());
  return SUBJECT_COLORS.find(c => !used.includes(c)) || SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];
}

// Color of a subject: the one chosen by the student, otherwise a fixed one derived from the name.
export function subjectColor(name: string, subjects: SubjectDef[] = []): string {
  const found = subjects.find(s => s.name.toLowerCase() === name.toLowerCase());
  if (found) return found.color;
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
}

export interface UserData {
  tasks: Task[];
  grades: Grade[];
  sessions: StudySession[];
  archive: ArchiveItem[];
  settings: UserSettings;
}

const DEFAULT_SETTINGS: UserSettings = {
  darkMode: true,
  weeklyGoal: 20,
  colorTheme: 'default',
  notes: '',
};

const STORAGE_PREFIX = 'studenthub_';

export function getStorageKey(userId: string, key: string): string {
  return `${STORAGE_PREFIX}${userId}_${key}`;
}

// Date helpers: always use the user's local day, never UTC, so that
// tasks and sessions don't shift by one day around midnight.
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

// Parses 'YYYY-MM-DD' as local midnight; full ISO timestamps are parsed as-is.
export function parseDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00') : new Date(value);
}

export function dateKeyOf(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toDateKey(new Date(value));
}

export function formatDate(value: string): string {
  return parseDate(value).toLocaleDateString('it-IT');
}

export function normalizeData(parsed: any): UserData {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    tasks: arr(parsed?.tasks),
    grades: arr(parsed?.grades),
    sessions: arr(parsed?.sessions),
    archive: arr(parsed?.archive),
    settings: { ...DEFAULT_SETTINGS, ...(parsed?.settings && typeof parsed.settings === 'object' ? parsed.settings : {}) },
  };
}

// Data saved in this browser by the old local-only version of the app.
export function loadCachedData(userId: string): UserData | null {
  try {
    const raw = localStorage.getItem(getStorageKey(userId, 'data'));
    if (raw) return normalizeData(JSON.parse(raw));
  } catch (e) {
    console.error('Error loading data:', e);
  }
  return null;
}

export function createId(): string {
  return uuidv4();
}

export interface AuthUser {
  id: string;
  email: string;
}

// Data created before the switch to Supabase lived in this browser under a local account
// with the same email. Returns it so it can be uploaded on the first online login.
export function findLegacyLocalData(email: string): UserData | null {
  const ids = new Set<string>();
  for (const key of [`studenthub_userid_${email}`, `studenthub_userid_${email.toLowerCase()}`]) {
    const id = localStorage.getItem(key);
    if (id) ids.add(id);
  }
  try {
    const auth = JSON.parse(localStorage.getItem('studenthub_auth') || 'null');
    if (auth?.id && typeof auth.email === 'string' && auth.email.toLowerCase() === email.toLowerCase()) ids.add(auth.id);
  } catch { /* ignore */ }
  for (const id of ids) {
    const data = loadCachedData(id);
    if (data) return data;
  }

  // The old version didn't save the account id at registration, so the data may be stored
  // under an id that no email points to. Use it only if there is exactly one such case.
  const claimed = new Set<string>();
  const orphans: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i) || '';
    if (key.startsWith('studenthub_userid_')) claimed.add(localStorage.getItem(key) || '');
  }
  for (let i = 0; i < localStorage.length; i++) {
    const match = /^studenthub_(.+)_data$/.exec(localStorage.key(i) || '');
    if (match && !claimed.has(match[1])) orphans.push(match[1]);
  }
  return orphans.length === 1 ? loadCachedData(orphans[0]) : null;
}

// True when email and password match an account of the old local-only version in this browser.
export function matchesLegacyAccount(email: string, password: string): boolean {
  try {
    const users = JSON.parse(localStorage.getItem('studenthub_users') || '{}');
    const stored = users[email.trim()] || users[email.trim().toLowerCase()];
    return !!stored && !stored.hashed && stored.password === password;
  } catch {
    return false;
  }
}

export function parseImportedData(json: string): UserData | null {
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const known = ['tasks', 'grades', 'sessions', 'archive', 'settings'];
    if (!known.some(k => k in data)) return null;
    return normalizeData(data);
  } catch (e) {
    console.error('Import error:', e);
    return null;
  }
}

export function getSubjectAverages(grades: Grade[]): Record<string, number> {
  const sums: Record<string, { total: number; count: number }> = {};
  grades.forEach(g => {
    if (!sums[g.subject]) sums[g.subject] = { total: 0, count: 0 };
    sums[g.subject].total += g.value;
    sums[g.subject].count += 1;
  });
  const avgs: Record<string, number> = {};
  Object.entries(sums).forEach(([subj, { total, count }]) => {
    avgs[subj] = Math.round((total / count) * 100) / 100;
  });
  return avgs;
}

export function getSubjectStudyTime(sessions: StudySession[]): Record<string, number> {
  const times: Record<string, number> = {};
  sessions.forEach(s => {
    times[s.subject] = (times[s.subject] || 0) + s.duration;
  });
  return times;
}

export function getStudyStreak(sessions: StudySession[]): number {
  if (sessions.length === 0) return 0;
  const dates = [...new Set(sessions.map(s => dateKeyOf(s.date)))].sort().reverse();
  const today = todayKey();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = toDateKey(yesterdayDate);

  if (dates[0] !== today && dates[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const d1 = parseDate(dates[i - 1]);
    const d2 = parseDate(dates[i]);
    const diff = Math.round((d1.getTime() - d2.getTime()) / 86400000);
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

export function getWeeklyStudyHours(sessions: StudySession[]): number {
  const weekAgo = new Date();
  weekAgo.setHours(0, 0, 0, 0);
  weekAgo.setDate(weekAgo.getDate() - 6);
  return sessions
    .filter(s => parseDate(s.date) >= weekAgo)
    .reduce((sum, s) => sum + s.duration, 0) / 60;
}

export const IMPORTANCE_CONFIG = [
  { level: 1, color: '#10b981', label: 'Tranquillo', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500' },
  { level: 2, color: '#eab308', label: 'Normale', bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500' },
  { level: 3, color: '#f97316', label: 'Importante', bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500' },
  { level: 4, color: '#ef4444', label: 'Urgente', bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500' },
  { level: 5, color: '#8b5cf6', label: 'Priorità massima', bg: 'bg-violet-500/20', text: 'text-violet-400', border: 'border-violet-500' },
];

export const MOTIVATIONAL_QUOTES = [
  "Il successo è la somma di piccoli sforzi ripetuti giorno dopo giorno.",
  "Non esiste ascensore per il successo, devi fare le scale.",
  "Ogni esperto è stato prima un principiante.",
  "La disciplina è il ponte tra obiettivi e risultati.",
  "Il futuro appartiene a chi crede nella bellezza dei propri sogni.",
];

export function getRandomQuote(): string {
  return MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
}

export function getHeatmapData(sessions: StudySession[]): Record<string, number> {
  const data: Record<string, number> = {};
  sessions.forEach(s => {
    const date = dateKeyOf(s.date);
    data[date] = (data[date] || 0) + s.duration / 60;
  });
  return data;
}

export function generateDemoData(): UserData {
  const today = new Date();
  const d = (offset: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    return toDateKey(date);
  };

  return {
    tasks: [
      { id: createId(), title: 'Compito di Matematica', date: d(2), type: 'scolastico', importance: 4, estimatedTime: 120, done: false, subject: 'Matematica' },
      { id: createId(), title: 'Interrogazione Storia', date: d(4), type: 'scolastico', importance: 5, estimatedTime: 90, done: false, subject: 'Storia' },
    ],
    grades: [
      { id: createId(), subject: 'Matematica', value: 7.5, description: 'Verifica', date: d(-10) },
      { id: createId(), subject: 'Storia', value: 8, description: 'Tema', date: d(-5) },
    ],
    sessions: [
      { id: createId(), subject: 'Matematica', duration: 45, date: d(-1) },
      { id: createId(), subject: 'Storia', duration: 30, date: d(-1) },
    ],
    archive: [],
    settings: {
      darkMode: true,
      weeklyGoal: 15,
      colorTheme: 'default',
      notes: 'Benvenuto in Student Hub!',
    },
  };
}
