import React, { useState } from 'react';
import { loginUser, registerUser, setAuthUser, AuthUser } from '../lib/store';
import { BookOpen, Mail, Lock, UserPlus, LogIn, ArrowLeft, Loader2 } from 'lucide-react';

interface AuthProps {
  onLogin: (user: AuthUser) => void;
}

export default function Auth({ onLogin }: AuthProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = loginUser(email, password);
      if (user) {
        setAuthUser(user);
        onLogin(user);
      } else {
        setError('Credenziali non valide. Controlla email e password.');
      }
    } catch (err: any) {
      setError(err.message || 'Errore di accesso.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
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
      const user = registerUser(email, password);
      if (user) {
        setAuthUser(user);
        onLogin(user);
      } else {
        setError('Un account con questa email esiste già.');
      }
    } catch (err: any) {
      setError(err.message || 'Errore nella registrazione.');
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
          <h1 className="text-3xl font-bold text-white mb-2">Student Hub</h1>
          <p className="text-white/60">Il tuo dashboard studentesco</p>
        </div>

        <div className="glass-card p-8 animate-scale-in">
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <LogIn className="w-5 h-5 text-indigo-400" />
                Accedi
              </h2>
              <div>
                <label className="block text-sm text-white/70 mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="input-glass w-full pl-10"
                    placeholder="la-tua@email.it"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input-glass w-full pl-10"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Accedi'}
              </button>
              <div className="text-center text-sm">
                <button type="button" onClick={() => { setMode('register'); setError(''); }} className="text-indigo-400 hover:text-indigo-300">
                  Non hai un account? Registrati
                </button>
              </div>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                Registrati
              </h2>
              <div>
                <label className="block text-sm text-white/70 mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-glass w-full" placeholder="la-tua@email.it" required />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input-glass w-full" placeholder="Minimo 6 caratteri" required />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Conferma Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="input-glass w-full" placeholder="Ripeti la password" required />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Crea Account'}
              </button>
              <button type="button" onClick={() => { setMode('login'); setError(''); }} className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Torna al login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
