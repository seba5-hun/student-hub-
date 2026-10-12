// Login with the official "Sign in with Google" button (Google Identity Services). Google's window
// then says "Continua su myndspace.world" with the MYND name, instead of the address of the
// login server (…supabase.co) shown by the redirect login. Google gives an ID token that Supabase
// checks and turns into the MYND session.

import { GOOGLE_CLIENT_ID, GoogleIdApi, loadGoogleIdentity } from './googleDrive';

export async function loadGoogleSignIn(): Promise<GoogleIdApi> {
  await loadGoogleIdentity();
  const id = window.google?.accounts?.id;
  if (!id) throw new Error('Google non disponibile');
  return id;
}

export const googleClientId = GOOGLE_CLIENT_ID;

// A one-time value: Google puts its hash in the token, Supabase checks it against the original,
// so a token can't be reused by someone else.
export async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const raw = btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hashed = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return { raw, hashed };
}

// The home-screen app on iPhone opens Google's window badly: there the redirect login is used.
export function isStandaloneApp(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
