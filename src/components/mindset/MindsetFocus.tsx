import { useEffect, useState } from 'react';
import { Play, Square, X, Plus, Smartphone, Check } from 'lucide-react';
import { MindsetData, PriorityArea, ActiveFocus, withDay, formatDuration, localStamp } from '../../lib/mindset';
import { createId, toDateKey } from '../../lib/store';
import { Theme, Section, Pill, useNow } from './ui';

const MODES = [
  { work: 25, pause: 5, name: 'Pomodoro', note: 'per iniziare quando costa fatica' },
  { work: 50, pause: 10, name: 'Deep work', note: 'il formato standard' },
  { work: 90, pause: 15, name: 'Deep work lungo', note: 'per le prime ore del mattino' },
];
const AREA_LABEL: Record<PriorityArea | 'other', string> = { school: 'Scuola', sport: 'Sport', project: 'Progetto', other: 'Altro' };

interface Props {
  m: MindsetData;
  update: (fn: (m: MindsetData) => MindsetData) => void;
  t: Theme;
  subjects: string[];
  preset: { task: string; area: PriorityArea | 'other' } | null;
  onPresetUsed: () => void;
  // School focus also counts in the Study Timer (subject statistics).
  onStudySession: (subject: string, minutes: number) => void;
}

export default function MindsetFocus({ m, update, t, subjects, preset, onPresetUsed, onStudySession }: Props) {
  const active = m.activeFocus || null;
  const now = useNow(active ? 1000 : 30_000);
  const today = toDateKey(now);
  const firstOpen = (m.days[today]?.priorities || []).find(p => !p.done && p.area !== 'sport');
  const [mode, setMode] = useState(1);
  const [task, setTask] = useState(preset?.task || firstOpen?.text || '');
  const [area, setArea] = useState<PriorityArea | 'other'>(preset?.area || firstOpen?.area || 'school');
  const [subject, setSubject] = useState('');
  const [rating, setRating] = useState<number | null>(null);

  useEffect(() => {
    if (!preset) return;
    setTask(preset.task);
    setArea(preset.area);
    onPresetUsed();
  }, [preset, onPresetUsed]);

  const start = () => {
    const f: ActiveFocus = { start: new Date().toISOString(), planned: MODES[mode].work, pause: MODES[mode].pause, task: task.trim() || 'Focus', area, subject: area === 'school' && subject ? subject : undefined, interruptions: 0 };
    update(x => ({ ...x, activeFocus: f }));
  };

  const finish = (f: ActiveFocus, minutes: number, score?: number) => {
    const key = toDateKey(new Date(f.start));
    update(x => withDay({ ...x, activeFocus: null }, key, l => ({
      ...l,
      focus: [...(l.focus || []), { id: createId(), start: localStamp(new Date(f.start)), minutes, task: f.task, area: f.area, rating: score, interruptions: f.interruptions, subject: f.subject }],
    })));
    if (f.subject && minutes > 0) onStudySession(f.subject, minutes);
    setRating(null);
  };

  if (active) {
    const elapsedSec = Math.max(0, Math.floor((now.getTime() - new Date(active.start).getTime()) / 1000));
    const total = active.planned * 60;
    const left = total - elapsedSec;
    const done = left <= 0;
    const shown = Math.max(0, left);
    const r = 110;
    const c = 2 * Math.PI * r;
    return (
      <div className={`${t.card} p-6 sm:p-8 flex flex-col items-center text-center`}>
        <p className={`text-xs uppercase tracking-[0.2em] ${t.sub}`}>{AREA_LABEL[active.area]} · {active.planned} minuti</p>
        <h2 className={`text-xl sm:text-2xl font-semibold mt-1 ${t.text}`}>{active.task}</h2>
        <div className="relative my-6" style={{ width: 2 * r + 20, height: 2 * r + 20 }}>
          <svg width={2 * r + 20} height={2 * r + 20} className="-rotate-90">
            <circle cx={r + 10} cy={r + 10} r={r} fill="none" strokeWidth={8} className={t.dark ? 'stroke-white/10' : 'stroke-black/10'} />
            <circle cx={r + 10} cy={r + 10} r={r} fill="none" strokeWidth={8} strokeLinecap="round" stroke={done ? 'var(--success)' : 'var(--brand-ring)'}
              strokeDasharray={c} strokeDashoffset={c * (shown / total)} style={{ transition: 'stroke-dashoffset 1s linear', filter: t.dark ? 'drop-shadow(0 0 12px rgba(200,242,90,.25))' : undefined }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-5xl font-bold tabular-nums ${t.text}`}>{String(Math.floor(shown / 60)).padStart(2, '0')}:{String(shown % 60).padStart(2, '0')}</span>
            <span className={`text-sm mt-1 ${t.sub}`}>{done ? 'completata' : `${formatDuration(elapsedSec / 60)} di focus`}</span>
          </div>
        </div>
        {done ? (
          <div className="space-y-4 animate-scale-in">
            <p className={`text-lg font-semibold ${t.text}`}>Sessione completata. Ora {active.pause} minuti di pausa, lontano dallo schermo.</p>
            <p className={`text-sm ${t.sub}`}>Quanto eri concentrato?</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setRating(n)} aria-label={`Concentrazione ${n}`}
                  className={`w-11 h-11 rounded-xl font-semibold ${rating === n ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-[var(--on-brand)]' : `${t.soft} ${t.text} ${t.hover}`}`}>{n}</button>
              ))}
            </div>
            <button onClick={() => finish(active, active.planned, rating ?? undefined)} className="btn-primary text-sm flex items-center gap-2 mx-auto">
              <Check className="w-4 h-4" /> Salva sessione
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={() => update(x => ({ ...x, activeFocus: x.activeFocus ? { ...x.activeFocus, interruptions: x.activeFocus.interruptions + 1 } : null }))}
              className={`px-4 py-2 rounded-xl text-sm flex items-center gap-2 ${t.soft} ${t.text} ${t.hover}`}>
              <Plus className="w-4 h-4" /> Interruzione ({active.interruptions})
            </button>
            <button onClick={() => finish(active, Math.round(elapsedSec / 60))} disabled={elapsedSec < 60}
              className={`px-4 py-2 rounded-xl text-sm flex items-center gap-2 disabled:opacity-40 ${t.soft} ${t.text} ${t.hover}`}>
              <Square className="w-4 h-4" /> Termina ora
            </button>
            <button onClick={() => update(x => ({ ...x, activeFocus: null }))} className={`px-4 py-2 rounded-xl text-sm flex items-center gap-2 text-red-400 hover:bg-red-500/10`}>
              <X className="w-4 h-4" /> Annulla
            </button>
          </div>
        )}
        {!done && <p className={`text-xs mt-6 flex items-center gap-1.5 ${t.sub}`}><Smartphone className="w-3.5 h-3.5" /> Un compito solo · Full Immersion attiva · telefono in un'altra stanza</p>}
      </div>
    );
  }

  const sessions = m.days[today]?.focus || [];
  const totalToday = sessions.reduce((s, f) => s + f.minutes, 0);
  return (
    <div className="space-y-4">
      <div className={`${t.card} p-5 sm:p-6 space-y-5`}>
        <div>
          <h2 className={`text-xl font-semibold ${t.text}`}>Focus</h2>
          <p className={`text-sm ${t.sub}`}>Un compito solo, niente notifiche, niente multitasking.</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map((md, i) => (
            <button key={md.work} onClick={() => setMode(i)}
              className={`p-3 rounded-2xl text-left transition-all ${mode === i ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-[var(--on-brand)] shadow-lg shadow-indigo-500/25' : `${t.soft} ${t.hover}`}`}>
              <span className={`block text-lg font-bold tabular-nums ${mode === i ? '' : t.text}`}>{md.work}/{md.pause}</span>
              <span className={`block text-sm font-medium ${mode === i ? '' : t.text}`}>{md.name}</span>
              <span className={`block text-[11px] ${mode === i ? 'text-white/75' : t.sub}`}>{md.note}</span>
            </button>
          ))}
        </div>
        <input value={task} onChange={e => setTask(e.target.value)} className={`${t.input} w-full`} placeholder="Su cosa lavori? Es. esercizi 31–40" aria-label="Compito" />
        <div className="flex flex-wrap gap-1.5">
          {(['school', 'project', 'other'] as const).map(a => <Pill key={a} t={t} active={area === a} onClick={() => setArea(a)}>{AREA_LABEL[a]}</Pill>)}
        </div>
        {area === 'school' && subjects.length > 0 && (
          <select value={subject} onChange={e => setSubject(e.target.value)} className={`${t.input} w-full`} aria-label="Materia">
            <option value="">Materia (facoltativa: il tempo va anche nel Timer Studio)</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <button onClick={start} className="btn-primary w-full py-3 text-base flex items-center justify-center gap-2">
          <Play className="w-5 h-5" /> Inizia {MODES[mode].work} minuti
        </button>
      </div>

      <Section title={`Oggi · ${formatDuration(totalToday)} di focus`} t={t}>
        {sessions.length === 0 ? <p className={`text-sm ${t.sub}`}>Nessuna sessione ancora. La prima è la più difficile: anche 25 minuti contano.</p> : (
          <ul className="space-y-1.5">
            {sessions.map(f => (
              <li key={f.id} className={`flex items-center gap-3 p-2.5 rounded-xl text-sm ${t.soft}`}>
                <span className={`tabular-nums text-xs ${t.sub}`}>{f.start.slice(11)}</span>
                <span className={`flex-1 truncate ${t.text}`}>{f.task}</span>
                <span className={t.sub}>{formatDuration(f.minutes)}</span>
                {f.rating && <span className="text-xs text-indigo-400">{f.rating}/5</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
