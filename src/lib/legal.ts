// Legal side of MYND: version of Terms + Privacy accepted by the user, consent to the usage
// statistics (asked by the banner, kept in this browser) and deletion of the account (GDPR art. 17).
import { supabase } from './supabase';

// Change it when Terms or Privacy change in a way users must accept again.
export const LEGAL_VERSION = '2026-10-19';

export interface LegalAcceptance { version: string; at: string; adult14: boolean }

export const LEGAL_LINKS = [
  { href: '/privacy.html', label: 'Privacy' },
  { href: '/termini.html', label: 'Termini e vendita' },
  { href: '/cookie.html', label: 'Cookie' },
  { href: '/note-legali.html', label: 'Note legali' },
];

// ---- Statistics consent (first-party usage statistics, no advertising) ----
const STATS_KEY = 'mynd_stats_consent';
type StatsChoice = { value: 'yes' | 'no'; at: string };

export function statsConsent(): 'yes' | 'no' | null {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? (JSON.parse(raw) as StatsChoice).value : null;
  } catch { return null; }
}

export function setStatsConsent(value: 'yes' | 'no') {
  try { localStorage.setItem(STATS_KEY, JSON.stringify({ value, at: new Date().toISOString() })); } catch { /* ignore */ }
  window.dispatchEvent(new Event('mynd-consent'));
}

// ---- Terms/Privacy acceptance, also kept with the account (proof of consent) ----
export function acceptedNow(): LegalAcceptance {
  return { version: LEGAL_VERSION, at: new Date().toISOString(), adult14: true };
}

export async function saveAcceptanceToAccount(acceptance: LegalAcceptance): Promise<void> {
  if (!supabase) return;
  await supabase.auth.updateUser({ data: { legal_version: acceptance.version, legal_at: acceptance.at, adult14: acceptance.adult14 } });
}

export async function acceptanceFromAccount(): Promise<LegalAcceptance | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  const meta = data.user?.user_metadata || {};
  return meta.legal_version ? { version: meta.legal_version, at: meta.legal_at, adult14: !!meta.adult14 } : null;
}

// ---- Account deletion: archive files first (Storage API), then the account and its data ----
export async function deleteMyAccount(userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase non configurato');
  const bucket = supabase.storage.from('archive');
  for (let round = 0; round < 50; round++) {
    const { data, error } = await bucket.list(userId, { limit: 1000 });
    if (error || !data?.length) break;
    const paths = data.filter(f => f.name).map(f => `${userId}/${f.name}`);
    if (!paths.length) break;
    const { error: removeError } = await bucket.remove(paths);
    if (removeError) break;
  }
  const { error } = await supabase.rpc('delete_my_account');
  if (error) {
    if (/delete_my_account|PGRST202|function/i.test(error.message)) {
      throw new Error('Manca la funzione di cancellazione su Supabase: esegui lo script supabase/account.sql. Nel frattempo scrivi a flowbase.service@gmail.com e cancelliamo noi l\'account.');
    }
    throw new Error(error.message);
  }
  await supabase.auth.signOut();
}

// ---- Newsletter (optional consent, kept with the account) ----
export async function newsletterStatus(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.getUser();
  return data.user?.user_metadata?.newsletter === true;
}

export async function setNewsletter(value: boolean): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.updateUser({ data: { newsletter: value, newsletter_at: new Date().toISOString() } });
  if (error) throw new Error(error.message);
}

export interface Subscriber { email: string; name: string; subscribed_at: string }

export async function loadNewsletter(): Promise<{ subscribers: Subscriber[]; verifiedUsers: number }> {
  if (!supabase) throw new Error('Supabase non configurato');
  const { data, error } = await supabase.rpc('admin_newsletter');
  if (error) {
    if (/admin_newsletter|PGRST202|function/i.test(error.message)) throw new Error('Manca la parte Newsletter su Supabase: esegui lo script supabase/newsletter.sql (Admin → Guida → Script Supabase).');
    throw new Error(error.message);
  }
  return { subscribers: data.subscribers || [], verifiedUsers: data.verified_users || 0 };
}
