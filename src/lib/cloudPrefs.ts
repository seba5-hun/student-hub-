// What the student types once is remembered on every device: AI keys, chosen AI and models,
// "Leggi le risposte", where the archive saves the files… They are kept in this browser (where the
// app reads them) and in the account (user_data, readable only by its owner), so another phone or
// computer gets them as soon as the student logs in.
//
// Every value has the time it was typed: between this browser and the account the newest wins, so
// an old key on one device can never replace the one just typed on another. Values saved before
// times existed count as "old" and never replace anything already there.

const EXACT = [
  'gemini_api_key', 'studenthub_groq_key', 'studenthub_claude_key', 'studenthub_openrouter_key', 'studenthub_openai_key',
  'studenthub_ai_provider', 'studenthub_claude_model', 'studenthub_openrouter_model', 'studenthub_openai_model',
  'mynd_tutor_read',
];
const PREFIXES = ['studenthub_archive_storage_'];
const TIMES = 'mynd_prefs_at';      // when each value was typed in this browser
const OWNER = 'mynd_prefs_owner';   // whose values these are (another account on the same device must not get them)

export const isSyncedPref = (key: string) => EXACT.includes(key) || PREFIXES.some(p => key.startsWith(p));

export interface AccountPrefs { values: Record<string, string>; times: Record<string, number> }

function localTimes(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(TIMES) || '{}'); } catch { return {}; }
}
function setLocalTime(key: string, t: number) {
  try { localStorage.setItem(TIMES, JSON.stringify({ ...localTimes(), [key]: t })); } catch { /* private mode */ }
}
function localSyncedKeys(): string[] {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && isSyncedPref(k)) keys.push(k); }
    return keys;
  } catch { return []; }
}
const readLocal = (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const writeLocal = (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* private mode */ } };

// Set by the app while someone is logged in: sends a changed value to the account.
let pushToAccount: ((key: string, value: string, at: number) => void) | null = null;
export function setPrefsPusher(fn: ((key: string, value: string, at: number) => void) | null) { pushToAccount = fn; }

// Saves a value typed now, in this browser and, if it is one to remember everywhere, in the account ('' = removed).
export function savePref(key: string, value: string) {
  writeLocal(key, value);
  if (!isSyncedPref(key)) return;
  const at = Date.now();
  setLocalTime(key, at);
  pushToAccount?.(key, value, at);
}

// Brings this browser and the account together for `userId`: the newest value of each key wins.
// Returns what the account is missing or has older, to be saved there.
export function syncWithAccount(userId: string, account: AccountPrefs): AccountPrefs {
  // Values left by another account on this device are not this student's.
  if (readLocal(OWNER) !== userId) {
    if (readLocal(OWNER)) { for (const k of localSyncedKeys()) writeLocal(k, ''); try { localStorage.removeItem(TIMES); } catch { /* ignore */ } }
    try { localStorage.setItem(OWNER, userId); } catch { /* ignore */ }
  }
  const times = localTimes();
  const up: AccountPrefs = { values: {}, times: {} };
  let changed = false;
  const keys = new Set([...Object.keys(account.values), ...localSyncedKeys()].filter(isSyncedPref));
  for (const k of keys) {
    const cloud = account.values[k], local = readLocal(k);
    const cloudAt = account.times[k] || 0, localAt = times[k] || 0;
    if (cloud === undefined) {                       // only here: goes up to the account
      if (local) { up.values[k] = local; up.times[k] = localAt; }
    } else if (cloudAt > localAt) {                  // typed later on another device
      if (local !== cloud) { writeLocal(k, cloud); changed = true; }
      setLocalTime(k, cloudAt);
    } else if (localAt > cloudAt) {                  // typed later here
      if (local !== cloud) { up.values[k] = local; up.times[k] = localAt; }
    } else if (!local && cloud) {                    // same age: fill what is missing, never replace
      writeLocal(k, cloud); changed = true;
    }
  }
  if (changed) window.dispatchEvent(new Event('mynd-prefs'));
  return up;
}

// The account was deleted: its values go away from this device too.
export function forgetLocalPrefs() {
  for (const k of localSyncedKeys()) writeLocal(k, '');
  try { localStorage.removeItem(TIMES); localStorage.removeItem(OWNER); } catch { /* ignore */ }
  window.dispatchEvent(new Event('mynd-prefs'));
}
