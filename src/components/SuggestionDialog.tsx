import React, { useState } from 'react';
import { X, Lightbulb, Bug, MessageCircle, Loader2, Check } from 'lucide-react';
import { sendSuggestion, SuggestionKind } from '../lib/suggestions';

// "Suggerisci una modifica": a short message for the people who make MYND (read in Admin).

const KINDS: { id: SuggestionKind; label: string; icon: typeof Lightbulb; placeholder: string }[] = [
  { id: 'idea', label: 'Un\'idea', icon: Lightbulb, placeholder: 'Es. Vorrei poter colorare gli impegni per materia anche nel calendario.' },
  { id: 'problema', label: 'Qualcosa non va', icon: Bug, placeholder: 'Cosa è successo e in quale sezione? Es. In Archivio la foto non si carica dal telefono.' },
  { id: 'altro', label: 'Altro', icon: MessageCircle, placeholder: 'Scrivi pure quello che vuoi dirci.' },
];

interface Props {
  userId: string | null;     // null: demo, without an account
  section: string;           // where the student is (sent with the message)
  darkMode: boolean;
  onClose: () => void;
  onSignup?: () => void;
}

export default function SuggestionDialog({ userId, section, darkMode, onClose, onSignup }: Props) {
  const [kind, setKind] = useState<SuggestionKind>('idea');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const text = darkMode ? 'text-white' : 'text-gray-900';
  const sub = darkMode ? 'text-white/60' : 'text-gray-500';
  const current = KINDS.find(k => k.id === kind)!;

  const send = async () => {
    if (!userId || message.trim().length < 3) return;
    setBusy(true); setError('');
    try {
      await sendSuggestion(userId, kind, message, section);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Suggerisci una modifica" onClick={e => e.stopPropagation()}
        className={`w-full sm:max-w-lg p-5 sm:p-7 rounded-t-3xl sm:rounded-3xl animate-scale-in ${darkMode ? 'glass-float' : 'glass-card-light'}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className={`text-2xl font-bold tracking-[-0.03em] ${text}`}>{sent ? 'Grazie!' : 'Suggerisci una modifica.'}</h2>
            <p className={`text-sm mt-1 ${sub}`}>{sent
              ? 'Il tuo messaggio è arrivato a chi costruisce MYND. Le idee migliori finiscono nell\'app.'
              : 'Cosa cambieresti in MYND? Ogni messaggio viene letto da chi la costruisce.'}</p>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className={`p-2 rounded-full ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/5'} ${text}`}><X className="w-5 h-5" /></button>
        </div>

        {sent ? (
          <div className="mt-6 flex flex-col items-center gap-4 py-4">
            <span className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'var(--brand-fill)', color: 'var(--on-brand)' }}><Check className="w-8 h-8" /></span>
            <div className="flex gap-2">
              <button onClick={() => { setSent(false); setMessage(''); }} className={`px-4 py-2 rounded-xl text-sm ${darkMode ? 'bg-white/10 text-white/80' : 'bg-black/5 text-gray-700'}`}>Scrivine un altro</button>
              <button onClick={onClose} className="btn-primary text-sm">Chiudi</button>
            </div>
          </div>
        ) : !userId ? (
          <div className="mt-6 space-y-4">
            <p className={`text-sm ${sub}`}>Per inviare un suggerimento serve un account: così, se serve, possiamo anche risponderti.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className={`px-4 py-2 rounded-xl text-sm ${darkMode ? 'bg-white/10 text-white/80' : 'bg-black/5 text-gray-700'}`}>Chiudi</button>
              {onSignup && <button onClick={onSignup} className="btn-primary text-sm">Crea il tuo account</button>}
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo di messaggio">
              {KINDS.map(k => {
                const on = kind === k.id;
                return (
                  <button key={k.id} type="button" role="radio" aria-checked={on} onClick={() => setKind(k.id)}
                    className={`text-sm px-3 py-1.5 rounded-full flex items-center gap-1.5 border transition-colors ${on
                      ? 'bg-[var(--brand-fill)] text-[var(--on-brand)] border-transparent font-semibold'
                      : darkMode ? 'border-white/10 text-white/70 hover:bg-white/10' : 'border-black/10 text-gray-600 hover:bg-black/5'}`}>
                    <k.icon className="w-4 h-4" /> {k.label}
                  </button>
                );
              })}
            </div>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} maxLength={2000} autoFocus
              placeholder={current.placeholder} className={`${darkMode ? 'input-glass' : 'input-light'} w-full text-sm resize-none`} />
            <div className="flex items-center justify-between gap-3">
              <span className={`text-xs ${sub}`}>{message.length}/2000</span>
              <div className="flex gap-2">
                <button onClick={onClose} className={`px-4 py-2 rounded-xl text-sm ${darkMode ? 'bg-white/10 text-white/80' : 'bg-black/5 text-gray-700'}`}>Annulla</button>
                <button onClick={send} disabled={busy || message.trim().length < 3} className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />} Invia
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
