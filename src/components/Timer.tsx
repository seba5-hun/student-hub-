import React, { useState, useEffect, useMemo } from 'react';
import { Play, Pause, Save, Trash2, Palette, Plus, RotateCcw, Split, Minus } from 'lucide-react';
import { useDialog } from './Dialog';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import SubjectManager from './SubjectManager';
import { StudySession, Grade, SubjectDef, subjectColor, getSubjectStudyTime, createId, formatDate } from '../lib/store';

interface TimerProps {
  sessions: StudySession[];
  extraSubjects?: string[];
  grades: Grade[];
  darkMode: boolean;
  onUpdate: (sessions: StudySession[]) => void;
  preselectedSubject?: string;
  subjectDefs: SubjectDef[];
  onUpdateSubjects: (subjects: SubjectDef[]) => void;
  onRenameSubject: (oldName: string, newName: string) => void;
}

const TIMER_KEY = 'studenthub_timer';

// 45 → "45 min", 90 → "1 h 30 min", 120 → "2 h"
export function formatMinutes(total: number): string {
  const m = Math.round(total);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

// Time of the running session, per subject ('' = not assigned yet, split when saving).
interface TimerState {
  subject: string;
  segments: Record<string, number>; // ms already counted per subject
  startedAt: number | null;         // running chunk, counted for `subject`
}

function loadTimerState(): TimerState | null {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Older versions kept a single total for one subject.
    const segments = parsed.segments && typeof parsed.segments === 'object'
      ? parsed.segments
      : parsed.accumulatedMs ? { [parsed.subject || '']: parsed.accumulatedMs } : {};
    return { subject: parsed.subject || '', segments, startedAt: parsed.startedAt ?? null };
  } catch {
    return null;
  }
}

function saveTimerState(state: TimerState | null): void {
  try {
    if (state) localStorage.setItem(TIMER_KEY, JSON.stringify(state));
    else localStorage.removeItem(TIMER_KEY);
  } catch { /* ignore */ }
}

export default function Timer({ sessions, extraSubjects = [], grades, darkMode, onUpdate, preselectedSubject, subjectDefs, onUpdateSubjects, onRenameSubject }: TimerProps) {
  const dialog = useDialog();
  // Time is computed from timestamps (not by counting ticks), so it stays correct when the
  // tab is in background, and the state is saved so the timer survives changing section.
  const [saved] = useState(loadTimerState);
  const [subject, setSubject] = useState(preselectedSubject || saved?.subject || '');
  const [segments, setSegments] = useState<Record<string, number>>(saved?.segments || {});
  const [startedAt, setStartedAt] = useState<number | null>(saved?.startedAt ?? null);
  const [now, setNow] = useState(Date.now());
  const [splitting, setSplitting] = useState<Record<string, number> | null>(null); // minutes per subject
  const isRunning = startedAt !== null;
  const liveMs = startedAt !== null ? Math.max(0, now - startedAt) : 0;
  // Time per subject in this session, including the chunk that is running now.
  const parts: Record<string, number> = { ...segments };
  if (liveMs > 0) parts[subject] = (parts[subject] || 0) + liveMs;
  const totalMs = Object.values(parts).reduce((sum, ms) => sum + ms, 0);
  const seconds = Math.floor(totalMs / 1000);
  const unassignedMs = parts[''] || 0;

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';

  const [showSubjects, setShowSubjects] = useState(false);

  // All subjects live in "Le mie materie" (the app adds the ones found in the data).
  const ownNames = subjectDefs.map(d => d.name);
  const otherNames = subject && !ownNames.some(o => o.toLowerCase() === subject.toLowerCase()) ? [subject] : [];

  const renameSubject = (oldName: string, newName: string) => {
    onRenameSubject(oldName, newName);
    if (subject.toLowerCase() === oldName.toLowerCase()) setSubject(newName);
  };

  useEffect(() => {
    if (!isRunning) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  useEffect(() => {
    const hasTime = startedAt !== null || Object.values(segments).some(ms => ms > 0);
    saveTimerState(hasTime ? { subject, segments, startedAt } : null);
  }, [subject, segments, startedAt]);

  // Closes the running chunk and credits it to the current subject.
  const commitRunning = (at: number) => {
    if (startedAt === null) return segments;
    const next = { ...segments, [subject]: (segments[subject] || 0) + Math.max(0, at - startedAt) };
    setSegments(next);
    return next;
  };

  // Changing subject while the timer runs splits the time automatically.
  const changeSubject = (value: string) => {
    if (value === subject) return;
    if (startedAt !== null) {
      const at = Date.now();
      commitRunning(at);
      setStartedAt(at);
    }
    setSubject(value);
  };

  useEffect(() => { if (preselectedSubject) changeSubject(preselectedSubject); }, [preselectedSubject]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => setStartedAt(Date.now());
  const pause = () => {
    if (startedAt === null) return;
    commitRunning(Date.now());
    setStartedAt(null);
  };
  const reset = () => {
    setSegments({});
    setStartedAt(null);
    setSplitting(null);
  };

  const saveParts = (minutesBySubject: Record<string, number>) => {
    const date = new Date().toISOString();
    const newSessions: StudySession[] = Object.entries(minutesBySubject)
      .filter(([name, minutes]) => name && minutes > 0)
      .map(([name, minutes]) => ({ id: createId(), subject: name, duration: Math.round(minutes), date }));
    if (newSessions.length) onUpdate([...sessions, ...newSessions]);
    reset();
  };

  // Stops the timer and returns the minutes per subject, rounded so they add up to the total.
  const stopAndCount = (): Record<string, number> => {
    const final = commitRunning(Date.now());
    setStartedAt(null);
    const totalMin = Math.round(Object.values(final).reduce((sum, ms) => sum + ms, 0) / 60000);
    const entries = Object.entries(final).filter(([, ms]) => ms > 0);
    const minutes: Record<string, number> = {};
    let used = 0;
    entries.forEach(([name, ms], i) => {
      const m = i === entries.length - 1 ? Math.max(0, totalMin - used) : Math.round(ms / 60000);
      minutes[name] = m;
      used += m;
    });
    return minutes;
  };

  // Opens the split panel, starting from the current division.
  const openSplit = (minutes: Record<string, number> = stopAndCount()) => {
    const draft: Record<string, number> = {};
    ownNames.forEach(n => { draft[n] = 0; });
    Object.entries(minutes).forEach(([n, m]) => { if (n) draft[n] = m; });
    draft[''] = minutes[''] || 0;
    setSplitting(draft);
  };

  const handleSave = () => {
    if (seconds < 60) return;
    const minutes = stopAndCount();
    // Some time has no subject yet: it has to be split first.
    if (minutes['']) openSplit(minutes);
    else saveParts(minutes);
  };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };


  const resetStats = async () => {
    const ok = await dialog.confirm({
      title: 'Azzerare le statistiche di studio?',
      message: 'Tutte le sessioni registrate vengono eliminate: ore settimanali, serie di giorni, grafici e tempo per materia ripartono da zero su tutti i dispositivi. Impegni, voti, materie e archivio non vengono toccati. L\'operazione non si può annullare.',
      confirmLabel: 'Azzera tutto',
      danger: true,
    });
    if (!ok) return;
    onUpdate([]);
    reset();
  };

  // The chart and the list don't depend on the running time: memoized so the timer ticking
  // every second doesn't redraw them.
  const distribution = useMemo(() => {
    const pieData = Object.entries(getSubjectStudyTime(sessions))
      .map(([name, minutes]) => ({ name, value: minutes }))
      .sort((a, b) => b.value - a.value);
    const total = pieData.reduce((sum, d) => sum + d.value, 0);
    const surface = darkMode ? '#241d4a' : '#ffffff';
    return (
      <div className={`${cardClass} p-6`}>
        <h3 className={`font-semibold mb-4 ${textColor}`}>Distribuzione tempo</h3>
        {pieData.length > 0 ? (
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative w-56 h-56 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={62} outerRadius={100} dataKey="value"
                    stroke={surface} strokeWidth={2} paddingAngle={pieData.length > 1 ? 1 : 0} labelLine={false}
                    label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                      if (percent < 0.07) return null;
                      const r = (innerRadius + outerRadius) / 2;
                      const x = cx + r * Math.cos(-midAngle * Math.PI / 180);
                      const y = cy + r * Math.sin(-midAngle * Math.PI / 180);
                      return (
                        <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700}
                          style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.35)', strokeWidth: 3 }}>
                          {`${Math.round(percent * 100)}%`}
                        </text>
                      );
                    }}>
                    {pieData.map(d => <Cell key={d.name} fill={subjectColor(d.name, subjectDefs)} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: darkMode ? '#1f2937' : '#fff', border: darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', borderRadius: '10px', fontSize: 13 }}
                    itemStyle={{ color: darkMode ? '#fff' : '#1f2937' }}
                    formatter={(val: number, name: string) => [`${formatMinutes(val)} · ${Math.round((val / total) * 100)}%`, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className={`text-2xl font-bold tabular-nums ${textColor}`}>{(total / 60).toFixed(1)} h</span>
                <span className={`text-xs ${subTextColor}`}>in totale</span>
              </div>
            </div>
            <ul className="flex-1 w-full space-y-2" aria-label="Tempo per materia">
              {pieData.map(d => (
                <li key={d.name} className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: subjectColor(d.name, subjectDefs) }} />
                  <span className={`flex-1 text-sm font-medium truncate ${textColor}`}>{d.name}</span>
                  <span className={`text-sm tabular-nums ${textColor}`}>{formatMinutes(d.value)}</span>
                  <span className={`text-xs tabular-nums w-10 text-right ${subTextColor}`}>{Math.round((d.value / total) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        ) : <p className={`text-sm ${subTextColor} text-center py-8`}>Nessuna sessione</p>}
      </div>
    );
  }, [sessions, subjectDefs, darkMode, cardClass, textColor, subTextColor]);

  const recentList = useMemo(() => (
        sessions.length === 0 ? <p className={`text-sm ${subTextColor}`}>Nessuna sessione</p> : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {[...sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10).map(session => (
              <div key={session.id} className={`flex items-center justify-between p-3 rounded-lg ${darkMode ? 'bg-white/5' : 'bg-black/5'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: subjectColor(session.subject, subjectDefs) }}>
                    {session.subject[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${textColor}`}>{session.subject}</p>
                    <p className={`text-xs ${subTextColor}`}>{formatDate(session.date)} • {formatMinutes(session.duration)}</p>
                  </div>
                </div>
                <button onClick={() => onUpdate(sessions.filter(s => s.id !== session.id))} className="p-2 text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )
  ), [sessions, subjectDefs, darkMode, textColor, subTextColor, onUpdate]);

  return (
    <div className="space-y-6">
      <h2 className={`text-2xl font-bold ${textColor}`}>⏱️ Timer Studio</h2>

      <div className={`${cardClass} p-8 text-center`}>
        <div className="mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <label className={`text-sm ${subTextColor}`}>Materia</label>
            <button onClick={() => setShowSubjects(v => !v)} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              <Palette className="w-3.5 h-3.5" /> Le mie materie
            </button>
          </div>
          <div className="flex items-center justify-center gap-2">
            {subject && <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: subjectColor(subject, subjectDefs) }} />}
            <select value={subject} onChange={e => changeSubject(e.target.value)} className={`${darkMode ? 'input-glass' : 'input-light'} text-center max-w-xs`}>
              <option value="">⏱️ Timer generale (dividi dopo)</option>
              {ownNames.map(s => <option key={s} value={s}>{s}</option>)}
              {otherNames.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <p className={`text-xs mt-2 ${subTextColor}`}>
            {isRunning
              ? 'Puoi cambiare materia mentre il timer corre: il tempo si divide da solo.'
              : 'Avvia anche senza materia: alla fine dividi il tempo tra le materie.'}
          </p>
          {ownNames.length === 0 && !showSubjects && (
            <button onClick={() => setShowSubjects(true)} className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1">
              <Plus className="w-4 h-4" /> Aggiungi le materie della tua scuola
            </button>
          )}
        </div>

        {showSubjects && (
          <SubjectManager
            subjects={subjectDefs}
            darkMode={darkMode}
            onChange={onUpdateSubjects}
            onRename={renameSubject}
            onClose={() => setShowSubjects(false)}
          />
        )}

        <div className={`flex items-start justify-center gap-1 sm:gap-2 font-mono font-bold ${textColor} pt-8 pb-4`} aria-label={`${Math.floor(seconds / 3600)} ore, ${Math.floor((seconds % 3600) / 60)} minuti, ${seconds % 60} secondi`}>
          {[
            { value: Math.floor(seconds / 3600), unit: 'ore' },
            { value: Math.floor((seconds % 3600) / 60), unit: 'min' },
            { value: seconds % 60, unit: 'sec' },
          ].map((part, i) => (
            <React.Fragment key={part.unit}>
              {i > 0 && <span className="text-5xl sm:text-6xl md:text-7xl opacity-40">:</span>}
              <div className="flex flex-col items-center">
                <span className="text-5xl sm:text-6xl md:text-7xl tabular-nums">{part.value.toString().padStart(2, '0')}</span>
                <span className={`text-xs font-sans font-medium uppercase tracking-widest mt-1 ${subTextColor}`}>{part.unit}</span>
              </div>
            </React.Fragment>
          ))}
        </div>

        {totalMs > 0 && (() => {
          const shown: Record<string, number> = splitting
            ? Object.fromEntries(Object.entries(splitting).map(([n, m]) => [n, m * 60000]))
            : parts;
          const shownTotal = Object.values(shown).reduce((a, b) => a + b, 0) || 1;
          return (
          <div className="max-w-xl mx-auto mb-2">
            <div className={`h-3 rounded-full overflow-hidden flex ${darkMode ? 'bg-white/10' : 'bg-black/10'}`}>
              {Object.entries(shown).filter(([, ms]) => ms > 0).map(([name, ms]) => (
                <div key={name || '_'} title={name || 'Da assegnare'} className="h-full transition-all duration-500 ease-out"
                  style={{ width: `${(ms / shownTotal) * 100}%`, background: name ? subjectColor(name, subjectDefs) : `repeating-linear-gradient(45deg, ${darkMode ? '#ffffff40' : '#00000030'} 0 6px, transparent 6px 12px)` }} />
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3">
              {Object.entries(shown).filter(([, ms]) => ms > 0).map(([name, ms]) => (
                <span key={name || '_'} className={`text-xs flex items-center gap-1.5 ${subTextColor}`}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: name ? subjectColor(name, subjectDefs) : darkMode ? '#ffffff55' : '#00000040' }} />
                  <span className={name === subject && isRunning ? `font-semibold ${textColor}` : ''}>{name || 'Da assegnare'}</span>
                  <span className="font-mono">{formatTime(Math.floor(ms / 1000))}</span>
                </span>
              ))}
            </div>
          </div>
          );
        })()}

        {splitting ? (
          <SplitPanel
            draft={splitting}
            darkMode={darkMode}
            subjectDefs={subjectDefs}
            onChange={setSplitting}
            onCancel={() => setSplitting(null)}
            onSave={() => saveParts(splitting)}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-6">
            {!isRunning ? (
              <button onClick={start} className="btn-primary flex items-center gap-2 px-6 py-3">
                <Play className="w-5 h-5" /> {seconds > 0 ? 'Riprendi' : 'Avvia'}
              </button>
            ) : (
              <button onClick={pause} className="px-6 py-3 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold flex items-center gap-2">
                <Pause className="w-5 h-5" /> Pausa
              </button>
            )}
            <button onClick={handleSave} disabled={seconds < 60} title={seconds < 60 ? 'Serve almeno 1 minuto' : undefined} className="px-6 py-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold flex items-center gap-2 disabled:opacity-50">
              {unassignedMs > 0 ? <><Split className="w-5 h-5" /> Dividi e salva</> : <><Save className="w-5 h-5" /> Salva</>}
            </button>
            {unassignedMs === 0 && (
              <button onClick={() => openSplit()} disabled={seconds < 60} title="Cambia la divisione del tempo tra le materie"
                className="px-4 py-3 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 font-semibold flex items-center gap-2 disabled:opacity-50">
                <Split className="w-5 h-5" /> Dividi
              </button>
            )}
            <button onClick={reset} className={`px-4 py-3 rounded-xl ${darkMode ? 'bg-white/5 text-white/60' : 'bg-black/5 text-gray-500'}`}>
              Reset
            </button>
          </div>
        )}
      </div>

      {distribution}

      <div className={`${cardClass} p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className={`font-semibold ${textColor}`}>Sessioni recenti</h3>
          <button onClick={resetStats} disabled={sessions.length === 0 && seconds === 0} title={sessions.length === 0 && seconds === 0 ? 'Non ci sono ancora statistiche da azzerare' : undefined}
            className="text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 bg-red-500/15 text-red-400 hover:bg-red-500/25 disabled:opacity-40 disabled:cursor-not-allowed">
            <RotateCcw className="w-3.5 h-3.5" /> Azzera statistiche
          </button>
        </div>
        {recentList}
      </div>
    </div>
  );
}

// Split of the general timer: minutes per subject; '' holds the minutes still to assign.
function SplitPanel({ draft, darkMode, subjectDefs, onChange, onCancel, onSave }: {
  draft: Record<string, number>;
  darkMode: boolean;
  subjectDefs: SubjectDef[];
  onChange: (d: Record<string, number>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const left = draft[''] || 0;
  const names = Object.keys(draft).filter(Boolean);
  const total = Object.values(draft).reduce((a, b) => a + b, 0);
  const assigned = total - left;

  // Raising a subject takes the minutes still to assign first, then from the other subjects
  // (largest first); lowering it gives the minutes back to "da assegnare".
  const set = (name: string, value: number) => {
    const current = draft[name] || 0;
    const target = Math.max(0, Math.min(total, Math.round(value)));
    const next: Record<string, number> = { ...draft, [name]: target };
    if (target <= current) {
      next[''] = left + (current - target);
    } else {
      let need = target - current;
      const fromLeft = Math.min(left, need);
      next[''] = left - fromLeft;
      need -= fromLeft;
      names.filter(n => n !== name).sort((a, b) => (draft[b] || 0) - (draft[a] || 0)).forEach(n => {
        if (need <= 0) return;
        const take = Math.min(next[n] || 0, need);
        next[n] = (next[n] || 0) - take;
        need -= take;
      });
    }
    onChange(next);
  };
  const even = () => {
    const chosen = names.filter(n => draft[n] > 0);
    const targets = chosen.length ? chosen : names;
    if (!targets.length) return;
    const next: Record<string, number> = { ...draft };
    targets.forEach((n, i) => { next[n] = (draft[n] || 0) + Math.floor(left / targets.length) + (i < left % targets.length ? 1 : 0); });
    next[''] = 0;
    onChange(next);
  };

  return (
    <div className={`mt-6 text-left max-w-xl mx-auto rounded-2xl p-4 animate-scale-in ${darkMode ? 'bg-white/5 border border-white/10' : 'bg-black/5 border border-black/10'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className={`font-semibold ${textColor}`}>Dividi {total} min tra le materie</h3>
        <span title="Togli minuti a una materia per darli a un'altra" className={`text-sm font-medium ${left > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
          {left > 0 ? `Da assegnare: ${left} min` : 'Tutto assegnato ✓'}
        </span>
      </div>
      <p className={`text-xs mb-3 ${subTextColor}`}>Sposta i cursori: i minuti in più vengono presi dal tempo da assegnare o dalle altre materie.</p>
      {names.length === 0 ? (
        <p className={`text-sm ${subTextColor}`}>Aggiungi prima le tue materie con “Le mie materie”.</p>
      ) : (
        <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {names.map(name => {
            const value = draft[name] || 0;
            const color = subjectColor(name, subjectDefs);
            return (
              <li key={name} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className={`text-sm flex-1 truncate ${textColor}`}>{name}</span>
                <input type="range" min={0} max={total} value={value} onChange={e => set(name, Number(e.target.value))}
                  aria-label={`Minuti di ${name}`} className="w-24 sm:w-36" style={{ accentColor: color }} />
                <button type="button" onClick={() => set(name, value - 5)} disabled={value === 0} aria-label={`Togli 5 minuti a ${name}`}
                  className={`p-1 rounded-lg disabled:opacity-30 ${darkMode ? 'bg-white/10' : 'bg-black/5'}`}><Minus className="w-3.5 h-3.5" /></button>
                <input type="number" min={0} value={value} onChange={e => set(name, Number(e.target.value) || 0)} aria-label={`Minuti ${name}`}
                  className={`${darkMode ? 'input-glass' : 'input-light'} w-16 text-center text-sm py-1 px-1`} />
                <button type="button" onClick={() => set(name, value + 5)} disabled={value >= total} aria-label={`Aggiungi 5 minuti a ${name}`}
                  className={`p-1 rounded-lg disabled:opacity-30 ${darkMode ? 'bg-white/10' : 'bg-black/5'}`}><Plus className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => set(name, value + left)} disabled={left === 0}
                  className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-30 whitespace-nowrap">+ resto</button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
        <button type="button" onClick={even} disabled={left === 0 || names.length === 0} className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-30">
          Dividi il resto in parti uguali
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className={`px-4 py-2 rounded-lg text-sm ${darkMode ? 'text-white/60' : 'text-gray-500'}`}>Indietro</button>
          <button type="button" onClick={onSave} disabled={assigned === 0} className="btn-primary text-sm disabled:opacity-50">
            Salva {assigned} min
          </button>
        </div>
      </div>
      {left > 0 && assigned > 0 && <p className={`text-xs mt-2 text-right ${subTextColor}`}>I {left} min non assegnati non verranno salvati.</p>}
    </div>
  );
}
