import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Save, Trash2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { StudySession, Grade, getSubjectStudyTime, createId } from '../lib/store';

interface TimerProps {
  sessions: StudySession[];
  grades: Grade[];
  darkMode: boolean;
  onUpdate: (sessions: StudySession[]) => void;
  preselectedSubject?: string;
}

export default function Timer({ sessions, grades, darkMode, onUpdate, preselectedSubject }: TimerProps) {
  const [subject, setSubject] = useState(preselectedSubject || '');
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<any>(null);

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';

  const subjects = [...new Set([...grades.map(g => g.subject), ...sessions.map(s => s.subject)])].sort();

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning]);

  useEffect(() => { if (preselectedSubject) setSubject(preselectedSubject); }, [preselectedSubject]);

  const handleSave = () => {
    if (seconds < 60 || !subject) return;
    const newSession: StudySession = { id: createId(), subject, duration: Math.round(seconds / 60), date: new Date().toISOString() };
    onUpdate([...sessions, newSession]);
    setSeconds(0);
    setIsRunning(false);
  };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const subjectTimes = getSubjectStudyTime(sessions);
  const pieData = Object.entries(subjectTimes).map(([name, minutes]) => ({ name, value: minutes }));
  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  return (
    <div className="space-y-6">
      <h2 className={`text-2xl font-bold ${textColor}`}>⏱️ Timer Studio</h2>

      <div className={`${cardClass} p-8 text-center`}>
        <div className="mb-6">
          <label className={`block text-sm mb-2 ${subTextColor}`}>Materia</label>
          <select value={subject} onChange={e => setSubject(e.target.value)} className={`${darkMode ? 'input-glass' : 'input-light'} text-center max-w-xs mx-auto block`}>
            <option value="">Seleziona materia...</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className={`text-6xl md:text-7xl font-mono font-bold ${textColor} py-8`}>
          {formatTime(seconds)}
        </div>

        <div className="flex items-center justify-center gap-4 mt-6">
          {!isRunning ? (
            <button onClick={() => setIsRunning(true)} disabled={!subject} className="btn-primary flex items-center gap-2 px-6 py-3 disabled:opacity-50">
              <Play className="w-5 h-5" /> Avvia
            </button>
          ) : (
            <button onClick={() => setIsRunning(false)} className="px-6 py-3 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold flex items-center gap-2">
              <Pause className="w-5 h-5" /> Pausa
            </button>
          )}
          <button onClick={handleSave} disabled={seconds < 60 || !subject} className="px-6 py-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold flex items-center gap-2 disabled:opacity-50">
            <Save className="w-5 h-5" /> Salva
          </button>
          <button onClick={() => { setSeconds(0); setIsRunning(false); }} className={`px-4 py-3 rounded-xl ${darkMode ? 'bg-white/5 text-white/60' : 'bg-black/5 text-gray-500'}`}>
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
                {pieData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
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
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                    <span className="text-indigo-400 text-sm font-bold">{session.subject[0]}</span>
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${textColor}`}>{session.subject}</p>
                    <p className={`text-xs ${subTextColor}`}>{new Date(session.date).toLocaleDateString('it-IT')} • {session.duration}min</p>
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
