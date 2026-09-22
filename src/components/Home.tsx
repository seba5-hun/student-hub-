import React, { useMemo } from 'react';
import { Target, BookOpen, Clock, Flame, TrendingUp, TrendingDown, Award, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { UserData, getSubjectAverages, getSubjectStudyTime, getStudyStreak, getWeeklyStudyHours, getHeatmapData, getRandomQuote, IMPORTANCE_CONFIG, parseDate, formatDate } from '../lib/store';

interface HomeProps {
  data: UserData;
  darkMode: boolean;
  onNavigate: (section: string) => void;
  onUpdateSettings?: (settings: UserData['settings']) => void;
}

export default function Home({ data, darkMode, onNavigate, onUpdateSettings }: HomeProps) {
  const { tasks, grades, sessions, settings } = data;
  const quote = useMemo(() => getRandomQuote(), []);

  const activeTasks = tasks.filter(t => !t.done).sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());
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

  return (
    <div className="space-y-6">
      <div className={`${cardClass} p-5 border-l-4 border-indigo-500`}>
        <p className={`italic ${darkMode ? 'text-white/80' : 'text-gray-600'}`}>"{quote}"</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Target className="w-5 h-5" />} label="Impegni attivi" value={activeTasks.length} color="indigo" darkMode={darkMode} />
        <StatCard icon={<BookOpen className="w-5 h-5" />} label="Media voti" value={avgGrade} color="emerald" darkMode={darkMode} />
        <StatCard icon={<Clock className="w-5 h-5" />} label="Ore studio" value={totalHours} color="amber" darkMode={darkMode} />
        <StatCard icon={<Flame className="w-5 h-5" />} label="Streak 🔥" value={streak} color="rose" darkMode={darkMode} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`${cardClass} p-6 flex items-center gap-6`}>
          <div className="relative">
            <svg width="110" height="110" className="transform -rotate-90">
              <circle cx="55" cy="55" r="45" stroke={darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} strokeWidth="8" fill="none" />
              <circle cx="55" cy="55" r="45" stroke="url(#goalGrad)" strokeWidth="8" fill="none"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" className="progress-ring" />
              <defs>
                <linearGradient id="goalGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-lg font-bold ${textColor}`}>{Math.round(goalProgress)}%</span>
            </div>
          </div>
          <div>
            <h3 className={`font-semibold ${textColor}`}>Obiettivo Settimanale</h3>
            <p className={`text-sm ${subTextColor}`}>{weeklyHours.toFixed(1)}h / {settings.weeklyGoal}h</p>
          </div>
        </div>

        <div className={`${cardClass} p-6`}>
          <h3 className={`font-semibold mb-3 ${textColor}`}>Riepilogo</h3>
          <div className="grid grid-cols-2 gap-3">
            <SummaryItem icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} label="Migliore" value={bestSubject ? bestSubject[0] : '—'} sub={bestSubject ? `${bestSubject[1]}` : ''} darkMode={darkMode} />
            <SummaryItem icon={<TrendingDown className="w-4 h-4 text-red-400" />} label="Più debole" value={worstSubject ? worstSubject[0] : '—'} sub={worstSubject ? `${worstSubject[1]}` : ''} darkMode={darkMode} />
            <SummaryItem icon={<Award className="w-4 h-4 text-amber-400" />} label="Più studiata" value={mostStudied ? mostStudied[0] : '—'} sub={mostStudied ? `${Math.round(mostStudied[1] / 60)}h` : ''} darkMode={darkMode} />
            <SummaryItem icon={<CheckCircle2 className="w-4 h-4 text-indigo-400" />} label="Completati" value={`${tasks.filter(t => t.done).length}`} sub="totale" darkMode={darkMode} />
          </div>
        </div>
      </div>

      <div className={`${cardClass} p-6`}>
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
                    <p className={`text-xs ${subTextColor}`}>{formatDate(task.date)}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${imp.bg} ${imp.text}`}>{imp.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${cardClass} p-6`}>
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
            <p className={`text-sm ${subTextColor} text-center py-8`}>Nessun dato disponibile</p>
          )}
        </div>
      </div>

      <div className={`${cardClass} p-6 border-l-4 border-amber-500`}>
        <h3 className={`font-semibold mb-2 ${textColor}`}>📝 Note rapide</h3>
        <textarea
          value={settings.notes}
          onChange={(e) => {
            if (onUpdateSettings) {
              onUpdateSettings({ ...settings, notes: e.target.value });
            }
          }}
          className={`w-full h-24 rounded-lg p-3 text-sm resize-none ${darkMode ? 'bg-white/5 text-white border-white/10' : 'bg-black/5 text-gray-800 border-black/10'} border outline-none focus:border-indigo-500/50`}
          placeholder="Scrivi qui le tue note rapide..."
        />
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
    <div className={`rounded-xl p-4 bg-gradient-to-br ${colors[color]} border backdrop-blur-xl`}>
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
