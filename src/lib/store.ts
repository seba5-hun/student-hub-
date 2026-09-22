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

function normalizeData(parsed: any): UserData {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    tasks: arr(parsed?.tasks),
    grades: arr(parsed?.grades),
    sessions: arr(parsed?.sessions),
    archive: arr(parsed?.archive),
    settings: { ...DEFAULT_SETTINGS, ...(parsed?.settings && typeof parsed.settings === 'object' ? parsed.settings : {}) },
  };
}

export function loadUserData(userId: string): UserData {
  try {
    const raw = localStorage.getItem(getStorageKey(userId, 'data'));
    if (raw) {
      return normalizeData(JSON.parse(raw));
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

type StoredUsers = Record<string, { email: string; password: string; hashed?: boolean }>;

export function getRegisteredUsers(): StoredUsers {
  try {
    const raw = localStorage.getItem('studenthub_users');
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return {};
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function hashPassword(email: string, password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`studenthub:${email}:${password}`);
  // crypto.subtle exists only on https/localhost; on plain http (e.g. from a phone on the LAN) use the JS version.
  if (!globalThis.crypto?.subtle) return sha256Hex(bytes);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function sha256Hex(data: Uint8Array): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const len = data.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(len / 0x20000000));
  view.setUint32(padded.length - 4, (len << 3) >>> 0);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return H.map(x => x.toString(16).padStart(8, '0')).join('');
}

function userIdKey(email: string): string {
  return `studenthub_userid_${email}`;
}

// Makes sure the email -> userId mapping exists, so the same data is found on every login.
export function ensureUserIdMapping(user: AuthUser): void {
  if (!localStorage.getItem(userIdKey(user.email))) {
    localStorage.setItem(userIdKey(user.email), user.id);
  }
}

export async function registerUser(rawEmail: string, password: string): Promise<AuthUser | null> {
  const email = normalizeEmail(rawEmail);
  const users = getRegisteredUsers();
  if (users[email]) return null;
  const id = localStorage.getItem(userIdKey(email)) || uuidv4();
  users[email] = { email, password: await hashPassword(email, password), hashed: true };
  localStorage.setItem('studenthub_users', JSON.stringify(users));
  localStorage.setItem(userIdKey(email), id);
  return { id, email };
}

export async function loginUser(rawEmail: string, password: string): Promise<AuthUser | null> {
  const users = getRegisteredUsers();
  // Older accounts were stored with the email exactly as typed.
  const email = users[normalizeEmail(rawEmail)] ? normalizeEmail(rawEmail) : rawEmail.trim();
  const stored = users[email];
  if (!stored) return null;

  const hashed = await hashPassword(email, password);
  const valid = stored.hashed ? stored.password === hashed : stored.password === password;
  if (!valid) return null;

  if (!stored.hashed) {
    // Upgrade legacy plain-text password to a hash.
    users[email] = { email, password: hashed, hashed: true };
    localStorage.setItem('studenthub_users', JSON.stringify(users));
  }

  const userId = localStorage.getItem(userIdKey(email));
  if (userId) return { id: userId, email };
  const id = uuidv4();
  localStorage.setItem(userIdKey(email), id);
  return { id, email };
}

export function exportData(userId: string): string {
  const data = loadUserData(userId);
  return JSON.stringify(data, null, 2);
}

export function importData(userId: string, json: string): boolean {
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    const known = ['tasks', 'grades', 'sessions', 'archive', 'settings'];
    if (!known.some(k => k in data)) return false;
    saveUserData(userId, normalizeData(data));
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

function generateDemoData(): UserData {
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
