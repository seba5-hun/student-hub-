import React, { useState, useEffect } from 'react';
import { BookOpen, Lock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface ResetPasswordProps {
  onBackToLogin: () => void;
}

export default function ResetPassword({ onBackToLogin }: ResetPasswordProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Estrai il token dai parametri URL
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
    } else {
      setError('Link di reset non valido o scaduto.');
    }
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 6) {
      setError('La password deve avere almeno 6 caratteri.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Le password non corrispondono.');
      return;
    }

    if (!token) {
      setError('Token non valido.');
      return;
    }

    setLoading(true);

    try {
      // Qui dovresti chiamare la tua API per resettare la password
      // Per ora simuliamo una chiamata API
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simula successo
      setSuccess('Password reimpostata con successo! Reindirizzamento al login...');
      
      setTimeout(() => {
        onBackToLogin();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Errore durante il reset della password.');
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
          <p className="text-gray-600">Reimposta la tua password</p>
        </div>

        <div className="glass-card-light p-8 animate-scale-in">
          {error && !token ? (
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={onBackToLogin}
                className="btn-primary w-full"
              >
                Torna al Login
              </button>
            </div>
          ) : success ? (
            <div className="text-center">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <p className="text-emerald-600">{success}</p>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <Lock className="w-5 h-5 text-indigo-600" />
                Nuova Password
              </h2>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Nuova Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input-light w-full pl-10"
                    placeholder="Minimo 6 caratteri"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Conferma Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="input-light w-full pl-10"
                    placeholder="Ripeti la password"
                    required
                  />
                </div>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Reimposta Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
