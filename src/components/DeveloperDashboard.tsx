import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw, Users, UserPlus, Clock, Timer as TimerIcon, Sparkles, Upload, Eye, Search, Monitor, Smartphone, Tablet, Loader2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { DashboardData, loadDashboard } from '../lib/analytics';
import { SECTIONS } from './Layout';
import { toDateKey } from '../lib/store';

const SECTION_LABELS: Record<string, string> = {
  ...Object.fromEntries(SECTIONS.map(s => [s.id, s.label])),
  accesso: 'Pagina di accesso',
  'reset-password': 'Reimposta password',
  sviluppatori: 'Admin',
};

const DEVICE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  desktop: { label: 'Computer', icon: <Monitor className="w-4 h-4" /> },
  mobile: { label: 'Telefono', icon: <Smartphone className="w-4 h-4" /> },
  tablet: { label: 'Tablet', icon: <Tablet className="w-4 h-4" /> },
};

export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds || 0);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatDay(day: string): string {
  const [, month, d] = day.split('-');
  return `${Number(d)}/${Number(month)}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return `${date.toLocaleDateString('it-IT')} ${date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
}

// Every day of the period, with 0 where there was no activity (a missing day is not a gap).
function fillDays(daily: DashboardData['daily'], days: number) {
  const byDay = new Map(daily.map(d => [d.day, d]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = toDateKey(date);
    const d = byDay.get(key);
    out.push({ day: key, label: formatDay(key), visitors: d?.visitors || 0, minutes: Math.round((d?.seconds || 0) / 6) / 10 });
  }
  return out;
}

export default function DeveloperDashboard({ darkMode }: { darkMode: boolean }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [query, setQuery] = useState('');

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';
  const axisColor = darkMode ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)';
  const gridColor = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const accent = darkMode ? '#C8F25A' : '#5C8500';

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await loadDashboard(days));
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { refresh(); }, [refresh]);

  const series = useMemo(() => (data ? fillDays(data.daily, days) : []), [data, days]);
  const t = data?.totals || {};
  const sections = (data?.sections || []).filter(s => s.section !== 'sviluppatori');
  const maxSectionSeconds = Math.max(1, ...sections.map(s => s.seconds));
  const topSection = sections.find(s => s.section !== 'accesso' && s.section !== 'reset-password');
  const deviceTotal = (data?.devices || []).reduce((n, d) => n + d.visitors, 0) || 1;
  const users = (data?.users || []).filter(u => u.email?.toLowerCase().includes(query.trim().toLowerCase()));

  const tile = (icon: React.ReactNode, label: string, value: string | number, sub?: string) => (
    <div className={`${cardClass} p-4`}>
      <div className={`flex items-center gap-2 text-xs ${subTextColor}`}>{icon}{label}</div>
      <p className={`text-2xl font-bold mt-1 ${textColor}`}>{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${subTextColor}`}>{sub}</p>}
    </div>
  );

  const tooltipStyle = { background: darkMode ? '#1f2937' : '#fff', border: 'none', borderRadius: 8, color: darkMode ? '#fff' : '#1f2937', fontSize: 12 };

  const areaChart = (title: string, dataKey: 'visitors' | 'minutes', unit: string, id: string) => (
    <div className={`${cardClass} p-5`}>
      <h3 className={`font-semibold mb-3 ${textColor}`}>{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
              <stop offset="100%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={gridColor} />
          <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis allowDecimals={dataKey === 'minutes'} tick={{ fill: axisColor, fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: axisColor, strokeDasharray: '3 3' }}
            formatter={(v: number) => [`${v} ${unit}`, title]} labelFormatter={l => `Giorno ${l}`} />
          <Area type="monotone" dataKey={dataKey} stroke={accent} strokeWidth={2} fill={`url(#${id})`} activeDot={{ r: 5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className={`text-lg font-semibold flex items-center gap-2 ${textColor}`}><Activity className="w-5 h-5 text-indigo-400" /> Statistiche</h3>
          <p className={`text-sm ${subTextColor}`}>
            Andamento del sito{updatedAt && ` · aggiornato alle ${updatedAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex rounded-xl p-1 ${darkMode ? 'bg-white/10' : 'bg-black/5'}`} role="group" aria-label="Periodo">
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1 rounded-lg text-sm ${days === d ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-[var(--on-brand)]' : subTextColor}`}>
                {d} giorni
              </button>
            ))}
          </div>
          <button onClick={refresh} disabled={loading} aria-label="Aggiorna" title="Aggiorna"
            className={`p-2 rounded-xl ${darkMode ? 'bg-white/10 hover:bg-white/15 text-white' : 'bg-black/5 hover:bg-black/10 text-gray-700'}`}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">⚠️ {error}</div>}

      {loading && !data && (
        <div className={`${cardClass} p-10 flex justify-center`}><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {tile(<Eye className="w-4 h-4" />, `Visitatori (${days} giorni)`, t.visitors ?? 0, `${t.visitors_all ?? 0} da sempre · ${t.sessions ?? 0} visite`)}
            {tile(<Users className="w-4 h-4" />, 'Utenti registrati', t.registered_users ?? 0, `+${t.new_users ?? 0} nel periodo`)}
            {tile(<UserPlus className="w-4 h-4" />, 'Utenti attivi', t.active_period ?? 0, `${t.active_1d ?? 0} oggi · ${t.active_7d ?? 0} negli ultimi 7 giorni`)}
            {tile(<Clock className="w-4 h-4" />, 'Tempo medio per utente', formatDuration(t.avg_seconds_per_user ?? 0), `${formatDuration(t.total_seconds ?? 0)} in totale`)}
            {tile(<TimerIcon className="w-4 h-4" />, 'Tempo medio per visita', formatDuration(t.avg_seconds_per_session ?? 0))}
            {tile(<Activity className="w-4 h-4" />, 'Sezione più usata', topSection ? SECTION_LABELS[topSection.section] || topSection.section : '—', topSection ? `${formatDuration(topSection.seconds)} · ${topSection.views} aperture` : undefined)}
            {tile(<Sparkles className="w-4 h-4" />, 'Domande all\'AI', t.ai_messages ?? 0)}
            {tile(<Upload className="w-4 h-4" />, 'File caricati', t.file_uploads ?? 0)}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {areaChart('Visitatori al giorno', 'visitors', 'visitatori', 'devVisitors')}
            {areaChart('Minuti di utilizzo al giorno', 'minutes', 'minuti', 'devMinutes')}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className={`${cardClass} p-5 lg:col-span-2`}>
              <h3 className={`font-semibold mb-1 ${textColor}`}>Sezioni più usate</h3>
              <p className={`text-xs mb-4 ${subTextColor}`}>Ordinate per tempo di utilizzo</p>
              {sections.length === 0 ? <p className={`text-sm ${subTextColor}`}>Ancora nessun dato.</p> : (
                <ul className="space-y-3">
                  {sections.map(s => (
                    <li key={s.section}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className={textColor}>{SECTION_LABELS[s.section] || s.section}</span>
                        <span className={`text-xs ${subTextColor}`}>{formatDuration(s.seconds)} · {s.views} aperture · {s.users} utenti</span>
                      </div>
                      <div className={`h-2 mt-1.5 rounded-full ${darkMode ? 'bg-white/5' : 'bg-black/5'}`}>
                        <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (s.seconds / maxSectionSeconds) * 100)}%`, background: accent }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={`${cardClass} p-5`}>
              <h3 className={`font-semibold mb-4 ${textColor}`}>Dispositivi</h3>
              {(data.devices || []).length === 0 ? <p className={`text-sm ${subTextColor}`}>Ancora nessun dato.</p> : (
                <ul className="space-y-3">
                  {data.devices.map(d => {
                    const info = DEVICE_LABELS[d.device] || { label: d.device, icon: <Monitor className="w-4 h-4" /> };
                    const pct = Math.round((d.visitors / deviceTotal) * 100);
                    return (
                      <li key={d.device}>
                        <div className="flex items-center justify-between text-sm">
                          <span className={`flex items-center gap-2 ${textColor}`}>{info.icon}{info.label}</span>
                          <span className={`text-xs ${subTextColor}`}>{pct}% · {d.visitors}</span>
                        </div>
                        <div className={`h-2 mt-1.5 rounded-full ${darkMode ? 'bg-white/5' : 'bg-black/5'}`}>
                          <div className="h-2 rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: accent }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className={`${cardClass} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className={`font-semibold ${textColor}`}>Utenti</h3>
                <p className={`text-xs ${subTextColor}`}>Tempo e visite negli ultimi {days} giorni</p>
              </div>
              <div className="relative">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${subTextColor}`} />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cerca email…"
                  className={`${darkMode ? 'input-glass' : 'input-light'} pl-9 py-1.5 text-sm`} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`text-left text-xs ${subTextColor}`}>
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Registrato il</th>
                    <th className="py-2 pr-4 font-medium">Ultimo accesso</th>
                    <th className="py-2 pr-4 font-medium text-right">Tempo</th>
                    <th className="py-2 font-medium text-right">Visite</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.email} className={`border-t ${darkMode ? 'border-white/5' : 'border-black/5'}`}>
                      <td className={`py-2 pr-4 ${textColor}`}>{u.email}</td>
                      <td className={`py-2 pr-4 whitespace-nowrap ${subTextColor}`}>{new Date(u.created_at).toLocaleDateString('it-IT')}</td>
                      <td className={`py-2 pr-4 whitespace-nowrap ${subTextColor}`}>{formatDateTime(u.last_seen)}</td>
                      <td className={`py-2 pr-4 text-right tabular-nums ${textColor}`}>{formatDuration(u.seconds)}</td>
                      <td className={`py-2 text-right tabular-nums ${textColor}`}>{u.sessions}</td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan={5} className={`py-4 text-center ${subTextColor}`}>Nessun utente trovato.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className={`text-xs ${subTextColor}`}>
            Il tempo viene contato solo mentre la pagina è aperta in primo piano e l'utente la sta usando (si ferma dopo 2 minuti di inattività).
            Non vengono registrati contenuti di note, file o chat. Il tuo utilizzo da sviluppatore non è conteggiato.
          </p>
        </>
      )}
    </div>
  );
}
