import React, { useState } from 'react';
import { supabase, authErrorMessage } from '../lib/supabase';
import { BookOpen, Lock, CheckCircle, Loader2, Eye, EyeOff } from 'lucide-react';

interface ResetPasswordProps {
  // Called when the password has been changed, or to go back to the login.
  onDone: () => void;
}

// Shown after the user opens the link in the reset email: Supabase has already
// signed them in with a temporary session, so here we only set the new password.
export default function ResetPassword({ onDone }: ResetPasswordProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

    if (!supabase) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess('Password reimpostata con successo! Ti sto portando alla tua dashboard...');
      setTimeout(onDone, 1500);
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
          <p className="text-gray-600">Reimposta la tua password</p>
        </div>

        <div className="glass-card-light p-8 animate-scale-in">
          {success ? (
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
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input-light w-full pl-10 pr-10"
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
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="input-light w-full pl-10 pr-10"
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
                {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Reimposta Password'}
              </button>
              <button type="button" onClick={onDone} className="text-sm text-indigo-600 hover:text-indigo-700 w-full">
                Annulla
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
