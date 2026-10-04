import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Sector } from 'recharts';
import { BarChart3, ChevronDown, PieChart as PieIcon, TrendingUp, TrendingDown, Sparkles } from 'lucide-react';
import { StudySession, SubjectDef, subjectColor } from '../lib/store';
import { periodOf, sessionsIn, minutesBySubject } from '../lib/studyPeriods';

interface Props {
  sessions: StudySession[];
  subjectDefs: SubjectDef[];
  darkMode: boolean;
  showStats: boolean;
  onToggleStats: () => void;
}

const WEEKS = [{ v: 0, l: 'Questa settimana' }, { v: -1, l: 'Scorsa' }, { v: -2, l: '2 sett. fa' }];

function hm(total: number): string {
  const m = Math.round(total);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

// Lighter version of a hex colour, for the gradient of each slice.
function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return hex;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

// The hovered slice grows a little and gets a thin halo.
function ActiveSlice(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, cornerRadius } = props;
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius - 2} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} cornerRadius={cornerRadius} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 11} outerRadius={outerRadius + 14} startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.45} cornerRadius={2} />
    </g>
  );
}

export default function WeekDistribution({ sessions, subjectDefs, darkMode, showStats, onToggleStats }: Props) {
  const [week, setWeek] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const mutedColor = darkMode ? 'text-white/65' : 'text-gray-500';

  const data = useMemo(() => {
    const period = periodOf('week', week);
    const subjects = minutesBySubject(sessionsIn(sessions, period));
    const total = subjects.reduce((sum, s) => sum + s.minutes, 0);
    const prevTotal = sessionsIn(sessions, periodOf('week', week - 1)).reduce((sum, s) => sum + s.duration, 0);
    return { period, subjects, total, prevTotal };
  }, [sessions, week]);

  const { period, subjects, total, prevTotal } = data;
  const change = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
  const focus = active !== null ? subjects[active] : null;
  const color = (name: string) => subjectColor(name, subjectDefs);
  const gradId = (i: number) => `wd-grad-${i}`;

  return (
    <div className={`relative overflow-hidden rounded-2xl p-[1px] ${darkMode ? 'bg-gradient-to-br from-white/25 via-white/5 to-indigo-400/30' : 'bg-gradient-to-br from-indigo-200 via-white to-purple-200'}`}>
      <div className={`relative rounded-2xl p-6 ${darkMode ? 'bg-[#1b1640]/80' : 'bg-white/90'}`}>
        {/* soft light behind the chart */}
        <div className="pointer-events-none absolute -top-24 -left-16 w-72 h-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-10 w-72 h-72 rounded-full bg-fuchsia-500/10 blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <PieIcon className="w-5 h-5 text-white" />
            </span>
            <div>
              <h3 className={`text-lg font-semibold tracking-tight ${textColor}`}>Distribuzione del tempo</h3>
              <p className={`text-xs ${mutedColor}`}>{period.label} · si azzera ogni lunedì</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className={`relative flex rounded-full p-1 ${darkMode ? 'bg-black/25 ring-1 ring-white/10' : 'bg-gray-100 ring-1 ring-black/5'}`} role="tablist" aria-label="Settimana">
              {WEEKS.map(o => (
                <button key={o.v} role="tab" aria-selected={week === o.v} onClick={() => { setWeek(o.v); setActive(null); }}
                  className={`px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-300 ${week === o.v
                    ? (darkMode ? 'bg-white text-gray-900 shadow-md' : 'bg-gray-900 text-white shadow-md')
                    : `${mutedColor} hover:opacity-100`}`}>
                  {o.l}
                </button>
              ))}
            </div>
            <button onClick={onToggleStats} aria-expanded={showStats}
              className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-1.5 transition-all duration-300 ${showStats
                ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/30'
                : darkMode ? 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15' : 'bg-gray-900/5 text-gray-800 ring-1 ring-black/10 hover:bg-gray-900/10'}`}>
              <BarChart3 className="w-4 h-4" /> Statistiche
              <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${showStats ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {subjects.length === 0 ? (
          <div className="relative flex flex-col items-center justify-center py-10 text-center">
            <div className={`w-40 h-40 rounded-full border-[14px] border-dashed ${darkMode ? 'border-white/10' : 'border-black/10'} flex items-center justify-center`}>
              <Sparkles className={`w-8 h-8 ${mutedColor}`} />
            </div>
            <p className={`mt-5 font-medium ${textColor}`}>{week === 0 ? 'Una settimana tutta da scrivere' : 'Nessuna sessione in questa settimana'}</p>
            <p className={`text-sm mt-1 ${mutedColor}`}>{week === 0 ? 'Avvia il timer: qui vedrai come dividi il tuo tempo tra le materie.' : 'Prova a guardare un\'altra settimana.'}</p>
          </div>
        ) : (
          <div className="relative grid grid-cols-1 md:grid-cols-[minmax(0,300px)_1fr] gap-8 items-center">
            <div className="relative mx-auto w-[260px] h-[260px] sm:w-[300px] sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <defs>
                    {subjects.map((s, i) => (
                      <linearGradient key={s.name} id={gradId(i)} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={lighten(color(s.name), 0.35)} />
                        <stop offset="100%" stopColor={color(s.name)} />
                      </linearGradient>
                    ))}
                    <filter id="wd-glow" x="-30%" y="-30%" width="160%" height="160%">
                      <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor={darkMode ? '#000' : '#6366f1'} floodOpacity={darkMode ? 0.45 : 0.18} />
                    </filter>
                  </defs>
                  {/* track */}
                  <Pie data={[{ v: 1 }]} dataKey="v" cx="50%" cy="50%" innerRadius="70%" outerRadius="88%" isAnimationActive={false}
                    fill={darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'} stroke="none" />
                  <Pie data={subjects} dataKey="minutes" nameKey="name" cx="50%" cy="50%" innerRadius="70%" outerRadius="88%"
                    startAngle={90} endAngle={-270} paddingAngle={subjects.length > 1 ? 3 : 0} cornerRadius={8} stroke="none"
                    activeIndex={active ?? undefined} activeShape={ActiveSlice}
                    onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(null)} onClick={(_, i) => setActive(a => (a === i ? null : i))}
                    animationDuration={900} animationEasing="ease-out" style={{ filter: 'url(#wd-glow)', cursor: 'pointer' }}>
                    {subjects.map((s, i) => (
                      <Cell key={s.name} fill={`url(#${gradId(i)})`} opacity={active === null || active === i ? 1 : 0.35} style={{ transition: 'opacity 300ms' }} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-12">
                {focus ? (
                  <div key={focus.name} className="animate-scale-in">
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: lighten(color(focus.name), darkMode ? 0.25 : 0) }}>{focus.name}</p>
                    <p className={`text-3xl font-bold tabular-nums mt-1 ${textColor}`}>{hm(focus.minutes)}</p>
                    <p className={`text-sm mt-0.5 ${mutedColor}`}>{Math.round((focus.minutes / total) * 100)}% della settimana</p>
                  </div>
                ) : (
                  <div key="total" className="animate-scale-in">
                    <p className={`text-xs font-semibold uppercase tracking-widest ${mutedColor}`}>Totale</p>
                    <p className={`text-4xl font-bold tabular-nums mt-1 bg-clip-text text-transparent ${darkMode ? 'bg-gradient-to-br from-white to-indigo-200' : 'bg-gradient-to-br from-gray-900 to-indigo-600'}`}>
                      {(total / 60).toFixed(1)}<span className="text-2xl"> h</span>
                    </p>
                    {change !== null ? (
                      <span className={`inline-flex items-center gap-1 mt-2 text-xs font-semibold px-2 py-0.5 rounded-full ${change >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                        {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {change >= 0 ? '+' : ''}{change}% vs sett. prima
                      </span>
                    ) : <p className={`text-xs mt-1 ${mutedColor}`}>{subjects.length} {subjects.length === 1 ? 'materia' : 'materie'}</p>}
                  </div>
                )}
              </div>
            </div>

            <ul className="space-y-2.5" aria-label="Tempo per materia">
              {subjects.map((s, i) => {
                const pct = (s.minutes / total) * 100;
                const isActive = active === i;
                return (
                  <li key={s.name}>
                    <button type="button" onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                      className={`w-full text-left rounded-xl px-4 py-3 transition-all duration-300 ${isActive
                        ? (darkMode ? 'bg-white/12 ring-1 ring-white/20 translate-x-1' : 'bg-white ring-1 ring-black/10 shadow-md translate-x-1')
                        : (darkMode ? 'bg-white/[0.06] hover:bg-white/10' : 'bg-gray-50 hover:bg-white')} ${active !== null && !isActive ? 'opacity-55' : ''}`}>
                      <div className="flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full flex-shrink-0 ring-4" style={{ background: color(s.name), boxShadow: `0 0 12px ${color(s.name)}`, ['--tw-ring-color' as string]: `${color(s.name)}33` }} />
                        <span className={`flex-1 font-semibold truncate ${textColor}`}>{s.name}</span>
                        <span className={`font-semibold tabular-nums ${textColor}`}>{hm(s.minutes)}</span>
                        <span className={`w-12 text-right text-sm font-bold tabular-nums ${mutedColor}`}>{Math.round(pct)}%</span>
                      </div>
                      <div className={`mt-2.5 h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-white/10' : 'bg-black/5'}`}>
                        <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${lighten(color(s.name), 0.35)}, ${color(s.name)})` }} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
