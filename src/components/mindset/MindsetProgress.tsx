import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { BedDouble, Smartphone, Flame, Lightbulb, TrendingUp, AlertTriangle } from 'lucide-react';
import {
  MindsetData, scoreDay, weekAverage, sleepStats, sleepWarning, phoneStats, habitStreak, disruptionPatterns, completionByType,
  formatDuration, fromMin, lastKeys, sleepMinutes, CAUSES,
} from '../../lib/mindset';
import { toDateKey } from '../../lib/store';
import { Theme, Section } from './ui';

const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

function Stat({ label, value, note, t }: { label: string; value: string; note?: string; t: Theme }) {
  return (
    <div className={`p-3 rounded-xl ${t.soft}`}>
      <p className={`text-xs ${t.sub}`}>{label}</p>
      <p className={`text-xl font-bold tabular-nums ${t.text}`}>{value}</p>
      {note && <p className={`text-[11px] ${t.sub}`}>{note}</p>}
    </div>
  );
}

export default function MindsetProgress({ m, t }: { m: MindsetData; t: Theme }) {
  const today = toDateKey(new Date());
  const chart = useMemo(() => lastKeys(today, 14).reverse().map(k => ({
    key: k,
    label: new Date(`${k}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'narrow', day: 'numeric' }),
    score: scoreDay(m, k).score,
  })), [m, today]);
  const weekly = weekAverage(m, today);
  const prevWeekly = useMemo(() => {
    const s = lastKeys(today, 7, 7).map(k => scoreDay(m, k).score).filter((x): x is number => x !== null);
    return s.length ? Math.round(s.reduce((a, c) => a + c, 0) / s.length) : null;
  }, [m, today]);
  const sleep = sleepStats(m, today);
  const warning = sleepWarning(m, today);
  const phone = phoneStats(m, today);
  const patterns = disruptionPatterns(m, today);
  const byType = completionByType(m, today);
  const insights = useMemo(() => buildInsights(m, today), [m, today]);
  const axis = t.dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';
  const hasScores = chart.some(d => d.score !== null);

  return (
    <div className="space-y-4">
      <Section title="Punteggio · ultimi 14 giorni" icon={<TrendingUp className="w-4 h-4" />} t={t}>
        <div className="flex items-baseline gap-3 mb-2">
          <span className={`text-4xl font-bold tabular-nums ${t.text}`}>{weekly ?? '–'}</span>
          <span className={`text-sm ${t.sub}`}>media degli ultimi 7 giorni
            {weekly !== null && prevWeekly !== null && ` · ${weekly >= prevWeekly ? '+' : ''}${weekly - prevWeekly} sulla settimana prima`}</span>
        </div>
        {hasScores ? (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid vertical={false} stroke={t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                <XAxis dataKey="label" tick={{ fill: axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={{ fill: axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: t.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }}
                  contentStyle={{ background: t.dark ? '#1b1640' : '#fff', border: 'none', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', color: t.dark ? '#fff' : '#111' }}
                  formatter={(v: number) => [v ?? 'nessun dato', 'Punteggio']}
                  labelFormatter={(_, p) => (p?.[0] ? new Date(`${p[0].payload.key}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }) : '')} />
                <Bar dataKey="score" radius={[4, 4, 0, 0]} maxBarSize={22}>
                  {chart.map((d, i) => <Cell key={d.key} fill={i === chart.length - 1 ? 'var(--brand-ring)' : (t.dark ? '#3A3F45' : '#D5D9DE')} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <p className={`text-sm ${t.sub}`}>Il grafico si riempie man mano che registri le giornate.</p>}
        <p className={`text-xs mt-2 ${t.sub}`}>Conta la tendenza, non il singolo giorno: costanza prima di intensità.</p>
      </Section>

      <Section title="Cosa sto imparando" icon={<Lightbulb className="w-4 h-4" />} t={t}>
        {insights.length ? (
          <ul className="space-y-2">
            {insights.map((s, i) => <li key={i} className={`text-sm p-3 rounded-xl ${t.soft} ${t.text}`}>{s}</li>)}
          </ul>
        ) : <p className={`text-sm ${t.sub}`}>Dati ancora insufficienti. Dopo circa due settimane di giornate registrate qui compaiono le prime cose che ho capito di te, calcolate sui tuoi dati, senza inventare.</p>}
      </Section>

      <Section title="Sonno · ultimi 7 giorni" icon={<BedDouble className="w-4 h-4" />} t={t}>
        {sleep.nights ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat t={t} label="Sonno medio" value={formatDuration(sleep.avgSleep!)} note={`obiettivo ${formatDuration(m.profile.sleepNeed)}`} />
              <Stat t={t} label="A letto (media)" value={sleep.avgBed !== null ? fromMin(sleep.avgBed) : '–'} />
              <Stat t={t} label="Sveglia (media)" value={sleep.avgWake !== null ? fromMin(sleep.avgWake) : '–'} />
              <Stat t={t} label="Regolarità" value={sleep.spread !== null ? `±${Math.round(sleep.spread)} min` : '–'} note="quanto varia la sveglia" />
            </div>
            <p className={`text-sm mt-3 ${sleep.debt > 120 ? 'text-amber-400' : t.sub}`}>
              Debito di sonno della settimana: <b>{formatDuration(sleep.debt)}</b>{sleep.debt > 120 ? ' · stasera proteggi il sonno.' : ''}
            </p>
            {warning && <p className="text-sm text-amber-400 mt-2 flex gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{warning}</p>}
          </>
        ) : <p className={`text-sm ${t.sub}`}>Registra il sonno con "Vado a dormire" la sera e "Sveglio" la mattina.</p>}
      </Section>

      <Section title="Telefono" icon={<Smartphone className="w-4 h-4" />} t={t}>
        {phone.logged ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat t={t} label="Oggi" value={phone.today !== null ? formatDuration(phone.today) : '–'} />
            <Stat t={t} label="Media 7 giorni" value={phone.avg7 !== null ? formatDuration(phone.avg7) : '–'} />
            <Stat t={t} label="Obiettivo di questa settimana" value={formatDuration(phone.target)} note={`finale ${formatDuration(m.profile.phoneGoal)}`} />
            <Stat t={t} label="Tempo recuperato" value={phone.recovered !== null ? `+${formatDuration(phone.recovered)}` : '–'}
              note={phone.baseline !== null ? `questa settimana, rispetto ai tuoi primi giorni (${formatDuration(phone.baseline)})` : 'servono 3 giorni registrati'} />
          </div>
        ) : <p className={`text-sm ${t.sub}`}>Inserisci il tempo di utilizzo nel reset serale: da lì calcolo il tempo che recuperi.</p>}
      </Section>

      <Section title="Abitudini" icon={<Flame className="w-4 h-4" />} t={t}>
        <div className="space-y-2">
          {m.habits.map(h => {
            const s = habitStreak(m, h.id, today);
            return (
              <div key={h.id} className={`flex items-center gap-3 p-2.5 rounded-xl ${t.soft}`}>
                <span className={`flex-1 text-sm ${t.text}`}>{h.name}</span>
                <span className={`text-sm tabular-nums ${s.streak ? 'text-amber-400' : t.sub}`}>{s.streak ? `🔥 ${s.streak}` : '–'}</span>
                <span className={`text-xs w-28 text-right ${t.sub}`}>{s.rate}% in 30 giorni</span>
              </div>
            );
          })}
        </div>
        <p className={`text-xs mt-2 ${t.sub}`}>Un giorno saltato a settimana non rompe la serie.</p>
      </Section>

      <Section title="Imprevisti · ultimi 30 giorni" t={t}>
        {patterns.total ? (
          <>
            <p className={`text-sm mb-2 ${t.text}`}>{patterns.total} {patterns.total === 1 ? "imprevisto" : "imprevisti"}, circa {formatDuration(patterns.minutes)} in totale.</p>
            <div className="space-y-1.5">
              {patterns.causes.map(c => (
                <div key={c.id} className="flex items-center gap-3 text-sm">
                  <span className={`flex-1 ${t.text}`}>{c.info?.emoji} {c.info?.label || c.id}</span>
                  <span className={t.sub}>{c.count}× · {formatDuration(c.minutes)}</span>
                </div>
              ))}
            </div>
            {patterns.topDay && <p className={`text-xs mt-2 ${t.sub}`}>Capitano più spesso di {WEEKDAYS[patterns.topDay[0]]}.</p>}
          </>
        ) : <p className={`text-sm ${t.sub}`}>Nessun imprevisto segnato. Quando qualcosa sballa la giornata usa il tasto "Imprevisto" in Oggi.</p>}
        {byType.size > 0 && (
          <div className="mt-3 space-y-1">
            {[...byType.entries()].map(([id, v]) => {
              const dt = m.dayTypes.find(d => d.id === id);
              return <p key={id} className={`text-sm ${t.sub}`}>{dt?.emoji} Giornate {dt?.name || id}: completi il <b className={t.text}>{Math.round((v.done / v.total) * 100)}%</b> del piano.</p>;
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

// Real patterns only, and only with enough days on both sides of the comparison.
function buildInsights(m: MindsetData, today: string): string[] {
  const out: string[] = [];
  const keys = lastKeys(today, 42, 1);
  const days = keys.map(k => ({ k, d: m.days[k] })).filter(x => x.d);

  // Sleep vs focus (evening check-in).
  const withSleep = days.map(x => ({ slept: sleepMinutes(x.d!.sleep), focus: x.d!.checkin?.focus, energy: x.d!.checkin?.energy })).filter(x => x.slept !== null);
  const enough = withSleep.filter(x => x.slept! >= m.profile.sleepNeed - 15 && x.focus);
  const short = withSleep.filter(x => x.slept! < m.profile.sleepNeed - 60 && x.focus);
  if (enough.length >= 5 && short.length >= 5) {
    const a = enough.reduce((s, x) => s + x.focus!, 0) / enough.length;
    const b = short.reduce((s, x) => s + x.focus!, 0) / short.length;
    if (Math.abs(a - b) >= 0.4) {
      out.push(`Quando dormi almeno ${formatDuration(m.profile.sleepNeed - 15)} il tuo focus è in media ${a.toFixed(1)}, contro ${b.toFixed(1)} quando dormi meno di ${formatDuration(m.profile.sleepNeed - 60)}.`);
    }
  }

  // Phone vs focus.
  const phoneDays = days.filter(x => typeof x.d!.phone === 'number' && x.d!.checkin?.focus);
  if (phoneDays.length >= 10) {
    const sorted = [...phoneDays].sort((a, c) => a.d!.phone! - c.d!.phone!);
    const half = Math.floor(sorted.length / 2);
    const low = sorted.slice(0, half);
    const high = sorted.slice(-half);
    const fa = low.reduce((s, x) => s + x.d!.checkin!.focus!, 0) / low.length;
    const fb = high.reduce((s, x) => s + x.d!.checkin!.focus!, 0) / high.length;
    if (fa - fb >= 0.4) out.push(`Nei giorni con meno telefono (sotto ${formatDuration(low[low.length - 1].d!.phone!)}) il tuo focus è ${fa.toFixed(1)}, contro ${fb.toFixed(1)} nei giorni con più telefono.`);
  }

  // Morning deep work done.
  const mornings = keys.slice(0, 14).filter(k => m.days[k]?.status?.[`${k}-deep`]);
  if (mornings.length >= 5) {
    const done = mornings.filter(k => ['done', 'min'].includes(m.days[k]!.status![`${k}-deep`])).length;
    out.push(`Hai fatto il deep work del mattino ${done} volte su ${mornings.length} giorni in cui l'hai segnato.`);
  }

  // Most frequent cause of disruptions.
  const p = disruptionPatterns(m, today);
  if (p.causes[0] && p.causes[0].count >= 3) {
    const info = CAUSES.find(c => c.id === p.causes[0].id);
    out.push(`L'imprevisto più frequente è "${info?.label || p.causes[0].id}" (${p.causes[0].count} volte in 30 giorni)${info && !info.external ? ': è quello su cui puoi agire di più.' : ': conviene lasciare un po\' di margine nei giorni in cui capita.'}`);
  }
  return out;
}
