import React, { useEffect, useRef, useState } from 'react';
import { AuthUser, matchesLegacyAccount } from '../lib/store';
import { supabase, authErrorMessage, googleLoginEnabled } from '../lib/supabase';
import { LEGAL_VERSION } from '../lib/legal';
import { loadGoogleSignIn, makeNonce, googleClientId, isStandaloneApp } from '../lib/googleSignIn';
import { track } from '../lib/analytics';
import { Loader2, Check, AlertCircle, Eye } from 'lucide-react';

interface AuthProps {
  onLogin: (user: AuthUser) => void;
  initialError?: string;
  // "Dai un'occhiata": opens the app with example data, without an account.
  onDemo?: () => void;
  startMode?: 'register';
}

// The app returns here after the links in confirmation and reset emails.
const redirectTo = () => `${window.location.origin}${window.location.pathname}`;
const SEEN_KEY = 'mynd_seen_welcome';
const seenBefore = () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ } };

type Mode = 'welcome' | 'login' | 'register' | 'reset' | 'verify';

// 0-4 segments: length, letters of both cases, digits, symbols (or a long password).
function passwordScore(p: string): number {
  if (p.length < 8) return Math.min(1, p.length > 0 ? 1 : 0);
  let s = 1;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p) || p.length >= 12) s++;
  return Math.min(4, s);
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Indietro"
      className="w-11 h-11 rounded-full glass-card !rounded-full flex items-center justify-center text-lg transition-transform duration-150 active:scale-95">
      ←
    </button>
  );
}

// The "manifesto" screen: huge title with the final dot, fields on the background, one lime button at the bottom.
export function ManifestoScreen({ children, footer, back, glow = 'left' }: {
  children: React.ReactNode; footer: React.ReactNode; back?: () => void; glow?: 'left' | 'right' | 'none';
}) {
  return (
    <div className="min-h-[100dvh] relative overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {glow !== 'none' && (
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{ background: glow === 'left' ? 'radial-gradient(60% 30% at 0% 40%, rgba(200,242,90,.08), transparent 70%)' : 'radial-gradient(60% 30% at 100% 20%, rgba(200,242,90,.08), transparent 70%)' }} />
      )}
      <div className="relative mx-auto max-w-[440px] min-h-[100dvh] flex flex-col px-7"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)', paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}>
        <div className="h-[46px] mt-[46px] -ml-2">{back && <BackButton onClick={back} />}</div>
        <div className="flex-1 pt-[44px] pb-8">{children}</div>
        <div className="sticky bottom-0 pb-10 pt-4 -mx-2 px-2" style={{ background: 'linear-gradient(to top, var(--bg) 70%, transparent)' }}>{footer}</div>
      </div>
    </div>
  );
}

export function PrimaryButton({ children, disabled, loading, arrow, type = 'submit', onClick }: {
  children: React.ReactNode; disabled?: boolean; loading?: boolean; arrow?: boolean; type?: 'submit' | 'button'; onClick?: () => void;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      className={`btn-primary w-full h-14 !rounded-full text-[17px] flex items-center ${arrow ? 'justify-between !pl-6 !pr-2' : 'justify-center'} disabled:opacity-40 disabled:cursor-not-allowed`}>
      {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (
        <>
          <span>{children}</span>
          {arrow && <span className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ background: '#0A0B0C', color: '#C8F25A' }}>→</span>}
        </>
      )}
    </button>
  );
}

// "Slide to start": the dark knob is dragged to the right end of the lime bar. Until the user
// touches it, the knob glides to the middle and back to show the gesture. Keyboard: Enter/→.
const KNOB = 44;
const PAD = 6;
export function SwipeToStart({ label, onComplete }: { label: string; onComplete: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [travel, setTravel] = useState(0);
  const [x, setX] = useState(0);
  const xRef = useRef(0);
  const drag = useRef<{ px: number; x: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setTravel(Math.max(0, el.clientWidth - KNOB - 2 * PAD));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const move = (v: number) => { xRef.current = v; setX(v); };
  const finish = () => {
    if (done) return;
    setTouched(true);
    setDone(true);
    move(travel);
    window.setTimeout(onComplete, 260);
  };
  const release = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(false);
    if (travel > 0 && xRef.current >= travel * 0.8) finish();
    else if (!d.moved) { move(travel * 0.35); window.setTimeout(() => move(0), 260); } // a tap: show the way
    else move(0);
  };
  const progress = travel > 0 ? x / travel : 0;

  return (
    <div ref={trackRef} className="relative w-full h-14 rounded-full select-none overflow-hidden"
      style={{ background: 'var(--btn-primary)', boxShadow: 'var(--btn-primary-shadow)', border: '1px solid rgba(255,255,255,.5)', ['--travel' as string]: `${travel}px` }}>
      <span className="absolute inset-0 flex items-center justify-center gap-2 text-[17px] font-semibold pointer-events-none"
        style={{ color: 'var(--on-brand)', paddingLeft: KNOB, opacity: Math.max(0, 1 - progress * 1.6), transition: dragging ? 'none' : 'opacity 250ms' }}>
        {label}<span aria-hidden className="tracking-[-0.2em] opacity-50">›››</span>
      </span>
      <button type="button" aria-label={label}
        className={`absolute rounded-full flex items-center justify-center text-lg cursor-grab active:cursor-grabbing ${!touched && travel > 0 ? 'swipe-hint' : ''}`}
        style={{
          top: PAD - 1, left: PAD - 1, width: KNOB, height: KNOB, background: '#0A0B0C', color: '#C8F25A', touchAction: 'none',
          transform: touched ? `translate3d(${x}px,0,0)` : undefined,
          transition: dragging ? 'none' : 'transform 320ms cubic-bezier(.3,1.3,.5,1)',
        }}
        onPointerDown={e => {
          if (done) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { px: e.clientX, x: xRef.current, moved: false };
          setTouched(true);
          setDragging(true);
        }}
        onPointerMove={e => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.px;
          if (Math.abs(dx) > 4) d.moved = true;
          move(Math.min(travel, Math.max(0, d.x + dx)));
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onClick={e => { if (e.detail === 0) finish(); }}
        onKeyDown={e => { if (e.key === 'ArrowRight') { e.preventDefault(); finish(); } }}>
        →
      </button>
    </div>
  );
}

// "Continua con Google": shown only when Google login is switched on in Supabase.
// No password to remember; on the iPhone it uses the Google account already on the phone.
function GoogleButton({ onError, onLogin }: { onError: (msg: string) => void; onLogin: (user: AuthUser) => void }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  // gis: the official Google button (shows "myndspace.world"); redirect: the old button, used when
  // Google's library can't load or in the iPhone home-screen app.
  const [mode, setMode] = useState<'loading' | 'gis' | 'redirect'>('loading');
  const box = useRef<HTMLDivElement>(null);
  // Latest callbacks, read when Google answers (the button is set up once).
  const handlers = useRef({ onError, onLogin });
  handlers.current = { onError, onLogin };
  useEffect(() => { let alive = true; googleLoginEnabled().then(v => { if (alive) setOn(v); }); return () => { alive = false; }; }, []);
  useEffect(() => {
    if (!on || !supabase) return;
    if (isStandaloneApp()) { setMode('redirect'); return; }
    let alive = true;
    const late = window.setTimeout(() => { if (alive) setMode(m => (m === 'loading' ? 'redirect' : m)); }, 6000);
    (async () => {
      try {
        const [id, nonce] = await Promise.all([loadGoogleSignIn(), makeNonce()]);
        if (!alive || !box.current) return;
        id.initialize({
          client_id: googleClientId,
          nonce: nonce.hashed,
          context: 'signin',
          ux_mode: 'popup',
          itp_support: true,
          use_fedcm_for_button: true,
          callback: async r => {
            if (!r.credential) return;
            setBusy(true);
            const { data, error } = await supabase!.auth.signInWithIdToken({ provider: 'google', token: r.credential, nonce: nonce.raw });
            if (error || !data.user) { handlers.current.onError(authErrorMessage(error || new Error('Accesso con Google non riuscito.'))); setBusy(false); return; }
            handlers.current.onLogin({ id: data.user.id, email: data.user.email || '' });
          },
        });
        id.renderButton(box.current, {
          type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with',
          logo_alignment: 'center', locale: 'it', width: Math.min(400, Math.max(220, box.current.offsetWidth)),
        });
        if (alive) setMode('gis');
      } catch {
        if (alive) setMode('redirect');
      }
    })();
    return () => { alive = false; window.clearTimeout(late); };
  }, [on]);
  if (!on || !supabase) return null;
  const go = async () => {
    setBusy(true);
    const { error } = await supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
    if (error) { onError(authErrorMessage(error)); setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-5">
      {mode !== 'redirect' && (
        <div className="relative min-h-[44px] flex justify-center">
          <div ref={box} className={`w-full flex justify-center transition-opacity ${mode === 'gis' && !busy ? 'opacity-100' : 'opacity-0'}`} />
          {(mode === 'loading' || busy) && (
            <div className="absolute inset-0 rounded-full flex items-center justify-center gap-2 text-sm" style={{ background: '#fff', color: '#1F1F1F' }}>
              <Loader2 className="w-4 h-4 animate-spin" /> {busy ? 'Accesso in corso…' : 'Continua con Google'}
            </div>
          )}
        </div>
      )}
      {mode === 'redirect' && (
        <button type="button" onClick={go} disabled={busy}
          className="w-full h-14 rounded-full flex items-center justify-center gap-3 text-[16px] font-semibold disabled:opacity-60"
          style={{ background: '#fff', color: '#1F1F1F', border: '1px solid rgba(0,0,0,.12)' }}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : (
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
          )}
          Continua con Google
        </button>
      )}
      {/* Google creates the account in one tap: the acceptance is written under the button. */}
      <p className="text-xs -mt-3 text-center leading-snug" style={{ color: 'var(--text-subtle)' }}>
        Continuando con Google accetti i <a href="/termini.html" target="_blank" rel="noopener" className="underline">Termini</a> e dichiari di aver letto
        l'<a href="/privacy.html" target="_blank" rel="noopener" className="underline">informativa privacy</a>.
      </p>
      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.12em]" style={{ color: 'var(--text-subtle)' }}>
        <span className="flex-1 h-px" style={{ background: 'var(--border)' }} />oppure<span className="flex-1 h-px" style={{ background: 'var(--border)' }} />
      </div>
    </div>
  );
}

export function Field({ label, type = 'text', value, onChange, autoComplete, autoFocus, toggle }: {
  label: string; type?: string; value: string; onChange: (v: string) => void; autoComplete?: string; autoFocus?: boolean; toggle?: boolean;
}) {
  const [show, setShow] = useState(false);
  const id = `f-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="field-line">
      <label htmlFor={id}>{label}</label>
      <div className="flex items-center gap-3">
        <input id={id} type={toggle ? (show ? 'text' : 'password') : type} value={value} onChange={e => onChange(e.target.value)}
          name={autoComplete === 'username' || autoComplete === 'email' ? 'email' : autoComplete?.includes('password') ? 'password' : undefined}
          autoComplete={autoComplete} autoFocus={autoFocus} required
          style={toggle && !show && value ? { letterSpacing: '0.2em' } : undefined} />
        {toggle && (
          <button type="button" onClick={() => setShow(s => !s)} className="text-sm flex-shrink-0 min-h-[44px] px-1" style={{ color: 'var(--text-muted)' }}>
            {show ? 'Nascondi' : 'Mostra'}
          </button>
        )}
      </div>
    </div>
  );
}

// The 6 digits of the email code: one real input (paste and iPhone's "from Mail" suggestion work)
// drawn as six boxes.
function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <div className="grid grid-cols-6 gap-2" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => {
          const current = focused && (i === value.length || (i === 5 && value.length >= 6));
          return (
            <span key={i} className="h-16 rounded-2xl flex items-center justify-center text-[28px] font-semibold tabular transition-colors"
              style={{ background: 'var(--glass-well)', boxShadow: current ? 'inset 0 0 0 2px var(--brand-ring)' : 'inset 0 0 0 1px var(--border)', color: 'var(--text)' }}>
              {value[i] || ''}
            </span>
          );
        })}
      </div>
      <input ref={ref} value={value} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} aria-label="Codice di verifica di 6 cifre"
        className="absolute inset-0 w-full h-full opacity-0 cursor-text" />
    </div>
  );
}

export function Notice({ kind, title, text }: { kind: 'ok' | 'error'; title: string; text?: string }) {
  return (
    <div className="glass-float rounded-[28px] p-5 flex gap-3.5 items-start animate-scale-in" role={kind === 'error' ? 'alert' : 'status'}>
      <span className="w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center"
        style={{ background: kind === 'ok' ? 'rgba(200,242,90,.14)' : 'rgba(232,104,91,.14)', color: kind === 'ok' ? 'var(--brand)' : 'var(--danger)' }}>
        {kind === 'ok' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-base font-semibold">{title}</span>
        {text && <span className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{text}</span>}
      </div>
    </div>
  );
}

const WORDS: [string, string][] = [['M', 'ake'], ['Y', 'our'], ['N', 'ext'], ['D', 'ecision.']];

export default function Auth({ onLogin, initialError = '', onDemo, startMode }: AuthProps) {
  const [mode, setModeState] = useState<Mode>(() => (startMode || (initialError || seenBefore() ? 'login' : 'welcome')));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState(initialError);
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  // Email check: the 6-digit code sent after sign-up (or when an unverified account tries to log in).
  const [code, setCode] = useState('');
  const [newsletter, setNewsletter] = useState(false);
  const [verifyFrom, setVerifyFrom] = useState<'register' | 'login'>('register');

  const setMode = (m: Mode) => { setModeState(m); setError(''); setSuccess(''); if (m !== 'welcome') markSeen(); };

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [resendIn]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error && /email not confirmed/i.test(error.message)) {
        // The account exists but the email was never verified: a new code, and the code screen.
        openVerify('login');
        await sendCode(true);
        setSuccess('Il tuo account non è ancora verificato: ti abbiamo mandato un nuovo codice.');
        return;
      }
      if (error) {
        if (/invalid login credentials/i.test(error.message) && matchesLegacyAccount(email, password)) {
          await migrateLegacyAccount();
          return;
        }
        throw error;
      }
      onLogin({ id: data.user.id, email: data.user.email || email.trim() });
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Accounts of the old version existed only in this browser: create them on Supabase with the
  // same email and password. The local data is uploaded on the first login (see App.loadUser).
  const migrateLegacyAccount = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: redirectTo() },
    });
    if (error) throw error;
    if (data.session && data.user) {
      onLogin({ id: data.user.id, email: data.user.email || email.trim() });
    } else if (data.user && data.user.identities?.length === 0) {
      setError('Esiste già un account online con questa email, ma con un\'altra password. Usa "Password dimenticata?".');
    } else {
      openVerify();
      setSuccess('Abbiamo trasferito il tuo account online! Inserisci il codice che ti abbiamo mandato via email: i tuoi dati verranno caricati al primo accesso.');
    }
  };

  const score = passwordScore(password);
  const canRegister = !!name.trim() && /\S+@\S+\.\S+/.test(email.trim()) && password.length >= 8 && privacy;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !canRegister) return;
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        // Terms/Privacy accepted with the checkbox: kept with the account as proof of consent.
        options: {
          emailRedirectTo: redirectTo(),
          data: {
            name: name.trim(), legal_version: LEGAL_VERSION, legal_at: new Date().toISOString(), adult14: true,
            // Newsletter: only with the separate, optional box (consent, GDPR art. 6.1.a).
            newsletter, ...(newsletter ? { newsletter_at: new Date().toISOString() } : {}),
          },
        },
      });
      if (error) throw error;
      if (data.user && data.user.identities?.length !== 0) track('signup', 'accesso');
      try { localStorage.setItem('mynd_name', name.trim()); } catch { /* ignore */ }
      if (data.session && data.user) {
        onLogin({ id: data.user.id, email: data.user.email || email.trim() });
      } else if (data.user && data.user.identities?.length === 0) {
        // Supabase answers this way when the email is already registered.
        setError('Esiste già un account con questa email. Accedi o recupera la password.');
      } else {
        // Email confirmation is on: the code screen (the email also has a link, as a fallback).
        openVerify();
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const openVerify = (from: 'register' | 'login' = 'register') => { setVerifyFrom(from); setModeState('verify'); setError(''); setSuccess(''); setCode(''); setResendIn(60); };

  // A new code. Supabase allows one every ~60 seconds: its answer says how long to wait.
  const sendCode = async (quiet = false) => {
    if (!supabase || (!quiet && resendIn > 0)) return;
    setError('');
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: redirectTo() } });
    if (error) {
      const wait = /after (\d+) second/i.exec(error.message);
      if (wait) { setResendIn(Number(wait[1])); return; }
      setError(authErrorMessage(error));
      return;
    }
    setResendIn(60);
    if (!quiet) setSuccess('Nuovo codice inviato. Controlla la posta (anche lo spam).');
  };

  const verifyCode = async (token = code) => {
    if (!supabase || token.length < 6) return;
    setLoading(true); setError(''); setSuccess('');
    try {
      let result = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'signup' });
      if (result.error && !/expired|invalid/i.test(result.error.message)) result = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
      if (result.error) throw result.error;
      const user = result.data.user || result.data.session?.user;
      if (!user) throw new Error('Codice non valido.');
      onLogin({ id: user.id, email: user.email || email.trim() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(/expired|invalid|otp/i.test(msg) ? 'Il codice è sbagliato o scaduto. Controlla l\'ultima email ricevuta o chiedine uno nuovo.' : authErrorMessage(err));
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!supabase || resendIn > 0) return;
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() });
      if (error) throw error;
      setSuccess('sent');
      setResendIn(60);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const privacyLink = <a href="/privacy.html" target="_blank" rel="noopener" className="underline" style={{ color: 'var(--text)' }}>informativa sulla privacy</a>;
  const termsLink = <a href="/termini.html" target="_blank" rel="noopener" className="underline" style={{ color: 'var(--text)' }}>Termini e condizioni</a>;
  const errorBox = error ? <Notice kind="error" title="Qualcosa non va." text={error} /> : null;

  if (mode === 'welcome') {
    return (
      <ManifestoScreen glow="left" footer={
        <div className="flex flex-col gap-3">
          <SwipeToStart label="Scorri per iniziare" onComplete={() => setMode('register')} />
          <button type="button" onClick={() => setMode('login')} className="h-12 text-base">Ho già un account</button>
          {onDemo && (
            <button type="button" onClick={onDemo} className="h-11 -mt-2 text-[15px] font-medium inline-flex items-center justify-center gap-2" style={{ color: 'var(--brand-ring)' }}>
              <Eye className="w-4 h-4" /> Dai un'occhiata, senza account
            </button>
          )}
          <p className="text-xs text-center" style={{ color: 'var(--text-subtle)' }}>
            <a href="/info.html" className="underline">Cos'è MYND</a> · <a href="/privacy.html" className="underline">Privacy</a> · <a href="/termini.html" className="underline">Termini</a> · <a href="/cookie.html" className="underline">Cookie</a> · <a href="/note-legali.html" className="underline">Note legali</a>
          </p>
        </div>
      }>
        <h1 className="flex flex-col font-bold" style={{ fontSize: 'clamp(52px, 17vw, 68px)', letterSpacing: '-0.05em', lineHeight: 0.98 }} aria-label="Make Your Next Decision.">
          {WORDS.map(([first, rest], i) => (
            <span key={first} className="mynd-word" style={{ animationDelay: `${i * 80}ms` }} aria-hidden>
              {first === 'Y' ? <span className="mynd-ignite" style={{ color: 'var(--logo-y)' }}>Y</span> : first}
              <span style={{ color: '#3A3F45' }}>{rest}</span>
            </span>
          ))}
        </h1>
        <p className="mt-10 text-[17px] leading-relaxed max-w-[330px]" style={{ color: 'var(--text-muted)' }}>
          Studio, sport, sonno e progetti in un unico sistema che ti dice sempre cosa fare adesso.
        </p>
      </ManifestoScreen>
    );
  }

  if (mode === 'login') {
    return (
      <form onSubmit={handleLogin}>
        <ManifestoScreen back={() => setMode('welcome')} glow="none" footer={
          <div className="flex flex-col gap-3.5 items-center">
            <PrimaryButton loading={loading}>Accedi</PrimaryButton>
            {onDemo && (
              <button type="button" onClick={onDemo} className="text-sm font-medium inline-flex items-center gap-1.5" style={{ color: 'var(--brand-ring)' }}>
                <Eye className="w-4 h-4" /> Dai un'occhiata senza account
              </button>
            )}
            <a href="/privacy.html" target="_blank" rel="noopener" className="text-xs" style={{ color: 'var(--text-subtle)' }}>Informativa sulla privacy</a>
          </div>
        }>
          <div className="flex flex-col gap-10">
            <div className="flex flex-col gap-2">
              <h1 className="text-[44px] font-bold leading-none" style={{ letterSpacing: '-0.045em' }}>Accedi.</h1>
              <p className="text-base" style={{ color: 'var(--text-muted)' }}>La prossima decisione è qui.</p>
            </div>
            <div className="flex flex-col gap-7">
              <GoogleButton onError={setError} onLogin={onLogin} />
              <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="username" />
              <Field label="Password" value={password} onChange={setPassword} autoComplete="current-password" toggle />
              <div className="flex justify-between items-center">
                <button type="button" onClick={() => setMode('reset')} className="text-[15px] min-h-[44px]">Password dimenticata?</button>
                <button type="button" onClick={() => setMode('register')} className="text-[15px] min-h-[44px]" style={{ color: 'var(--text-muted)' }}>Crea account</button>
              </div>
            </div>
            {errorBox}
            {success && <Notice kind="ok" title="Fatto." text={success} />}
          </div>
        </ManifestoScreen>
      </form>
    );
  }

  if (mode === 'register') {
    return (
      <form onSubmit={handleRegister}>
        <ManifestoScreen back={() => setMode('welcome')} glow="none" footer={
          <div className="flex flex-col gap-4">
            <label className="flex gap-3 items-start px-2 cursor-pointer">
              <input type="checkbox" checked={privacy} onChange={e => setPrivacy(e.target.checked)} className="sr-only peer" />
              <span aria-hidden className="w-6 h-6 flex-shrink-0 rounded-[7px] flex items-center justify-center text-sm font-bold transition-colors peer-focus-visible:ring-2"
                style={privacy ? { background: '#C8F25A', color: '#0A0B0C' } : { border: '1.5px solid var(--border)' }}>
                {privacy && '✓'}
              </span>
              <span className="text-sm leading-snug" style={{ color: 'var(--text-muted)' }}>Ho almeno 14 anni (o il consenso di un genitore), accetto i {termsLink} e ho letto l'{privacyLink}.</span>
            </label>
            <label className="flex gap-3 items-start px-2 cursor-pointer">
              <input type="checkbox" checked={newsletter} onChange={e => setNewsletter(e.target.checked)} className="sr-only peer" />
              <span aria-hidden className="w-6 h-6 flex-shrink-0 rounded-[7px] flex items-center justify-center text-sm font-bold transition-colors peer-focus-visible:ring-2"
                style={newsletter ? { background: '#C8F25A', color: '#0A0B0C' } : { border: '1.5px solid var(--border)' }}>
                {newsletter && '✓'}
              </span>
              <span className="text-sm leading-snug" style={{ color: 'var(--text-muted)' }}>Voglio ricevere novità e consigli di studio via email (facoltativo, ti disiscrivi quando vuoi).</span>
            </label>
            <PrimaryButton loading={loading} disabled={!canRegister}>Crea account</PrimaryButton>
          </div>
        }>
          <div className="flex flex-col gap-9">
            <div className="flex flex-col gap-2">
              <h1 className="text-[44px] font-bold leading-none" style={{ letterSpacing: '-0.045em' }}>Inizia da te.</h1>
              <p className="text-base" style={{ color: 'var(--text-muted)' }}>Bastano 30 secondi.</p>
            </div>
            <div className="flex flex-col gap-6">
              <GoogleButton onError={setError} onLogin={onLogin} />
              <Field label="Nome" value={name} onChange={setName} autoComplete="given-name" />
              <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="username" />
              <Field label="Password" value={password} onChange={setPassword} autoComplete="new-password" toggle />
              <div className="flex flex-col gap-2">
                <div className="flex gap-1.5" aria-hidden>
                  {[0, 1, 2, 3].map(i => <span key={i} className="flex-1 h-1 rounded-sm transition-colors duration-150" style={{ background: i < score ? '#C8F25A' : 'var(--border)' }} />)}
                </div>
                <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                  {password.length < 8 ? 'Almeno 8 caratteri' : score >= 3 ? 'Password solida · almeno 8 caratteri ✓' : 'Va bene · aggiungi numeri o simboli per renderla più solida'}
                </span>
              </div>
            </div>
            {errorBox}
          </div>
        </ManifestoScreen>
      </form>
    );
  }

  if (mode === 'verify') {
    const isIOSMail = /iPad|iPhone|iPod/.test(navigator.userAgent);
    return (
      <form onSubmit={e => { e.preventDefault(); verifyCode(); }}>
        <ManifestoScreen back={() => setMode(verifyFrom)} glow="right" footer={
          <div className="flex flex-col gap-3">
            <PrimaryButton loading={loading} disabled={code.length < 6}>Verifica</PrimaryButton>
            <button type="button" onClick={() => sendCode()} disabled={resendIn > 0} className="h-11 text-[15px] tabular disabled:opacity-60" style={{ color: 'var(--text-muted)' }}>
              {resendIn > 0 ? `Non è arrivato? Invia di nuovo tra ${Math.floor(resendIn / 60)}:${String(resendIn % 60).padStart(2, '0')}` : 'Non è arrivato? Invia di nuovo il codice'}
            </button>
          </div>
        }>
          <div className="flex flex-col gap-9">
            <div className="flex flex-col gap-2">
              <h1 className="text-[44px] font-bold leading-none" style={{ letterSpacing: '-0.045em' }}>Controlla la posta.</h1>
              <p className="text-base leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Abbiamo mandato un codice di 6 cifre a <b style={{ color: 'var(--text)' }}>{email.trim()}</b>. Scrivilo qui per verificare la tua email.
              </p>
            </div>
            <CodeInput value={code} onChange={v => { setCode(v); setError(''); if (v.length === 6 && !loading) verifyCode(v); }} />
            <div className="flex flex-col gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              <span>Non trovi l'email? Guarda anche in <b style={{ color: 'var(--text)' }}>Spam</b> o <b style={{ color: 'var(--text)' }}>Promozioni</b>. Il codice vale 1 ora.</span>
              <span>Email sbagliata? <button type="button" onClick={() => setMode('register')} className="underline" style={{ color: 'var(--text)' }}>Correggila</button></span>
              {isIOSMail && <a href="message://" className="underline w-fit" style={{ color: 'var(--text)' }}>Apri l'app Mail</a>}
            </div>
            {success && <Notice kind="ok" title="Fatto." text={success} />}
            {errorBox}
          </div>
        </ManifestoScreen>
      </form>
    );
  }

  // Password recovery
  const sent = success === 'sent';
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return (
    <form onSubmit={handleReset}>
      <ManifestoScreen back={() => setMode('login')} glow="none" footer={
        sent ? (
          <div className="flex flex-col gap-3">
            {isIOS
              ? <a href="message://" className="btn-primary w-full h-14 !rounded-full text-[17px] flex items-center justify-center">Apri la posta</a>
              : <PrimaryButton type="button" onClick={() => setMode('login')}>Torna ad accedere</PrimaryButton>}
            <button type="button" onClick={() => handleReset()} disabled={resendIn > 0} className="h-11 text-[15px] tabular" style={{ color: 'var(--text-muted)' }}>
              {resendIn > 0 ? `Invia di nuovo tra 0:${String(resendIn).padStart(2, '0')}` : 'Invia di nuovo'}
            </button>
          </div>
        ) : <PrimaryButton loading={loading}>Invia il link</PrimaryButton>
      }>
        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-2">
            <h1 className="text-[44px] font-bold leading-none" style={{ letterSpacing: '-0.045em' }}>Nessun problema.</h1>
            <p className="text-base leading-relaxed" style={{ color: 'var(--text-muted)' }}>Scrivi la tua email: ti mandiamo un link per sceglierne una nuova.</p>
          </div>
          <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" autoFocus />
          {sent && <Notice kind="ok" title="Link inviato." text="Se esiste un account con questa email, riceverai il link per sceglierne una nuova. Controlla la posta, anche nello spam." />}
          {errorBox}
        </div>
      </ManifestoScreen>
    </form>
  );
}
