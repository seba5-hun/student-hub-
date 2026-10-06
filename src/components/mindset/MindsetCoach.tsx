import React, { useEffect, useRef, useState } from 'react';
import { Send, Square, Bot, Loader2, CalendarCheck, Undo2, Trash2, Sparkles } from 'lucide-react';
import { MindsetData, CoachMessage, CoachPlan, Priority, AREAS, PRIORITY_AREAS, withDay, formatDuration, blockRange, blocksOf, localStamp } from '../../lib/mindset';
import { buildCoachContext, parsePlan, COACH_SYSTEM, StudyInfo } from '../../lib/mindsetCoach';
import { askTutor, isReady, providerLabel, ChatTurn, StoppedError } from '../../lib/ai';
import { createId, toDateKey } from '../../lib/store';
import AISettings from '../AISettings';
import ModelPicker from '../ModelPicker';
import { Theme, AreaDot } from './ui';
import { useDialog } from '../Dialog';

interface Props {
  m: MindsetData;
  update: (fn: (m: MindsetData) => MindsetData) => void;
  t: Theme;
  study: StudyInfo;
}

const QUICK = [
  'Oggi è un casino: riorganizzami il resto della giornata',
  'Programmami la giornata di domani',
  'Ho dormito male: come adatto oggi?',
  'Ho saltato l\'allenamento, cosa faccio?',
  'Com\'è andata questa settimana?',
];
const MAX_SAVED = 60;

function Formatted({ text }: { text: string }) {
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <React.Fragment key={i}>{part}</React.Fragment>);
  return (
    <div className="text-sm space-y-1 leading-relaxed">
      {text.split('\n').map((line, i) => {
        const h = /^(#{1,4})\s+(.*)$/.exec(line);
        if (h) return <p key={i} className="font-semibold mt-2">{inline(h[2])}</p>;
        const b = /^(\s*)[-*•]\s+(.*)$/.exec(line);
        if (b) return <p key={i} className="pl-4 -indent-3">• {inline(b[2])}</p>;
        if (!line.trim()) return <div key={i} className="h-1.5" />;
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}

export default function MindsetCoach({ m, update, t, study }: Props) {
  const dialog = useDialog();
  const [ready, setReady] = useState(isReady);
  const [settings, setSettings] = useState(false);
  const [, setAiName] = useState(providerLabel);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messages = m.coach || [];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, loading]);
  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const id = window.setInterval(() => setElapsed(s => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [loading]);

  const save = (fn: (list: CoachMessage[]) => CoachMessage[]) => update(x => ({ ...x, coach: fn(x.coach || []).slice(-MAX_SAVED) }));

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setInput('');
    setError('');
    const userMsg: CoachMessage = { id: createId(), role: 'user', text: q, at: localStamp(new Date()) };
    save(list => [...list, userMsg]);
    const history: ChatTurn[] = [...messages, userMsg].slice(-14).map(x => ({
      role: x.role,
      // The assistant also sees the plans it proposed (and whether they were applied).
      text: x.plan ? `${x.text}\n\n[Piano proposto per ${x.plan.day}${x.applied ? ', applicato' : ''}: ${x.plan.blocks.map(b => `${b.start}-${b.end} ${b.title}`).join('; ')}]` : x.text,
    }));
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const reply = await askTutor(COACH_SYSTEM, async () => buildCoachContext(m, study, new Date()), history, controller.signal);
      const { text: answer, plan } = parsePlan(reply || '', toDateKey(new Date()));
      save(list => [...list, { id: createId(), role: 'assistant', text: answer || (plan ? 'Ecco la proposta:' : 'Non ho una risposta, riprova.'), at: localStamp(new Date()), plan }]);
    } catch (err) {
      if (!(err instanceof StoppedError) && !controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const applyPlan = (msg: CoachMessage, plan: CoachPlan) => {
    update(x => {
      const prev = x.days[plan.day] || {};
      // Another plan already applied to that day: undoing this one goes back to before both.
      const earlier = (x.coach || []).find(c => c.applied && c.plan?.day === plan.day && c.id !== msg.id);
      const previous = earlier?.previous || { blocks: prev.blocks, priorities: prev.priorities };
      const priorities: Priority[] = [...(prev.priorities || [])];
      (Object.entries(plan.priorities) as [Priority['area'], string][]).forEach(([area, text]) => {
        const i = priorities.findIndex(p => p.area === area);
        const item: Priority = { id: createId(), area, text, done: false };
        if (i >= 0) priorities[i] = item; else priorities.push(item);
      });
      // A plan for today starts from now: what was already planned (and done) before it stays.
      const firstStart = Math.min(...plan.blocks.map(b => blockRange(b)[0]));
      const kept = plan.day === toDateKey(new Date())
        ? blocksOf(x, plan.day).filter(b => blockRange(b)[1] <= firstStart && !plan.blocks.some(p => p.id === b.id))
        : [];
      const next = withDay(x, plan.day, l => ({ ...l, blocks: [...kept, ...plan.blocks], priorities }));
      return {
        ...next,
        coach: (next.coach || []).map(c => (c.id === msg.id ? { ...c, applied: true, previous }
          : c.applied && c.plan?.day === plan.day ? { ...c, applied: false, previous: undefined } : c)),
      };
    });
  };
  const undoPlan = (msg: CoachMessage, plan: CoachPlan) => {
    update(x => {
      const next = withDay(x, plan.day, l => ({ ...l, blocks: msg.previous?.blocks, priorities: msg.previous?.priorities }));
      return { ...next, coach: (next.coach || []).map(c => (c.id === msg.id ? { ...c, applied: false, previous: undefined } : c)) };
    });
  };

  if (!ready || settings) {
    return (
      <AISettings darkMode={t.dark} onDone={() => { setReady(isReady()); setSettings(false); setAiName(providerLabel()); }}
        onCancel={ready ? () => setSettings(false) : undefined}
        geminiGuide={<p className={`text-sm ${t.sub}`}>Vai su aistudio.google.com/app/apikey, crea una chiave gratuita e incollala qui.</p>} />
    );
  }

  const today = toDateKey(new Date());
  return (
    <div className={`${t.card} flex flex-col`} style={{ minHeight: 'calc(100vh - 14rem)' }}>
      <div className={`flex items-center justify-between gap-2 p-4 border-b ${t.border}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0"><Bot className="w-5 h-5 text-white" /></div>
          <div className="min-w-0">
            <p className={`font-semibold ${t.text}`}>Mindset Coach</p>
            <p className={`text-xs truncate ${t.sub}`}>Conosce la tua giornata, il sonno, gli impegni e lo studio</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ModelPicker darkMode={t.dark} compact onChange={() => setAiName(providerLabel())} onOpenSettings={() => setSettings(true)} />
          {messages.length > 0 && (
            <button onClick={async () => { if (await dialog.confirm({ title: 'Cancellare la conversazione?', confirmLabel: 'Cancella', danger: true })) save(() => []); }}
              className={`p-2 rounded-lg ${t.sub} ${t.hover}`} aria-label="Cancella conversazione"><Trash2 className="w-4 h-4" /></button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <Sparkles className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
            <p className={`font-medium ${t.text}`}>Raccontami la giornata, anche se è complicata.</p>
            <p className={`text-sm mt-1 ${t.sub}`}>Ti propongo un programma: lo applichi alla sezione Oggi con un tocco, e puoi sempre annullarlo.</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] rounded-2xl px-4 py-3 ${msg.role === 'user'
              ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
              : `${t.soft} ${t.text}`}`}>
              {msg.role === 'user' ? <p className="text-sm whitespace-pre-wrap">{msg.text}</p> : <Formatted text={msg.text} />}
              {msg.plan && <PlanCard plan={msg.plan} applied={!!msg.applied} t={t} today={today}
                onApply={() => applyPlan(msg, msg.plan!)} onUndo={() => undoPlan(msg, msg.plan!)} />}
            </div>
          </div>
        ))}
        {loading && (
          <div className={`flex items-center gap-2 text-sm ${t.sub}`}>
            <Loader2 className="w-4 h-4 animate-spin" /> Il coach sta pensando… {elapsed > 2 ? `${elapsed}s` : ''}
          </div>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div ref={endRef} />
      </div>

      <div className={`p-3 border-t ${t.border} space-y-2`}>
        {messages.length < 2 && !loading && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {QUICK.map(q => (
              <button key={q} onClick={() => send(q)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs ${t.soft} ${t.text} ${t.hover}`}>{q}</button>
            ))}
          </div>
        )}
        <form onSubmit={e => { e.preventDefault(); send(input); }} className="flex items-end gap-2">
          <textarea value={input} onChange={e => setInput(e.target.value)} rows={Math.min(5, Math.max(1, input.split('\n').length))}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder="Es. oggi esco da scuola alle 13, alle 17 ho il dentista e domani ho la verifica di storia…"
            className={`${t.input} flex-1 resize-none py-2.5`} aria-label="Messaggio al coach" />
          {loading ? (
            <button type="button" onClick={() => abortRef.current?.abort()} className="p-3 rounded-xl bg-red-500/80 text-white" aria-label="Ferma"><Square className="w-4 h-4" /></button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="p-3 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white disabled:opacity-40" aria-label="Invia"><Send className="w-4 h-4" /></button>
          )}
        </form>
      </div>
    </div>
  );
}

function PlanCard({ plan, applied, onApply, onUndo, t, today }: { plan: CoachPlan; applied: boolean; onApply: () => void; onUndo: () => void; t: Theme; today: string }) {
  const label = plan.day === today ? 'oggi' : new Date(`${plan.day}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric' });
  const prios = PRIORITY_AREAS.filter(a => plan.priorities[a.id]);
  return (
    <div className={`mt-3 rounded-xl p-3 ${t.dark ? 'bg-black/20' : 'bg-white'} ring-1 ${t.dark ? 'ring-white/10' : 'ring-black/5'}`}>
      <p className={`text-xs uppercase tracking-wider mb-2 ${t.sub}`}>Programma per {label}</p>
      <ul className="space-y-1">
        {plan.blocks.map(b => {
          const [s, e] = blockRange(b);
          return (
            <li key={b.id} className="flex items-center gap-2 text-sm">
              <span className={`w-11 tabular-nums text-xs ${t.sub}`}>{b.start}</span>
              <AreaDot area={b.area} />
              <span className={`flex-1 ${t.text}`}>{b.title}</span>
              <span className={`text-xs ${t.sub}`}>{formatDuration(e - s)}</span>
            </li>
          );
        })}
      </ul>
      {prios.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {prios.map(a => <p key={a.id} className="text-xs"><span className="font-semibold" style={{ color: AREAS[a.id === 'school' ? 'school' : a.id === 'sport' ? 'sport' : 'project'].color }}>{a.label}:</span> <span className={t.text}>{plan.priorities[a.id]}</span></p>)}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        {applied ? (
          <>
            <span className="text-sm text-emerald-400 flex items-center gap-1.5"><CalendarCheck className="w-4 h-4" /> Applicato a {label}</span>
            <button onClick={onUndo} className={`ml-auto text-xs flex items-center gap-1 ${t.sub} hover:text-indigo-400`}><Undo2 className="w-3.5 h-3.5" /> Annulla</button>
          </>
        ) : (
          <button onClick={onApply} className="btn-primary text-sm flex items-center gap-2"><CalendarCheck className="w-4 h-4" /> Applica a {label}</button>
        )}
      </div>
    </div>
  );
}
