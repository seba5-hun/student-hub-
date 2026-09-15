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

export interface ArchiveItem {
  id: string;
  subject: string;
  topic: string;
  name: string;
  link?: string;
}

export interface UserSettings {
  darkMode: boolean;
  weeklyGoal: number;
  colorTheme: string;
  notes: string;
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

const DEFAULT_DATA: UserData = {
  tasks: [],
  grades: [],
  sessions: [],
  archive: [],
  settings: DEFAULT_SETTINGS,
};

const STORAGE_PREFIX = 'studenthub_';

export function getStorageKey(userId: string, key: string): string {
  return `${STORAGE_PREFIX}${userId}_${key}`;
}

export function loadUserData(userId: string): UserData {
  try {
    const raw = localStorage.getItem(getStorageKey(userId, 'data'));
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_DATA, ...parsed };
    }
  } catch (e) {
    console.error('Error loading data:', e);
  }
  return generateDemoData();
}

export function saveUserData(userId: string, data: UserData): void {
  try {
    localStorage.setItem(getStorageKey(userId, 'data'), JSON.stringify(data));
  } catch (e) {
    console.error('Error saving data:', e);
  }
}

export function createId(): string {
  return uuidv4();
}

export interface AuthUser {
  id: string;
  email: string;
}

export function getAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('studenthub_auth');
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return null;
}

export function setAuthUser(user: AuthUser | null): void {
  if (user) {
    localStorage.setItem('studenthub_auth', JSON.stringify(user));
  } else {
    localStorage.removeItem('studenthub_auth');
  }
}

export function getRegisteredUsers(): Record<string, { email: string; password: string }> {
  try {
    const raw = localStorage.getItem('studenthub_users');
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return {};
}

export function registerUser(email: string, password: string): AuthUser | null {
  const users = getRegisteredUsers();
  if (users[email]) return null;
  const id = uuidv4();
  users[email] = { email, password };
  localStorage.setItem('studenthub_users', JSON.stringify(users));
  return { id, email };
}

export function loginUser(email: string, password: string): AuthUser | null {
  const users = getRegisteredUsers();
  if (users[email] && users[email].password === password) {
    const userId = localStorage.getItem(`studenthub_userid_${email}`);
    if (userId) return { id: userId, email };
    const id = uuidv4();
    localStorage.setItem(`studenthub_userid_${email}`, id);
    return { id, email };
  }
  return null;
}

export function exportData(userId: string): string {
  const data = loadUserData(userId);
  return JSON.stringify(data, null, 2);
}

export function importData(userId: string, json: string): boolean {
  try {
    const data = JSON.parse(json);
    saveUserData(userId, { ...DEFAULT_DATA, ...data });
    return true;
  } catch (e) {
    console.error('Import error:', e);
    return false;
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
  const dates = [...new Set(sessions.map(s => s.date))].sort().reverse();
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  if (dates[0] !== today && dates[0] !== yesterday) return 0;
  
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const d1 = new Date(dates[i - 1]);
    const d2 = new Date(dates[i]);
    const diff = (d1.getTime() - d2.getTime()) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

export function getWeeklyStudyHours(sessions: StudySession[]): number {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  return sessions
    .filter(s => new Date(s.date) >= weekAgo)
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
    const date = s.date.split('T')[0];
    data[date] = (data[date] || 0) + s.duration / 60;
  });
  return data;
}

function generateDemoData(): UserData {
  const today = new Date();
  const d = (offset: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    return date.toISOString().split('T')[0];
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
