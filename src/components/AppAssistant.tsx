import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Loader2, Undo2, Check, Trash2 } from 'lucide-react';
import { UserData } from '../lib/store';
import { askAuto, autoReady, ChatTurn } from '../lib/ai';
import { ASSISTANT_SYSTEM, describeState, parseAnswer, applyActions } from '../lib/assistant';

// "Assistente MYND" in Personalizza: a chat with the automatic AI that changes the app for real
// (Home panels, menu, names, versions, subjects, tasks…). Every change is listed under the answer
// and the last one can be undone. The chat is kept in this browser.

interface Message { role: 'user' | 'assistant'; text: string; done?: string[]; skipped?: string[]; undone?: boolean; id: number }

// Data before each applied change (for "Annulla"): kept for this session, also when Personalizza is closed.
const SNAPSHOTS = new Map<number, UserData>();

const SUGGESTIONS = [
  'Metti i prossimi impegni in cima alla Home',
  'Nascondi la frase motivazionale',
  'Allenamento ogni martedì e giovedì alle 18 fino a giugno',
  'Obiettivo di 15 ore a settimana',
  'Crea una versione per preparare un esame universitario',
  'Aggiungi la materia Filosofia in viola',
];

interface Props {
  data: UserData;
  darkMode: boolean;
  storageKey: string;
  onUpdateData: (update: (prev: UserData) => UserData) => void;
  onNavigate?: (section: string) => void;
}

export default function AppAssistant({ data, darkMode, storageKey, onUpdateData, onNavigate }: Props) {
  const [messages, setMessages] = useState<Message[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(messages.slice(-40))); } catch { /* full */ } }, [messages, storageKey]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);

  const text = darkMode ? 'text-white' : 'text-gray-800';
  const sub = darkMode ? 'text-white/60' : 'text-gray-500';
  const well = darkMode ? 'bg-white/5' : 'bg-black/[0.04]';
  const ready = autoReady();
  const lastActionId = [...messages].reverse().find(m => m.done?.length && !m.undone)?.id;

  const send = async (raw?: string) => {
    const question = (raw ?? input).trim();
    if (!question || busy) return;
    setInput(''); setError('');
    const userMsg: Message = { role: 'user', text: question, id: Date.now() };
    const history = [...messages, userMsg];
    setMessages(history);
    setBusy(true);
    try {
      const turns: ChatTurn[] = history.slice(-10).map(m => ({ role: m.role, text: m.text }));
      const system = `${ASSISTANT_SYSTEM}\n\nSTATO ATTUALE DELL'APP:\n${describeState(dataRef.current)}`;
      const answer = parseAnswer(await askAuto(system, turns));
      const id = Date.now() + 1;
      let done: string[] = [], skipped: string[] = [], navigate: string | undefined;
      if (answer.actions.length) {
        const before = dataRef.current;
        const result = applyActions(before, answer.actions);
        done = result.done; skipped = result.skipped; navigate = result.navigate;
        if (done.length) { SNAPSHOTS.set(id, before); onUpdateData(() => result.data); }
      }
      setMessages(m => [...m, { role: 'assistant', text: answer.reply || (done.length ? 'Fatto!' : 'Non ho capito bene: puoi dirmelo in un altro modo?'), done, skipped, id }]);
      if (navigate && onNavigate) setTimeout(() => onNavigate(navigate!), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const undo = (m: Message) => {
    const snap = SNAPSHOTS.get(m.id);
    if (!snap) return;
    onUpdateData(() => snap);
    SNAPSHOTS.delete(m.id);
    setMessages(ms => ms.map(x => (x.id === m.id ? { ...x, undone: true } : x)));
  };

  return (
    <div className={`rounded-2xl p-4 ${well}`} style={{ boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--brand-ring) 30%, transparent)' }}>
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--brand-fill) 16%, transparent)', color: 'var(--brand-ring)' }}>
          <Sparkles className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold ${text}`}>Assistente MYND</p>
          <p className={`text-xs ${sub}`}>Dimmi come vuoi l'app e la sistemo io · modello automatico</p>
        </div>
        {messages.length > 0 && (
          <button onClick={() => { setMessages([]); SNAPSHOTS.clear(); }} title="Nuova conversazione" aria-label="Cancella la conversazione"
            className={`p-2 rounded-lg ${sub} ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}><Trash2 className="w-4 h-4" /></button>
        )}
      </div>

      <div ref={list} className="mt-3 space-y-3 max-h-80 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => send(s)} disabled={!ready || busy}
                className={`text-xs px-3 py-1.5 rounded-full border text-left disabled:opacity-50 ${darkMode ? 'border-white/10 text-white/75 hover:bg-white/10' : 'border-black/10 text-gray-600 hover:bg-black/5'}`}>{s}</button>
            ))}
          </div>
        )}
        {messages.map(m => m.role === 'user' ? (
          <div key={m.id} className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-sm" style={{ background: 'var(--brand-fill)', color: 'var(--on-brand)' }}>{m.text}</p>
          </div>
        ) : (
          <div key={m.id} className="max-w-[92%]">
            <p className={`text-sm whitespace-pre-line ${text}`}>{m.text}</p>
            {!!m.done?.length && (
              <div className={`mt-2 rounded-xl p-2.5 space-y-1 ${darkMode ? 'bg-black/20' : 'bg-white/70'} ${m.undone ? 'opacity-50' : ''}`}>
                {m.done.map((d, i) => (
                  <p key={i} className={`text-xs flex items-start gap-1.5 ${m.undone ? 'line-through' : ''} ${sub}`}><Check className="w-3.5 h-3.5 mt-px flex-shrink-0" style={{ color: 'var(--brand-ring)' }} />{d}</p>
                ))}
                {m.undone ? <p className={`text-xs ${sub}`}>Annullato.</p> : m.id === lastActionId && SNAPSHOTS.has(m.id) && (
                  <button onClick={() => undo(m)} className="text-xs font-semibold flex items-center gap-1 mt-1" style={{ color: 'var(--brand-ring)' }}><Undo2 className="w-3.5 h-3.5" /> Annulla</button>
                )}
              </div>
            )}
            {!!m.skipped?.length && <p className={`text-xs mt-1 ${sub}`}>Non ho potuto: {m.skipped.join(', ')}.</p>}
          </div>
        ))}
        {busy && <p className={`text-sm flex items-center gap-2 ${sub}`}><Loader2 className="w-4 h-4 animate-spin" /> Ci penso…</p>}
      </div>

      {error && <p className="text-sm text-red-400 mt-2 whitespace-pre-line">{error}</p>}
      {!ready && <p className={`text-xs mt-2 ${sub}`}>Per usare l'assistente collega una chiave AI gratuita (Gemini) nella Guida Studio AI.</p>}

      <form onSubmit={e => { e.preventDefault(); send(); }} className="mt-3 flex items-center gap-2">
        <input value={input} onChange={e => setInput(e.target.value)} disabled={!ready} maxLength={600}
          placeholder="Es. sposta il calendario in alto e aggiungi la verifica di storia venerdì"
          className={`${darkMode ? 'input-glass' : 'input-light'} flex-1 min-w-0 text-sm`} />
        <button type="submit" disabled={!ready || busy || !input.trim()} aria-label="Invia" className="btn-primary h-10 w-10 !p-0 flex items-center justify-center flex-shrink-0 disabled:opacity-40">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
