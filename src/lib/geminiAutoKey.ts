// Creates a free Gemini API key in the user's own Google account with one click, so nobody has to
// go to AI Studio and copy a key by hand.
//
// How: Google sign-in in the browser (Google Identity Services) asks for permission to manage the
// user's Google Cloud; then, in their account, the app
//   1. uses (or creates) a project called "MYND AI", without billing, so the key stays on the free tier;
//   2. turns on the Gemini API in it;
//   3. creates (or reuses) a key named "MYND", limited to the Gemini API, and reads it.
// The permission token is never stored (it expires within an hour): the app keeps only the key,
// in this browser.
//
// The Google Cloud project that owns the OAuth client must have Cloud Resource Manager API,
// Service Usage API and API Keys API turned on, and the cloud-platform scope on its consent screen.

import { GOOGLE_CLIENT_ID, loadGoogleIdentity } from './googleDrive';

const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const CRM = 'https://cloudresourcemanager.googleapis.com/v1';
const USAGE = 'https://serviceusage.googleapis.com/v1';
const KEYS = 'https://apikeys.googleapis.com/v2';
const PROJECT_NAME = 'MYND AI';
const KEY_NAME = 'MYND';
const GEMINI_API = 'generativelanguage.googleapis.com';

export type AutoKeyStep = 'permesso' | 'progetto' | 'api' | 'chiave';
export const AUTO_KEY_STEPS: Record<AutoKeyStep, string> = {
  permesso: 'Chiedo il permesso a Google…',
  progetto: 'Preparo il progetto "MYND AI" nel tuo account…',
  api: 'Attivo Gemini nel progetto…',
  chiave: 'Creo la chiave…',
};

interface Operation { name: string; done?: boolean; error?: { message?: string }; response?: Record<string, unknown> }
interface Project { projectId: string; name?: string; lifecycleState?: string }
interface ApiKey { name: string; displayName?: string; deleteTime?: string }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Asks Google for a short access token with the cloud-platform permission. Call it from the click.
function askToken(hint?: string): Promise<string> {
  return loadGoogleIdentity().then(oauth => new Promise<string>((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      hint,
      callback: r => {
        if (r.error || !r.access_token) reject(new Error(r.error === 'access_denied' ? 'Permesso non concesso: senza, non posso creare la chiave.' : r.error_description || r.error || 'Accesso a Google non riuscito.'));
        else resolve(r.access_token);
      },
      error_callback: e => reject(new Error(e.type === 'popup_closed' ? 'Finestra di Google chiusa prima di finire.' : e.type === 'popup_failed_to_open' ? 'Il browser ha bloccato la finestra di Google: consenti i pop-up per questo sito e riprova.' : e.message || 'Accesso a Google non riuscito.')),
    });
    client.requestAccessToken({ prompt: '' });
  }));
}

// Turns Google's English errors into something a person can act on.
function explain(status: number, message: string): string {
  const m = message.toLowerCase();
  if (m.includes('terms of service') || m.includes('tos')) return 'Prima devi accettare i termini di Google Cloud: apri console.cloud.google.com con questo account, accetta, poi riprova.';
  if (m.includes('has not been used in project') || m.includes('is disabled')) return 'Questa funzione non è ancora attiva nella configurazione di MYND su Google. Riprova più tardi o usa il link "Crea la chiave su aistudio.google.com".';
  if (m.includes('quota') && m.includes('project')) return 'Il tuo account Google ha raggiunto il numero massimo di progetti. Eliminane uno su console.cloud.google.com oppure crea la chiave a mano su aistudio.google.com.';
  if (status === 401) return 'Il permesso di Google è scaduto: riprova.';
  return message || `Errore di Google (${status}).`;
}

async function call<T>(token: string, url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!res.ok) {
    const err = new Error(explain(res.status, json.error?.message || '')) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json;
}

// Long jobs (create project, turn on an API, create a key) answer with an operation to poll.
async function wait(token: string, base: string, op: Operation, what: string): Promise<Operation> {
  for (let i = 0; !op.done; i++) {
    if (i >= 40) throw new Error(`Google ci sta mettendo troppo (${what}). Riprova tra un minuto.`);
    await sleep(Math.min(1000 + i * 500, 3000));
    op = await call<Operation>(token, `${base}/${op.name}`);
  }
  if (op.error) throw new Error(op.error.message || `Non riuscito: ${what}.`);
  return op;
}

// A brand-new project needs a few seconds before the other services see it.
async function retry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (err) {
      const status = (err as { status?: number }).status;
      if (i >= 5 || (status !== 403 && status !== 404 && status !== 409)) throw err;
      await sleep(3000);
    }
  }
}

async function findOrCreateProject(token: string): Promise<string> {
  const list = await call<{ projects?: Project[] }>(token, `${CRM}/projects?pageSize=500&filter=${encodeURIComponent('lifecycleState:ACTIVE')}`);
  const found = list.projects?.find(p => p.name === PROJECT_NAME && p.lifecycleState === 'ACTIVE');
  if (found) return found.projectId;
  const projectId = `mynd-ai-${Math.random().toString(36).slice(2, 8)}`;
  const op = await call<Operation>(token, `${CRM}/projects`, { method: 'POST', body: { projectId, name: PROJECT_NAME } });
  await wait(token, CRM, op, 'creazione del progetto');
  return projectId;
}

async function enableGemini(token: string, projectId: string) {
  const op = await retry(() => call<Operation>(token, `${USAGE}/projects/${projectId}/services:batchEnable`, {
    method: 'POST', body: { serviceIds: [GEMINI_API, 'apikeys.googleapis.com'] },
  }));
  await wait(token, USAGE, op, 'attivazione di Gemini');
}

async function findOrCreateKey(token: string, projectId: string): Promise<string> {
  const parent = `${KEYS}/projects/${projectId}/locations/global/keys`;
  const list = await retry(() => call<{ keys?: ApiKey[] }>(token, parent));
  let key = list.keys?.find(k => k.displayName === KEY_NAME && !k.deleteTime);
  if (!key) {
    const op = await retry(() => call<Operation>(token, parent, {
      method: 'POST', body: { displayName: KEY_NAME, restrictions: { apiTargets: [{ service: GEMINI_API }] } },
    }));
    const done = await wait(token, KEYS, op, 'creazione della chiave');
    key = done.response as unknown as ApiKey;
  }
  const { keyString } = await call<{ keyString?: string }>(token, `${KEYS}/${key.name}/keyString`);
  if (!keyString) throw new Error('Google non ha restituito la chiave. Riprova.');
  return keyString;
}

// The whole flow. Start it directly from a click (the Google window must open from the click).
export async function createGeminiKeyWithGoogle(onStep: (s: AutoKeyStep) => void, email?: string): Promise<string> {
  onStep('permesso');
  const token = await askToken(email);
  onStep('progetto');
  const projectId = await findOrCreateProject(token);
  onStep('api');
  await enableGemini(token, projectId);
  onStep('chiave');
  return findOrCreateKey(token, projectId);
}
