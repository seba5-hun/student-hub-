import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { statsConsent, setStatsConsent } from '../lib/legal';

// First visit: MYND only uses the browser storage it needs to work; the usage statistics (which
// sections are opened and for how long, never contents) start only if the user agrees. "Rifiuta"
// and "Accetta" weigh the same and closing the banner counts as a refusal (Garante Privacy, 2021).
export default function ConsentBanner() {
  const [open, setOpen] = useState(() => statsConsent() === null);
  useEffect(() => {
    const sync = () => setOpen(statsConsent() === null);
    window.addEventListener('mynd-consent', sync);
    return () => window.removeEventListener('mynd-consent', sync);
  }, []);
  if (!open) return null;
  const choose = (v: 'yes' | 'no') => { setStatsConsent(v); setOpen(false); };
  const button = 'flex-1 h-10 rounded-full text-sm font-semibold transition-colors';
  return (
    <div role="dialog" aria-label="Privacy e statistiche" className="fixed z-[90] left-3 right-3 sm:left-4 sm:right-auto sm:max-w-sm animate-scale-in"
      style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
      <div className="glass-float rounded-3xl p-4 pr-10 relative" style={{ color: 'var(--text)' }}>
        <button onClick={() => choose('no')} aria-label="Chiudi (rifiuta le statistiche)" className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
          <X className="w-4 h-4" />
        </button>
        <p className="text-sm font-semibold">La tua privacy</p>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          MYND usa solo l'archiviazione tecnica necessaria per funzionare. Se vuoi, ci aiuti a migliorarla con
          statistiche d'uso: quali sezioni apri e per quanto tempo, mai i contenuti. Niente pubblicità.{' '}
          <a href="/cookie.html" target="_blank" rel="noopener" className="underline">Cookie policy</a>
        </p>
        <div className="flex gap-2 mt-3">
          <button onClick={() => choose('no')} className={button} style={{ background: 'var(--glass-well)', color: 'var(--text)' }}>Rifiuta</button>
          <button onClick={() => choose('yes')} className={button} style={{ background: 'var(--glass-well)', color: 'var(--text)' }}>Accetta</button>
        </div>
      </div>
    </div>
  );
}
