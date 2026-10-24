import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2, Sparkles, Check, ShieldCheck, KeyRound, History, MessageSquarePlus, Trash2 } from 'lucide-react';
import { askAuto, autoReady, ChatTurn } from '../../lib/ai';
import { AIAction, describeAction, parseActions } from '../../lib/projectsAI';
import { Member, PTask, Project } from '../../lib/projects';
import type { Tool, ToolItem } from '../../lib/tools';
import type { DockProps } from './AIDock';
import { APP_CHATS, ChatSummary, chatErrorMessage, deleteChat, listChatsIn, loadChat, saveChat, titleFrom } from '../../lib/chats';
import { useDialog } from '../Dialog';

// The chats of MYND AI in Performance are saved like those of the Guida Studio AI (table "chats"),
// one list per project (and one for the overview), on every device.
const PERFORMANCE_CHATS = `${APP_CHATS}performance`;
const newChatId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`);
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
export function AIPanel({ title, system, context, quick, project, tasks, tools = [], toolItems = [], members = [], me = '', dock, chat, onApply, onClose, onConnect }: {
  title: string;
  system: string;
  context: () => string;
  quick: string[];
  project?: Project;
  tasks?: PTask[];
  tools?: Tool[];
  toolItems?: ToolItem[];
  members?: Member[];
  me?: string;
  onApply?: (actions: AIAction[]) => Promise<void>;
  onClose: () => void;
  onConnect: () => void;
  dock?: DockProps;
  // Where the chats are saved: whose they are and to which project (or "panoramica") they belong.
  chat?: { userId: string; topic: string };
}) {
  const dialog = useDialog();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [chatId, setChatId] = useState(newChatId);
  const [saved, setSaved] = useState<ChatSummary[]>([]);
  const [showList, setShowList] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The answer while it is being written (shown right away instead of waiting for the end).
  const [partial, setPartial] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const ready = autoReady();

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);
  useEffect(() => { dock?.onBusy(busy); }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Saved chats: the list on opening, every conversation saved by itself after each answer.
  const refreshList = () => { if (chat) listChatsIn(chat.userId, PERFORMANCE_CHATS, chat.topic).then(r => setSaved(r.chats)).catch(() => {}); };
  useEffect(refreshList, [chat?.userId, chat?.topic]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!chat || busy || !msgs.some(m => m.role === 'assistant')) return;
    const id = window.setTimeout(() => {
      const first = msgs.find(m => m.role === 'user')?.text || 'Chat';
      saveChat(chat.userId, {
        id: chatId, subject: PERFORMANCE_CHATS, topic: chat.topic, title: titleFrom(first), updatedAt: new Date().toISOString(),
        messages: msgs.map((m, i) => ({ id: String(i), role: m.role, content: m.text, ...(m.actions?.length ? { actions: m.actions, state: m.state } : {}) })),
      }).then(() => setSaveNote('')).catch(err => setSaveNote(chatErrorMessage(err))).finally(refreshList);
    }, 400);
    return () => window.clearTimeout(id);
  }, [msgs, busy, chatId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openSaved = async (id: string) => {
    if (!chat || busy) return;
    try {
      const c = await loadChat(chat.userId, id);
      if (!c) return;
      type Stored = { role: 'user' | 'assistant'; content: string; actions?: AIAction[]; state?: Msg['state'] };
      setMsgs((c.messages as unknown as Stored[]).map(m => ({ role: m.role, text: m.content, ...(m.actions ? { actions: m.actions, state: m.state } : {}) })));
      setChatId(id); setShowList(false); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  const startNew = () => { if (busy) return; setMsgs([]); setChatId(newChatId()); setShowList(false); setError(''); };
  const removeSaved = async (c: ChatSummary) => {
    if (!chat || !(await dialog.confirm({ title: `Eliminare la chat “${c.title}”?`, confirmLabel: 'Elimina', danger: true }))) return;
    try { await deleteChat(chat.userId, c.id); } catch { /* removed here anyway */ }
    if (c.id === chatId) startNew();
    setSaved(list => list.filter(x => x.id !== c.id));
  };
  const when = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const history = [...msgs, { role: 'user' as const, text: question }];
    setMsgs(history); setInput(''); setBusy(true); setError('');
    try {
      // The data is read again at every question, so the answer follows the latest changes.
      const turns: ChatTurn[] = history.slice(-8).map((m, i, a) => ({ role: m.role, text: i === a.length - 1 ? `DATI AGGIORNATI:\n${context()}\n\nDOMANDA: ${m.text}` : m.text }));
      setPartial('');
      const reply = await askAuto(system, turns, { onPartial: t => setPartial(t.replace(/```azioni[\s\S]*$/i, '').trim()) });
      const { text, actions } = project && tasks && onApply ? parseActions(reply, tasks, project, tools, history.filter(m => m.role === 'user').map(m => m.text).join('\n')) : { text: reply.replace(/```azioni[\s\S]*?(```|$)/i, '').trim(), actions: [] };
      setMsgs(m => [...m, { role: 'assistant', text: text || 'Ecco le modifiche che ti propongo.', actions, state: actions.length ? 'open' : undefined }]);
    } catch (err) {
      setError(err instanceof Error ? err.message.split('\n')[0] : String(err));
      setMsgs(m => m.slice(0, -1));
      setInput(question);
    }
    setPartial('');
    setBusy(false);
  };

  const apply = async (i: number) => {
    const m = msgs[i];
    if (!m.actions || !onApply) return;
    setError('');
    setMsgs(ms => ms.map((x, j) => (j === i ? { ...x, state: 'applied' } : x)));
    try {
      await onApply(m.actions);
    } catch (err) {
      setMsgs(ms => ms.map((x, j) => (j === i ? { ...x, state: 'open' } : x)));
      setError(`Non sono riuscito ad applicare tutto: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <Sheet title={title} onClose={onClose} minimized={dock?.minimized} onMinimize={dock?.onMinimize}
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
          {chat && (saved.length > 0 || msgs.length > 0) && (
            <div className="flex items-center gap-2 -mt-1">
              {saved.length > 0 && (
                <button onClick={() => setShowList(v => !v)} aria-expanded={showList} className="h-9 px-3 rounded-full text-sm inline-flex items-center gap-1.5 glass-card !rounded-full" style={{ color: 'var(--text-muted)' }}>
                  <History className="w-4 h-4" /> {showList ? 'Torna alla chat' : `Chat precedenti · ${saved.length}`}
                </button>
              )}
              {msgs.length > 0 && !showList && (
                <button onClick={startNew} disabled={busy} className="h-9 px-3 rounded-full text-sm inline-flex items-center gap-1.5 ml-auto disabled:opacity-40" style={{ color: 'var(--brand-ring)' }}>
                  <MessageSquarePlus className="w-4 h-4" /> Nuova chat
                </button>
              )}
            </div>
          )}
          {showList ? (
            <ul className="space-y-1.5">
              {saved.map(c => (
                <li key={c.id} className="rounded-2xl pl-4 pr-1.5 flex items-center gap-2" style={{ background: c.id === chatId ? 'color-mix(in srgb, var(--brand-fill) 12%, transparent)' : 'var(--glass-well)' }}>
                  <button onClick={() => openSaved(c.id)} className="flex-1 min-w-0 py-2.5 text-left">
                    <span className="block text-[15px] truncate" style={{ color: 'var(--text)' }}>{c.title}</span>
                    <span className="block text-xs" style={{ color: 'var(--text-subtle)' }}>{when(c.updatedAt)}{c.id === chatId ? ' · aperta ora' : ''}</span>
                  </button>
                  <button onClick={() => removeSaved(c)} aria-label={`Elimina la chat ${c.title}`} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--text-subtle)' }}><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          ) : <>
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
                      {m.actions.map((a, j) => <li key={j} className="text-sm flex gap-2" style={{ color: 'var(--text)' }}><span style={{ color: 'var(--brand-ring)' }}>+</span>{describeAction(a, tasks, tools, members, me, toolItems)}</li>)}
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
            {busy && msgs[msgs.length - 1]?.role === 'user' && (partial
              ? <div className="opacity-90"><Rich text={partial} /></div>
              : <p className="text-sm inline-flex items-center gap-2" style={{ color: 'var(--text-subtle)' }}><Loader2 className="w-4 h-4 animate-spin" /> MYND AI sta pensando… <span className="hidden sm:inline">puoi ridurre la finestra con −</span></p>
            )}
          </div>
          </>}
          <ErrorNote text={error} />
          {saveNote && <p className="text-[11px]" style={{ color: 'var(--text-subtle)' }}>{saveNote}</p>}
          <AINote />
          <div ref={endRef} />
        </>
      )}
    </Sheet>
  );
}
