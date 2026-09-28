import React, { useState, useEffect } from 'react';
import { Play, Pause, Save, Trash2, Palette, Plus, X } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { StudySession, Grade, SubjectDef, SUBJECT_COLORS, subjectColor, getSubjectStudyTime, createId, formatDate } from '../lib/store';

interface TimerProps {
  sessions: StudySession[];
  extraSubjects?: string[];
  grades: Grade[];
  darkMode: boolean;
  onUpdate: (sessions: StudySession[]) => void;
  preselectedSubject?: string;
  subjectDefs: SubjectDef[];
  onUpdateSubjects: (subjects: SubjectDef[]) => void;
}

const TIMER_KEY = 'studenthub_timer';

interface TimerState {
  subject: string;
  accumulatedMs: number;
  startedAt: number | null;
}

function loadTimerState(): TimerState | null {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    return raw ? JSON.parse(raw) : null;
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

export default function Timer({ sessions, extraSubjects = [], grades, darkMode, onUpdate, preselectedSubject, subjectDefs, onUpdateSubjects }: TimerProps) {
  // Time is computed from timestamps (not by counting ticks), so it stays correct when the
  // tab is in background, and the state is saved so the timer survives changing section.
  const [saved] = useState(loadTimerState);
  const [subject, setSubject] = useState(preselectedSubject || saved?.subject || '');
  const [accumulatedMs, setAccumulatedMs] = useState(saved?.accumulatedMs || 0);
  const [startedAt, setStartedAt] = useState<number | null>(saved?.startedAt ?? null);
  const [now, setNow] = useState(Date.now());
  const isRunning = startedAt !== null;
  const seconds = Math.floor((accumulatedMs + (startedAt !== null ? now - startedAt : 0)) / 1000);

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';

  const [showSubjects, setShowSubjects] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(SUBJECT_COLORS[subjectDefs.length % SUBJECT_COLORS.length]);
  const [subjectError, setSubjectError] = useState('');

  // The student's own subjects first (in their order), then any other name already used in the app.
  const ownNames = subjectDefs.map(d => d.name);
  const otherNames = [...new Set([...grades.map(g => g.subject), ...sessions.map(s => s.subject), ...extraSubjects, ...(subject ? [subject] : [])])]
    .filter(n => !ownNames.some(o => o.toLowerCase() === n.toLowerCase()))
    .sort();

  const addSubject = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (subjectDefs.some(d => d.name.toLowerCase() === name.toLowerCase())) {
      setSubjectError('Questa materia c\'è già.');
      return;
    }
    const next = [...subjectDefs, { name, color: newColor }];
    onUpdateSubjects(next);
    setNewName('');
    setSubjectError('');
    setNewColor(SUBJECT_COLORS[next.length % SUBJECT_COLORS.length]);
    if (!subject) setSubject(name);
  };

  const setColor = (name: string, color: string) => {
    onUpdateSubjects(subjectDefs.map(d => (d.name === name ? { ...d, color } : d)));
  };

  const removeSubject = (name: string) => {
    if (!confirm(`Togliere "${name}" dalle tue materie? Le sessioni già salvate restano.`)) return;
    onUpdateSubjects(subjectDefs.filter(d => d.name !== name));
  };

  useEffect(() => {
    if (!isRunning) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  useEffect(() => {
    saveTimerState(accumulatedMs > 0 || startedAt !== null ? { subject, accumulatedMs, startedAt } : null);
  }, [subject, accumulatedMs, startedAt]);

  useEffect(() => { if (preselectedSubject) setSubject(preselectedSubject); }, [preselectedSubject]);

  const start = () => setStartedAt(Date.now());
  const pause = () => {
    if (startedAt === null) return;
    setAccumulatedMs(ms => ms + (Date.now() - startedAt));
    setStartedAt(null);
  };
  const reset = () => {
    setAccumulatedMs(0);
    setStartedAt(null);
  };

  const handleSave = () => {
    if (seconds < 60 || !subject) return;
    const newSession: StudySession = { id: createId(), subject, duration: Math.round(seconds / 60), date: new Date().toISOString() };
    onUpdate([...sessions, newSession]);
    reset();
  };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const subjectTimes = getSubjectStudyTime(sessions);
  const pieData = Object.entries(subjectTimes).map(([name, minutes]) => ({ name, value: minutes }));

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
            <select value={subject} onChange={e => setSubject(e.target.value)} className={`${darkMode ? 'input-glass' : 'input-light'} text-center max-w-xs`}>
              <option value="">Seleziona materia...</option>
              {ownNames.map(s => <option key={s} value={s}>{s}</option>)}
              {otherNames.length > 0 && ownNames.length > 0 && <option disabled>──────────</option>}
              {otherNames.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {ownNames.length === 0 && !showSubjects && (
            <button onClick={() => setShowSubjects(true)} className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1">
              <Plus className="w-4 h-4" /> Aggiungi le materie della tua scuola
            </button>
          )}
        </div>

        {showSubjects && (
          <div className={`text-left max-w-md mx-auto mb-6 p-4 rounded-xl ${darkMode ? 'bg-white/5' : 'bg-black/5'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`font-semibold ${textColor}`}>Le mie materie</h3>
              <button onClick={() => setShowSubjects(false)} className={subTextColor} aria-label="Chiudi"><X className="w-4 h-4" /></button>
            </div>

            {subjectDefs.length === 0 && <p className={`text-sm mb-3 ${subTextColor}`}>Aggiungi le materie che studi e scegli un colore per ognuna.</p>}
            <ul className="space-y-2 mb-4">
              {subjectDefs.map(d => (
                <li key={d.name} className="flex items-center gap-3">
                  <label className="relative w-7 h-7 rounded-full cursor-pointer flex-shrink-0 border-2 border-white/30" style={{ backgroundColor: d.color }} title="Cambia colore">
                    <input type="color" value={d.color} onChange={e => setColor(d.name, e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label={`Colore di ${d.name}`} />
                  </label>
                  <span className={`flex-1 text-sm ${textColor}`}>{d.name}</span>
                  <button onClick={() => removeSubject(d.name)} className="text-red-400 p-1" aria-label={`Togli ${d.name}`}><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>

            <form onSubmit={addSubject} className="space-y-3">
              <input value={newName} onChange={e => { setNewName(e.target.value); setSubjectError(''); }} className={`${darkMode ? 'input-glass' : 'input-light'} w-full`} placeholder="Nome materia (es. Matematica)" maxLength={40} />
              <div className="flex flex-wrap items-center gap-2">
                {SUBJECT_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setNewColor(c)} aria-label={`Colore ${c}`}
                    className={`w-7 h-7 rounded-full transition-transform ${newColor === c ? 'ring-2 ring-offset-2 ring-white scale-110' : ''} ${darkMode ? 'ring-offset-gray-900' : 'ring-offset-white'}`}
                    style={{ backgroundColor: c }} />
                ))}
                <label className={`relative w-7 h-7 rounded-full cursor-pointer border-2 border-dashed flex items-center justify-center ${darkMode ? 'border-white/40' : 'border-black/30'}`} title="Altro colore"
                  style={SUBJECT_COLORS.includes(newColor) ? undefined : { backgroundColor: newColor, borderStyle: 'solid' }}>
                  {SUBJECT_COLORS.includes(newColor) && <Plus className={`w-3.5 h-3.5 ${subTextColor}`} />}
                  <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Altro colore" />
                </label>
              </div>
              {subjectError && <p className="text-sm text-red-400">{subjectError}</p>}
              <button type="submit" disabled={!newName.trim()} className="btn-primary text-sm w-full disabled:opacity-50 flex items-center justify-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: newColor }} /> Aggiungi materia
              </button>
            </form>
          </div>
        )}

        <div className={`text-6xl md:text-7xl font-mono font-bold ${textColor} py-8`}>
          {formatTime(seconds)}
        </div>

        <div className="flex items-center justify-center gap-4 mt-6">
          {!isRunning ? (
            <button onClick={start} disabled={!subject} className="btn-primary flex items-center gap-2 px-6 py-3 disabled:opacity-50">
              <Play className="w-5 h-5" /> Avvia
            </button>
          ) : (
            <button onClick={pause} className="px-6 py-3 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold flex items-center gap-2">
              <Pause className="w-5 h-5" /> Pausa
            </button>
          )}
          <button onClick={handleSave} disabled={seconds < 60 || !subject} className="px-6 py-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold flex items-center gap-2 disabled:opacity-50">
            <Save className="w-5 h-5" /> Salva
          </button>
          <button onClick={reset} className={`px-4 py-3 rounded-xl ${darkMode ? 'bg-white/5 text-white/60' : 'bg-black/5 text-gray-500'}`}>
            Reset
          </button>
        </div>
      </div>

      <div className={`${cardClass} p-6`}>
        <h3 className={`font-semibold mb-4 ${textColor}`}>Distribuzione tempo</h3>
        {pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {pieData.map(d => <Cell key={d.name} fill={subjectColor(d.name, subjectDefs)} />)}
              </Pie>
              <Tooltip contentStyle={{ background: darkMode ? '#1f2937' : '#fff', border: 'none', borderRadius: '8px' }} formatter={(val: number) => `${Math.round(val)}min`} />
            </PieChart>
          </ResponsiveContainer>
        ) : <p className={`text-sm ${subTextColor} text-center py-8`}>Nessuna sessione</p>}
      </div>

      <div className={`${cardClass} p-6`}>
        <h3 className={`font-semibold mb-4 ${textColor}`}>Sessioni recenti</h3>
        {sessions.length === 0 ? <p className={`text-sm ${subTextColor}`}>Nessuna sessione</p> : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {[...sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10).map(session => (
              <div key={session.id} className={`flex items-center justify-between p-3 rounded-lg ${darkMode ? 'bg-white/5' : 'bg-black/5'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: subjectColor(session.subject, subjectDefs) }}>
                    {session.subject[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${textColor}`}>{session.subject}</p>
                    <p className={`text-xs ${subTextColor}`}>{formatDate(session.date)} • {session.duration}min</p>
                  </div>
                </div>
                <button onClick={() => onUpdate(sessions.filter(s => s.id !== session.id))} className="p-2 text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
