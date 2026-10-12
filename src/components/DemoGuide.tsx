import React from 'react';
import { Sparkles, MapPin, Lock, Bot } from 'lucide-react';

// Guida Studio AI in the demo: an example conversation (the real tutor needs an account and the
// student's own files), with the way to create an account.

const CHAT: { role: 'user' | 'ai'; text: string; source?: string }[] = [
  { role: 'user', text: 'Interrogami sulla Rivoluzione francese, ho l\'interrogazione giovedì.' },
  { role: 'ai', text: 'Va bene! Prima domanda: **perché Luigi XVI convocò gli Stati Generali nel 1789?**' },
  { role: 'user', text: 'Perché lo Stato non aveva più soldi.' },
  {
    role: 'ai',
    text: 'Giusto, ma incompleto. Le casse erano vuote per le **spese della corte e delle guerre**, e il re voleva nuove tasse. Ti è mancato il punto chiave: il **Terzo Stato chiedeva di votare per testa e non per ordine**.\n\nVoto: **6½**. Prossima domanda: cosa successe il **14 luglio 1789**?',
    source: 'Capitolo 3 – La crisi dell\'Antico regime · pag. 11',
  },
];

function Bold({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <React.Fragment key={i}>{p}</React.Fragment>))}</>;
}

export default function DemoGuide({ onSignup }: { onSignup: () => void }) {
  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 pt-2">
        <span className="w-11 h-11 rounded-2xl glass-lens flex items-center justify-center" style={{ color: 'var(--brand-ring)' }}><Sparkles className="w-5 h-5" /></span>
        <div>
          <h2 className="text-[28px] font-bold leading-tight" style={{ letterSpacing: '-0.035em', color: 'var(--text)' }}>Guida Studio AI.</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Un tutor che studia con te, sui tuoi file. Ecco un esempio.</p>
        </div>
      </div>

      <div className="glass-card p-4 sm:p-6 space-y-4">
        {CHAT.map((m, i) => m.role === 'user' ? (
          <div key={i} className="flex justify-end">
            <p className="max-w-[80%] rounded-2xl px-4 py-3 text-sm" style={{ background: 'var(--brand-fill)', color: 'var(--on-brand)' }}>{m.text}</p>
          </div>
        ) : (
          <div key={i} className="flex gap-3">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--glass-well)', color: 'var(--brand-ring)' }}><Bot className="w-4 h-4" /></span>
            <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-line" style={{ background: 'var(--glass-well)', color: 'var(--text)' }}>
              <Bold text={m.text} />
              {m.source && (
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold h-8 px-3 rounded-full"
                  style={{ color: 'var(--brand-ring)', background: 'color-mix(in srgb, var(--brand-fill) 14%, transparent)' }}>
                  <MapPin className="w-3.5 h-3.5" /> {m.source}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="glass-card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <Lock className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--brand-ring)' }} />
        <p className="text-sm flex-1" style={{ color: 'var(--text-muted)' }}>
          Con il tuo account carichi libri, PDF e appunti: il tutor ti spiega, ti interroga, fa riassunti e flashcard, e ti mostra la riga esatta del libro da cui viene ogni risposta.
        </p>
        <button onClick={onSignup} className="btn-primary h-11 px-5 text-sm whitespace-nowrap">Crea il tuo account</button>
      </div>
    </div>
  );
}
