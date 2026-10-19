import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

// Shown once to accounts that haven't accepted the current Terms and Privacy (e.g. created with
// Google, or after the documents changed): the app opens after the acceptance.
export default function LegalGate({ updated, onAccept, onLogout }: { updated: boolean; onAccept: () => void; onLogout: () => void }) {
  const [checked, setChecked] = useState(false);
  const link = (href: string, label: string) => <a href={href} target="_blank" rel="noopener" className="underline" style={{ color: 'var(--text)' }}>{label}</a>;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="Termini e privacy" className="w-full max-w-md glass-float rounded-3xl p-6 sm:p-7 animate-scale-in" style={{ color: 'var(--text)' }}>
        <span className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--brand-fill) 16%, transparent)', color: 'var(--brand-ring)' }}>
          <ShieldCheck className="w-5 h-5" />
        </span>
        <h2 className="text-2xl font-bold tracking-[-0.03em] mt-4">{updated ? 'Abbiamo aggiornato termini e privacy.' : 'Prima di iniziare.'}</h2>
        <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {updated
            ? 'Per continuare a usare MYND leggi e accetta la nuova versione. I tuoi dati restano come sono.'
            : 'Per usare MYND serve la tua accettazione dei termini del servizio e la presa visione dell\'informativa privacy.'}
        </p>
        <p className="text-sm mt-3" style={{ color: 'var(--text-muted)' }}>
          {link('/termini.html', 'Termini e condizioni')} · {link('/privacy.html', 'Informativa privacy')} · {link('/cookie.html', 'Cookie')}
        </p>
        <label className="flex gap-3 items-start mt-5 cursor-pointer">
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="w-5 h-5 mt-0.5 flex-shrink-0 accent-[var(--brand-fill)]" />
          <span className="text-sm leading-snug" style={{ color: 'var(--text-muted)' }}>
            Ho almeno 14 anni (o il consenso di un genitore), accetto i Termini e condizioni e ho letto l'informativa privacy.
          </span>
        </label>
        <div className="flex gap-2 mt-6">
          <button onClick={onLogout} className="px-4 h-11 rounded-full text-sm" style={{ color: 'var(--text-muted)' }}>Esci</button>
          <button onClick={onAccept} disabled={!checked} className="btn-primary flex-1 h-11 text-sm disabled:opacity-40">Accetta e continua</button>
        </div>
      </div>
    </div>
  );
}
