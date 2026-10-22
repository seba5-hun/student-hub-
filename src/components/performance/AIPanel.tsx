import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2, Sparkles, Check, ShieldCheck, KeyRound } from 'lucide-react';
import { askAuto, autoReady, ChatTurn } from '../../lib/ai';
import { AIAction, describeAction, parseActions } from '../../lib/projectsAI';
import { PTask, Project } from '../../lib/projects';
import { Sheet, ErrorNote } from './ui';

// Where the AI's data goes, said once, plainly.
export function AINote() {
  return (
    <p className="text-[11px] leading-relaxed flex gap-1.5" style={{ color: 'var(--text-subtle)' }}>
      <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
      <span>Per rispondere, la domanda e i dati del progetto vengono inviati al servizio AI collegato al tuo account (es. Google Gemini). Non scrivere password o dati sensibili.</span>
    </p>
  );
}

// No AI connected: said clearly, with the way to connect one (no pretend answers).
export function ConnectAI({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--glass-well)' }}>
      <p className="text-sm flex gap-2" style={{ color: 'var(--text)' }}><KeyRound className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--brand-ring)' }} /> MYND AI non è ancora collegata al tuo account.</p>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Collega una chiave AI gratuita (Google Gemini) nella Guida Studio AI: ci vuole un minuto e vale su tutti i tuoi dispositivi.</p>
      <button onClick={onConnect} className="btn-primary h-11 px-5">Collega l'AI</button>
    </div>
  );
}

// **bold** and simple lists, nothing else (the text stays text).
function Rich({ text }: { text: string }) {
  return (
    <div className="text-[15px] leading-relaxed space-y-1.5" style={{ color: 'var(--text)' }}>
      {text.split('\n').filter((l, i, a) => l.trim() || (i > 0 && a[i - 1].trim())).map((line, i) => {
        const clean = line.replace(/^#{1,6}\s*/, '');
        const bullet = /^\s*[-*•]\s+/.test(clean);
        const parts = clean.replace(/^\s*[-*•]\s+/, '').split(/\*\*(.+?)\*\*/g);
        const body = parts.map((p, j) => (j % 2 ? <strong key={j} className="font-semibold">{p}</strong> : <React.Fragment key={j}>{p}</React.Fragment>));
        if (!clean.trim()) return <div key={i} className="h-1" />;
        return bullet ? <p key={i} className="pl-4 relative"><span className="absolute left-0" style={{ color: 'var(--text-subtle)' }}>•</span>{body}</p> : <p key={i}>{body}</p>;
      })}
    </div>
  );
}

interface Msg { role: 'user' | 'assistant'; text: string; actions?: AIAction[]; state?: 'open' | 'applied' | 'ignored' }

// MYND AI in a panel: questions about one project (with changes it can propose) or about all of them.
export function AIPanel({ title, system, context, quick, project, tasks, onApply, onClose, onConnect }: {
  title: string;
  system: string;
  context: () => string;
  quick: string[];
  project?: Project;
  tasks?: PTask[];
  onApply?: (actions: AIAction[]) => Promise<void>;
  onClose: () => void;
  onConnect: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const ready = autoReady();

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const history = [...msgs, { role: 'user' as const, text: question }];
    setMsgs(history); setInput(''); setBusy(true); setError('');
    try {
      // The data is read again at every question, so the answer follows the latest changes.
      const turns: ChatTurn[] = history.slice(-8).map((m, i, a) => ({ role: m.role, text: i === a.length - 1 ? `DATI AGGIORNATI:\n${context()}\n\nDOMANDA: ${m.text}` : m.text }));
      const reply = await askAuto(system, turns);
      const { text, actions } = project && tasks && onApply ? parseActions(reply, tasks, project) : { text: reply.replace(/```azioni[\s\S]*?(```|$)/i, '').trim(), actions: [] };
      setMsgs(m => [...m, { role: 'assistant', text: text || 'Ecco le modifiche che ti propongo.', actions, state: actions.length ? 'open' : undefined }]);
    } catch (err) {
      setError(err instanceof Error ? err.message.split('\n')[0] : String(err));
      setMsgs(m => m.slice(0, -1));
      setInput(question);
    }
    setBusy(false);
  };

  const apply = async (i: number) => {
    const m = msgs[i];
    if (!m.actions || !onApply) return;
    setBusy(true); setError('');
    try {
      await onApply(m.actions);
      setMsgs(ms => ms.map((x, j) => (j === i ? { ...x, state: 'applied' } : x)));
    } catch (err) {
      setError(`Non sono riuscito ad applicare tutto: ${err instanceof Error ? err.message : String(err)}`);
    }
    setBusy(false);
  };

  return (
    <Sheet title={title} onClose={onClose}
      footer={ready ? (
        <form className="w-full flex gap-2 items-end" onSubmit={e => { e.preventDefault(); ask(input); }}>
          <textarea value={input} onChange={e => setInput(e.target.value)} rows={1} placeholder="Chiedi a MYND AI…" aria-label="Domanda per MYND AI"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }}
            className="input-glass flex-1 min-h-12 max-h-32 py-3 text-[15px] resize-none" />
          <button type="submit" disabled={busy || !input.trim()} aria-label="Invia" className="btn-primary !p-0 w-12 h-12 flex items-center justify-center flex-shrink-0 disabled:opacity-40">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-5 h-5 flex-shrink-0" />}
          </button>
        </form>
      ) : undefined}>
      {!ready ? <ConnectAI onConnect={onConnect} /> : (
        <>
          {msgs.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                <Sparkles className="w-4 h-4 inline -mt-0.5 mr-1" style={{ color: 'var(--brand-ring)' }} />
                Rispondo in base ai dati reali{project ? ' di questo progetto' : ' dei tuoi progetti'}. {project ? 'Se serve, ti propongo delle modifiche: le applichi solo se ti convincono.' : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                {quick.map(q => (
                  <button key={q} onClick={() => ask(q)} className="glass-card !rounded-full px-3.5 h-9 text-sm hover:opacity-90" style={{ color: 'var(--text)' }}>{q}</button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-4">
            {msgs.map((m, i) => (m.role === 'user' ? (
              <p key={i} className="ml-auto max-w-[85%] w-fit rounded-3xl rounded-br-lg px-4 py-2.5 text-[15px] glass-lens whitespace-pre-line" style={{ color: 'var(--text)' }}>{m.text}</p>
            ) : (
              <div key={i} className="space-y-3 animate-scale-in">
                <Rich text={m.text} />
                {m.actions && m.actions.length > 0 && tasks && (
                  <div className="rounded-2xl p-4 space-y-2.5" style={{ background: 'var(--glass-well)' }}>
                    <p className="text-xs font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--text-muted)' }}>Modifiche proposte</p>
                    <ul className="space-y-1.5">
                      {m.actions.map((a, j) => <li key={j} className="text-sm flex gap-2" style={{ color: 'var(--text)' }}><span style={{ color: 'var(--brand-ring)' }}>+</span>{describeAction(a, tasks)}</li>)}
                    </ul>
                    {m.state === 'open' && (
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => apply(i)} disabled={busy} className="btn-primary h-10 px-4 text-sm disabled:opacity-40">Applica</button>
                        <button onClick={() => setMsgs(ms => ms.map((x, k) => (k === i ? { ...x, state: 'ignored' } : x)))} className="btn-secondary h-10 px-4 text-sm">Lascia stare</button>
                      </div>
                    )}
                    {m.state === 'applied' && <p className="text-sm inline-flex items-center gap-1.5" style={{ color: 'var(--brand-ring)' }}><Check className="w-4 h-4" /> Applicate</p>}
                    {m.state === 'ignored' && <p className="text-sm" style={{ color: 'var(--text-subtle)' }}>Non applicate</p>}
                  </div>
                )}
              </div>
            )))}
            {busy && msgs[msgs.length - 1]?.role === 'user' && (
              <p className="text-sm inline-flex items-center gap-2" style={{ color: 'var(--text-subtle)' }}><Loader2 className="w-4 h-4 animate-spin" /> MYND AI sta pensando…</p>
            )}
          </div>
          <ErrorNote text={error} />
          <AINote />
          <div ref={endRef} />
        </>
      )}
    </Sheet>
  );
}
