import React, { useEffect, useRef, useState } from 'react';
import { AuthUser, matchesLegacyAccount } from '../lib/store';
import { supabase, authErrorMessage } from '../lib/supabase';
import { track } from '../lib/analytics';
import { Loader2, Check, AlertCircle } from 'lucide-react';

interface AuthProps {
  onLogin: (user: AuthUser) => void;
  initialError?: string;
}

// The app returns here after the links in confirmation and reset emails.
const redirectTo = () => `${window.location.origin}${window.location.pathname}`;
const SEEN_KEY = 'mynd_seen_welcome';
const seenBefore = () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ } };

type Mode = 'welcome' | 'login' | 'register' | 'reset';

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

export default function Auth({ onLogin, initialError = '' }: AuthProps) {
  const [mode, setModeState] = useState<Mode>(() => (initialError || seenBefore() ? 'login' : 'welcome'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState(initialError);
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

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
      setPassword('');
      setSuccess('Abbiamo trasferito il tuo account online! Ti abbiamo inviato un\'email: clicca sul link per confermare, poi accedi con la stessa password. I tuoi dati verranno caricati al primo accesso.');
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
        options: { emailRedirectTo: redirectTo(), data: { name: name.trim() } },
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
        setModeState('login');
        setPassword('');
        setSuccess('Account creato! Ti abbiamo inviato un\'email: clicca sul link per confermare, poi accedi.');
      }
    } catch (err) {
      setError(authErrorMessage(err));
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
  const errorBox = error ? <Notice kind="error" title="Qualcosa non va." text={error} /> : null;

  if (mode === 'welcome') {
    return (
      <ManifestoScreen glow="left" footer={
        <div className="flex flex-col gap-3">
          <SwipeToStart label="Scorri per iniziare" onComplete={() => setMode('register')} />
          <button type="button" onClick={() => setMode('login')} className="h-12 text-base">Ho già un account</button>
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
            <a href="/privacy.html" target="_blank" rel="noopener" className="text-xs" style={{ color: 'var(--text-subtle)' }}>Informativa sulla privacy</a>
          </div>
        }>
          <div className="flex flex-col gap-10">
            <div className="flex flex-col gap-2">
              <h1 className="text-[44px] font-bold leading-none" style={{ letterSpacing: '-0.045em' }}>Accedi.</h1>
              <p className="text-base" style={{ color: 'var(--text-muted)' }}>La prossima decisione è qui.</p>
            </div>
            <div className="flex flex-col gap-7">
              <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
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
              <span className="text-sm leading-snug" style={{ color: 'var(--text-muted)' }}>Ho letto l'{privacyLink}.</span>
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
              <Field label="Nome" value={name} onChange={setName} autoComplete="given-name" />
              <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
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
