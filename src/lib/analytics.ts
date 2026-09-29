// Usage statistics for the developer page. Only counts and times are recorded (which section,
// for how long, how many AI questions/uploads) — never the content of notes, files or chats.
import { supabase } from './supabase';

export const DEVELOPER_EMAIL = 'flowbase.service@gmail.com';

export function isDeveloper(email?: string | null): boolean {
  return !!email && email.trim().toLowerCase() === DEVELOPER_EMAIL;
}

type EventName = 'visit' | 'section_view' | 'section_time' | 'ai_message' | 'file_upload' | 'signup';

function randomId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function stored(storage: 'local' | 'session', key: string): string {
  try {
    const store = storage === 'local' ? localStorage : sessionStorage;
    let value = store.getItem(key);
    if (!value) {
      value = randomId();
      store.setItem(key, value);
    }
    return value;
  } catch {
    return randomId();
  }
}

// Same browser = same visitor; a new tab or a return after closing = new session.
const visitorId = stored('local', 'studenthub_visitor');
const sessionId = stored('session', 'studenthub_session');
let userId: string | null = null;

function device(): string {
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'tablet';
  if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
}

export function track(event: EventName, section?: string | null, seconds = 0): void {
  if (!supabase) return;
  supabase
    .from('analytics_events')
    .insert({
      user_id: userId,
      visitor_id: visitorId,
      session_id: sessionId,
      event,
      section: section ?? null,
      seconds: Math.max(0, Math.min(3600, Math.round(seconds))),
      device: event === 'visit' ? device() : null,
    })
    .then(({ error }) => {
      // Statistics must never disturb the app: missing table, offline… are ignored.
      if (error && import.meta.env.DEV) console.warn('analytics:', error.message);
    });
}

// One "visit" per session, recorded again after login so it is linked to the account.
let visitTrackedFor: string | null | undefined;
export function setAnalyticsUser(id: string | null): void {
  userId = id;
  if (visitTrackedFor === id) return;
  try {
    const key = `studenthub_visit_${sessionId}_${id ?? 'anon'}`;
    if (sessionStorage.getItem(key)) { visitTrackedFor = id; return; }
    sessionStorage.setItem(key, '1');
  } catch { /* ignore */ }
  visitTrackedFor = id;
  track('visit');
}

// ---- Time spent per section ----
// Counted only while the page is visible and the user has done something in the last
// 2 minutes, so a tab left open doesn't inflate the numbers.

const IDLE_MS = 2 * 60 * 1000;
let currentSection: string | null = null;
let sectionStart = 0;
let accumulated = 0;
let lastActivity = Date.now();

function now(): number {
  return Date.now();
}

function running(): boolean {
  return currentSection !== null && document.visibilityState === 'visible' && now() - lastActivity < IDLE_MS;
}

function pause(): void {
  if (sectionStart) {
    accumulated += now() - sectionStart;
    sectionStart = 0;
  }
}

function resume(): void {
  if (!sectionStart && running()) sectionStart = now();
}

function flush(): void {
  pause();
  const seconds = accumulated / 1000;
  accumulated = 0;
  if (currentSection && seconds >= 1) track('section_time', currentSection, seconds);
  resume();
}

export function setAnalyticsSection(section: string | null): void {
  if (section === currentSection) return;
  flush();
  currentSection = section;
  sectionStart = 0;
  lastActivity = now();
  if (section) {
    track('section_view', section);
    resume();
  }
}

if (typeof window !== 'undefined') {
  const activity = () => {
    const wasIdle = now() - lastActivity >= IDLE_MS;
    lastActivity = now();
    if (wasIdle) resume();
  };
  ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(e =>
    window.addEventListener(e, activity, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    else resume();
  });
  window.addEventListener('pagehide', flush);
  // Every minute: stop counting if idle, and send what has been collected.
  window.setInterval(() => {
    if (sectionStart && now() - lastActivity >= IDLE_MS) {
      accumulated += Math.max(0, lastActivity + IDLE_MS - sectionStart);
      sectionStart = 0;
    }
    flush();
  }, 60 * 1000);
}

export interface DashboardData {
  totals: Record<string, number>;
  sections: { section: string; views: number; seconds: number; users: number }[];
  daily: { day: string; visitors: number; users: number; seconds: number }[];
  signups: { day: string; users: number }[];
  devices: { device: string; visitors: number }[];
  users: { email: string; created_at: string; last_seen: string | null; seconds: number; sessions: number }[];
}

export async function loadDashboard(days: number): Promise<DashboardData> {
  if (!supabase) throw new Error('Supabase non configurato');
  const { data, error } = await supabase.rpc('admin_dashboard', { p_days: days });
  if (error) {
    if (/not allowed|42501/i.test(error.message)) throw new Error('Questo account non ha accesso alle statistiche. Serve l\'account sviluppatore con l\'email confermata.');
    if (/admin_dashboard|PGRST202|function/i.test(error.message)) throw new Error('Manca la funzione delle statistiche su Supabase: esegui di nuovo lo script supabase/schema.sql.');
    throw new Error(error.message);
  }
  return data as DashboardData;
}
