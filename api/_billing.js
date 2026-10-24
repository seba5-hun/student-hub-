// Shared by the Stripe functions (files starting with "_" are not published as pages).
// They run on Vercel's server: the secret keys are read from the Vercel environment variables
// and never reach the browser.
import crypto from 'node:crypto';

const STRIPE_API = 'https://api.stripe.com/v1';
// The responses always have the same shape, whatever version the Stripe account uses by default.
const STRIPE_VERSION = '2024-06-20';
const DEFAULT_SUPABASE_URL = 'https://czzlvcmnfvyrcjvyfyxi.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_jT6_ggiUROhkzmEgaUBouw_cBcygmKP';

// Values pasted in dashboards often keep quotes, spaces or the "NAME=" prefix: clean them.
export function env(name) {
  return (process.env[name] || '').trim().replace(new RegExp(`^${name}\\s*=\\s*`), '').replace(/^['"]|['"]$/g, '').trim();
}

const supabaseUrl = () => (env('SUPABASE_URL') || env('VITE_SUPABASE_URL') || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
const publishableKey = () => env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY') || DEFAULT_PUBLISHABLE_KEY;

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Turns an error into the answer for the app (the message is shown to the user).
export function fail(err) {
  if (err instanceof HttpError) return json({ error: err.message }, err.status);
  console.error(err);
  return json({ error: 'Qualcosa è andato storto con il pagamento. Riprova tra poco.' }, 500);
}

export function requireConfig(names) {
  const missing = names.filter(n => !env(n));
  if (missing.length) {
    console.error('Variabili mancanti su Vercel:', missing.join(', '));
    throw new HttpError(503, 'I pagamenti non sono ancora attivi. Riprova più tardi.');
  }
}

// ------------------------------------------------------------------ Stripe

// Stripe wants form fields: { a: { b: 1 }, c: [x] } → a[b]=1&c[0]=x
function form(value, prefix, out = []) {
  if (value === undefined || value === null) return out;
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) form(v, prefix ? `${prefix}[${k}]` : k, out);
  } else out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  return out;
}

export async function stripe(method, path, params) {
  const query = params ? form(params).join('&') : '';
  const res = await fetch(`${STRIPE_API}${path}${method === 'GET' && query ? `?${query}` : ''}`, {
    method,
    headers: { Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`, 'Stripe-Version': STRIPE_VERSION, 'content-type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : query,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Stripe', method, path, res.status, body?.error?.message);
    throw new HttpError(502, 'Stripe non ha accettato la richiesta. Riprova tra poco.');
  }
  return body;
}

// Checks that an event really comes from Stripe (header "Stripe-Signature", tolerance 5 minutes).
export function verifyStripeSignature(raw, header, secret, now = Date.now() / 1000) {
  if (!header || !secret) return false;
  const parts = header.split(',').map(p => p.split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !signatures.length || Math.abs(now - t) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${raw}`, 'utf8').digest('hex');
  return signatures.some(s => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

// ------------------------------------------------------------------ Supabase

// Who is asking: the Supabase session of the app (header "Authorization: Bearer <token>").
export async function currentUser(request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Accedi di nuovo e riprova.');
  const res = await fetch(`${supabaseUrl()}/auth/v1/user`, { headers: { apikey: publishableKey(), Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new HttpError(401, 'Sessione scaduta: accedi di nuovo e riprova.');
  const user = await res.json();
  return { id: user.id, email: user.email, token };
}

// my_access() of that user (trial, prices, current subscription, codes).
export async function accessOf(user) {
  const res = await fetch(`${supabaseUrl()}/rest/v1/rpc/my_access`, {
    method: 'POST',
    headers: { apikey: publishableKey(), Authorization: `Bearer ${user.token}`, 'content-type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    console.error('my_access', res.status, await res.text().catch(() => ''));
    throw new HttpError(503, 'Manca la parte Abbonamenti su Supabase (script supabase/abbonamenti.sql).');
  }
  return res.json();
}

// The "subscriptions" table, with the service_role key (only here, on the server).
async function service(method, path, body, prefer) {
  const res = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,
      'content-type': 'application/json', ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    console.error('Supabase', method, path, res.status, await res.text().catch(() => ''));
    throw new HttpError(500, 'Non riesco a salvare l\'abbonamento. Riprova tra poco.');
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

export async function subscriptionRow(filter) {
  const rows = await service('GET', `subscriptions?select=*&${filter}&limit=1`);
  return rows?.[0] || null;
}

export async function saveSubscriptionRow(row) {
  await service('POST', 'subscriptions?on_conflict=user_id', { ...row, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');
}

// The address of the app that called (where Stripe sends the user back).
export function appOrigin(request) {
  return env('APP_URL').replace(/\/$/, '') || new URL(request.url).origin;
}
