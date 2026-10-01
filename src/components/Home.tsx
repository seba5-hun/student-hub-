import React, { useMemo, useState } from 'react';
import { Pencil, Minus, Target, BookOpen, Clock, Flame, TrendingUp, TrendingDown, Award, CheckCircle2, SlidersHorizontal, ChevronUp, ChevronDown, EyeOff, Plus, Check, RotateCcw } from 'lucide-react';
import { SECTIONS } from './Layout';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { UserData, getSubjectAverages, getSubjectStudyTime, getStudyStreak, getWeeklyStudyHours, getHeatmapData, getRandomQuote, IMPORTANCE_CONFIG, formatDate, formatTaskTime, compareTasks } from '../lib/store';

// Panels of the Home page, in their default order. `wide` panels take the full row.
const WIDGETS: { id: string; label: string; wide?: boolean }[] = [
  { id: 'quote', label: 'Frase motivazionale', wide: true },
  { id: 'stats', label: 'Statistiche (impegni, media, ore, streak)', wide: true },
  { id: 'goal', label: 'Obiettivo settimanale' },
  { id: 'summary', label: 'Riepilogo materie' },
  { id: 'upcoming', label: 'Prossimi impegni', wide: true },
  { id: 'chart', label: 'Tempo di studio per materia' },
  { id: 'notes', label: 'Note rapide', wide: true },
];

interface HomeProps {
  data: UserData;
  darkMode: boolean;
  onNavigate: (section: string) => void;
  onUpdateSettings?: (patch: Partial<UserData['settings']>) => void;
}

export default function Home({ data, darkMode, onNavigate, onUpdateSettings }: HomeProps) {
  const { tasks, grades, sessions, settings } = data;
  const quote = useMemo(() => getRandomQuote(), []);

  const activeTasks = tasks.filter(t => !t.done).sort(compareTasks);
  const avgGrade = grades.length > 0 ? (grades.reduce((s, g) => s + g.value, 0) / grades.length).toFixed(1) : '—';
  const totalHours = (sessions.reduce((s, ss) => s + ss.duration, 0) / 60).toFixed(1);
  const streak = getStudyStreak(sessions);
  const weeklyHours = getWeeklyStudyHours(sessions);
  const goalProgress = settings.weeklyGoal > 0 ? Math.min((weeklyHours / settings.weeklyGoal) * 100, 100) : 0;

  const subjectAvgs = getSubjectAverages(grades);
  const bestSubject = Object.entries(subjectAvgs).sort((a, b) => b[1] - a[1])[0];
  const worstSubject = Object.entries(subjectAvgs).sort((a, b) => a[1] - b[1])[0];
  const studyTimes = getSubjectStudyTime(sessions);
  const mostStudied = Object.entries(studyTimes).sort((a, b) => b[1] - a[1])[0];

  const studyChartData = Object.entries(studyTimes).map(([subject, minutes]) => ({
    subject: subject.length > 10 ? subject.slice(0, 10) + '…' : subject,
    ore: Math.round(minutes / 60 * 10) / 10,
  }));

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';

  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (goalProgress / 100) * circumference;

  const [editing, setEditing] = useState(false);
  const layout = settings.homeLayout;
  const order = [
    ...(layout?.order || []).filter(id => WIDGETS.some(w => w.id === id)),
    ...WIDGETS.map(w => w.id).filter(id => !(layout?.order || []).includes(id)),
  ];
  const hidden = layout?.hidden || [];
  const visible = order.filter(id => !hidden.includes(id));
  const hiddenSections = settings.hiddenSections || [];

  // Half-width panels go side by side in pairs; one left alone (next to a wide panel or at
  // the end) takes the full row, so no row is left half empty.
  const fullRow = new Set<string>();
  for (let i = 0; i < visible.length; i++) {
    const w = WIDGETS.find(x => x.id === visible[i]);
    const next = WIDGETS.find(x => x.id === visible[i + 1]);
    if (w?.wide) { fullRow.add(visible[i]); continue; }
    if (next && !next.wide) { i++; continue; }
    fullRow.add(visible[i]);
  }

  const saveLayout = (nextOrder: string[], nextHidden: string[]) =>
    onUpdateSettings?.({ homeLayout: { order: nextOrder, hidden: nextHidden } });
  const hideWidget = (id: string) => saveLayout(order, [...hidden, id]);
  const showWidget = (id: string) => saveLayout(order, hidden.filter(h => h !== id));
  // Moves a panel before/after the nearest visible one.
  const moveWidget = (id: string, direction: -1 | 1) => {
    const pos = visible.indexOf(id);
    const other = visible[pos + direction];
    if (!other) return;
    const next = [...order];
    const a = next.indexOf(id);
    const b = next.indexOf(other);
    [next[a], next[b]] = [next[b], next[a]];
    saveLayout(next, hidden);
  };
  const toggleSection = (id: string) => onUpdateSettings?.({
    hiddenSections: hiddenSections.includes(id) ? hiddenSections.filter(h => h !== id) : [...hiddenSections, id],
  });
  const resetAll = () => onUpdateSettings?.({ homeLayout: { order: WIDGETS.map(w => w.id), hidden: [] }, hiddenSections: [] });

  const renderWidget = (id: string): React.ReactNode => {
    switch (id) {
      case 'quote':
        return (
          <div className={`${cardClass} p-5 border-l-4 border-l-indigo-500 h-full flex items-center`}>
            <p className={`italic ${darkMode ? 'text-white/80' : 'text-gray-600'}`}>"{quote}"</p>
          </div>
        );
      case 'stats':
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<Target className="w-5 h-5" />} label="Impegni attivi" value={activeTasks.length} color="indigo" darkMode={darkMode} />
            <StatCard icon={<BookOpen className="w-5 h-5" />} label="Media voti" value={avgGrade} color="emerald" darkMode={darkMode} />
            <StatCard icon={<Clock className="w-5 h-5" />} label="Ore studio" value={totalHours} color="amber" darkMode={darkMode} />
            <StatCard icon={<Flame className="w-5 h-5" />} label="Streak 🔥" value={streak} color="rose" darkMode={darkMode} />
          </div>
        );
      case 'goal':
        return (
          <GoalCard weeklyHours={weeklyHours} goal={settings.weeklyGoal} progress={goalProgress}
            circumference={circumference} strokeDashoffset={strokeDashoffset} darkMode={darkMode}
            onChange={onUpdateSettings ? (weeklyGoal) => onUpdateSettings({ weeklyGoal }) : undefined} />
        );
      case 'summary':
        return (
          <div className={`${cardClass} p-6 h-full flex flex-col`}>
            <h3 className={`font-semibold mb-3 ${textColor}`}>Riepilogo</h3>
            <div className="grid grid-cols-2 gap-3 flex-1 content-center">
              <SummaryItem icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} label="Migliore" value={bestSubject ? bestSubject[0] : '—'} sub={bestSubject ? `${bestSubject[1]}` : ''} darkMode={darkMode} />
              <SummaryItem icon={<TrendingDown className="w-4 h-4 text-red-400" />} label="Più debole" value={worstSubject ? worstSubject[0] : '—'} sub={worstSubject ? `${worstSubject[1]}` : ''} darkMode={darkMode} />
              <SummaryItem icon={<Award className="w-4 h-4 text-amber-400" />} label="Più studiata" value={mostStudied ? mostStudied[0] : '—'} sub={mostStudied ? `${Math.round(mostStudied[1] / 60)}h` : ''} darkMode={darkMode} />
              <SummaryItem icon={<CheckCircle2 className="w-4 h-4 text-indigo-400" />} label="Completati" value={`${tasks.filter(t => t.done).length}`} sub="totale" darkMode={darkMode} />
            </div>
          </div>
        );
      case 'upcoming':
        return (
          <div className={`${cardClass} p-6 h-full`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`font-semibold ${textColor}`}>Prossimi impegni</h3>
              <button onClick={() => onNavigate('impegni')} className="text-sm text-indigo-400 hover:text-indigo-300">Vedi tutti →</button>
            </div>
            {activeTasks.length === 0 ? (
              <p className={`text-sm ${subTextColor}`}>Nessun impegno in sospeso 🎉</p>
            ) : (
              <div className="space-y-2">
                {activeTasks.slice(0, 5).map(task => {
                  const imp = IMPORTANCE_CONFIG[task.importance - 1];
                  return (
                    <div key={task.id} className={`flex items-center justify-between p-3 rounded-lg ${darkMode ? 'bg-white/5' : 'bg-black/5'} border-l-3`} style={{ borderLeftColor: imp.color }}>
                      <div>
                        <p className={`text-sm font-medium ${textColor}`}>{task.title}</p>
                        <p className={`text-xs ${subTextColor}`}>{formatDate(task.date)}{task.time ? ` · 🕒 ${formatTaskTime(task)}` : ''}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${imp.bg} ${imp.text}`}>{imp.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      case 'chart':
        return (
          <div className={`${cardClass} p-6 h-full flex flex-col`}>
            <h3 className={`font-semibold mb-4 ${textColor}`}>Tempo studio per materia</h3>
            {studyChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={studyChartData}>
                  <XAxis dataKey="subject" tick={{ fill: darkMode ? '#fff' : '#333', fontSize: 11 }} />
                  <YAxis tick={{ fill: darkMode ? '#fff' : '#333', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: darkMode ? '#1f2937' : '#fff', border: 'none', borderRadius: '8px', color: darkMode ? '#fff' : '#333' }} />
                  <Bar dataKey="ore" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className={`text-sm ${subTextColor} text-center py-8 flex-1 flex items-center justify-center`}>Nessun dato disponibile</p>
            )}
          </div>
        );
      case 'notes':
        return (
          <div className={`${cardClass} p-6 border-l-4 border-l-amber-500 h-full flex flex-col`}>
            <h3 className={`font-semibold mb-2 ${textColor}`}>📝 Note rapide</h3>
            <textarea
              value={settings.notes}
              onChange={(e) => onUpdateSettings?.({ notes: e.target.value })}
              className={`w-full min-h-24 flex-1 rounded-lg p-3 text-sm resize-none ${darkMode ? 'bg-white/5 text-white border-white/10' : 'bg-black/5 text-gray-800 border-black/10'} border outline-none focus:border-indigo-500/50`}
              placeholder="Scrivi qui le tue note rapide..."
            />
          </div>
        );
      default:
        return null;
    }
  };

  const toolButton = (label: string, icon: React.ReactNode, onClick: () => void, disabled = false) => (
    <button onClick={onClick} disabled={disabled} title={label} aria-label={label}
      className={`w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30 ${darkMode ? 'bg-gray-900/90 text-white hover:bg-gray-800' : 'bg-white text-gray-700 hover:bg-gray-100 shadow'}`}>
      {icon}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end pt-3">
        {editing ? (
          <button onClick={() => setEditing(false)} className="btn-primary text-sm flex items-center gap-2">
            <Check className="w-4 h-4" /> Fatto
          </button>
        ) : (
          <button onClick={() => setEditing(true)}
            className={`text-sm px-3 py-1.5 rounded-lg flex items-center gap-2 ${darkMode ? 'text-white/70 hover:bg-white/10' : 'text-gray-600 hover:bg-black/5'}`}>
            <SlidersHorizontal className="w-4 h-4" /> Personalizza
          </button>
        )}
      </div>

      {editing && (
        <div className={`${cardClass} p-5 space-y-4 border border-dashed ${darkMode ? 'border-indigo-400/50' : 'border-indigo-500/40'}`}>
          <div>
            <h3 className={`font-semibold ${textColor}`}>Personalizza la tua dashboard</h3>
            <p className={`text-sm ${subTextColor}`}>Usa le frecce per spostare i pannelli e l'occhio per nasconderli. Le scelte valgono su tutti i tuoi dispositivi.</p>
          </div>

          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${subTextColor}`}>Pannelli nascosti</p>
            {hidden.length === 0 ? (
              <p className={`text-sm ${subTextColor}`}>Nessuno: tutti i pannelli sono visibili.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {order.filter(id => hidden.includes(id)).map(id => (
                  <button key={id} onClick={() => showWidget(id)}
                    className={`text-sm px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${darkMode ? 'border-white/15 text-white/80 hover:bg-white/10' : 'border-black/10 text-gray-700 hover:bg-black/5'}`}>
                    <Plus className="w-3.5 h-3.5" /> {WIDGETS.find(w => w.id === id)?.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${subTextColor}`}>Sezioni nel menu</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SECTIONS.filter(sec => sec.id !== 'home').map(sec => {
                const on = !hiddenSections.includes(sec.id);
                return (
                  <label key={sec.id} className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg cursor-pointer ${darkMode ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}>
                    <span className={`text-sm flex items-center gap-2 ${on ? textColor : subTextColor}`}>
                      <sec.icon className="w-4 h-4" /> {sec.label}
                    </span>
                    <input type="checkbox" checked={on} onChange={() => toggleSection(sec.id)} className="sr-only" aria-label={`Mostra ${sec.label} nel menu`} />
                    <span className={`w-10 h-6 rounded-full relative transition-colors flex-shrink-0 ${on ? 'bg-gradient-to-r from-indigo-500 to-purple-600' : darkMode ? 'bg-white/15' : 'bg-black/15'}`}>
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-5' : 'left-1'}`} />
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <button onClick={resetAll} className={`text-sm flex items-center gap-1.5 ${subTextColor} hover:underline`}>
            <RotateCcw className="w-3.5 h-3.5" /> Ripristina come all'inizio
          </button>
        </div>
      )}

      {visible.length === 0 && !editing && (
        <div className={`${cardClass} p-8 text-center`}>
          <p className={textColor}>La tua Home è vuota.</p>
          <button onClick={() => setEditing(true)} className="mt-3 text-sm text-indigo-400 hover:text-indigo-300">Personalizza per aggiungere pannelli</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visible.map((id, i) => {
          const widget = WIDGETS.find(w => w.id === id)!;
          return (
            <div key={id} className={`relative h-full ${fullRow.has(id) ? 'md:col-span-2' : ''} ${editing ? `rounded-2xl outline-2 outline-dashed outline-offset-4 ${darkMode ? 'outline-indigo-400/60' : 'outline-indigo-500/50'}` : ''}`}>
              {editing && (
                <div className="absolute -top-3 right-3 z-10 flex items-center gap-1">
                  {toolButton('Sposta su', <ChevronUp className="w-4 h-4" />, () => moveWidget(id, -1), i === 0)}
                  {toolButton('Sposta giù', <ChevronDown className="w-4 h-4" />, () => moveWidget(id, 1), i === visible.length - 1)}
                  {toolButton(`Nascondi ${widget.label}`, <EyeOff className="w-4 h-4" />, () => hideWidget(id))}
                </div>
              )}
              <div className={`h-full ${editing ? 'pointer-events-none select-none opacity-90' : ''}`}>{renderWidget(id)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color, darkMode }: { icon: React.ReactNode; label: string; value: string | number; color: string; darkMode: boolean }) {
  const colors: Record<string, string> = {
    indigo: 'from-indigo-500/20 to-indigo-600/10 border-indigo-500/30',
    emerald: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30',
    amber: 'from-amber-500/20 to-amber-600/10 border-amber-500/30',
    rose: 'from-rose-500/20 to-rose-600/10 border-rose-500/30',
  };
  const iconColors: Record<string, string> = {
    indigo: 'text-indigo-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    rose: 'text-rose-400',
  };

  return (
    <div className={`rounded-xl p-4 bg-gradient-to-br ${colors[color]} border`}>
      <div className={`${iconColors[color]} mb-2`}>{icon}</div>
      <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>{value}</p>
      <p className={`text-xs ${darkMode ? 'text-white/60' : 'text-gray-500'}`}>{label}</p>
    </div>
  );
}

function SummaryItem({ icon, label, value, sub, darkMode }: { icon: React.ReactNode; label: string; value: string; sub: string; darkMode: boolean }) {
  return (
    <div className={`p-2 rounded-lg ${darkMode ? 'bg-white/5' : 'bg-black/5'}`}>
      <div className="flex items-center gap-1 mb-1">{icon}<span className={`text-xs ${darkMode ? 'text-white/60' : 'text-gray-500'}`}>{label}</span></div>
      <p className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>{value}</p>
      <p className={`text-xs ${darkMode ? 'text-white/40' : 'text-gray-400'}`}>{sub}</p>
    </div>
  );
}

const GOAL_PRESETS = [5, 10, 15, 20, 30];

// Weekly goal ring; the pencil opens an inline editor (stepper, presets, slider).
function GoalCard({ weeklyHours, goal, progress, circumference, strokeDashoffset, darkMode, onChange }: {
  weeklyHours: number;
  goal: number;
  progress: number;
  circumference: number;
  strokeDashoffset: number;
  darkMode: boolean;
  onChange?: (hours: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal);
  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';
  const chip = darkMode ? 'bg-white/10 hover:bg-white/15 text-white/80' : 'bg-black/5 hover:bg-black/10 text-gray-600';
  const clamp = (h: number) => Math.max(1, Math.min(100, Math.round(h)));
  // While editing, the ring and the numbers preview the new goal.
  const shownGoal = editing ? clamp(draft) : goal;
  const shownProgress = editing ? Math.min((weeklyHours / shownGoal) * 100, 100) : progress;
  const shownOffset = editing ? circumference - (shownProgress / 100) * circumference : strokeDashoffset;
  const left = Math.max(0, goal - weeklyHours);

  const open = () => { setDraft(goal || 10); setEditing(true); };
  const save = () => { onChange?.(clamp(draft)); setEditing(false); };

  return (
    <div className={`${cardClass} p-6 h-full flex flex-col justify-center relative`}>
      {onChange && !editing && (
        <button onClick={open} aria-label="Modifica obiettivo settimanale" title="Modifica obiettivo"
          className={`absolute top-3 right-3 p-2 rounded-lg transition-colors ${darkMode ? 'text-white/50 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-black/5'}`}>
          <Pencil className="w-4 h-4" />
        </button>
      )}
      <div className="flex items-center justify-center sm:justify-start gap-6">
        <div className="relative flex-shrink-0">
          <svg width="110" height="110" className="transform -rotate-90">
            <circle cx="55" cy="55" r="45" stroke={darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} strokeWidth="8" fill="none" />
            <circle cx="55" cy="55" r="45" stroke="url(#goalGrad)" strokeWidth="8" fill="none"
              strokeDasharray={circumference} strokeDashoffset={shownOffset} strokeLinecap="round" className="progress-ring" />
            <defs>
              <linearGradient id="goalGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-lg font-bold ${textColor}`}>{Math.round(shownProgress)}%</span>
          </div>
        </div>
        <div className="min-w-0">
          <h3 className={`font-semibold ${textColor}`}>Obiettivo Settimanale</h3>
          <p className={`text-sm ${subTextColor}`}>{weeklyHours.toFixed(1)}h / <span className="transition-colors">{shownGoal}h</span></p>
          {!editing && goal > 0 && (
            <p className={`text-xs mt-1 ${left === 0 ? 'text-emerald-400' : subTextColor}`}>
              {left === 0 ? 'Obiettivo raggiunto 🎉' : `Mancano ${left.toFixed(1)}h negli ultimi 7 giorni`}
            </p>
          )}
        </div>
      </div>

      {editing && (
        <div className={`mt-5 pt-4 border-t animate-scale-in ${darkMode ? 'border-white/10' : 'border-black/10'}`}>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setDraft(d => clamp(d - 1))} aria-label="Un'ora in meno" className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${chip}`}>
              <Minus className="w-4 h-4" />
            </button>
            <div className="flex items-baseline gap-1">
              <input type="number" min={1} max={100} value={draft} aria-label="Ore a settimana"
                onChange={e => setDraft(Number(e.target.value) || 0)}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
                className={`w-16 text-center text-2xl font-bold bg-transparent outline-none ${textColor}`} />
              <span className={`text-sm ${subTextColor}`}>ore / settimana</span>
            </div>
            <button onClick={() => setDraft(d => clamp(d + 1))} aria-label="Un'ora in più" className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${chip}`}>
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <input type="range" min={1} max={60} value={Math.min(draft, 60)} onChange={e => setDraft(Number(e.target.value))}
            aria-label="Obiettivo in ore" className="w-full mt-4 accent-indigo-500" />
          <div className="flex flex-wrap justify-center gap-2 mt-3">
            {GOAL_PRESETS.map(h => (
              <button key={h} onClick={() => setDraft(h)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${draft === h ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white' : chip}`}>
                {h}h
              </button>
            ))}
          </div>
          <p className={`text-xs text-center mt-3 ${subTextColor}`}>Circa {(clamp(draft) / 7).toFixed(1)}h al giorno</p>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setEditing(false)} className={`px-4 py-2 rounded-lg text-sm ${subTextColor}`}>Annulla</button>
            <button onClick={save} className="btn-primary text-sm">Salva</button>
          </div>
        </div>
      )}
    </div>
  );
}
