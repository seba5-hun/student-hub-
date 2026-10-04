import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react';
import { StudySession, SubjectDef, subjectColor } from '../lib/store';
import { PeriodKind, periodOf, sessionsIn, minutesBySubject, bucketsOf } from '../lib/studyPeriods';

const KINDS: { id: PeriodKind; label: string; previous: string }[] = [
  { id: 'week', label: 'Settimana', previous: 'alla settimana scorsa' },
  { id: 'month', label: 'Mese', previous: 'al mese scorso' },
  { id: 'year', label: 'Anno', previous: "all'anno scorso" },
];

function hm(total: number): string {
  const m = Math.round(total);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export default function StudyStats({ sessions, subjectDefs, darkMode }: { sessions: StudySession[]; subjectDefs: SubjectDef[]; darkMode: boolean }) {
  const [kind, setKind] = useState<PeriodKind>('week');
  const [offset, setOffset] = useState(0);

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/70' : 'text-gray-600';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';
  const tileClass = darkMode ? 'bg-white/10' : 'bg-black/5';
  const axisColor = darkMode ? 'rgba(255,255,255,0.75)' : '#4b5563';

  const stats = useMemo(() => {
    const period = periodOf(kind, offset);
    const previous = periodOf(kind, offset - 1);
    const current = sessionsIn(sessions, period);
    const total = current.reduce((sum, s) => sum + s.duration, 0);
    const prevTotal = sessionsIn(sessions, previous).reduce((sum, s) => sum + s.duration, 0);
    const buckets = bucketsOf(kind, period, sessions);
    const subjects = minutesBySubject(current);
    // Days counted up to today for the current period, so the average isn't diluted by future days.
    const end = Math.min(period.end.getTime(), Date.now());
    const days = Math.max(1, Math.ceil((end - period.start.getTime()) / 86400000));
    const studyDays = new Set(current.map(s => new Date(s.date).toDateString())).size;
    return { period, total, prevTotal, buckets, subjects, avgPerDay: total / days, studyDays };
  }, [sessions, kind, offset]);

  const change = stats.prevTotal > 0 ? Math.round(((stats.total - stats.prevTotal) / stats.prevTotal) * 100) : null;
  const kindInfo = KINDS.find(k => k.id === kind)!;
  const best = stats.buckets.reduce((a, b) => (b.minutes > a.minutes ? b : a), stats.buckets[0]);
  const chartData = stats.buckets.map(b => ({ ...b, hours: Math.round((b.minutes / 60) * 10) / 10 }));

  const tile = (label: string, value: string, extra?: React.ReactNode) => (
    <div className={`${tileClass} rounded-xl p-3`}>
      <p className={`text-xs font-medium ${subTextColor}`}>{label}</p>
      <p className={`text-xl font-bold tabular-nums mt-0.5 ${textColor}`}>{value}</p>
      {extra}
    </div>
  );

  return (
    <div className={`${cardClass} p-6 space-y-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className={`font-semibold flex items-center gap-2 ${textColor}`}><BarChart3 className="w-5 h-5 text-indigo-400" /> Statistiche</h3>
        <div className={`flex rounded-xl p-1 ${darkMode ? 'bg-white/10' : 'bg-black/5'}`} role="tablist">
          {KINDS.map(k => (
            <button key={k.id} role="tab" aria-selected={kind === k.id} onClick={() => { setKind(k.id); setOffset(0); }}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all ${kind === k.id ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow' : subTextColor}`}>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setOffset(o => o - 1)} aria-label="Periodo precedente" className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/10 text-white' : 'hover:bg-black/5 text-gray-700'}`}>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className={`font-semibold ${textColor}`}>{stats.period.label}</p>
          {offset !== 0 && (
            <button onClick={() => setOffset(0)} className="text-xs text-indigo-400 hover:text-indigo-300">Torna a oggi</button>
          )}
        </div>
        <button onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={offset === 0} aria-label="Periodo successivo"
          className={`p-2 rounded-lg disabled:opacity-30 ${darkMode ? 'hover:bg-white/10 text-white' : 'hover:bg-black/5 text-gray-700'}`}>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tile('Tempo totale', hm(stats.total),
          <p className={`text-xs mt-1 flex items-center gap-1 ${change === null ? subTextColor : change > 0 ? 'text-emerald-400' : change < 0 ? 'text-red-400' : subTextColor}`}>
            {change === null ? <>nessun confronto con il periodo prima</> : <>
              {change > 0 ? <TrendingUp className="w-3 h-3" /> : change < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {change > 0 ? '+' : ''}{change}% rispetto {kindInfo.previous}
            </>}
          </p>)}
        {tile('Media al giorno', hm(stats.avgPerDay))}
        {tile('Giorni di studio', String(stats.studyDays))}
        {tile(kind === 'year' ? 'Mese migliore' : 'Giorno migliore', best && best.minutes > 0 ? best.label : '—',
          best && best.minutes > 0 ? <p className={`text-xs mt-1 ${subTextColor}`}>{hm(best.minutes)}</p> : null)}
      </div>

      {stats.total === 0 ? (
        <p className={`text-sm text-center py-10 ${subTextColor}`}>Nessuna sessione di studio in questo periodo.</p>
      ) : (
        <>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'} />
                <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 12 }} axisLine={false} tickLine={false}
                  interval={kind === 'month' ? 'preserveStartEnd' : 0} minTickGap={4} />
                <YAxis tick={{ fill: axisColor, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} unit=" h" />
                <Tooltip
                  cursor={{ fill: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const b = payload[0].payload as typeof chartData[number];
                    return (
                      <div className={`rounded-xl px-3 py-2 text-sm shadow-xl border ${darkMode ? 'bg-gray-900 border-white/10 text-white' : 'bg-white border-black/10 text-gray-800'}`}>
                        <p className="font-semibold mb-1">{b.label} · {hm(b.minutes)}</p>
                        {Object.entries(b.bySubject).sort((x, y) => y[1] - x[1]).map(([name, min]) => (
                          <p key={name} className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: subjectColor(name, subjectDefs) }} />
                            <span className="flex-1">{name}</span><span className="tabular-nums">{hm(min)}</span>
                          </p>
                        ))}
                      </div>
                    );
                  }} />
                <Bar dataKey="hours" fill="#818cf8" radius={[4, 4, 0, 0]} maxBarSize={kind === 'month' ? 18 : 40} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2">
            <p className={`text-sm font-semibold ${textColor}`}>Per materia</p>
            {stats.subjects.map(s => (
              <div key={s.name} className="flex items-center gap-3">
                <span className={`w-28 sm:w-36 text-sm font-medium truncate ${textColor}`}>{s.name}</span>
                <div className={`flex-1 h-3 rounded-full overflow-hidden ${darkMode ? 'bg-white/10' : 'bg-black/10'}`}>
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(s.minutes / stats.subjects[0].minutes) * 100}%`, background: subjectColor(s.name, subjectDefs) }} />
                </div>
                <span className={`w-24 text-right text-sm font-semibold tabular-nums ${textColor}`}>{hm(s.minutes)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
