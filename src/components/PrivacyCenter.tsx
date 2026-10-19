import React, { useState } from 'react';
import { X, Download, Trash2, Loader2, FileText, ExternalLink } from 'lucide-react';
import { LEGAL_LINKS, statsConsent, setStatsConsent, deleteMyAccount } from '../lib/legal';

// "Privacy e dati" (account menu): the legal documents, the choice about usage statistics, the
// download of all data (portability) and the deletion of the account (right to erasure).
interface Props {
  userId: string;
  email: string;
  darkMode: boolean;
  acceptedAt?: string;
  onExport: () => void;
  onDeleted?: () => void;   // absent in the demo (no account to delete)
  onClose: () => void;
}

export default function PrivacyCenter({ userId, email, darkMode, acceptedAt, onExport, onDeleted, onClose }: Props) {
  const [stats, setStats] = useState(statsConsent() === 'yes');
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const text = darkMode ? 'text-white' : 'text-gray-900';
  const sub = darkMode ? 'text-white/60' : 'text-gray-500';
  const well = darkMode ? 'bg-white/5' : 'bg-black/[0.04]';

  const toggleStats = () => { const next = !stats; setStats(next); setStatsConsent(next ? 'yes' : 'no'); };
  const remove = async () => {
    setBusy(true); setError('');
    try { await deleteMyAccount(userId); onDeleted?.(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Privacy e dati" onClick={e => e.stopPropagation()}
        className={`w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto p-5 sm:p-7 rounded-t-3xl sm:rounded-3xl animate-scale-in ${darkMode ? 'glass-float' : 'glass-card-light'}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className={`text-2xl font-bold tracking-[-0.03em] ${text}`}>Privacy e dati.</h2>
            <p className={`text-sm mt-1 ${sub}`}>{email}{acceptedAt ? ` · termini accettati il ${new Date(acceptedAt).toLocaleDateString('it-IT')}` : ''}</p>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className={`p-2 rounded-full ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/5'} ${text}`}><X className="w-5 h-5" /></button>
        </div>

        <p className={`text-xs font-semibold uppercase tracking-wide mt-6 mb-2 ${sub}`}>Documenti</p>
        <div className="grid grid-cols-2 gap-2">
          {[...LEGAL_LINKS, { href: '/recesso.html', label: 'Modulo di recesso' }].map(l => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener" className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm ${well} ${text}`}>
              <FileText className="w-4 h-4 opacity-60" /> <span className="flex-1">{l.label}</span> <ExternalLink className="w-3.5 h-3.5 opacity-40" />
            </a>
          ))}
        </div>

        <p className={`text-xs font-semibold uppercase tracking-wide mt-6 mb-2 ${sub}`}>Statistiche d'uso</p>
        <label className={`flex items-center justify-between gap-4 p-3 rounded-xl cursor-pointer ${well}`}>
          <span className={`text-sm ${sub}`}>Aiuta a migliorare MYND contando quali sezioni usi e per quanto tempo (mai i contenuti).</span>
          <input type="checkbox" checked={stats} onChange={toggleStats} className="sr-only" aria-label="Statistiche d'uso" />
          <span className={`w-10 h-6 rounded-full relative flex-shrink-0 transition-colors ${stats ? 'bg-[var(--brand-fill)]' : darkMode ? 'bg-white/15' : 'bg-black/15'}`}>
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${stats ? 'left-5' : 'left-1'}`} />
          </span>
        </label>

        <p className={`text-xs font-semibold uppercase tracking-wide mt-6 mb-2 ${sub}`}>I tuoi dati</p>
        <button onClick={onExport} className={`w-full flex items-center gap-3 p-3 rounded-xl text-left text-sm ${well} ${text}`}>
          <Download className="w-4 h-4 opacity-70" /> <span className="flex-1">Scarica tutti i tuoi dati (file .json)</span>
        </button>

        {!onDeleted ? null : !confirming ? (
          <button onClick={() => setConfirming(true)} className="w-full flex items-center gap-3 p-3 mt-2 rounded-xl text-left text-sm text-red-400 hover:bg-red-500/10">
            <Trash2 className="w-4 h-4" /> Elimina il mio account
          </button>
        ) : (
          <div className="mt-2 p-4 rounded-xl border border-red-500/40 bg-red-500/5 space-y-3">
            <p className={`text-sm ${text}`}><b>Eliminare l'account per sempre?</b></p>
            <p className={`text-sm ${sub}`}>Vengono cancellati account, impegni, voti, sessioni, chat e i file dell'Archivio salvati su MYND. I file su Google Drive restano nel tuo Drive. Un abbonamento attivo va disdetto a parte. Non si può annullare.</p>
            <input value={typed} onChange={e => setTyped(e.target.value)} placeholder='Scrivi ELIMINA per confermare'
              className={`${darkMode ? 'input-glass' : 'input-light'} w-full text-sm`} />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setConfirming(false); setTyped(''); }} className={`px-4 py-2 rounded-xl text-sm ${sub}`}>Annulla</button>
              <button onClick={remove} disabled={typed.trim().toUpperCase() !== 'ELIMINA' || busy}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-rose-500 to-red-600 disabled:opacity-40 flex items-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Elimina per sempre
              </button>
            </div>
          </div>
        )}
        <p className={`text-xs mt-5 ${sub}`}>Per qualsiasi richiesta sui tuoi dati: <a href="mailto:flowbase.service@gmail.com" className="underline">flowbase.service@gmail.com</a></p>
      </div>
    </div>
  );
}
