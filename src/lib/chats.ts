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

// ---- Copy on this device ----
// Every chat is also kept in the browser, so it is never lost when saving online fails:
// it shows up in the list anyway and is uploaded as soon as Supabase works again.

interface LocalChat extends Chat {
  synced: boolean;
}

function localKey(userId: string): string {
  return `studenthub_chats_${userId}`;
}

function readLocal(userId: string): Record<string, LocalChat> {
  try {
    return JSON.parse(localStorage.getItem(localKey(userId)) || '{}');
  } catch {
    return {};
  }
}

function writeLocal(userId: string, chats: Record<string, LocalChat>): void {
  try {
    localStorage.setItem(localKey(userId), JSON.stringify(chats));
  } catch {
    // Storage full: keep only the 30 most recent chats on this device.
    const recent = Object.values(chats).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30);
    try { localStorage.setItem(localKey(userId), JSON.stringify(Object.fromEntries(recent.map(c => [c.id, c])))); } catch { /* ignore */ }
  }
}

function summary(c: Chat): ChatSummary {
  return { id: c.id, subject: c.subject, topic: c.topic, title: c.title, updatedAt: c.updatedAt };
}

// ---- Supabase ----

async function remoteSave(userId: string, chat: Chat): Promise<void> {
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

// Uploads the chats that were saved only on this device. Returns the error, if any.
export async function syncLocalChats(userId: string): Promise<unknown> {
  const local = readLocal(userId);
  for (const chat of Object.values(local).filter(c => !c.synced)) {
    try {
      const { synced: _synced, ...plain } = chat;
      await remoteSave(userId, plain);
      local[chat.id] = { ...chat, synced: true };
      writeLocal(userId, local);
    } catch (err) {
      return err;
    }
  }
  return null;
}

// Chats from Supabase plus the ones only on this device. `error` tells why Supabase failed.
export async function listChats(userId: string): Promise<{ chats: ChatSummary[]; error: unknown }> {
  const local = readLocal(userId);
  let remote: ChatSummary[] = [];
  let error: unknown = null;
  try {
    const { data, error: e } = await client()
      .from(TABLE)
      .select('id, subject, topic, title, updated_at')
      .order('updated_at', { ascending: false })
      .limit(500);
    if (e) throw e;
    remote = (data || []).map(r => ({ id: r.id, subject: r.subject, topic: r.topic, title: r.title, updatedAt: r.updated_at }));
  } catch (err) {
    error = err;
  }
  const byId = new Map(remote.map(c => [c.id, c]));
  for (const c of Object.values(local)) {
    const r = byId.get(c.id);
    if (!r || c.updatedAt > r.updatedAt) byId.set(c.id, summary(c));
  }
  return { chats: [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), error };
}

export async function loadChat(userId: string, id: string): Promise<Chat | null> {
  const local = readLocal(userId)[id];
  try {
    const { data, error } = await client().from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (data && (!local || data.updated_at >= local.updatedAt)) {
      return { id: data.id, subject: data.subject, topic: data.topic, title: data.title, updatedAt: data.updated_at, messages: data.messages || [] };
    }
  } catch (err) {
    if (!local) throw err;
  }
  if (!local) return null;
  const { synced: _synced, ...plain } = local;
  return plain;
}

// Saves on this device first, then on Supabase. Throws only if the online save fails
// (the chat is kept locally and uploaded later).
export async function saveChat(userId: string, chat: Chat): Promise<void> {
  const local = readLocal(userId);
  local[chat.id] = { ...chat, synced: false };
  writeLocal(userId, local);
  await remoteSave(userId, chat);
  const after = readLocal(userId);
  if (after[chat.id]?.updatedAt === chat.updatedAt) {
    after[chat.id] = { ...after[chat.id], synced: true };
    writeLocal(userId, after);
  }
}

export async function renameChat(userId: string, id: string, title: string): Promise<void> {
  const local = readLocal(userId);
  if (local[id]) {
    local[id] = { ...local[id], title };
    writeLocal(userId, local);
  }
  const { error } = await client().from(TABLE).update({ title }).eq('id', id);
  if (error) throw error;
}

export async function deleteChat(userId: string, id: string): Promise<void> {
  const local = readLocal(userId);
  delete local[id];
  writeLocal(userId, local);
  const { error } = await client().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export function chatErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err ?? '');
  const detail = raw ? ` (Supabase: ${raw})` : '';
  if (/PGRST205|42P01|could not find the table|relation .* does not exist/i.test(raw)) {
    return `Chat salvate solo su questo dispositivo: su Supabase manca la tabella "chats". Esegui lo script supabase/schema.sql.${detail}`;
  }
  if (/column|PGRST204|42703/i.test(raw)) {
    return `Chat salvate solo su questo dispositivo: su Supabase esiste una tabella "chats" diversa da quella che serve all'app.${detail}`;
  }
  if (/row-level security|42501|permission denied/i.test(raw)) {
    return `Chat salvate solo su questo dispositivo: Supabase rifiuta il salvataggio per i permessi. Esegui di nuovo lo script supabase/schema.sql.${detail}`;
  }
  return `Chat salvate solo su questo dispositivo: il salvataggio online non è riuscito.${detail}`;
}

// Chat title from the first message, like "Riassunto della Rivoluzione francese…".
export function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 48 ? `${clean.slice(0, 47).trimEnd()}…` : clean || 'Nuova chat';
}
