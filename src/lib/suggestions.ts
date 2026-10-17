// "Suggerisci una modifica": students write what they would change in MYND; only the admin reads
// the suggestions (Admin → Suggerimenti). Table and functions: supabase/suggerimenti.sql.
import { supabase } from './supabase';

export type SuggestionKind = 'idea' | 'problema' | 'altro';
export type SuggestionStatus = 'new' | 'read' | 'done';

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  section: string | null;
  message: string;
  status: SuggestionStatus;
  created_at: string;
  email: string | null;
}

function client() {
  if (!supabase) throw new Error('Supabase non configurato');
  return supabase;
}

const MISSING = 'Manca la parte "Suggerimenti" su Supabase: esegui lo script supabase/suggerimenti.sql.';

function friendly(error: { message: string; code?: string }): Error {
  if (/not allowed|42501/i.test(error.message) && !/row-level security/i.test(error.message)) return new Error('Questo account non è admin.');
  if (/row-level security/i.test(error.message)) return new Error('Hai già inviato molti suggerimenti oggi: riprova domani. Grazie!');
  if (/suggestions|admin_suggestions|PGRST20[25]|42P01|schema cache|function/i.test(error.message)) return new Error(MISSING);
  return new Error(error.message);
}

export async function sendSuggestion(userId: string, kind: SuggestionKind, message: string, section: string): Promise<void> {
  const { error } = await client().from('suggestions').insert({ user_id: userId, kind, message: message.trim().slice(0, 2000), section: section.slice(0, 40) });
  if (error) throw friendly(error);
}

export async function loadSuggestions(): Promise<Suggestion[]> {
  const { data, error } = await client().rpc('admin_suggestions');
  if (error) throw friendly(error);
  return (data || []) as Suggestion[];
}

export async function setSuggestionStatus(id: string, status: SuggestionStatus): Promise<void> {
  const { error } = await client().rpc('admin_set_suggestion_status', { p_id: id, p_status: status });
  if (error) throw friendly(error);
}

export async function deleteSuggestion(id: string): Promise<void> {
  const { error } = await client().rpc('admin_delete_suggestion', { p_id: id });
  if (error) throw friendly(error);
}
