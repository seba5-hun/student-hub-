import React, { useState } from 'react';
import { supabase, authErrorMessage } from '../lib/supabase';
import { ManifestoScreen, PrimaryButton, Field, Notice } from './Auth';

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

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 6) {
      setError('La password deve avere almeno 6 caratteri.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Le due password non sono uguali.');
      return;
    }
    if (!supabase) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess('Ti porto alla tua giornata…');
      setTimeout(onDone, 1500);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleReset}>
      <ManifestoScreen glow="none" footer={<PrimaryButton loading={loading} disabled={!!success}>Salva la password</PrimaryButton>}>
        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-2">
            <h1 className="text-[44px] font-bold leading-none" style={{ letterSpacing: '-0.045em' }}>Nuova password.</h1>
            <p className="text-base" style={{ color: 'var(--text-muted)' }}>Scegline una che ricorderai.</p>
          </div>
          <div className="flex flex-col gap-7">
            <Field label="Nuova password" value={password} onChange={setPassword} autoComplete="new-password" toggle autoFocus />
            <Field label="Ripeti la password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" toggle />
          </div>
          {error && <Notice kind="error" title="Qualcosa non va." text={error} />}
          {success && <Notice kind="ok" title="Password salvata." text={success} />}
        </div>
      </ManifestoScreen>
    </form>
  );
}
