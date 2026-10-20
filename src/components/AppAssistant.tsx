import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Loader2, Undo2, Check, Trash2, X, AppWindow, Package, Clock } from 'lucide-react';
import { UserData } from '../lib/store';
import { askAuto, autoReady, ChatTurn } from '../lib/ai';
import { ASSISTANT_SYSTEM, describeState, parseAnswer, applyActions, focusNote, customSummary, allApps, Action } from '../lib/assistant';
import { CustomPlan, Draft, loadMyPlan, sendRequest } from '../lib/customRequests';
import { sendSuggestion } from '../lib/suggestions';

// "Assistente MYND": a chat with the automatic AI that changes the app for real (Home panels, menu,
// names, versions, subjects, tasks…) and builds what is missing (blocks, sections, mini-apps).
// Every change is listed under the answer and the last one can be undone. The chat is kept in
// this browser. It opens from Home → Personalizza in a side panel (variant "studio").
// New functions with code (mini-apps) are personalisations sold in packages: the AI prepares them
// and the student sends them to the admin, who checks them and turns them on (lib/customRequests).

// A request for a function on measure, sent when the student confirmed it.
interface SentRequest { title: string; ok: boolean; error?: string }
interface Message {
  role: 'user' | 'assistant'; text: string; done?: string[]; skipped?: string[]; undone?: boolean; id: number; apps?: string[];
  sent?: SentRequest[];
}
// Only the team installs code (after checking it): the chat never runs these.
const BLOCKED_ACTIONS = ['create_app', 'update_app'];

// Data before each applied change (for "Annulla"): kept for this session, also when Personalizza is closed.
const SNAPSHOTS = new Map<number, UserData>();

// What the studio proposes first: new things to build.
const CREATE_SUGGESTIONS = [
  'Voglio delle flashcard per ripassare, divise per materia',
  'Un quiz che mi interroga sulle prossime verifiche',
  'Un calcolatore: che voto mi serve per arrivare al 7?',
  'Un diario dello studio con come mi sono sentito ogni giorno',
  'Un tracker del sonno con il grafico della settimana',
  'Una sezione Sport con abitudini e allenamenti',
];

const SUGGESTIONS = [
  'Metti i prossimi impegni in cima alla Home',
  'Nascondi la frase motivazionale',
  'Allenamento ogni martedì e giovedì alle 18 fino a giugno',
  'Obiettivo di 15 ore a settimana',
  'Crea una versione per preparare un esame universitario',
  'Aggiungi la materia Filosofia in viola',
  'Crea una sezione Sport con le abitudini e gli allenamenti',
  'Conto alla rovescia alla fine della scuola nella Home',
];

interface Props {
  data: UserData;
  darkMode: boolean;
  storageKey: string;
  userId?: string;   // to send the requests that need new code (Admin → Suggerimenti)
  onUpdateData: (update: (prev: UserData) => UserData) => void;
  onNavigate?: (section: string) => void;
  variant?: 'card' | 'studio';
  // A request from outside (e.g. "Modifica con l'AI" on a mini-app): text to complete and the app.
  request?: { text: string; appId?: string; n: number };
  onClose?: () => void;
}

export default function AppAssistant({ data, darkMode, storageKey, userId, onUpdateData, onNavigate, variant = 'card', request, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  // The mini-app being edited: its code goes to the AI with the next messages.
  const [focus, setFocus] = useState<string | undefined>(request?.appId);
  const studio = variant === 'studio';
  const demo = !userId || userId === 'demo';
  // The student's package of personalisations (null: loading or not available).
  const [plan, setPlan] = useState<CustomPlan | null>(null);
  const [planError, setPlanError] = useState('');
  const refreshPlan = () => { if (!demo) loadMyPlan(userId!).then(p => { setPlan(p); setPlanError(''); }).catch(e => setPlanError(e instanceof Error ? e.message : String(e))); };
  useEffect(refreshPlan, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!request) return;
    setFocus(request.appId);
    if (request.text) setInput(request.text);
    setTimeout(() => { const f = field.current; if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }, 50);
  }, [request?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(messages.slice(-40))); } catch { /* full */ } }, [messages, storageKey]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);

  const text = darkMode ? 'text-white' : 'text-gray-800';
  const sub = darkMode ? 'text-white/60' : 'text-gray-500';
  const well = darkMode ? 'bg-white/5' : 'bg-black/[0.04]';
  const ready = autoReady();
  const lastActionId = [...messages].reverse().find(m => SNAPSHOTS.has(m.id) && !m.undone)?.id;

  const send = async (raw?: string) => {
    const question = (raw ?? input).trim();
    if (!question || busy) return;
    setInput(''); setError('');
    const userMsg: Message = { role: 'user', text: question, id: Date.now() };
    const history = [...messages, userMsg];
    setMessages(history);
    setBusy(true);
    try {
      const turns: ChatTurn[] = history.slice(-10).map(m => ({ role: m.role, text: m.done?.length ? `${m.text}\n[Fatto: ${m.done.join('; ')}${m.undone ? ' — poi annullato dallo studente' : ''}]` : m.text }));
      const credits = demo ? 'nessuna: è la demo, serve un account' : plan ? `${plan.left} disponibili su ${plan.credits}` : planError ? 'non disponibili al momento' : 'nessuna';
      const system = `${ASSISTANT_SYSTEM}\n\nSTATO ATTUALE DELL'APP:\n${describeState(dataRef.current)}\nPERSONALIZZAZIONI DEL PACCHETTO: ${credits}.${focusNote(dataRef.current.settings, focus)}`;
      const answer = parseAnswer(await askAuto(system, turns));
      const id = Date.now() + 1;
      let done: string[] = [], skipped: string[] = [], navigate: string | undefined, apps: string[] = [];
      const actions = answer.actions.filter(a => a.type !== 'request_custom' && !BLOCKED_ACTIONS.includes(a.type));
      if (actions.length) {
        const before = dataRef.current;
        const result = applyActions(before, actions, answer.codes);
        done = result.done; skipped = result.skipped; navigate = result.navigate; apps = result.apps;
        if (apps.length) setFocus(apps[apps.length - 1]);
        if (done.length && result.data !== before) { SNAPSHOTS.set(id, before); onUpdateData(() => result.data); }
        // Things that need new code go to the developers (Admin → Suggerimenti).
        for (const r of result.requests) {
          if (!userId || userId === 'demo') { skipped.push('invio della richiesta (nella demo non si può)'); continue; }
          try {
            await sendSuggestion(userId, 'idea', `[Assistente MYND] ${r}`, 'assistente');
            done.push('Richiesta inviata agli sviluppatori di MYND');
          } catch {
            skipped.push('invio della richiesta: riprova più tardi o usa "Suggerisci una modifica" nel menu');
          }
        }
      }
      // Functions on measure: the request goes to the team (Admin → Personalizzazioni) right away.
      const sent: SentRequest[] = [];
      for (const a of answer.actions.filter(x => x.type === 'request_custom')) {
        const d = makeRequest(a, history);
        if (!d) { skipped.push('preparare la richiesta (riprova a chiedermelo)'); continue; }
        if (demo) { sent.push({ title: d.title, ok: false, error: 'Nella demo non si può: crea un account per avere le funzioni su misura.' }); continue; }
        try { await sendRequest(userId!, d); sent.push({ title: d.title, ok: true }); } catch (e) { sent.push({ title: d.title, ok: false, error: e instanceof Error ? e.message : String(e) }); }
      }
      if (sent.some(x => x.ok)) refreshPlan();
      // If nothing could be sent, the "Perfetto, inviata!" of the AI would be wrong.
      const reply = sent.length && !sent.some(x => x.ok) ? 'Non sono riuscito a inviare la richiesta.' : answer.reply;
      setMessages(m => [...m, { role: 'assistant', text: reply || (done.length || sent.length ? 'Fatto!' : 'Non ho capito bene: puoi dirmelo in un altro modo?'), done, skipped, id,
        ...(apps.length ? { apps } : {}), ...(sent.length ? { sent } : {}) }]);
      // In the studio the student keeps talking: the new thing opens behind it.
      if (navigate && onNavigate) setTimeout(() => onNavigate(navigate!), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // The idea confirmed by the student → request for the team, with what the student asked in words,
  // the AI's detailed version for the developer and what the student's MYND already has.
  const makeRequest = (a: Action, history: Message[]): Draft | null => {
    const settings = dataRef.current.settings;
    // Only what was said after the previous request sent (an earlier idea is not part of this one).
    const lastSent = history.map(m => !!m.sent?.some(x => x.ok)).lastIndexOf(true);
    const asked = history.slice(lastSent + 1).filter(m => m.role === 'user').slice(-10).map(m => `- ${m.text}`).join('\n');
    const summary = String(a.summary || '').trim();
    const spec = String(a.spec || '').trim().slice(0, 8000);
    if (!summary && !spec) return null;
    const idea = `${summary || 'Funzione su misura chiesta all\'Assistente MYND.'}\n\nCosa ha scritto lo studente:\n${asked}`;
    const key = String(a.target_app || '').trim();
    const target = key ? allApps(settings).find(b => b.id === key || b.title.toLowerCase() === key.toLowerCase()) : undefined;
    const base = { uses_data: a.uses_data === true || a.writes_data === true, writes_data: a.writes_data === true, description: summary, spec, context: customSummary(settings) };
    if (target) {
      return { title: target.title, idea, kind: 'update', target_app: target.id, html: '',
        placement: { ...base, uses_data: base.uses_data || target.config.data === true, writes_data: base.writes_data || target.config.write === true, current_html: String(target.config.html || '').slice(0, 150000) } };
    }
    return { title: String(a.title || 'La mia funzione').slice(0, 60), idea, kind: 'new', html: '',
      placement: { ...base, place: String(a.place || 'section'), position: a.position ? String(a.position) : undefined, icon: a.icon ? String(a.icon) : undefined } };
  };

  const askPackage = async () => {
    if (demo) { setError('Nella demo non si può: crea un account per avere le personalizzazioni.'); return; }
    try {
      await sendSuggestion(userId!, 'idea', '[Pacchetto personalizzazioni] Vorrei un pacchetto di personalizzazioni su misura per la mia MYND.', 'personalizzazioni');
      setMessages(ms => [...ms, { role: 'assistant', id: Date.now(), text: 'Ho inviato la tua richiesta di un pacchetto al team MYND: ti scriveranno all\'email del tuo account.' }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const undo = (m: Message) => {
    const snap = SNAPSHOTS.get(m.id);
    if (!snap) return;
    onUpdateData(() => snap);
    SNAPSHOTS.delete(m.id);
    setMessages(ms => ms.map(x => (x.id === m.id ? { ...x, undone: true } : x)));
  };

  const apps = allApps(data.settings);
  const focused = apps.find(b => b.id === focus);
  const chips = studio ? CREATE_SUGGESTIONS : SUGGESTIONS;
  const left = plan?.left ?? 0;
  const requests = plan?.requests || [];
  const STATUS: Record<string, [string, string]> = { pending: ['In lavorazione', 'var(--warning)'], approved: ['Attiva', 'var(--brand-ring)'], rejected: ['Non approvata', 'var(--danger)'] };
  const chip = 'text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap';

  return (
    <div className={studio ? 'flex flex-col h-full min-h-0' : `rounded-2xl p-4 ${well}`}
      style={studio ? undefined : { boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--brand-ring) 30%, transparent)' }}>
      <div className="flex items-center gap-2.5">
        <span className={`${studio ? 'w-10 h-10 rounded-2xl' : 'w-8 h-8 rounded-xl'} flex items-center justify-center flex-shrink-0`} style={{ background: 'color-mix(in srgb, var(--brand-fill) 16%, transparent)', color: 'var(--brand-ring)' }}>
          <Sparkles className={studio ? 'w-5 h-5' : 'w-4 h-4'} />
        </span>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold ${studio ? 'text-lg' : ''} ${text}`}>Assistente MYND</p>
          <p className={`text-xs ${sub}`}>{studio ? 'Dimmi di cosa hai bisogno: lo progettiamo insieme e lo costruisco io' : 'Dimmi come vuoi l’app e la sistemo io · modello automatico'}</p>
        </div>
        {messages.length > 0 && (
          <button onClick={() => { setMessages([]); SNAPSHOTS.clear(); setFocus(undefined); }} title="Nuova conversazione" aria-label="Cancella la conversazione"
            className={`p-2 rounded-lg ${sub} ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}><Trash2 className="w-4 h-4" /></button>
        )}
        {onClose && (
          <button onClick={onClose} aria-label="Chiudi" className={`p-2 rounded-lg ${sub} ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}><X className="w-5 h-5" /></button>
        )}
      </div>

      {studio && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`${chip} ${well} ${text}`}><Package className="w-3.5 h-3.5" style={{ color: 'var(--brand-ring)' }} />
            {demo ? 'Personalizzazioni: solo con un account' : planError ? 'Personalizzazioni: non disponibili' : plan ? `Personalizzazioni: ${plan.left} su ${plan.credits}` : 'Personalizzazioni: …'}
          </span>
          {!demo && !planError && plan && plan.left === 0 && (
            <button onClick={askPackage} className={`${chip} font-semibold`} style={{ color: 'var(--brand-ring)', background: 'color-mix(in srgb, var(--brand-fill) 12%, transparent)' }}>Richiedi un pacchetto</button>
          )}
        </div>
      )}

      <div ref={list} className={`mt-3 space-y-3 overflow-y-auto pr-1 ${studio ? 'flex-1 min-h-0 py-2' : 'max-h-80'}`}>
        {messages.length === 0 && (
          <div className="space-y-4">
            {studio && (
              <div className={`rounded-2xl p-4 text-sm space-y-1.5 ${well} ${sub}`}>
                <p className={`font-medium ${text}`}>MYND si adatta a te, al 100%.</p>
                <p>Descrivi la funzione che ti servirebbe, anche una sezione o la Home rifatta come vuoi tu: ti faccio qualche domanda, ti riassumo l'idea e, quando confermi, la invio al team MYND che la costruisce apposta per te e la attiva solo nella tua MYND. Ogni funzione nuova usa una personalizzazione del tuo pacchetto.</p>
                <p>Sistemare la Home, il menu, i nomi, le materie e gli impegni invece è gratis e immediato.</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {chips.map(c => (
                <button key={c} onClick={() => send(c)} disabled={!ready || busy}
                  className={`text-xs px-3 py-1.5 rounded-full border text-left disabled:opacity-50 ${darkMode ? 'border-white/10 text-white/75 hover:bg-white/10' : 'border-black/10 text-gray-600 hover:bg-black/5'}`}>{c}</button>
              ))}
            </div>
            {studio && requests.length > 0 && (
              <div>
                <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${sub}`}>Le tue richieste</p>
                <div className="space-y-1.5">
                  {requests.slice(0, 8).map(r => (
                    <div key={r.id} className={`rounded-xl px-3 py-2 text-sm ${well}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate ${text}`}>{r.kind === 'update' ? 'Modifica: ' : ''}{r.title}</span>
                        <span className="text-xs font-semibold flex-shrink-0" style={{ color: STATUS[r.status][1] }}>{STATUS[r.status][0]}</span>
                      </div>
                      {r.admin_note && <p className={`text-xs mt-1 ${sub}`}>{r.admin_note}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {studio && apps.length > 0 && (
              <div>
                <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${sub}`}>Le tue creazioni</p>
                <div className="flex flex-wrap gap-2">
                  {apps.map(b => (
                    <button key={b.id} onClick={() => { setFocus(b.id); setInput(`Modifica "${b.title}": `); field.current?.focus(); }}
                      className={`text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 ${well} ${text}`}><AppWindow className="w-3.5 h-3.5" style={{ color: 'var(--brand-ring)' }} />{b.title}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {messages.map(m => m.role === 'user' ? (
          <div key={m.id} className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-sm whitespace-pre-line" style={{ background: 'var(--brand-fill)', color: 'var(--on-brand)' }}>{m.text}</p>
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
            {m.sent?.map((r, i) => (
              <div key={i} className={`mt-2 rounded-xl p-3 space-y-1 ${darkMode ? 'bg-black/20' : 'bg-white/70'}`} style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${r.ok ? 'var(--brand-ring)' : 'var(--danger)'} 25%, transparent)` }}>
                <p className={`text-sm font-semibold flex items-center gap-1.5 ${text}`}><AppWindow className="w-4 h-4" style={{ color: 'var(--brand-ring)' }} />{r.title}</p>
                {r.ok
                  ? <p className={`text-xs flex items-center gap-1.5 ${sub}`}><Clock className="w-3.5 h-3.5 flex-shrink-0" /> Richiesta inviata: la modifica verrà fatta il prima possibile e la troverai nella tua MYND.</p>
                  : <p className="text-xs text-red-400">{r.error}{!demo && left < 1 && <> <button onClick={askPackage} className="font-semibold underline" style={{ color: 'var(--brand-ring)' }}>Richiedi un pacchetto</button></>}</p>}
              </div>
            ))}
            {!!m.skipped?.length && <p className={`text-xs mt-1 ${sub}`}>Non ho potuto: {m.skipped.join(', ')}.</p>}
          </div>
        ))}
        {busy && <p className={`text-sm flex items-center gap-2 ${sub}`}><Loader2 className="w-4 h-4 animate-spin" /> Ci penso…</p>}
      </div>

      {error && <p className="text-sm text-red-400 mt-2 whitespace-pre-line">{error}</p>}
      {!ready && <p className={`text-xs mt-2 ${sub}`}>Per usare l'assistente collega una chiave AI gratuita (Gemini) nella Guida Studio AI.</p>}

      {focused && (
        <p className={`text-xs mt-2 flex items-center gap-1.5 ${sub}`}>
          <AppWindow className="w-3.5 h-3.5" style={{ color: 'var(--brand-ring)' }} /> Stai lavorando su «{focused.title}»
          <button onClick={() => setFocus(undefined)} aria-label="Smetti di modificare questa mini-app" className="p-0.5 rounded hover:opacity-70"><X className="w-3 h-3" /></button>
        </p>
      )}
      <form onSubmit={e => { e.preventDefault(); send(); }} className="mt-2 flex items-end gap-2">
        <textarea ref={field} value={input} onChange={e => setInput(e.target.value)} disabled={!ready} maxLength={studio ? 2000 : 600} rows={studio ? 2 : 1}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={studio ? 'Es. un posto per i libri da leggere, con voto e citazioni' : 'Es. sposta il calendario in alto e aggiungi la verifica di storia venerdì'}
          className={`${darkMode ? 'input-glass' : 'input-light'} flex-1 min-w-0 text-sm resize-none`} />
        <button type="submit" disabled={!ready || busy || !input.trim()} aria-label="Invia" className="btn-primary h-10 w-10 !p-0 flex items-center justify-center flex-shrink-0 disabled:opacity-40">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
