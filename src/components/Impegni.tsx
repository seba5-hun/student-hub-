import React, { useState } from 'react';
import { Plus, Trash2, Check, Clock } from 'lucide-react';
import { Task, IMPORTANCE_CONFIG, createId, parseDate, formatDate } from '../lib/store';

interface ImpegniProps {
  tasks: Task[];
  knownSubjects?: string[];
  darkMode: boolean;
  onUpdate: (tasks: Task[]) => void;
  prefillDate?: string;
}

export default function Impegni({ tasks, knownSubjects = [], darkMode, onUpdate, prefillDate }: ImpegniProps) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(prefillDate || '');
  const [endDate, setEndDate] = useState('');
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [type, setType] = useState<'scolastico' | 'personale'>('scolastico');
  const [importance, setImportance] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [estimatedTime, setEstimatedTime] = useState(60);
  const [subject, setSubject] = useState('');
  const [formError, setFormError] = useState('');
  const [showForm, setShowForm] = useState(!!prefillDate);

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    if (isMultiDay && endDate && endDate < date) {
      setFormError('La data di fine non può essere prima della data di inizio.');
      return;
    }
    setFormError('');
    const newTask: Task = {
      id: createId(),
      title: title.trim(),
      date,
      endDate: isMultiDay && endDate ? endDate : undefined,
      type,
      importance,
      estimatedTime: Math.max(0, estimatedTime || 0),
      done: false,
      subject: type === 'scolastico' && subject.trim() ? subject.trim() : undefined,
    };
    onUpdate([...tasks, newTask]);
    setTitle('');
    setDate('');
    setEndDate('');
    setIsMultiDay(false);
    setSubject('');
    setEstimatedTime(60);
    setShowForm(false);
  };

  const toggleDone = (id: string) => {
    onUpdate(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  const deleteTask = (id: string) => {
    onUpdate(tasks.filter(t => t.id !== id));
  };

  const pendingTasks = tasks.filter(t => !t.done).sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());
  const subjectOptions = [...new Set([...knownSubjects, ...tasks.map(t => t.subject).filter((s): s is string => !!s)])].sort();
  const doneTasks = tasks.filter(t => t.done);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className={`text-2xl font-bold ${textColor}`}>📋 Impegni</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Nuovo
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className={`${cardClass} p-6 space-y-4 animate-scale-in`}>
          <h3 className={`font-semibold ${textColor}`}>Nuovo Impegno</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm mb-1 ${subTextColor}`}>Titolo</label>
              <input value={title} onChange={e => setTitle(e.target.value)} className={darkMode ? 'input-glass w-full' : 'input-light w-full'} placeholder="Es. Compito di matematica" required />
            </div>
            <div>
              <label className={`block text-sm mb-1 ${subTextColor}`}>Data inizio</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={darkMode ? 'input-glass w-full' : 'input-light w-full'} required />
            </div>
            <div>
              <label className={`block text-sm mb-1 ${subTextColor}`}>Tipo</label>
              <select value={type} onChange={e => setType(e.target.value as any)} className={darkMode ? 'input-glass w-full' : 'input-light w-full'}>
                <option value="scolastico">Scolastico</option>
                <option value="personale">Personale</option>
              </select>
            </div>
            {type === 'scolastico' && (
              <div>
                <label className={`block text-sm mb-1 ${subTextColor}`}>Materia (opzionale)</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} list="impegni-subjects" className={darkMode ? 'input-glass w-full' : 'input-light w-full'} placeholder="Es. Matematica" />
                <datalist id="impegni-subjects">
                  {subjectOptions.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
            )}
            <div>
              <label className={`block text-sm mb-1 ${subTextColor}`}>Tempo stimato (minuti)</label>
              <input type="number" min={0} step={15} value={estimatedTime} onChange={e => setEstimatedTime(parseInt(e.target.value, 10) || 0)} className={darkMode ? 'input-glass w-full' : 'input-light w-full'} />
            </div>
            <div>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isMultiDay} onChange={e => setIsMultiDay(e.target.checked)} className="w-4 h-4" />
                <span className={`text-sm ${subTextColor}`}>Multi-giorno</span>
              </label>
              {isMultiDay && (
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={date} className={`${darkMode ? 'input-glass' : 'input-light'} w-full mt-2`} />
              )}
            </div>
          </div>

          <div>
            <label className={`block text-sm mb-2 ${subTextColor}`}>Importanza</label>
            <div className="flex gap-2 flex-wrap">
              {IMPORTANCE_CONFIG.map(imp => (
                <button key={imp.level} type="button" onClick={() => setImportance(imp.level as any)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border ${importance === imp.level ? `${imp.bg} ${imp.text} ${imp.border}` : darkMode ? 'border-white/10 text-white/50' : 'border-black/10 text-gray-500'}`}>
                  {imp.label}
                </button>
              ))}
            </div>
          </div>

          {formError && <p className="text-red-400 text-sm">{formError}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary text-sm">Aggiungi</button>
            <button type="button" onClick={() => setShowForm(false)} className={`px-4 py-2 rounded-lg text-sm ${darkMode ? 'text-white/60' : 'text-gray-500'}`}>Annulla</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {pendingTasks.map(task => {
          const imp = IMPORTANCE_CONFIG[task.importance - 1];
          return (
            <div key={task.id} className={`${cardClass} p-4 border-l-4 flex items-center gap-4`} style={{ borderLeftColor: imp.color }}>
              <button onClick={() => toggleDone(task.id)} aria-label="Segna come completato" className={`w-6 h-6 rounded-full flex-shrink-0 border-2 ${darkMode ? 'border-white/30' : 'border-gray-300'}`}></button>
              <div className="flex-1">
                <p className={`font-medium ${textColor}`}>{task.title}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`text-xs ${subTextColor}`}>{formatDate(task.date)}{task.endDate ? ` → ${formatDate(task.endDate)}` : ''}</span>
                  {task.subject && <span className={`text-xs ${subTextColor}`}>{task.subject}</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${imp.bg} ${imp.text}`}>{imp.label}</span>
                </div>
              </div>
              <button onClick={() => deleteTask(task.id)} className="p-2 text-red-400 hover:bg-red-500/10 rounded">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}

        {doneTasks.length > 0 && (
          <div className="mt-6">
            <h3 className={`text-sm font-medium mb-3 ${subTextColor}`}>Completati ({doneTasks.length})</h3>
            {doneTasks.map(task => {
              const imp = IMPORTANCE_CONFIG[task.importance - 1];
              return (
                <div key={task.id} className={`${cardClass} p-4 border-l-4 flex items-center gap-4 mb-2 opacity-60`} style={{ borderLeftColor: imp.color }}>
                  <button onClick={() => toggleDone(task.id)} className="w-6 h-6 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-emerald-400" />
                  </button>
                  <div className="flex-1">
                    <p className={`font-medium line-through ${textColor}`}>{task.title}</p>
                  </div>
                  <button onClick={() => deleteTask(task.id)} className="p-2 text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
