// What the student types once is remembered on every device: AI keys, chosen AI and models,
// "Leggi le risposte", where the archive saves the files… They are kept in this browser (where the
// app reads them) and in the account (user_data, readable only by its owner), so another phone or
// computer gets them as soon as the student logs in.

const EXACT = [
  'gemini_api_key', 'studenthub_groq_key', 'studenthub_claude_key', 'studenthub_openrouter_key', 'studenthub_openai_key',
  'studenthub_ai_provider', 'studenthub_claude_model', 'studenthub_openrouter_model', 'studenthub_openai_model',
  'mynd_tutor_read',
];
const PREFIXES = ['studenthub_archive_storage_'];

export const isSyncedPref = (key: string) => EXACT.includes(key) || PREFIXES.some(p => key.startsWith(p));

// Set by the app while someone is logged in: sends a changed value to the account.
let pushToAccount: ((key: string, value: string) => void) | null = null;
export function setPrefsPusher(fn: ((key: string, value: string) => void) | null) { pushToAccount = fn; }

// Saves a value in this browser and, if it is one to remember everywhere, in the account ('' = removed).
export function savePref(key: string, value: string) {
  try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* private mode */ }
  if (isSyncedPref(key)) pushToAccount?.(key, value);
}

function localSyncedKeys(): string[] {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && isSyncedPref(k)) keys.push(k); }
    return keys;
  } catch { return []; }
}

// The account's values go into this browser (the account wins); values only in this browser
// (saved before this existed) are returned, to be added to the account.
export function applyAccountPrefs(account: Record<string, string> | undefined): Record<string, string> {
  const cloud = account || {};
  let changed = false;
  try {
    for (const [k, v] of Object.entries(cloud)) {
      if (!isSyncedPref(k)) continue;
      const local = localStorage.getItem(k) || '';
      if (local === (v || '')) continue;
      if (v) localStorage.setItem(k, v); else localStorage.removeItem(k);
      changed = true;
    }
  } catch { /* private mode */ }
  const missing: Record<string, string> = {};
  for (const k of localSyncedKeys()) {
    if (k in cloud) continue;
    try { const v = localStorage.getItem(k); if (v) missing[k] = v; } catch { /* ignore */ }
  }
  if (changed) window.dispatchEvent(new Event('mynd-prefs'));
  return missing;
}

// Logging out: the keys stay in the account, not on this device (the next person can't use them).
export function clearLocalPrefs() {
  for (const k of localSyncedKeys()) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  window.dispatchEvent(new Event('mynd-prefs'));
}
