import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Download, Bell, BellOff, Plus, X } from 'lucide-react';
import { Task, IMPORTANCE_CONFIG, createId } from '../lib/store';
import { downloadICS } from '../lib/calendar';

interface CalendarioProps {
  tasks: Task[];
  darkMode: boolean;
  onNavigate?: (section: string, prefillDate?: string) => void;
  onAddTask?: (task: Task) => void;
}

export default function Calendario({ tasks, darkMode, onNavigate, onAddTask }: CalendarioProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddDate, setQuickAddDate] = useState('');
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddType, setQuickAddType] = useState<'scolastico' | 'personale'>('scolastico');
  const [quickAddImportance, setQuickAddImportance] = useState<1 | 2 | 3 | 4 | 5>(2);

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const adjustedFirstDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const dayNames = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach(task => {
      const startDate = new Date(task.date + 'T00:00:00');
      const endDate = task.endDate ? new Date(task.endDate + 'T00:00:00') : startDate;
      const current = new Date(startDate);
      while (current <= endDate) {
        const dateStr = current.toISOString().split('T')[0];
        if (!map[dateStr]) map[dateStr] = [];
        if (!map[dateStr].find(t => t.id === task.id)) map[dateStr].push(task);
        current.setDate(current.getDate() + 1);
      }
    });
    return map;
  }, [tasks]);

  const selectedTasks = selectedDay ? (tasksByDate[selectedDay] || []) : [];
  const today = new Date().toISOString().split('T')[0];

  const calendarDays = [];
  for (let i = 0; i < adjustedFirstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);

  const handleDownloadCalendar = () => {
    const activeTasks = tasks.filter(t => !t.done);
    if (activeTasks.length === 0) { alert('Nessun impegno attivo'); return; }
    downloadICS(activeTasks, 'student-hub-impegni.ics');
  };

  const handleQuickAdd = () => {
    if (!quickAddTitle.trim() || !quickAddDate) return;
    const newTask: Task = { id: createId(), title: quickAddTitle.trim(), date: quickAddDate, type: quickAddType, importance: quickAddImportance, estimatedTime: 60, done: false };
    if (onAddTask) onAddTask(newTask);
    setQuickAddTitle(''); setQuickAddType('scolastico'); setQuickAddImportance(2); setShowQuickAdd(false);
  };

  const openQuickAdd = (date?: string) => {
    setQuickAddDate(date || new Date().toISOString().split('T')[0]);
    setShowQuickAdd(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className={`text-2xl font-bold ${textColor}`}>📅 Calendario</h2>
        <button onClick={() => openQuickAdd()} className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white hover:scale-110 transition-transform shadow-lg">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div className={`${cardClass} p-6`}>
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h3 className={`text-lg font-semibold ${textColor}`}>{monthNames[month]} {year}</h3>
          <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {dayNames.map(day => <div key={day} className={`text-center text-xs font-medium py-2 ${subTextColor}`}>{day}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} className="aspect-square" />;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayTasks = tasksByDate[dateStr] || [];
            const isToday = dateStr === today;
            const isSelected = dateStr === selectedDay;

            return (
              <button key={dateStr} onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center relative transition-all text-sm ${isToday ? 'ring-2 ring-indigo-500' : ''} ${isSelected ? 'bg-indigo-500/20 border border-indigo-500/30' : darkMode ? 'hover:bg-white/5' : 'hover:bg-black/5'} ${dayTasks.length > 0 ? 'font-semibold' : ''} ${textColor}`}>
                <span>{day}</span>
                {dayTasks.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {dayTasks.slice(0, 3).map((t, j) => <div key={j} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: IMPORTANCE_CONFIG[t.importance - 1].color }} />)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <div className={`${cardClass} p-6 animate-scale-in`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-semibold ${textColor}`}>{new Date(selectedDay + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
            <button onClick={() => openQuickAdd(selectedDay)} className="btn-primary flex items-center gap-1 text-xs px-3 py-1.5">
              <Plus className="w-3.5 h-3.5" /> Aggiungi
            </button>
          </div>
          {selectedTasks.length === 0 ? <p className={`text-sm ${subTextColor}`}>Nessun impegno</p> : (
            <div className="space-y-2">
              {selectedTasks.map(task => {
                const imp = IMPORTANCE_CONFIG[task.importance - 1];
                return (
                  <div key={task.id} className={`flex items-center gap-3 p-3 rounded-lg ${darkMode ? 'bg-white/5' : 'bg-black/5'} border-l-3`} style={{ borderLeftColor: imp.color }}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: imp.color }} />
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${task.done ? 'line-through opacity-60' : ''} ${textColor}`}>{task.title}</p>
                      <span className={`text-xs ${subTextColor}`}>{task.type} • {imp.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className={`${cardClass} p-6 border-l-4 border-purple-500`}>
        <div className="flex items-center gap-3 mb-3">
          <Download className="w-5 h-5 text-purple-400" />
          <h3 className={`font-semibold ${textColor}`}>Esporta Calendario</h3>
        </div>
        <p className={`text-sm ${subTextColor} mb-3`}>Scarica i tuoi impegni come file .ics per iPhone</p>
        <button onClick={handleDownloadCalendar} className="btn-primary flex items-center gap-2 text-sm">
          <Download className="w-4 h-4" /> Scarica (.ics)
        </button>
      </div>

      {showQuickAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className={`${cardClass} p-6 w-full max-w-md animate-scale-in`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${textColor}`}>Nuovo Impegno</h3>
              <button onClick={() => setShowQuickAdd(false)} className={`p-1 rounded-lg ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
                <X className={`w-5 h-5 ${textColor}`} />
              </button>
            </div>
            <div className="space-y-4">
              <input type="text" value={quickAddTitle} onChange={e => setQuickAddTitle(e.target.value)} className={darkMode ? 'input-glass w-full' : 'input-light w-full'} placeholder="Titolo" autoFocus />
              <input type="date" value={quickAddDate} onChange={e => setQuickAddDate(e.target.value)} className={darkMode ? 'input-glass w-full' : 'input-light w-full'} />
              <div className="flex gap-2">
                <button onClick={() => setQuickAddType('scolastico')} className={`flex-1 py-2 rounded-lg text-sm ${quickAddType === 'scolastico' ? 'bg-indigo-500 text-white' : darkMode ? 'bg-white/10' : 'bg-black/5'}`}>📚 Scolastico</button>
                <button onClick={() => setQuickAddType('personale')} className={`flex-1 py-2 rounded-lg text-sm ${quickAddType === 'personale' ? 'bg-indigo-500 text-white' : darkMode ? 'bg-white/10' : 'bg-black/5'}`}>👤 Personale</button>
              </div>
              <div className="flex gap-2">
                {IMPORTANCE_CONFIG.map(imp => (
                  <button key={imp.level} onClick={() => setQuickAddImportance(imp.level as any)} className={`flex-1 py-2 rounded-lg text-xs border ${quickAddImportance === imp.level ? `${imp.bg} ${imp.text} ${imp.border}` : darkMode ? 'border-white/10' : 'border-black/10'}`}>
                    {imp.label.slice(0, 6)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowQuickAdd(false)} className={`flex-1 py-2 rounded-lg ${darkMode ? 'bg-white/10' : 'bg-black/5'}`}>Annulla</button>
                <button onClick={handleQuickAdd} disabled={!quickAddTitle.trim()} className="flex-1 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white disabled:opacity-50">Aggiungi</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
