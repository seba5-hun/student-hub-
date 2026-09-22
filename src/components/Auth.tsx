import React, { useState } from 'react';
import { AuthUser, matchesLegacyAccount } from '../lib/store';
import { supabase, authErrorMessage } from '../lib/supabase';
import { BookOpen, Mail, Lock, UserPlus, LogIn, ArrowLeft, Loader2, Eye, EyeOff } from 'lucide-react';

interface AuthProps {
  onLogin: (user: AuthUser) => void;
  initialError?: string;
}

// The app returns here after the links in confirmation and reset emails.
const redirectTo = () => `${window.location.origin}${window.location.pathname}`;

export default function Auth({ onLogin, initialError = '' }: AuthProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(initialError);
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
      setError('Esiste già un account online con questa email, ma con un\'altra password. Usa "Recupero password".');
    } else {
      setPassword('');
      setSuccess('Abbiamo trasferito il tuo account online! Ti abbiamo inviato un\'email: clicca sul link per confermare, poi accedi con la stessa password. I tuoi dati verranno caricati al primo accesso.');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Le password non corrispondono.');
      return;
    }
    if (password.length < 6) {
      setError('La password deve avere almeno 6 caratteri.');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: redirectTo() },
      });
      if (error) throw error;
      if (data.session && data.user) {
        onLogin({ id: data.user.id, email: data.user.email || email.trim() });
      } else if (data.user && data.user.identities?.length === 0) {
        // Supabase answers this way when the email is already registered.
        setError('Esiste già un account con questa email. Accedi o recupera la password.');
      } else {
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setSuccess('Account creato! Ti abbiamo inviato un\'email: clicca sul link per confermare, poi accedi.');
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() });
      if (error) throw error;
      setSuccess('Se esiste un account con questa email, riceverai un link per reimpostare la password. Controlla anche lo spam.');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-bg mesh-gradient flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4 shadow-lg shadow-indigo-500/30">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Student Hub</h1>
          <p className="text-gray-600">Il tuo dashboard studentesco</p>
        </div>

        <div className="glass-card-light p-8 animate-scale-in">
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <LogIn className="w-5 h-5 text-indigo-600" />
                Accedi
              </h2>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="input-light w-full pl-10"
                    placeholder="la-tua@email.it"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input-light w-full pl-10 pr-10"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              {success && <p className="text-emerald-600 text-sm">{success}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Accedi'}
              </button>
              <div className="flex justify-between text-sm">
                <button type="button" onClick={() => { setMode('reset'); setError(''); setSuccess(''); }} className="text-indigo-600 hover:text-indigo-700">
                  Recupero password
                </button>
                <button type="button" onClick={() => { setMode('register'); setError(''); setSuccess(''); }} className="text-indigo-600 hover:text-indigo-700">
                  Registrati
                </button>
              </div>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-600" />
                Registrati
              </h2>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-light w-full" placeholder="la-tua@email.it" required />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input-light w-full pr-10"
                    placeholder="Minimo 6 caratteri"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Conferma Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="input-light w-full pr-10"
                    placeholder="Ripeti la password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Crea Account'}
              </button>
              <button type="button" onClick={() => { setMode('login'); setError(''); setSuccess(''); }} className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Torna al login
              </button>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={handleReset} className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-600" />
                Recupero Password
              </h2>
              <p className="text-gray-600 text-sm mb-4">
                Inserisci la tua email e ti invieremo un link per reimpostare la password.
              </p>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="input-light w-full pl-10"
                    placeholder="la-tua@email.it"
                    required
                  />
                </div>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              {success && <p className="text-emerald-600 text-sm">{success}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Invia link'}
              </button>
              <button type="button" onClick={() => { setMode('login'); setError(''); setSuccess(''); }} className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Torna al login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
