// Google Drive as archive storage: every student keeps the files in their own Drive
// (folder "Student Hub/<materia>/<argomento>"), so the space is theirs (15 GB free).
//
// Uses Google Identity Services in the browser with the "drive.file" permission: the app can
// see and change only the files it created itself, nothing else in the student's Drive.

// OAuth client ID (public, like the Supabase publishable key). Created in Google Cloud Console,
// see GUIDA_GOOGLE_DRIVE.md. Can be overridden with VITE_GOOGLE_CLIENT_ID.
const DEFAULT_GOOGLE_CLIENT_ID = '';
const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || DEFAULT_GOOGLE_CLIENT_ID;

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ROOT_FOLDER = 'Student Hub';
const TOKEN_KEY = 'studenthub_drive_token';

export const DRIVE_MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
export const driveConfigured = !!CLIENT_ID;

interface Token { value: string; expires: number }

interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken: (o?: { prompt?: string }) => void; callback: (r: TokenResponse) => void }
interface GoogleOAuth2 {
  initTokenClient: (o: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type?: string; message?: string }) => void }) => TokenClient;
  revoke: (token: string, done?: () => void) => void;
}
declare global {
  interface Window { google?: { accounts?: { oauth2?: GoogleOAuth2 } } }
}

export class DriveNotConnectedError extends Error {
  constructor() {
    super('Google Drive non è collegato su questo dispositivo: aprilo nell\'Archivio e premi "Collega Google Drive".');
  }
}

// ---- Access token (kept for the browser session, ~1 hour) ----

let token: Token | null = (() => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null') as Token | null;
    return saved && saved.expires > Date.now() ? saved : null;
  } catch {
    return null;
  }
})();

function storeToken(value: Token | null) {
  token = value;
  try {
    if (value) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

export function hasDriveToken(): boolean {
  return !!token && token.expires - 60_000 > Date.now();
}

let gisPromise: Promise<GoogleOAuth2> | null = null;

// Loads the Google sign-in library. Called in advance when the archive opens, so that the
// permission window can open straight from the click (browsers block late pop-ups).
export function loadGoogleIdentity(): Promise<GoogleOAuth2> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => (window.google?.accounts?.oauth2 ? resolve(window.google.accounts.oauth2) : reject(new Error('Google non disponibile')));
      script.onerror = () => { gisPromise = null; reject(new Error('Impossibile contattare Google. Controlla la connessione.')); };
      document.head.appendChild(script);
    });
  }
  return gisPromise;
}

let tokenClient: TokenClient | null = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

function requestToken(oauth: GoogleOAuth2, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = oauth.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: r => {
          const p = pending; pending = null;
          if (!p) return;
          if (r.error || !r.access_token) {
            p.reject(new Error(r.error === 'access_denied' ? 'Accesso a Google Drive non concesso.' : r.error_description || r.error || 'Accesso a Google Drive non riuscito.'));
            return;
          }
          storeToken({ value: r.access_token, expires: Date.now() + (r.expires_in || 3600) * 1000 });
          p.resolve(r.access_token);
        },
        error_callback: e => {
          const p = pending; pending = null;
          p?.reject(new Error(e.type === 'popup_closed' ? 'Finestra di Google chiusa prima di finire.' : e.type === 'popup_failed_to_open' ? 'Il browser ha bloccato la finestra di Google: consenti i pop-up per questo sito e riprova.' : e.message || 'Accesso a Google Drive non riuscito.'));
        },
      });
    }
    pending?.reject(new Error('Richiesta sostituita'));
    pending = { resolve, reject };
    tokenClient.requestAccessToken({ prompt });
  });
}

// Returns a valid token, asking Google for one if needed. Call it directly in a click handler.
export function ensureDriveToken(): Promise<string> {
  if (!driveConfigured) return Promise.reject(new Error('Google Drive non è ancora configurato in questa app.'));
  if (hasDriveToken()) return Promise.resolve(token!.value);
  const oauth = window.google?.accounts?.oauth2;
  if (oauth) return requestToken(oauth, '');
  return loadGoogleIdentity().then(o => requestToken(o, ''));
}

export function disconnectDrive(): void {
  const current = token?.value;
  storeToken(null);
  folderCache.clear();
  if (current) window.google?.accounts?.oauth2?.revoke(current);
}

// ---- Drive API ----

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!hasDriveToken()) throw new DriveNotConnectedError();
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token!.value}` } });
  if (res.status === 401) {
    storeToken(null);
    throw new DriveNotConnectedError();
  }
  if (!res.ok) {
    let message = `Errore di Google Drive (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error?.message) message = body.error.message;
      if (res.status === 403 && /quota|storage/i.test(message)) message = 'Il tuo Google Drive è pieno: libera spazio e riprova.';
    } catch { /* ignore */ }
    throw new Error(message);
  }
  return res;
}

const folderCache = new Map<string, string>();

function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function ensureFolder(name: string, parent: string | null): Promise<string> {
  const key = `${parent || 'root'}/${name.toLowerCase()}`;
  const cached = folderCache.get(key);
  if (cached) return cached;
  const q = [`mimeType='${FOLDER_MIME}'`, `name='${escapeQuery(name)}'`, 'trashed=false', parent ? `'${parent}' in parents` : `'root' in parents`].join(' and ');
  const found = await (await driveFetch(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`)).json();
  let id: string | undefined = found.files?.[0]?.id;
  if (!id) {
    const created = await (await driveFetch(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}) }),
    })).json();
    id = created.id as string;
  }
  folderCache.set(key, id);
  return id;
}

export interface DriveFileRef { id: string; webViewLink?: string }

// Uploads into "Student Hub/<subject>/<topic>" (resumable upload: works for big files too).
export async function uploadToDrive(file: File, subject: string, topic: string): Promise<DriveFileRef> {
  const root = await ensureFolder(ROOT_FOLDER, null);
  const subjectFolder = await ensureFolder(subject || 'Altro', root);
  const topicFolder = await ensureFolder(topic || 'Generale', subjectFolder);
  const type = file.type || 'application/octet-stream';
  const start = await driveFetch(`${UPLOAD_API}/files?uploadType=resumable&fields=id,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type },
    body: JSON.stringify({ name: file.name, parents: [topicFolder] }),
  });
  const location = start.headers.get('Location');
  if (!location) throw new Error('Google Drive non ha accettato il caricamento.');
  const done = await driveFetch(location, { method: 'PUT', headers: { 'Content-Type': type }, body: file });
  const body = await done.json();
  return { id: body.id, webViewLink: body.webViewLink };
}

export async function downloadFromDrive(id: string): Promise<Blob> {
  return (await driveFetch(`${API}/files/${encodeURIComponent(id)}?alt=media`)).blob();
}

// Moved to the Drive bin (recoverable for 30 days) rather than deleted for good.
export async function trashOnDrive(id: string): Promise<void> {
  await driveFetch(`${API}/files/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
}

export interface DriveInfo { email: string; used: number; limit: number | null }

export async function driveInfo(): Promise<DriveInfo> {
  const body = await (await driveFetch(`${API}/about?fields=user(emailAddress),storageQuota(limit,usage)`)).json();
  return {
    email: body.user?.emailAddress || '',
    used: Number(body.storageQuota?.usage || 0),
    limit: body.storageQuota?.limit ? Number(body.storageQuota.limit) : null,
  };
}

export function driveViewUrl(ref: DriveFileRef): string {
  return ref.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(ref.id)}/view`;
}
