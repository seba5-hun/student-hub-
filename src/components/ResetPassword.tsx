import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BookOpen, Lock, CheckCircle, AlertCircle } from 'lucide-react';

interface ResetPasswordProps {
  onSuccess: () => void;
}

export default function ResetPassword({ onSuccess }: ResetPasswordProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isValidToken, setIsValidToken] = useState(true);

  useEffect(() => {
    // Verifica che il token sia valido
    const checkToken = async () => {
      const hash = window.location.hash;
      if (!hash || !hash.includes('access_token')) {
        setIsValidToken(false);
        setError('Link di reset non valido o scaduto. Richiedi un nuovo reset.');
        return;
      }

      // Supabase gestisce automaticamente il token dall'hash
      // Verifichiamo che l'utente sia autenticato
      const { data: { session } } = await supabase!.auth.getSession();
      if (!session) {
        setIsValidToken(false);
        setError('Sessione non valida. Richiedi un nuovo reset.');
      }
    };

    checkToken();
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('La password deve avere almeno 6 caratteri.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Le password non corrispondono.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase!.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Errore durante il reset della password.');
    } finally {
      setLoading(false);
    }
  };

  if (!isValidToken) {
    return (
      <div className="min-h-screen gradient-bg mesh-gradient flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4 shadow-lg shadow-indigo-500/30">
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Student Hub</h1>
          </div>

          <div className="glass-card p-8 animate-scale-in">
            <div className="flex flex-col items-center text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
              <h2 className="text-xl font-semibold text-white mb-2">Link Non Valido</h2>
              <p className="text-white/60 mb-6">{error}</p>
              <a
                href="/"
                className="btn-primary inline-block"
              >
                Torna alla Home
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen gradient-bg mesh-gradient flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8 animate-fade-in">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4 shadow-lg shadow-indigo-500/30">
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Student Hub</h1>
          </div>

          <div className="glass-card p-8 animate-scale-in">
            <div className="flex flex-col items-center text-center">
              <CheckCircle className="w-12 h-12 text-emerald-400 mb-4" />
              <h2 className="text-xl font-semibold text-white mb-2">Password Aggiornata!</h2>
              <p className="text-white/60">La tua password è stata reimpostata con successo. Verrai reindirizzato alla home...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg mesh-gradient flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4 shadow-lg shadow-indigo-500/30">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Student Hub</h1>
          <p className="text-white/60">Reimposta la tua password</p>
        </div>

        <div className="glass-card p-8 animate-scale-in">
          <form onSubmit={handleResetPassword} className="space-y-4">
            <h2 className="text-xl font-semibold text-white mb-6">Nuova Password</h2>
            
            <div>
              <label className="block text-sm text-white/70 mb-1">Nuova Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="input-glass w-full pl-10"
                  placeholder="Minimo 6 caratteri"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-white/70 mb-1">Conferma Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="input-glass w-full pl-10"
                  placeholder="Ripeti la password"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? 'Reimpostazione...' : 'Reimposta Password'}
            </button>

            <div className="text-center">
              <a href="/" className="text-sm text-indigo-400 hover:text-indigo-300">
                Annulla e torna al login
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
