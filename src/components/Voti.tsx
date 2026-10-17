import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts';
import { Grade, createId, getSubjectAverages, todayKey, parseDate, formatDate, gradeOn10, fromOn10 } from '../lib/store';
import { useProfile, universityStats } from '../lib/profile';

interface VotiProps {
  grades: Grade[];
  subjectNames?: string[];
  darkMode: boolean;
  onUpdate: (grades: Grade[]) => void;
}

// Grades on the student's scale: 1–10 at school, 18–30 e lode with CFU at university (the
// "libretto", with weighted average and starting score for the degree), scores out of 100 for tests.
export default function Voti({ grades, subjectNames = [], darkMode, onUpdate }: VotiProps) {
  const prof = useProfile();
  const scale = prof.scale;
  const [subject, setSubject] = useState('');
  const [value, setValue] = useState('');
  const [lode, setLode] = useState(false);
  const [cfu, setCfu] = useState('6');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayKey());
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';
  const inputClass = darkMode ? 'input-glass' : 'input-light';

  const range = scale === 30 ? { min: 18, max: 30, step: 1 } : scale === 100 ? { min: 0, max: 100, step: 1 } : { min: 1, max: 10, step: 0.25 };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(value.replace(',', '.'));
    if (!subject.trim() || isNaN(val) || val < range.min || val > range.max) {
      setFormError(scale === 30 ? 'Il voto va da 18 a 30 (per la lode spunta la casella).' : `Il ${prof.l('grade')} va da ${range.min} a ${range.max}.`);
      return;
    }
    const credits = parseInt(cfu, 10);
    const newGrade: Grade = {
      id: createId(), subject: subject.trim(), value: val, description: description.trim(), date,
      ...(scale !== 10 ? { scale } : {}),
      ...(scale === 30 ? { lode: lode && val === 30 ? true : undefined, cfu: credits > 0 ? credits : undefined } : {}),
    };
    onUpdate([...grades, newGrade]);
    setSubject(''); setValue(''); setLode(false); setDescription(''); setDate(todayKey()); setFormError(''); setShowForm(false);
  };

  const subjectAvgs = getSubjectAverages(grades);
  const shown = (v10: number) => Math.round(fromOn10(v10, scale) * 10) / 10;
  const short = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);
  const barData = Object.entries(subjectAvgs).map(([s, avg]) => ({ subject: short(s, 8), media: shown(avg) }));
  const radarData = Object.entries(subjectAvgs).map(([s, avg]) => ({ subject: short(s, 10), livello: shown(avg), fullMark: scale }));
  const uni = scale === 30 ? universityStats(grades) : null;
  const fmt1 = (v: number | null) => (v === null ? '—' : v.toFixed(2).replace('.', ',').replace(/0$/, ''));
  const tone = (g: Grade) => { const v = gradeOn10(g); return v >= 8 ? 'bg-emerald-500/20 text-emerald-400' : v >= 6 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'; };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className={`text-[34px] leading-[1.1] font-bold tracking-[-0.035em] ${textColor}`}>{prof.L('voti')}.</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Nuovo
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className={`${cardClass} p-6 space-y-4`}>
          <h3 className={`font-semibold ${textColor}`}>{scale === 30 ? 'Nuovo esame superato' : `Nuovo ${prof.l('grade')}`}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input value={subject} onChange={e => setSubject(e.target.value)} list="voti-subjects" className={inputClass} placeholder={prof.L('subject')} required />
            <datalist id="voti-subjects">{[...new Set([...subjectNames, ...grades.map(g => g.subject)])].map(s => <option key={s} value={s} />)}</datalist>
            <div className="flex items-center gap-3">
              <input type="number" inputMode="decimal" step={range.step} min={range.min} max={range.max} value={value} onChange={e => setValue(e.target.value)}
                className={`${inputClass} flex-1 min-w-0`} placeholder={scale === 30 ? 'Voto (18–30)' : scale === 100 ? `${prof.L('grade')} (0–100)` : 'Voto (1–10)'} required />
              {scale === 30 && (
                <label className={`flex items-center gap-2 text-sm cursor-pointer ${subTextColor}`}>
                  <input type="checkbox" checked={lode} onChange={e => setLode(e.target.checked)} disabled={value !== '30'} className="w-4 h-4" /> Lode
                </label>
              )}
            </div>
            {scale === 30 && (
              <input type="number" min={1} max={30} value={cfu} onChange={e => setCfu(e.target.value)} className={inputClass} placeholder="CFU" aria-label="CFU" />
            )}
            <input value={description} onChange={e => setDescription(e.target.value)} className={inputClass}
              placeholder={scale === 30 ? 'Note (es. scritto + orale)' : scale === 100 ? 'Es. Simulazione n. 3' : 'Descrizione'} />
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} required />
          </div>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <button type="submit" className="btn-primary text-sm">Aggiungi</button>
        </form>
      )}

      {uni && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['Media ponderata', fmt1(uni.weighted), 'pesata sui CFU'],
            ['Media aritmetica', fmt1(uni.arithmetic), `${uni.count} ${uni.count === 1 ? 'esame' : 'esami'}${uni.lodi ? ` · ${uni.lodi} ${uni.lodi === 1 ? 'lode' : 'lodi'}` : ''}`],
            ['CFU', String(uni.cfu), 'crediti conseguiti'],
            ['Base di laurea', uni.base === null ? '—' : uni.base.toFixed(1).replace('.', ','), 'su 110 (media × 110 / 30)'],
          ].map(([label, v, note]) => (
            <div key={label} className={`${cardClass} p-4`}>
              <p className={`text-xs ${subTextColor}`}>{label}</p>
              <p className={`text-2xl font-bold tracking-tight mt-1 ${textColor}`}>{v}</p>
              <p className={`text-xs mt-0.5 ${subTextColor}`}>{note}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${cardClass} p-6`}>
          <h3 className={`font-semibold mb-4 ${textColor}`}>Media per {prof.l('subject')}</h3>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData}>
                <XAxis dataKey="subject" tick={{ fill: darkMode ? '#fff' : '#333', fontSize: 11 }} />
                <YAxis domain={[0, scale]} tick={{ fill: darkMode ? '#fff' : '#333', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: darkMode ? '#1f2937' : '#fff', border: 'none', borderRadius: '8px' }} />
                <Bar dataKey="media" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className={`text-sm ${subTextColor} text-center py-8`}>Nessun {prof.l('grade')}</p>}
        </div>

        <div className={`${cardClass} p-6`}>
          <h3 className={`font-semibold mb-4 ${textColor}`}>Competenze</h3>
          {radarData.length > 2 ? (
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke={darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} />
                <PolarAngleAxis dataKey="subject" tick={{ fill: darkMode ? '#fff' : '#333', fontSize: 10 }} />
                <Radar animationDuration={600} name="Livello" dataKey="livello" stroke="var(--brand-ring)" fill="var(--brand-ring)" fillOpacity={0.3} />
              </RadarChart>
            </ResponsiveContainer>
          ) : <p className={`text-sm ${subTextColor} text-center py-8`}>Servono 3+ {prof.l('subjects')}</p>}
        </div>
      </div>

      <div className={`${cardClass} p-6`}>
        <h3 className={`font-semibold mb-4 ${textColor}`}>{scale === 30 ? 'Esami superati' : `Storico ${prof.l('grades')}`}</h3>
        {grades.length === 0 ? <p className={`text-sm ${subTextColor}`}>Nessun {prof.l('grade')}</p> : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {[...grades].sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime()).map(grade => (
              <div key={grade.id} className={`flex items-center justify-between p-3 rounded-lg ${darkMode ? 'bg-white/5' : 'bg-black/5'}`}>
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold px-3 py-1 rounded-lg whitespace-nowrap ${tone(grade)}`}>{prof.showGrade(grade)}</span>
                  <div>
                    <p className={`font-medium text-sm ${textColor}`}>{grade.subject}</p>
                    <p className={`text-xs ${subTextColor}`}>
                      {grade.cfu ? `${grade.cfu} CFU • ` : ''}{grade.description ? `${grade.description} • ` : ''}{formatDate(grade.date)}
                    </p>
                  </div>
                </div>
                <button onClick={() => onUpdate(grades.filter(g => g.id !== grade.id))} aria-label={`Elimina ${grade.subject}`} className="p-2 text-red-400">
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
