// Saved conversations of the Guida Studio AI (Supabase table "chats", one row per chat).
import { supabase } from './supabase';

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  // Photos attached in the chat are not saved (too big): only how many there were.
  images?: number;
}

export interface ChatSummary {
  id: string;
  subject: string;
  topic: string;
  title: string;
  updatedAt: string;
}

export interface Chat extends ChatSummary {
  messages: StoredMessage[];
}

const TABLE = 'chats';

function client() {
  if (!supabase) throw new Error('Supabase non configurato');
  return supabase;
}

export async function listChats(): Promise<ChatSummary[]> {
  const { data, error } = await client()
    .from(TABLE)
    .select('id, subject, topic, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []).map(r => ({ id: r.id, subject: r.subject, topic: r.topic, title: r.title, updatedAt: r.updated_at }));
}

export async function loadChat(id: string): Promise<Chat | null> {
  const { data, error } = await client().from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, subject: data.subject, topic: data.topic, title: data.title, updatedAt: data.updated_at, messages: data.messages || [] };
}

export async function saveChat(userId: string, chat: Chat): Promise<void> {
  const { error } = await client().from(TABLE).upsert({
    id: chat.id,
    user_id: userId,
    subject: chat.subject,
    topic: chat.topic,
    title: chat.title,
    messages: chat.messages,
    updated_at: chat.updatedAt,
  });
  if (error) throw error;
}

export async function renameChat(id: string, title: string): Promise<void> {
  const { error } = await client().from(TABLE).update({ title }).eq('id', id);
  if (error) throw error;
}

export async function deleteChat(id: string): Promise<void> {
  const { error } = await client().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export function chatErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (/chats|PGRST205|42P01|schema cache/i.test(msg)) {
    return 'Le chat non vengono salvate: manca la tabella "chats" su Supabase. Esegui di nuovo lo script supabase/schema.sql (vedi GUIDA_SUPABASE.md).';
  }
  return `Chat non salvata: ${msg || 'errore sconosciuto'}`;
}

// Chat title from the first message, like "Riassunto della Rivoluzione francese…".
export function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 48 ? `${clean.slice(0, 47).trimEnd()}…` : clean || 'Nuova chat';
}
