// Personalised functions, sold in packages: the student describes the idea to "Crea con l'AI", the
// AI prepares the function and the request goes to Admin → Personalizzazioni. Only after the admin
// has checked it (security) and approved it does it appear in that student's MYND.
// Tables and functions: supabase/personalizzazioni.sql.
import { supabase } from './supabase';
import { UserData } from './store';
import { applyActions, Action } from './assistant';

export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface Placement {
  place?: string;          // "home", "section" or one of MYND's sections
  position?: string;       // inside MYND's sections: above, below, replace
  icon?: string;
  uses_data?: boolean;
  writes_data?: boolean;
  description?: string;
}

export interface CustomRequest {
  id: string;
  user_id: string;
  title: string;
  idea: string;
  kind: 'new' | 'update';
  target_app: string | null;
  placement: Placement;
  html: string;
  status: RequestStatus;
  admin_note: string | null;
  review: unknown;
  created_at: string;
  reviewed_at: string | null;
  email?: string | null;
}

// Every account has 2 personalisations included; the packages bought add to them.
export const INCLUDED_CREDITS = 2;

export interface CustomPlan { credits: number; used: number; left: number; package: string | null; requests: CustomRequest[] }

// A request prepared in the chat, not sent yet.
export interface Draft { title: string; idea: string; kind: 'new' | 'update'; target_app?: string; placement: Placement; html: string }

function client() {
  if (!supabase) throw new Error('Supabase non configurato');
  return supabase;
}

const MISSING = 'Manca la parte "Personalizzazioni" su Supabase: esegui lo script supabase/personalizzazioni.sql.';

function friendly(error: { message: string; code?: string }): Error {
  if (/row-level security/i.test(error.message)) return new Error('Non hai personalizzazioni disponibili nel tuo pacchetto (oppure hai già inviato molte richieste oggi).');
  if (/not allowed|42501/i.test(error.message)) return new Error('Questo account non è admin.');
  if (/custom_requests|custom_plans|admin_custom|PGRST20[25]|42P01|schema cache|function/i.test(error.message)) return new Error(MISSING);
  return new Error(error.message);
}

// ---- Student ----
export async function loadMyPlan(userId: string): Promise<CustomPlan> {
  const db = client();
  const [plan, reqs] = await Promise.all([
    db.from('custom_plans').select('credits, package').eq('user_id', userId).maybeSingle(),
    db.from('custom_requests').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
  ]);
  if (plan.error) throw friendly(plan.error);
  if (reqs.error) throw friendly(reqs.error);
  const requests = (reqs.data || []) as CustomRequest[];
  const credits = plan.data ? plan.data.credits : INCLUDED_CREDITS;
  const used = requests.filter(r => r.status !== 'rejected').length;
  return { credits, used, left: Math.max(0, credits - used), package: plan.data?.package || null, requests };
}

export async function sendRequest(userId: string, d: Draft): Promise<void> {
  const { error } = await client().from('custom_requests').insert({
    user_id: userId, title: d.title.slice(0, 60) || 'Personalizzazione', idea: d.idea.slice(0, 4000), kind: d.kind,
    target_app: d.target_app || null, placement: d.placement, html: d.html.slice(0, 150000),
  });
  if (error) throw friendly(error);
}

// Puts the approved functions not yet installed into the student's own MYND ("La mia MYND").
export function installApproved(data: UserData, requests: CustomRequest[]): { data: UserData; installed: { title: string; open?: string }[] } {
  const done = new Set(data.settings.customInstalled || []);
  const todo = requests.filter(r => r.status === 'approved' && r.html && !done.has(r.id)).reverse();   // oldest first
  if (!todo.length) return { data, installed: [] };
  let next = data;
  const installed: { title: string; open?: string }[] = [];
  for (const r of todo) {
    const p = r.placement || {};
    const create: Action = { type: 'create_app', title: r.title, place: p.place || 'section', position: p.position, icon: p.icon, code: 'R', uses_data: !!p.uses_data, writes_data: !!p.writes_data, description: p.description || '' };
    const update: Action = { type: 'update_app', app: r.target_app || r.title, code: 'R', writes_data: !!p.writes_data, description: p.description || '' };
    let res = applyActions(next, [r.kind === 'update' ? update : create], { R: r.html });
    // The function to change is gone (removed by the student): it comes back as a new one.
    if (r.kind === 'update' && res.skipped.some(x => x.startsWith('modifica di'))) res = applyActions(next, [create], { R: r.html });
    next = res.data;
    installed.push({ title: r.title, open: res.navigate });
  }
  next = { ...next, settings: { ...next.settings, customInstalled: [...done, ...todo.map(r => r.id)].slice(-500) } };
  return { data: next, installed };
}

// ---- Admin ----
export async function loadAllRequests(): Promise<CustomRequest[]> {
  const { data, error } = await client().rpc('admin_custom_requests');
  if (error) throw friendly(error);
  return (data || []) as CustomRequest[];
}

export async function updateRequest(id: string, patch: { status?: RequestStatus; note?: string; html?: string; review?: unknown }): Promise<void> {
  const { error } = await client().rpc('admin_update_custom_request', {
    p_id: id, p_status: patch.status ?? null, p_note: patch.note ?? null, p_html: patch.html ?? null, p_review: patch.review ?? null,
  });
  if (error) throw friendly(error);
}

export interface PlanRow { user_id: string; email: string | null; credits: number; used: number; package: string | null; updated_at: string }

export async function loadPlans(): Promise<PlanRow[]> {
  const { data, error } = await client().rpc('admin_custom_plans');
  if (error) throw friendly(error);
  return (data || []) as PlanRow[];
}

export async function addCredits(email: string, add: number, pack?: string): Promise<{ email: string; credits: number }> {
  const { data, error } = await client().rpc('admin_add_custom_credits', { p_email: email, p_add: add, p_package: pack ?? null });
  if (error) throw friendly(error);
  return data as { email: string; credits: number };
}
