import { createClient } from '@supabase/supabase-js';
import { UserData, Task, Grade, StudySession, ArchiveItem, UserSettings } from './store';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = () => {
  return SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL !== 'your-project-url';
};

let supabase = isSupabaseConfigured() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export { supabase };

export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error('Supabase non configurato');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Supabase non configurato');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!supabase) throw new Error('Supabase non configurato');
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resetPassword(email: string) {
  if (!supabase) throw new Error('Supabase non configurato');
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
  return data;
}

export async function loadUserData(userId: string): Promise<UserData | null> {
  if (!supabase) return null;
  
  try {
    const [tasksRes, gradesRes, sessionsRes, archiveRes, settingsRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', userId),
      supabase.from('grades').select('*').eq('user_id', userId),
      supabase.from('sessions').select('*').eq('user_id', userId),
      supabase.from('archive').select('*').eq('user_id', userId),
      supabase.from('settings').select('*').eq('user_id', userId).single(),
    ]);
    
    const settings = settingsRes.data || {
      user_id: userId,
      dark_mode: true,
      weekly_goal: 20,
      color_theme: 'default',
      notes: '',
    };
    
    return {
      tasks: tasksRes.data || [],
      grades: gradesRes.data || [],
      sessions: sessionsRes.data || [],
      archive: archiveRes.data || [],
      settings: {
        darkMode: settings.dark_mode,
        weeklyGoal: settings.weekly_goal,
        colorTheme: settings.color_theme,
        notes: settings.notes,
      },
    };
  } catch (error) {
    console.error('Errore caricamento dati:', error);
    return null;
  }
}

export async function saveTasks(userId: string, tasks: Task[]) {
  if (!supabase) return;
  const tasksWithUserId = tasks.map(t => ({ ...t, user_id: userId }));
  await supabase.from('tasks').delete().eq('user_id', userId);
  if (tasks.length > 0) await supabase.from('tasks').insert(tasksWithUserId);
}

export async function saveGrades(userId: string, grades: Grade[]) {
  if (!supabase) return;
  const gradesWithUserId = grades.map(g => ({ ...g, user_id: userId }));
  await supabase.from('grades').delete().eq('user_id', userId);
  if (grades.length > 0) await supabase.from('grades').insert(gradesWithUserId);
}

export async function saveSessions(userId: string, sessions: StudySession[]) {
  if (!supabase) return;
  const sessionsWithUserId = sessions.map(s => ({ ...s, user_id: userId }));
  await supabase.from('sessions').delete().eq('user_id', userId);
  if (sessions.length > 0) await supabase.from('sessions').insert(sessionsWithUserId);
}

export async function saveArchive(userId: string, archive: ArchiveItem[]) {
  if (!supabase) return;
  const archiveWithUserId = archive.map(a => ({ ...a, user_id: userId }));
  await supabase.from('archive').delete().eq('user_id', userId);
  if (archive.length > 0) await supabase.from('archive').insert(archiveWithUserId);
}

export async function saveSettings(userId: string, settings: UserSettings) {
  if (!supabase) return;
  const settingsWithUserId = {
    user_id: userId,
    dark_mode: settings.darkMode,
    weekly_goal: settings.weeklyGoal,
    color_theme: settings.colorTheme,
    notes: settings.notes,
  };
  await supabase.from('settings').upsert(settingsWithUserId);
}
