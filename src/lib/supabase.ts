import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserData, normalizeData } from './store';

// Read before createClient: the client removes the tokens from the URL once it has used them.
const initialHash = new URLSearchParams(window.location.hash.slice(1));
const initialQuery = new URLSearchParams(window.location.search);
export const openedFromRecoveryLink = initialHash.get('type') === 'recovery' || initialQuery.get('type') === 'recovery';
// E.g. an expired confirmation or reset link.
export const linkErrorMessage = initialHash.get('error_description') || initialQuery.get('error_description');

// Values pasted in hosting dashboards often keep quotes, spaces or the "NAME=" prefix: clean them.
function cleanEnv(value: string | undefined, name: string): string {
  return (value || '').trim().replace(new RegExp(`^${name}\\s*=\\s*`), '').replace(/^['"]|['"]$/g, '').trim();
}

// Project defaults, used when the environment variables are not set (e.g. on the hosting).
// The publishable key is meant to be public: it ends up in the browser anyway, and the data
// is protected by Row Level Security (supabase/schema.sql). Never put the service_role key here.
const DEFAULT_URL = 'https://czzlvcmnfvyrcjvyfyxi.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_jT6_ggiUROhkzmEgaUBouw_cBcygmKP';

const url = cleanEnv(import.meta.env.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL') || DEFAULT_URL;
const anonKey = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY, 'VITE_SUPABASE_ANON_KEY') || DEFAULT_PUBLISHABLE_KEY;

function checkConfig(): string {
  if (!url && !anonKey) return 'Mancano VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.';
  if (!url) return 'Manca VITE_SUPABASE_URL.';
  if (!anonKey) return 'Manca VITE_SUPABASE_ANON_KEY.';
  if (!/^https:\/\/[^\s/]+\.supabase\.co\/?$/.test(url)) {
    return 'VITE_SUPABASE_URL non è valido: deve essere tipo https://xxxx.supabase.co (senza virgolette né spazi).';
  }
  return '';
}

// Why Supabase can't be used, or '' when the configuration is fine. The app shows this
// message instead of crashing into a white page.
export const configError = checkConfig();

function makeClient(): SupabaseClient | null {
  if (configError) return null;
  try {
    // The login stays on the device (localStorage) and is renewed by itself: the password is
    // asked only the first time on each device, or after "Esci".
    return createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  } catch (err) {
    console.error('Supabase init error:', err);
    return null;
  }
}

export const supabase: SupabaseClient | null = makeClient();

// Whether "Continua con Google" is switched on in Supabase (Authentication → Providers).
export async function googleLoginEnabled(): Promise<boolean> {
  if (configError) return false;
  try {
    const cached = sessionStorage.getItem('mynd_google_login');
    if (cached === '1') return true;
  } catch { /* ignore */ }
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, { headers: { apikey: anonKey } });
    const on = res.ok && !!(await res.json())?.external?.google;
    // Only "on" is remembered: once Google is switched on in Supabase, the button shows at the next load.
    try { if (on) sessionStorage.setItem('mynd_google_login', '1'); } catch { /* ignore */ }
    return on;
  } catch {
    return false;
  }
}

const TABLE = 'user_data';

// Returns null when the user has no saved data yet.
export async function fetchRemoteData(userId: string): Promise<UserData | null> {
  if (!supabase) throw new Error('Supabase non configurato');
  const { data, error } = await supabase.from(TABLE).select('data').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ? normalizeData(data.data) : null;
}

export async function saveRemoteData(userId: string, userData: UserData): Promise<void> {
  if (!supabase) throw new Error('Supabase non configurato');
  const { error } = await supabase
    .from(TABLE)
    .upsert({ user_id: userId, data: userData, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// Supabase error messages are in English: translate the ones users actually see.
export function authErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (/invalid login credentials/i.test(msg)) return 'Email o password non corretti.';
  if (/email not confirmed/i.test(msg)) return 'Devi prima confermare l\'email: controlla la tua casella di posta (anche lo spam).';
  if (/user already registered/i.test(msg)) return 'Esiste già un account con questa email.';
  if (/password should be at least/i.test(msg)) return 'La password è troppo corta.';
  if (/rate limit|too many requests|security purposes/i.test(msg)) return 'Troppi tentativi. Aspetta qualche minuto e riprova.';
  if (/same.*password|different from the old/i.test(msg)) return 'La nuova password deve essere diversa da quella vecchia.';
  if (/user_data|PGRST205|42P01|schema cache/i.test(msg)) return 'Manca la tabella dei dati su Supabase: esegui una volta lo script supabase/schema.sql (vedi GUIDA_SUPABASE.md).';
  if (/expired|invalid.*(link|token)|otp|session missing/i.test(msg)) return 'Il link è scaduto o non è valido. Richiedine uno nuovo.';
  if (/failed to fetch|network/i.test(msg)) return 'Errore di connessione. Controlla la rete e riprova.';
  return msg || 'Si è verificato un errore. Riprova.';
}

// ---- Archive files (Supabase Storage, bucket "archive", one folder per user) ----

const BUCKET = 'archive';
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

function client(): SupabaseClient {
  if (!supabase) throw new Error('Supabase non configurato');
  return supabase;
}

function safeFileName(name: string): string {
  const clean = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_');
  return clean.slice(-80) || 'file';
}

export async function uploadArchiveFile(userId: string, file: File): Promise<string> {
  const path = `${userId}/${crypto.randomUUID ? crypto.randomUUID() : Date.now()}-${safeFileName(file.name)}`;
  const { error } = await client().storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function uploadArchiveText(path: string, text: string): Promise<void> {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const { error } = await client().storage.from(BUCKET).upload(path, blob, {
    contentType: 'text/plain;charset=utf-8',
    upsert: true,
  });
  if (error) throw error;
}

export async function downloadArchiveFile(path: string): Promise<Blob> {
  const { data, error } = await client().storage.from(BUCKET).download(path);
  if (error) throw error;
  return data;
}

export async function archiveFileUrl(path: string): Promise<string> {
  const { data, error } = await client().storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function removeArchiveFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await client().storage.from(BUCKET).remove(paths);
  if (error) throw error;
}

export function storageErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (/bucket not found/i.test(msg)) return 'Manca lo spazio file su Supabase: esegui di nuovo lo script supabase/schema.sql (vedi GUIDA_SUPABASE.md).';
  if (/row-level security|unauthorized|not allowed|403/i.test(msg)) return 'Permesso negato dallo spazio file: esegui di nuovo lo script supabase/schema.sql.';
  if (/exceeded|too large|payload/i.test(msg)) return 'File troppo grande (massimo 50 MB).';
  if (/failed to fetch|network/i.test(msg)) return 'Errore di connessione. Controlla la rete e riprova.';
  return msg || 'Errore durante il caricamento.';
}
