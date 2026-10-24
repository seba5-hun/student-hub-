// Subscriptions (Stripe) and codes for free access. The state is computed by Supabase
// (supabase/abbonamenti.sql → my_access) and written only by the server: the payment page and the
// Stripe webhook live in /api (Vercel functions), where the secret keys are.
import { supabase } from './supabase';

export type Plan = 'mensile' | 'annuale';

export interface Access {
  enabled: boolean;
  admin: boolean;
  trial_days: number;
  trial_end: string;
  price_month_cents: number;
  price_year_cents: number;
  status: string;
  plan: Plan | null;
  period_end: string | null;
  cancel_at_period_end: boolean;
  has_customer: boolean;
  code_forever: boolean;
  code_until: string | null;
  has_access: boolean;
}

export interface AccessCode {
  code: string;
  note: string | null;
  months: number | null;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
  people: { email: string; redeemed_at: string; free_until: string | null }[];
}

export interface BillingAdmin {
  settings: { enabled: boolean; enabled_at: string | null; trial_days: number; price_month_cents: number; price_year_cents: number };
  counts: { active: number; trialing: number; mensile: number; annuale: number; codes: number };
  subscribers: { email: string; status: string; plan: Plan | null; current_period_end: string | null; cancel_at_period_end: boolean }[];
  codes: AccessCode[];
}

const PAID = ['active', 'trialing', 'past_due'];
export const isPaid = (a: Access) => PAID.includes(a.status);

function client() {
  if (!supabase) throw new Error('Supabase non configurato');
  return supabase;
}

const missingScript = (msg: string) => /my_access|admin_billing|redeem_code|billing|PGRST202|PGRST205|42883|schema cache/i.test(msg);

// null = the subscriptions are not set up on Supabase yet: everybody keeps using the app.
export async function loadAccess(): Promise<Access | null> {
  const { data, error } = await client().rpc('my_access');
  if (error) {
    if (missingScript(error.message)) return null;
    throw error;
  }
  // Anything unexpected: the app stays open rather than locking someone out.
  return data && typeof data === 'object' && typeof (data as Access).has_access === 'boolean' ? data as Access : null;
}

export async function redeemCode(code: string): Promise<Access> {
  const { data, error } = await client().rpc('redeem_code', { p_code: code });
  if (error) throw new Error(missingScript(error.message) ? 'I codici non sono ancora attivi.' : error.message);
  const out = data as { ok: boolean; error?: string; access?: Access };
  if (!out.ok || !out.access) throw new Error(out.error || 'Codice non valido.');
  return out.access;
}

async function callServer(path: string, body: unknown): Promise<string> {
  const { data: { session } } = await client().auth.getSession();
  if (!session) throw new Error('Accedi di nuovo e riprova.');
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
  } catch {
    throw new Error('Connessione assente: controlla la rete e riprova.');
  }
  const out = await res.json().catch(() => null) as { url?: string; error?: string } | null;
  if (!res.ok || !out?.url) throw new Error(out?.error || 'I pagamenti non sono ancora attivi. Riprova più tardi.');
  return out.url;
}

// Opens Stripe's payment page (Apple Pay, Google Pay, Link, card…).
export async function startCheckout(plan: Plan): Promise<void> {
  window.location.assign(await callServer('/api/stripe-checkout', { plan }));
}

// Stripe's page to change card or plan, see receipts, cancel.
export async function openPortal(): Promise<void> {
  window.location.assign(await callServer('/api/stripe-portal', {}));
}

// ---------------------------------------------------------------- wording

export function euro(cents: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function daysLeft(iso: string | null, now = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 86400000));
}

// If they subscribe now, the first payment waits until the free days end (trial or a code for some
// months). Stripe allows it only when that is more than 48 hours away (same rule as the server).
export function paysFrom(a: Access, now = Date.now()): string | null {
  if (!a.enabled) return null;
  const until = Math.max(Date.parse(a.trial_end) || 0, a.code_until ? Date.parse(a.code_until) : 0);
  return until - now > 49 * 3600000 ? new Date(until).toISOString() : null;
}

// How much the yearly plan saves compared with 12 months.
export function yearlySaving(a: Pick<Access, 'price_month_cents' | 'price_year_cents'>): number {
  return Math.max(0, Math.round((1 - a.price_year_cents / (a.price_month_cents * 12)) * 100));
}

export type AccessKind = 'admin' | 'spento' | 'abbonato' | 'codice' | 'prova' | 'scaduto';

export function accessKind(a: Access, now = Date.now()): AccessKind {
  if (a.admin) return 'admin';
  if (!a.enabled) return 'spento';
  if (isPaid(a)) return 'abbonato';
  if (a.code_forever || (a.code_until && Date.parse(a.code_until) > now)) return 'codice';
  if (Date.parse(a.trial_end) > now) return 'prova';
  return 'scaduto';
}

// One line for the account menu.
export function accessLabel(a: Access, now = Date.now()): string {
  switch (accessKind(a, now)) {
    case 'admin': return 'Admin · tutto incluso';
    case 'spento': return '';
    case 'abbonato': return a.status === 'past_due' ? 'Pagamento da aggiornare' : a.plan === 'annuale' ? 'Abbonamento annuale' : 'Abbonamento mensile';
    case 'codice': return a.code_forever ? 'Gratis con codice' : `Gratis fino al ${shortDate(a.code_until!)}`;
    case 'prova': { const d = daysLeft(a.trial_end, now); return `Prova gratuita · ${d} ${d === 1 ? 'giorno' : 'giorni'}`; }
    default: return 'Prova finita';
  }
}

// ---------------------------------------------------------------- admin

function adminError(error: { message: string }): Error {
  if (/not allowed|42501/i.test(error.message)) return new Error('Questo account non è admin.');
  if (missingScript(error.message)) return new Error('Manca la parte Abbonamenti su Supabase: esegui lo script supabase/abbonamenti.sql.');
  return new Error(error.message);
}

export async function loadBilling(): Promise<BillingAdmin> {
  const { data, error } = await client().rpc('admin_billing');
  if (error) throw adminError(error);
  return data as BillingAdmin;
}

export async function saveBilling(s: { enabled: boolean; trial_days: number; price_month_cents: number; price_year_cents: number }): Promise<void> {
  const { error } = await client().rpc('admin_set_billing', { p_enabled: s.enabled, p_trial_days: s.trial_days, p_price_month_cents: s.price_month_cents, p_price_year_cents: s.price_year_cents });
  if (error) throw adminError(error);
}

export async function createCode(c: { code: string; note: string; months: number | null; max_uses: number | null; expires_at: string | null }): Promise<void> {
  const { error } = await client().rpc('admin_create_code', { p_code: c.code, p_note: c.note, p_months: c.months, p_max_uses: c.max_uses, p_expires_at: c.expires_at });
  if (error) throw adminError(error);
}

export async function setCodeActive(code: string, active: boolean): Promise<void> {
  const { error } = await client().rpc('admin_set_code_active', { p_code: code, p_active: active });
  if (error) throw adminError(error);
}

export async function deleteCode(code: string): Promise<void> {
  const { error } = await client().rpc('admin_delete_code', { p_code: code });
  if (error) throw adminError(error);
}

// A code that is easy to read and dictate (no 0/O, 1/I).
export function randomCode(prefix = 'MYND'): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `${prefix}-${[...bytes].map(b => chars[b % chars.length]).join('')}`;
}
