import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts';
import { Grade, createId, getSubjectAverages } from '../lib/store';

interface VotiProps {
  grades: Grade[];
  darkMode: boolean;
  onUpdate: (grades: Grade[]) => void;
}

export default function Voti({ grades, darkMode, onUpdate }: VotiProps) {
  const [subject, setSubject] = useState('');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [showForm, setShowForm] = useState(false);

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(value);
    if (!subject.trim() || isNaN(val) || val < 1 || val > 10) return;
    const newGrade: Grade = { id: createId(), subject: subject.trim(), value: val, description: description.trim(), date };
    onUpdate([...grades, newGrade]);
    setSubject(''); setValue(''); setDescription(''); setShowForm(false);
  };

  const subjectAvgs = getSubjectAverages(grades);
  const barData = Object.entries(subjectAvgs).map(([subject, avg]) => ({ subject: subject.slice(0, 8), media: Math.round(avg * 10) / 10 }));
  const radarData = Object.entries(subjectAvgs).map(([subject, avg]) => ({ subject: subject.slice(0, 10), livello: avg, fullMark: 10 }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className={`text-2xl font-bold ${textColor}`}>📊 Voti</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Nuovo
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className={`${cardClass} p-6 space-y-4`}>
          <h3 className={`font-semibold ${textColor}`}>Nuovo Voto</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input value={subject} onChange={e => setSubject(e.target.value)} className={darkMode ? 'input-glass' : 'input-light'} placeholder="Materia" required />
            <input type="number" step="0.5" min="1" max="10" value={value} onChange={e => setValue(e.target.value)} className={darkMode ? 'input-glass' : 'input-light'} placeholder="Voto (1-10)" required />
            <input value={description} onChange={e => setDescription(e.target.value)} className={darkMode ? 'input-glass' : 'input-light'} placeholder="Descrizione" />
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={darkMode ? 'input-glass' : 'input-light'} required />
          </div>
          <button type="submit" className="btn-primary text-sm">Aggiungi</button>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${cardClass} p-6`}>
          <h3 className={`font-semibold mb-4 ${textColor}`}>Media per materia</h3>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData}>
                <XAxis dataKey="subject" tick={{ fill: darkMode ? '#fff' : '#333', fontSize: 11 }} />
                <YAxis domain={[0, 10]} tick={{ fill: darkMode ? '#fff' : '#333', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: darkMode ? '#1f2937' : '#fff', border: 'none', borderRadius: '8px' }} />
                <Bar dataKey="media" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className={`text-sm ${subTextColor} text-center py-8`}>Nessun voto</p>}
        </div>

        <div className={`${cardClass} p-6`}>
          <h3 className={`font-semibold mb-4 ${textColor}`}>Competenze</h3>
          {radarData.length > 2 ? (
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke={darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} />
                <PolarAngleAxis dataKey="subject" tick={{ fill: darkMode ? '#fff' : '#333', fontSize: 10 }} />
                <Radar name="Livello" dataKey="livello" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
              </RadarChart>
            </ResponsiveContainer>
          ) : <p className={`text-sm ${subTextColor} text-center py-8`}>Servono 3+ materie</p>}
        </div>
      </div>

      <div className={`${cardClass} p-6`}>
        <h3 className={`font-semibold mb-4 ${textColor}`}>Storico voti</h3>
        {grades.length === 0 ? <p className={`text-sm ${subTextColor}`}>Nessun voto</p> : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {[...grades].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(grade => (
              <div key={grade.id} className={`flex items-center justify-between p-3 rounded-lg ${darkMode ? 'bg-white/5' : 'bg-black/5'}`}>
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold px-3 py-1 rounded-lg ${grade.value >= 8 ? 'bg-emerald-500/20 text-emerald-400' : grade.value >= 6 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>{grade.value}</span>
                  <div>
                    <p className={`font-medium text-sm ${textColor}`}>{grade.subject}</p>
                    <p className={`text-xs ${subTextColor}`}>{grade.description} • {new Date(grade.date).toLocaleDateString('it-IT')}</p>
                  </div>
                </div>
                <button onClick={() => onUpdate(grades.filter(g => g.id !== grade.id))} className="p-2 text-red-400">
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
