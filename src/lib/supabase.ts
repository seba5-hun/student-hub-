import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserData, normalizeData } from './store';

// Read before createClient: the client removes the tokens from the URL once it has used them.
const initialHash = new URLSearchParams(window.location.hash.slice(1));
const initialQuery = new URLSearchParams(window.location.search);
export const openedFromRecoveryLink = initialHash.get('type') === 'recovery' || initialQuery.get('type') === 'recovery';
// E.g. an expired confirmation or reset link.
export const linkErrorMessage = initialHash.get('error_description') || initialQuery.get('error_description');

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// null when the .env file is missing: the app shows a configuration message instead of crashing.
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

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
