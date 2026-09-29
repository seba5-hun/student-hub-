// Account approval: every account is pending / approved / rejected / blocked (table "profiles").
// Only the admin can change it, through the admin_* functions in supabase/schema.sql.
import { supabase } from './supabase';

export type AccountStatus = 'pending' | 'approved' | 'rejected' | 'blocked';

export interface AdminUser {
  user_id: string;
  email: string;
  status: AccountStatus;
  created_at: string;
  email_confirmed: boolean;
  reviewed_at: string | null;
  last_seen: string | null;
  seconds: number;
  is_admin: boolean;
}

function client() {
  if (!supabase) throw new Error('Supabase non configurato');
  return supabase;
}

// Status of the logged-in account. If the approval tables don't exist yet (script not run)
// everybody is treated as approved, so the app keeps working as before.
export async function fetchMyStatus(userId: string): Promise<AccountStatus> {
  const { data, error } = await client().from('profiles').select('status').eq('user_id', userId).maybeSingle();
  if (error) {
    if (/profiles|PGRST205|42P01|schema cache/i.test(error.message)) return 'approved';
    throw error;
  }
  return (data?.status as AccountStatus) || 'pending';
}

function adminError(error: { message: string }): Error {
  if (/not allowed|42501/i.test(error.message)) return new Error('Questo account non è admin.');
  if (/admin_users|admin_set|PGRST202|function/i.test(error.message)) {
    return new Error('Manca la parte Admin su Supabase: esegui lo script supabase/schema.sql (sezione "Approvazione degli utenti").');
  }
  return new Error(error.message);
}

export async function loadAdminUsers(): Promise<{ users: AdminUser[]; requireApproval: boolean }> {
  const { data, error } = await client().rpc('admin_users');
  if (error) throw adminError(error);
  return { users: data.users || [], requireApproval: data.require_approval !== false };
}

export async function setUserStatus(userId: string, status: AccountStatus): Promise<void> {
  const { error } = await client().rpc('admin_set_user_status', { p_user_id: userId, p_status: status });
  if (error) throw adminError(error);
}

export async function setRequireApproval(value: boolean): Promise<void> {
  const { error } = await client().rpc('admin_set_require_approval', { p_value: value });
  if (error) throw adminError(error);
}
