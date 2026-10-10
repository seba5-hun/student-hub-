import React, { useState } from 'react';
import { Plus, Trash2, Check, Clock, TrendingUp, RotateCcw, Pencil, CalendarClock, Ban, X } from 'lucide-react';
import { Task, IMPORTANCE_CONFIG, createId, formatDateWithDay, formatDate, formatTaskTime, compareTasks, effectiveImportance, dueLabel, taskDeadline, toDateKey, parseDate, todayKey } from '../lib/store';

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
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [type, setType] = useState<'scolastico' | 'personale'>('scolastico');
  const [importance, setImportance] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [estimatedTime, setEstimatedTime] = useState(60);
  const [subject, setSubject] = useState('');
  const [formError, setFormError] = useState('');
  const [showForm, setShowForm] = useState(!!prefillDate);
  // The task being edited in the form (null: the form adds a new one).
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  // "Rinvia": the task whose date is being changed, with the date being chosen.
  const [moving, setMoving] = useState<{ id: string; date: string } | null>(null);

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';

  const addDays = (key: string, n: number) => { const d = parseDate(key); d.setDate(d.getDate() + n); return toDateKey(d); };
  const daysBetween = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);

  // A new date keeps the task's length (multi-day) and remembers the first date ("rinviato dal").
  const withDate = (t: Task, date: string): Task => {
    if (date === t.date) return t;
    const first = t.movedFrom || t.date;
    return {
      ...t, date,
      endDate: t.endDate ? addDays(t.endDate, daysBetween(t.date, date)) : undefined,
      movedFrom: first === date ? undefined : first,
      keepOpen: undefined,
    };
  };

  const resetForm = () => {
    setTitle(''); setDate(''); setEndDate(''); setTime(''); setEndTime('');
    setIsMultiDay(false); setSubject(''); setEstimatedTime(60); setImportance(2); setType('scolastico');
    setFormError(''); setEditingTaskId(null); setShowForm(false);
  };

  const startEdit = (t: Task) => {
    setTitle(t.title); setDate(t.date); setEndDate(t.endDate || ''); setIsMultiDay(!!t.endDate);
    setTime(t.time || ''); setEndTime(t.endTime || ''); setType(t.type); setImportance(t.importance);
    setEstimatedTime(t.estimatedTime); setSubject(t.subject || ''); setFormError('');
    setEditingTaskId(t.id); setShowForm(true); setMoving(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reschedule = (id: string, newDate: string) => {
    if (!newDate) return;
    onUpdate(tasks.map(t => (t.id !== id ? t : { ...withDate(t, newDate), done: false, cancelled: undefined, autoDone: undefined })));
    setMoving(null);
  };
  // It didn't happen: out of the lists and reminders, kept under "Saltati" in case it's rescheduled.
  const cancelTask = (id: string) => {
    onUpdate(tasks.map(t => (t.id === id ? { ...t, done: true, cancelled: true, autoDone: undefined } : t)));
    setMoving(null);
  };
  const restoreTask = (id: string) => {
    onUpdate(tasks.map(t => (t.id === id ? { ...t, done: false, cancelled: undefined, keepOpen: true } : t)));
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    if (isMultiDay && endDate && endDate < date) {
      setFormError('La data di fine non può essere prima della data di inizio.');
      return;
    }
    if (time && endTime && endTime <= time && !(isMultiDay && endDate && endDate > date)) {
      setFormError('L\'orario di fine deve essere dopo quello di inizio.');
      return;
    }
    setFormError('');
    const fields = {
      title: title.trim(),
      endDate: isMultiDay && endDate ? endDate : undefined,
      time: time || undefined,
      endTime: time && endTime ? endTime : undefined,
      type,
      importance,
      estimatedTime: Math.max(0, estimatedTime || 0),
      subject: type === 'scolastico' && subject.trim() ? subject.trim() : undefined,
    };
    if (editingTaskId) {
      onUpdate(tasks.map(t => {
        if (t.id !== editingTaskId) return t;
        const moved = withDate({ ...t, ...fields }, date);
        // A new date and its own new end: what was typed wins over the shifted one.
        return { ...moved, endDate: fields.endDate };
      }));
      resetForm();
      return;
    }
    const newTask: Task = {
      id: createId(),
      title: title.trim(),
      date,
      endDate: isMultiDay && endDate ? endDate : undefined,
      time: time || undefined,
      endTime: time && endTime ? endTime : undefined,
      type,
      importance,
      estimatedTime: Math.max(0, estimatedTime || 0),
      done: false,
      subject: type === 'scolastico' && subject.trim() ? subject.trim() : undefined,
    };
    onUpdate([...tasks, newTask]);
    resetForm();
  };

  // Reopening a task stops the app from completing it again automatically.
  const toggleDone = (id: string) => {
    onUpdate(tasks.map(t => (t.id !== id ? t
      : t.done ? { ...t, done: false, autoDone: undefined, keepOpen: true }
      : { ...t, done: true, autoDone: undefined })));
  };

  const setTaskTime = (id: string, value: string) => {
    onUpdate(tasks.map(t => t.id === id
      ? { ...t, time: value || undefined, endTime: value && t.endTime && t.endTime > value ? t.endTime : undefined }
      : t));
  };

  const deleteTask = (id: string) => {
    onUpdate(tasks.filter(t => t.id !== id));
  };

  const pendingTasks = tasks.filter(t => !t.done).sort(compareTasks);
  const subjectOptions = [...new Set([...knownSubjects, ...tasks.map(t => t.subject).filter((s): s is string => !!s)])].sort();
  const doneTasks = tasks.filter(t => t.done && !t.cancelled);
  const cancelledTasks = tasks.filter(t => t.cancelled).sort((a, b) => b.date.localeCompare(a.date));
  const inputClass = darkMode ? 'input-glass' : 'input-light';
  const chip = `text-xs px-2.5 py-1.5 rounded-full font-medium transition-colors ${darkMode ? 'bg-white/10 text-white/80 hover:bg-white/15' : 'bg-black/5 text-gray-700 hover:bg-black/10'}`;

  // The "Rinvia" panel under a task: a new date (with quick choices) or "È saltato".
  const reschedulePanel = (task: Task, cancelled = false) => moving?.id === task.id && (
    <div className="basis-full mt-3 pt-3 border-t space-y-3 animate-scale-in" style={{ borderColor: 'var(--border)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={moving.date} onChange={e => setMoving({ ...moving, date: e.target.value })} aria-label="Nuova data"
          className={`${inputClass} text-sm py-1.5`} />
        {[['Domani', addDays(todayKey(), 1)], ['+1 giorno', addDays(task.date, 1)], ['+1 settimana', addDays(task.date, 7)]].map(([label, d]) => (
          <button key={label} type="button" onClick={() => setMoving({ ...moving, date: d })} className={chip}>{label}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => reschedule(task.id, moving.date)} disabled={!moving.date || (!cancelled && moving.date === task.date)}
          className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-40">
          <CalendarClock className="w-4 h-4" /> {cancelled ? 'Rimetti in questa data' : 'Sposta a questa data'}
        </button>
        {!cancelled && (
          <button type="button" onClick={() => cancelTask(task.id)} className="text-sm px-3 py-2 rounded-xl flex items-center gap-1.5 text-red-400 hover:bg-red-500/10">
            <Ban className="w-4 h-4" /> È saltato
          </button>
        )}
        <button type="button" onClick={() => setMoving(null)} className={`text-sm px-3 py-2 ${subTextColor}`}>Annulla</button>
      </div>
      {!cancelled && <p className={`text-xs ${subTextColor}`}>"È saltato" lo toglie da impegni, calendario e promemoria senza contarlo come fatto: lo ritrovi in fondo, tra i saltati, se poi viene rimesso.</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className={`text-[34px] leading-[1.1] font-bold tracking-[-0.035em] ${textColor}`}>Impegni.</h2>
        <button onClick={() => (showForm ? resetForm() : setShowForm(true))} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Nuovo
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className={`${cardClass} p-6 space-y-4 animate-scale-in`}>
          <h3 className={`font-semibold ${textColor}`}>{editingTaskId ? 'Modifica impegno' : 'Nuovo Impegno'}</h3>
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
              <label className={`block text-sm mb-1 ${subTextColor}`}>Orario (opzionale)</label>
              <div className="flex items-center gap-2">
                <input type="time" value={time} onChange={e => setTime(e.target.value)} aria-label="Orario di inizio" className={`${darkMode ? 'input-glass' : 'input-light'} flex-1 min-w-0`} />
                <span className={`text-sm ${subTextColor}`}>–</span>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} disabled={!time} aria-label="Orario di fine (opzionale)" title="Fine (opzionale)" className={`${darkMode ? 'input-glass' : 'input-light'} flex-1 min-w-0 disabled:opacity-40`} />
                {time && (
                  <button type="button" onClick={() => { setTime(''); setEndTime(''); }} className={`text-xs ${subTextColor} hover:underline`}>Togli</button>
                )}
              </div>
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
            <button type="submit" className="btn-primary text-sm">{editingTaskId ? 'Salva modifiche' : 'Aggiungi'}</button>
            <button type="button" onClick={resetForm} className={`px-4 py-2 rounded-lg text-sm ${darkMode ? 'text-white/60' : 'text-gray-500'}`}>Annulla</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {pendingTasks.map(task => {
          const level = effectiveImportance(task);
          const imp = IMPORTANCE_CONFIG[level - 1];
          const raised = level > task.importance;
          const overdue = taskDeadline(task).getTime() <= Date.now();
          const due = overdue ? 'scaduto' : dueLabel(task);
          return (
            <div key={task.id} className={`${cardClass} p-4 border-l-4 flex flex-wrap items-center gap-x-4`} style={{ borderLeftColor: imp.color }}>
              <button onClick={() => toggleDone(task.id)} aria-label="Segna come completato" className={`w-6 h-6 rounded-full flex-shrink-0 border-2 ${darkMode ? 'border-white/30' : 'border-gray-300'}`}></button>
              <div className="flex-1 min-w-0">
                <p className={`font-medium ${textColor}`}>{task.title}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                  <button onClick={() => setMoving(moving?.id === task.id ? null : { id: task.id, date: task.date })} title="Cambia la data"
                    className={`text-xs text-left inline-flex items-center gap-1 rounded-full hover:underline ${subTextColor}`}>
                    {formatDateWithDay(task.date)}{task.endDate ? ` → ${formatDateWithDay(task.endDate)}` : ''}
                  </button>
                  {task.movedFrom && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" />rinviato dal {formatDate(task.movedFrom)}</span>}
                  {editingTimeId === task.id ? (
                    <input type="time" autoFocus defaultValue={task.time || ''} aria-label="Orario"
                      onChange={e => setTaskTime(task.id, e.target.value)}
                      onBlur={() => setEditingTimeId(null)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingTimeId(null); }}
                      className={`${darkMode ? 'input-glass' : 'input-light'} text-xs py-0.5 px-2`} />
                  ) : task.time ? (
                    <button onClick={() => setEditingTimeId(task.id)} title="Cambia orario"
                      className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 flex items-center gap-1 hover:bg-indigo-500/25">
                      <Clock className="w-3 h-3" />{formatTaskTime(task)}
                    </button>
                  ) : (
                    <button onClick={() => setEditingTimeId(task.id)} className={`text-xs flex items-center gap-1 ${subTextColor} hover:text-indigo-400`}>
                      <Clock className="w-3 h-3" />+ orario
                    </button>
                  )}
                  {task.subject && <span className={`text-xs ${subTextColor}`}>{task.subject}</span>}
                  <span title={raised ? `Priorità aumentata da sola perché ${due} (era ${IMPORTANCE_CONFIG[task.importance - 1].label})` : undefined}
                    className={`text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1 transition-colors duration-500 ${imp.bg} ${imp.text}`}>
                    {raised && <TrendingUp className="w-3 h-3" />}{imp.label}
                  </span>
                  {(raised || overdue || level >= 4) && <span className={`text-xs ${overdue ? 'text-red-400' : subTextColor}`}>{due}</span>}
                </div>
              </div>
              <div className="flex items-center">
                <button onClick={() => setMoving(moving?.id === task.id ? null : { id: task.id, date: task.date })} aria-label={`Rinvia o segna come saltato: ${task.title}`} title="Rinvia o segna come saltato"
                  className={`p-2 rounded ${moving?.id === task.id ? 'text-amber-400' : subTextColor} hover:text-amber-400`}>
                  <CalendarClock className="w-4 h-4" />
                </button>
                <button onClick={() => startEdit(task)} aria-label={`Modifica ${task.title}`} title="Modifica" className={`p-2 rounded ${subTextColor} hover:text-indigo-400`}>
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => deleteTask(task.id)} aria-label={`Elimina ${task.title}`} className="p-2 text-red-400 hover:bg-red-500/10 rounded">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {reschedulePanel(task)}
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
                    <p className={`text-xs ${subTextColor}`}>
                      {formatDateWithDay(task.date)}{task.time ? ` · ${formatTaskTime(task)}` : ''}
                      {task.autoDone && ' · completato in automatico (data passata)'}
                    </p>
                  </div>
                  {task.autoDone && (
                    <button onClick={() => toggleDone(task.id)} title="Riporta tra gli impegni da fare" className={`text-xs flex items-center gap-1 ${subTextColor} hover:text-indigo-400`}>
                      <RotateCcw className="w-3.5 h-3.5" /> Riapri
                    </button>
                  )}
                  <button onClick={() => deleteTask(task.id)} className="p-2 text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {cancelledTasks.length > 0 && (
          <div className="mt-6">
            <h3 className={`text-sm font-medium mb-3 ${subTextColor}`}>Saltati ({cancelledTasks.length})</h3>
            {cancelledTasks.map(task => (
              <div key={task.id} className={`${cardClass} p-4 flex flex-wrap items-center gap-x-4 mb-2`}>
                <span className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center bg-red-500/10 text-red-400"><X className="w-3.5 h-3.5" /></span>
                <div className="flex-1 min-w-[11rem] opacity-70">
                  <p className={`font-medium line-through ${textColor}`}>{task.title}</p>
                  <p className={`text-xs ${subTextColor}`}>{formatDateWithDay(task.date)}{task.subject ? ` · ${task.subject}` : ''} · saltato</p>
                </div>
                <div className="flex items-center ml-auto">
                <button onClick={() => setMoving(moving?.id === task.id ? null : { id: task.id, date: task.date >= todayKey() ? task.date : addDays(todayKey(), 1) })}
                  className={`text-xs flex items-center gap-1 px-2 py-1.5 ${subTextColor} hover:text-amber-400`}>
                  <CalendarClock className="w-3.5 h-3.5" /> Rinvia
                </button>
                <button onClick={() => restoreTask(task.id)} title="Rimettilo tra gli impegni con la stessa data" className={`text-xs flex items-center gap-1 px-2 py-1.5 ${subTextColor} hover:text-indigo-400`}>
                  <RotateCcw className="w-3.5 h-3.5" /> Ripristina
                </button>
                <button onClick={() => deleteTask(task.id)} aria-label={`Elimina ${task.title}`} className="p-2 text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
                </div>
                {reschedulePanel(task, true)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
