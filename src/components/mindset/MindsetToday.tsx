import { useMemo, useState } from 'react';
import {
  Sunrise, Moon, AlertTriangle, Play, Check, Plus, X, Pencil, Trash2, Zap, ChevronDown, RotateCcw, BellRing, BedDouble, Smartphone, Target,
} from 'lucide-react';
import {
  MindsetData, Block, BlockStatus, Priority, PriorityArea, DayLog, AREAS, Area, PRIORITY_AREAS, CAUSES,
  blocksOf, blockRange, currentAndNext, dayTypeOf, alarmOf, bedtimeFor, suggestAlarm, wakeKeyForBedtime, bedStamp,
  sleepMinutes, scoreDay, weekAverage, sleepWarning, vagueHint, greeting, formatDuration, withDay, addDays, localStamp,
  toMin, fromMin, stampMinutes,
} from '../../lib/mindset';
import { createId, toDateKey } from '../../lib/store';
import { Theme, AreaDot, Section, Scale, ScoreRing, Pill, useNow } from './ui';

interface Props {
  m: MindsetData;
  update: (fn: (m: MindsetData) => MindsetData) => void;
  t: Theme;
  eveningOpen: boolean;
  onEveningOpen: (open: boolean) => void;
  onStartFocus: (task: string, area: PriorityArea | 'other') => void;
}

const STATUS_LABEL: Record<BlockStatus, string> = { done: 'Fatto', min: 'Minimo', skipped: 'Saltato', excused: 'Imprevisto' };
const STATUS_STYLE: Record<BlockStatus, string> = {
  done: 'bg-emerald-500 text-white border-emerald-500',
  min: 'bg-sky-500/80 text-white border-sky-500',
  skipped: 'bg-transparent text-amber-400 border-amber-400/70',
  excused: 'bg-transparent text-slate-400 border-slate-400/60',
};
const SHORTCUT_NAME = 'Sveglia Mindset';

export default function MindsetToday({ m, update, t, eveningOpen, onEveningOpen, onStartFocus }: Props) {
  const now = useNow(30_000);
  const today = toDateKey(now);
  const log: DayLog = m.days[today] || {};
  const blocks = useMemo(() => blocksOf(m, today), [m, today]);
  const { current, next } = currentAndNext(blocks, now);
  const type = dayTypeOf(m, today);
  const { score, parts } = useMemo(() => scoreDay(m, today), [m, today]);
  const weekly = useMemo(() => weekAverage(m, today), [m, today]);
  const yesterday = useMemo(() => scoreDay(m, addDays(today, -1)).score, [m, today]);
  const warning = useMemo(() => sleepWarning(m, today), [m, today]);
  const [showParts, setShowParts] = useState(false);
  const [typeMenu, setTypeMenu] = useState(false);
  const [disruptOpen, setDisruptOpen] = useState(false);

  const setLog = (key: string, fn: (l: DayLog) => DayLog) => update(x => withDay(x, key, fn));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const hour = now.getHours();

  // The evening card: from about an hour before bedtime (or by hand), until "Vado a dormire".
  const wakeKey = wakeKeyForBedtime(now);
  const wentToBed = !!m.days[wakeKey]?.sleep?.bed && stampMinutes(m.days[wakeKey]!.sleep!.bed!) > stampMinutes(localStamp(now)) - 12 * 60;
  const bedtime = toMin(bedtimeFor(m, wakeKey));
  const eveningTime = hour < 4 || nowMin >= Math.min((bedtime < 720 ? bedtime + 1440 : bedtime) - 60, 22 * 60);
  const showEvening = eveningOpen || (eveningTime && !wentToBed);
  const showMorning = hour >= 4 && hour < 12 && !log.sleep?.wake;
  // From 18:00 the mission is about tomorrow: it's ready before going to bed.
  const eveningMode = hour >= 18 || hour < 4;
  const eveningKey = hour < 4 ? addDays(today, -1) : today;

  const changeType = (id: string) => {
    setLog(today, l => ({ ...l, dayType: id, blocks: undefined }));
    setTypeMenu(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className={`${t.card} p-5 flex items-center gap-4`}>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${t.sub}`}>{now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h2 className={`text-2xl sm:text-3xl font-bold tracking-tight ${t.text}`}>{greeting(now)}, {m.profile.name}.</h2>
          <div className="mt-2 relative inline-block">
            <button onClick={() => setTypeMenu(v => !v)} aria-expanded={typeMenu}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${t.soft} ${t.text} ${t.hover}`}>
              {type.emoji} Giornata {type.name} <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {typeMenu && (
              <div className={`absolute z-30 mt-2 w-56 rounded-2xl border shadow-2xl p-1.5 animate-scale-in ${t.dark ? 'bg-[#1b1640] border-white/10' : 'bg-white border-black/10'}`}>
                <p className={`px-3 py-1.5 text-xs ${t.sub}`}>Cambia il tipo di oggi (es. niente vento):</p>
                {m.dayTypes.map(dt => (
                  <button key={dt.id} onClick={() => changeType(dt.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2 ${t.text} ${t.hover} ${dt.id === type.id ? 'font-semibold' : ''}`}>
                    {dt.emoji} {dt.name} {dt.id === type.id && <Check className="w-4 h-4 ml-auto text-indigo-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <button onClick={() => setShowParts(v => !v)} className="flex flex-col items-center gap-1" aria-label="Dettaglio del punteggio">
          <ScoreRing score={score} t={t} />
          <span className={`text-xs ${t.sub}`}>media 7 gg: <b className={t.text}>{weekly ?? '–'}</b></span>
        </button>
      </div>

      {showParts && (
        <div className={`${t.card} p-4 space-y-2 animate-scale-in`}>
          <p className={`text-xs ${t.sub}`}>Il punteggio conta solo quello che hai registrato. Le attività saltate per un imprevisto che non dipende da te non contano.</p>
          {parts.map(p => (
            <div key={p.key} className="flex items-center gap-3">
              <span className={`w-24 text-sm ${t.text}`}>{p.label}</span>
              <div className={`flex-1 h-2 rounded-full overflow-hidden ${t.soft}`}>
                {p.value !== null && <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400" style={{ width: `${p.value * 100}%` }} />}
              </div>
              <span className={`w-40 text-xs text-right ${t.sub}`}>{p.detail}</span>
            </div>
          ))}
        </div>
      )}

      {yesterday !== null && yesterday < 55 && !log.status && (
        <div className={`${t.card} p-4 flex items-start gap-3 border-l-4 border-indigo-400`}>
          <RotateCcw className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
          <p className={`text-sm ${t.text}`}><b>Ieri non è stata la tua giornata migliore. Oggi è un reset.</b> <span className={t.sub}>Basta una cosa fatta bene per ripartire: scegli la priorità più importante.</span></p>
        </div>
      )}
      {warning && (
        <div className={`${t.card} p-4 flex items-start gap-3 border-l-4 border-amber-400`}>
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className={`text-sm ${t.text}`}>{warning}</p>
        </div>
      )}

      {showMorning && <MorningCard m={m} today={today} log={log} setLog={setLog} t={t} />}
      {showEvening && <EveningCard m={m} now={now} setLog={setLog} update={update} t={t} onClose={() => onEveningOpen(false)} forced={eveningOpen} />}

      {/* Now / next */}
      <div className={`${t.card} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[12rem]">
            <p className={`text-xs uppercase tracking-wider ${t.sub}`}>Adesso</p>
            {current ? (
              <>
                <p className={`text-lg font-semibold flex items-center gap-2 ${t.text}`}><AreaDot area={current.area} className="w-2.5 h-2.5" />{current.title}</p>
                <p className={`text-sm ${t.sub}`}>fino alle {current.end} · ancora {formatDuration(blockRange(current)[1] - nowMin)}</p>
              </>
            ) : <p className={`text-lg font-semibold ${t.text}`}>Tempo libero</p>}
            {next && <p className={`text-sm mt-1 ${t.sub}`}>Dopo: <span className={t.text}>{next.title}</span> alle {next.start}</p>}
          </div>
          <div className="flex gap-2">
            {current && (current.area === 'study' || current.area === 'project') && (
              <button onClick={() => onStartFocus(current.title, current.area === 'project' ? 'project' : 'school')} className="btn-primary text-sm flex items-center gap-2">
                <Play className="w-4 h-4" /> Avvia Focus
              </button>
            )}
            <button onClick={() => setDisruptOpen(true)} className={`px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2 ${t.soft} ${t.text} ${t.hover}`}>
              <Zap className="w-4 h-4 text-amber-400" /> Imprevisto
            </button>
          </div>
        </div>
      </div>

      {eveningMode ? (
        <div id="missione" className="space-y-3">
          <Priorities m={m} dayKey={wakeKey} setLog={setLog} t={t}
            title={`Missione di domani · ${new Date(`${wakeKey}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long' })} ${dayTypeOf(m, wakeKey).emoji}`} />
          <TodayLeftovers m={m} dayKey={eveningKey} tomorrowKey={wakeKey} setLog={setLog} t={t} />
        </div>
      ) : (
        <div id="missione">
          <Priorities m={m} dayKey={today} title="Missione di oggi" setLog={setLog} t={t} onStartFocus={onStartFocus}
            note={(log.priorities || []).length > 0 && !log.status ? 'Preparata ieri sera: sai già cosa fare.' : undefined} />
        </div>
      )}

      <Timeline m={m} today={today} blocks={blocks} log={log} nowMin={nowMin} currentId={current?.id} setLog={setLog} t={t} />

      <Habits m={m} today={today} log={log} setLog={setLog} t={t} />

      <SleepPhoneRow m={m} today={today} log={log} setLog={setLog} t={t} onEvening={() => onEveningOpen(true)} />

      {disruptOpen && <DisruptionDialog blocks={blocks} log={log} nowMin={nowMin} t={t} onClose={() => setDisruptOpen(false)}
        onSave={(d, affected) => {
          setLog(today, l => ({
            ...l,
            disruptions: [...(l.disruptions || []), d],
            status: { ...(l.status || {}), ...Object.fromEntries(affected.map(id => [id, d.external ? 'excused' as const : 'skipped' as const])) },
          }));
          setDisruptOpen(false);
        }} />}
    </div>
  );
}

// ---------- morning ----------

function MorningCard({ m, today, log, setLog, t }: { m: MindsetData; today: string; log: DayLog; setLog: (k: string, fn: (l: DayLog) => DayLog) => void; t: Theme }) {
  const alarm = alarmOf(m, today);
  const [editing, setEditing] = useState(false);
  const [wake, setWake] = useState(alarm);
  const [bed, setBed] = useState(log.sleep?.bed?.slice(11) || bedtimeFor(m, today));
  const needsBed = !log.sleep?.bed;
  const save = (w: string) => setLog(today, l => ({
    ...l,
    sleep: { ...(l.sleep || {}), wake: `${today}T${w}`, ...(needsBed ? { bed: bedStamp(today, bed) } : {}) },
  }));
  return (
    <div className={`${t.card} p-5 border-l-4 border-amber-400 animate-scale-in`}>
      <div className="flex items-center gap-2 mb-3">
        <Sunrise className="w-5 h-5 text-amber-400" />
        <h3 className={`font-semibold ${t.text}`}>Buongiorno! Sveglia prevista alle {alarm}</h3>
      </div>
      {needsBed && (
        <label className={`flex items-center gap-2 text-sm mb-3 ${t.sub}`}>
          Ieri sera a letto alle
          <input type="time" value={bed} onChange={e => setBed(e.target.value)} className={`${t.input} py-1 px-2 w-28`} />
        </label>
      )}
      {editing ? (
        <div className="flex items-center gap-2">
          <input type="time" value={wake} onChange={e => setWake(e.target.value)} className={`${t.input} py-1.5 px-2 w-28`} aria-label="Ora del risveglio" />
          <button onClick={() => save(wake)} className="btn-primary text-sm">Salva</button>
          <button onClick={() => setEditing(false)} className={`text-sm ${t.sub}`}>Annulla</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => save(alarm)} className="btn-primary text-sm flex items-center gap-2"><Check className="w-4 h-4" /> Sveglio alle {alarm}</button>
          <button onClick={() => setEditing(true)} className={`px-3 py-2 rounded-xl text-sm ${t.soft} ${t.text} ${t.hover}`}>A un altro orario</button>
        </div>
      )}
      <p className={`text-xs mt-3 ${t.sub}`}>Puoi correggerlo in qualsiasi momento dalla riga "Sonno" in fondo.</p>
    </div>
  );
}

const MORNING_ITEMS = ['Acqua', 'Luce naturale', 'Niente telefono', 'Deep work iniziato'];

// ---------- evening ----------

function EveningCard({ m, now, setLog, update, t, onClose, forced }: {
  m: MindsetData; now: Date; setLog: (k: string, fn: (l: DayLog) => DayLog) => void; update: Props['update']; t: Theme; onClose: () => void; forced: boolean;
}) {
  const evening = now.getHours() < 4 ? addDays(toDateKey(now), -1) : toDateKey(now);
  const tomorrow = wakeKeyForBedtime(now);
  const log = m.days[evening] || {};
  const suggestion = suggestAlarm(m, now);
  const [alarm, setAlarm] = useState(m.days[tomorrow]?.alarm || suggestion.alarm);
  const phone = log.phone;
  const [ph, setPh] = useState(phone !== undefined ? String(Math.floor(phone / 60)) : '');
  const [pm, setPm] = useState(phone !== undefined ? String(phone % 60) : '');
  const tomorrowType = dayTypeOf(m, tomorrow);
  const bedLogged = m.days[tomorrow]?.sleep?.bed;

  const savePhone = (h: string, mm: string) => {
    if (h === '' && mm === '') return;
    const total = (parseInt(h, 10) || 0) * 60 + (parseInt(mm, 10) || 0);
    setLog(evening, l => ({ ...l, phone: Math.min(total, 24 * 60) }));
  };
  const goToBed = () => {
    const stamp = localStamp(new Date());
    update(x => withDay(x, tomorrow, l => ({ ...l, alarm, sleep: { ...(l.sleep || {}), bed: stamp } })));
    onClose();
  };
  const shortcutUrl = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(alarm)}`;

  return (
    <div className={`${t.card} p-5 border-l-4 border-violet-400 space-y-5 animate-scale-in`} id="reset-serale">
      <div className="flex items-center justify-between gap-2">
        <h3 className={`font-semibold flex items-center gap-2 ${t.text}`}><Moon className="w-5 h-5 text-violet-400" /> Reset serale · 5 minuti</h3>
        {forced && <button onClick={onClose} className={t.sub} aria-label="Chiudi"><X className="w-4 h-4" /></button>}
      </div>

      <div className="space-y-2">
        <p className={`text-xs uppercase tracking-wider ${t.sub}`}>Com'è andata oggi?</p>
        {(['energy', 'focus', 'mood', 'stress'] as const).map(k => (
          <Scale key={k} t={t} label={{ energy: 'Energia', focus: 'Focus', mood: 'Umore', stress: 'Stress' }[k]}
            low={k === 'stress' ? 'calmo' : 'basso'} high={k === 'stress' ? 'tanto' : 'alto'}
            value={log.checkin?.[k]} onChange={v => setLog(evening, l => ({ ...l, checkin: { ...(l.checkin || {}), [k]: v } }))} />
        ))}
      </div>

      <div>
        <p className={`text-xs uppercase tracking-wider mb-2 ${t.sub}`}>Tempo al telefono oggi</p>
        <div className="flex items-center gap-2">
          <Smartphone className={`w-4 h-4 ${t.sub}`} />
          <input inputMode="numeric" value={ph} onChange={e => setPh(e.target.value.replace(/\D/g, '').slice(0, 2))} onBlur={() => savePhone(ph, pm)}
            className={`${t.input} w-16 py-1.5 px-2 text-center`} placeholder="0" aria-label="Ore" />
          <span className={t.sub}>h</span>
          <input inputMode="numeric" value={pm} onChange={e => setPm(e.target.value.replace(/\D/g, '').slice(0, 2))} onBlur={() => savePhone(ph, pm)}
            className={`${t.input} w-16 py-1.5 px-2 text-center`} placeholder="0" aria-label="Minuti" />
          <span className={t.sub}>min</span>
          {phone !== undefined && <Check className="w-4 h-4 text-emerald-400" />}
        </div>
        <p className={`text-xs mt-1.5 ${t.sub}`}>Su iPhone: Impostazioni › Tempo di utilizzo › Mostra tutta l'attività.</p>
      </div>

      <div>
        <p className={`text-xs uppercase tracking-wider mb-2 ${t.sub}`}>Domani · {tomorrowType.emoji} {tomorrowType.name}</p>
        {(() => {
          const ready = (m.days[tomorrow]?.priorities || []).length;
          return (
            <button onClick={() => document.getElementById('missione')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className={`w-full flex items-center gap-3 p-3 rounded-xl text-left text-sm ${t.soft} ${t.hover}`}>
              {ready === 3 ? <Check className="w-4 h-4 text-emerald-400" /> : <Target className="w-4 h-4 text-amber-400" />}
              <span className={`flex-1 ${t.text}`}>{ready === 3 ? 'Missione di domani pronta' : `Missione di domani: ${ready} di 3 priorità`}</span>
              <span className={`text-xs ${t.sub}`}>{ready === 3 ? 'rivedi' : 'completa qui sotto'}</span>
            </button>
          );
        })()}
      </div>

      <div className={`rounded-2xl p-4 ${t.soft}`}>
        {bedLogged ? (
          <p className={`text-sm ${t.text}`}>🌙 Buonanotte! Sei andato a letto alle {bedLogged.slice(11)}, sveglia alle {m.days[tomorrow]?.alarm || alarm}.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <BellRing className="w-6 h-6 text-violet-400" />
              <div className="flex-1 min-w-[10rem]">
                <p className={`text-sm ${t.sub}`}>Imposta la sveglia alle</p>
                <input type="time" value={alarm} onChange={e => setAlarm(e.target.value)} aria-label="Sveglia di domani"
                  className={`bg-transparent text-3xl font-bold tabular-nums ${t.text} focus:outline-none`} />
              </div>
              <p className={`text-xs ${t.sub}`}>{formatDuration(suggestion.sleep + toMin(alarm) - toMin(suggestion.alarm))} di sonno</p>
            </div>
            {suggestion.note && <p className="text-xs text-amber-400 mt-2">{suggestion.note}</p>}
            <div className="flex flex-wrap gap-2 mt-4">
              <a href={shortcutUrl} className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 ${t.dark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-white text-gray-800 hover:bg-gray-50'}`}>
                <BellRing className="w-4 h-4" /> Imposta sveglia
              </a>
              <button onClick={goToBed} className="btn-primary text-sm flex items-center gap-2"><BedDouble className="w-4 h-4" /> Fatto, vado a dormire</button>
            </div>
            <p className={`text-xs mt-2 ${t.sub}`}>"Imposta sveglia" usa il Comando Rapido di iPhone (vedi Piano › Comandi Rapidi). Poi telefono fuori dalla camera.</p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- priorities ----------

function Priorities({ m, dayKey, title, setLog, t, compact = false, onStartFocus, note }: {
  m: MindsetData; dayKey: string; title: string; setLog: (k: string, fn: (l: DayLog) => DayLog) => void; t: Theme; compact?: boolean; note?: string;
  onStartFocus?: (task: string, area: PriorityArea | 'other') => void;
}) {
  const list = m.days[dayKey]?.priorities || [];
  const set = (fn: (p: Priority[]) => Priority[]) => setLog(dayKey, l => ({ ...l, priorities: fn(l.priorities || []) }));
  const body = (
    <div className="space-y-2">
      {PRIORITY_AREAS.map(area => {
        const item = list.find(p => p.area === area.id);
        return <PriorityRow key={`${dayKey}-${area.id}-${item?.id || "nuova"}`} area={area} item={item} t={t} onStartFocus={onStartFocus} tomorrow={compact}
          onSave={text => set(ps => {
            const rest = ps.filter(p => p.area !== area.id);
            return text.trim() ? [...rest, { id: item?.id || createId(), area: area.id, text: text.trim(), done: item?.done || false }] : rest;
          })}
          onToggle={() => item && set(ps => ps.map(p => (p.id === item.id ? { ...p, done: !p.done } : p)))} />;
      })}
    </div>
  );
  if (compact) return body;
  return (
    <Section title={title} icon={<Target className="w-4 h-4" />} t={t}>
      {note && <p className="text-xs text-emerald-400 mb-2">{note}</p>}
      {body}
    </Section>
  );
}

// In the evening: today's priorities, to tick off or carry to tomorrow with one tap.
function TodayLeftovers({ m, dayKey, tomorrowKey, setLog, t }: {
  m: MindsetData; dayKey: string; tomorrowKey: string; setLog: (k: string, fn: (l: DayLog) => DayLog) => void; t: Theme;
}) {
  const list = m.days[dayKey]?.priorities || [];
  if (!list.length) return null;
  const tomorrow = m.days[tomorrowKey]?.priorities || [];
  const carry = (p: Priority) => {
    setLog(tomorrowKey, l => ({ ...l, priorities: [...(l.priorities || []).filter(x => x.area !== p.area), { id: createId(), area: p.area, text: p.text, done: false }] }));
  };
  return (
    <div className={`${t.card} p-4`}>
      <p className={`text-xs uppercase tracking-wider mb-2 ${t.sub}`}>Le priorità di oggi</p>
      <div className="space-y-1.5">
        {list.map(p => {
          const slotTaken = tomorrow.some(x => x.area === p.area);
          const carried = tomorrow.some(x => x.area === p.area && x.text === p.text);
          return (
            <div key={p.id} className={`flex items-center gap-3 p-2 rounded-xl ${t.soft}`}>
              <button onClick={() => setLog(dayKey, l => ({ ...l, priorities: (l.priorities || []).map(x => (x.id === p.id ? { ...x, done: !x.done } : x)) }))}
                role="checkbox" aria-checked={p.done} aria-label={`Completa: ${p.text}`}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${p.done ? 'bg-emerald-500 border-emerald-500 text-white' : t.dark ? 'border-white/30' : 'border-black/25'}`}>
                {p.done && <Check className="w-3 h-3" strokeWidth={3} />}
              </button>
              <span className={`flex-1 text-sm ${p.done ? `line-through ${t.sub}` : t.text}`}>{p.text}</span>
              {!p.done && (carried
                ? <span className="text-xs text-emerald-400">a domani ✓</span>
                : <button onClick={() => carry(p)} className={`text-xs px-2 py-1 rounded-lg ${t.sub} ${t.hover}`} title={slotTaken ? 'Sostituisce quella di domani' : undefined}>→ domani</button>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PriorityRow({ area, item, onSave, onToggle, t, onStartFocus, tomorrow }: {
  area: typeof PRIORITY_AREAS[number]; item?: Priority; onSave: (text: string) => void; onToggle: () => void; t: Theme; tomorrow?: boolean;
  onStartFocus?: (task: string, area: PriorityArea | 'other') => void;
}) {
  const [text, setText] = useState(item?.text || '');
  const [editing, setEditing] = useState(!item);
  const hint = editing ? vagueHint(text) : null;
  const color = AREAS[area.id === 'school' ? 'school' : area.id === 'sport' ? 'sport' : 'project'].color;
  if (item && !editing) {
    return (
      <div className={`flex items-center gap-3 p-2.5 rounded-xl ${t.soft}`}>
        <button onClick={onToggle} role="checkbox" aria-checked={item.done} aria-label={`Completa: ${item.text}`}
          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${item.done ? 'bg-emerald-500 border-emerald-500 text-white' : t.dark ? 'border-white/30' : 'border-black/25'}`}>
          {item.done && <Check className="w-4 h-4" strokeWidth={3} />}
        </button>
        <span className="text-[11px] font-semibold uppercase tracking-wider w-16 flex-shrink-0" style={{ color }}>{area.label}</span>
        <span className={`flex-1 text-sm ${item.done ? `line-through ${t.sub}` : t.text}`}>{item.text}</span>
        {onStartFocus && !item.done && area.id !== 'sport' && (
          <button onClick={() => onStartFocus(item.text, area.id)} className={`p-1.5 rounded-lg ${t.sub} ${t.hover}`} aria-label="Avvia Focus" title="Avvia Focus"><Play className="w-3.5 h-3.5" /></button>
        )}
        <button onClick={() => { setText(item.text); setEditing(true); }} className={`p-1.5 rounded-lg ${t.sub} ${t.hover}`} aria-label="Modifica"><Pencil className="w-3.5 h-3.5" /></button>
      </div>
    );
  }
  return (
    <form onSubmit={e => { e.preventDefault(); onSave(text); if (text.trim()) setEditing(false); }} className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider w-16 flex-shrink-0" style={{ color }}>{area.label}</span>
        <input value={text} onChange={e => setText(e.target.value)} onBlur={() => { if (text.trim() !== (item?.text || '')) onSave(text); if (text.trim()) setEditing(false); }}
          placeholder={area.example} className={`${t.input} flex-1 py-2 text-sm`} aria-label={`${tomorrow ? 'Domani' : 'Priorità'} ${area.label}`} />
      </div>
      {hint && <p className="text-xs text-amber-400 pl-[4.5rem]">{hint}</p>}
    </form>
  );
}

// ---------- timeline ----------

function Timeline({ m, today, blocks, log, nowMin, currentId, setLog, t }: {
  m: MindsetData; today: string; blocks: Block[]; log: DayLog; nowMin: number; currentId?: string; setLog: (k: string, fn: (l: DayLog) => DayLog) => void; t: Theme;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<Block | null>(null);
  const setStatus = (id: string, s: BlockStatus | null) => setLog(today, l => {
    const status = { ...(l.status || {}) };
    if (s) status[id] = s; else delete status[id];
    return { ...l, status };
  });
  // Editing turns the day into its own copy (the day type stays as it is).
  const saveBlocks = (fn: (b: Block[]) => Block[]) => setLog(today, l => ({ ...l, blocks: fn(l.blocks || blocksOf(m, today)) }));
  const addBlock = () => {
    const start = fromMin(Math.ceil((nowMin + 5) / 15) * 15);
    setEdit({ id: createId(), start, end: fromMin(toMin(start) + 60), title: '', area: 'study' });
    setOpen(null);
  };

  return (
    <Section title="La giornata" t={t} action={
      <div className="flex items-center gap-2">
        {log.blocks && (
          <button onClick={() => setLog(today, l => ({ ...l, blocks: undefined }))} className={`text-xs ${t.sub} hover:text-indigo-400`} title="Torna alla giornata tipo">Ripristina</button>
        )}
        <button onClick={addBlock} className={`p-1.5 rounded-lg ${t.sub} ${t.hover}`} aria-label="Aggiungi attività"><Plus className="w-4 h-4" /></button>
      </div>
    }>
      <ol className="relative">
        {blocks.map(block => {
          const [s, e] = blockRange(block);
          const st = log.status?.[block.id];
          const past = e <= nowMin;
          const isNow = block.id === currentId;
          return (
            <li key={block.id} className="relative">
              <div className={`flex items-center gap-3 py-2 pl-1 pr-1 rounded-xl transition-colors ${isNow ? (t.dark ? 'bg-indigo-500/15 ring-1 ring-indigo-400/40' : 'bg-indigo-50 ring-1 ring-indigo-200') : ''} ${past && !st ? 'opacity-60' : ''}`}>
                <span className={`w-12 text-xs tabular-nums text-right flex-shrink-0 ${t.sub}`}>{block.start}</span>
                <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: AREAS[block.area].color, opacity: 0.85 }} />
                <button onClick={() => setOpen(open === block.id ? null : block.id)} className="flex-1 min-w-0 text-left">
                  <span className={`block text-sm truncate ${st === 'done' ? `line-through ${t.sub}` : t.text}`}>{block.title}</span>
                  <span className={`block text-[11px] ${t.sub}`}>{AREAS[block.area].label} · {formatDuration(e - s)}{isNow ? ' · adesso' : ''}</span>
                </button>
                {st && st !== 'done' && <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_STYLE[st]}`}>{STATUS_LABEL[st]}</span>}
                <button onClick={() => setStatus(block.id, st === 'done' ? null : 'done')} role="checkbox" aria-checked={st === 'done'} aria-label={`Fatto: ${block.title}`}
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${st === 'done' ? STATUS_STYLE.done : t.dark ? 'border-white/25 hover:border-white/50' : 'border-black/20 hover:border-black/40'}`}>
                  {st === 'done' && <Check className="w-4 h-4" strokeWidth={3} />}
                </button>
              </div>
              {open === block.id && (
                <div className="flex flex-wrap gap-1.5 pl-16 pb-2 animate-scale-in">
                  {(['min', 'skipped'] as const).map(sv => (
                    <Pill key={sv} t={t} active={st === sv} onClick={() => setStatus(block.id, st === sv ? null : sv)}>
                      {sv === 'min' ? 'Fatto il minimo' : 'Saltato'}
                    </Pill>
                  ))}
                  <Pill t={t} onClick={() => { setEdit(block); setOpen(null); }}><Pencil className="w-3 h-3 inline mr-1" />Modifica</Pill>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {edit && (
        <BlockEditor block={edit} t={t} isNew={!blocks.some(x => x.id === edit.id)} onClose={() => setEdit(null)}
          onDelete={() => { saveBlocks(bs => bs.filter(x => x.id !== edit.id)); setEdit(null); }}
          onSave={nb => { saveBlocks(bs => (bs.some(x => x.id === nb.id) ? bs.map(x => (x.id === nb.id ? nb : x)) : [...bs, nb])); setEdit(null); }} />
      )}
    </Section>
  );
}

export function BlockEditor({ block, onSave, onDelete, onClose, t, isNew }: {
  block: Block; onSave: (b: Block) => void; onDelete: () => void; onClose: () => void; t: Theme; isNew: boolean;
}) {
  const [b, setB] = useState<Block>({ ...block, auto: undefined });
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); if (b.title.trim()) onSave({ ...b, title: b.title.trim() }); }}
        role="dialog" aria-modal="true" aria-label="Attività"
        className={`w-full max-w-sm p-5 space-y-4 animate-scale-in ${t.dark ? 'glass-card bg-gray-900/90' : 'glass-card-light'}`}>
        <h3 className={`font-semibold ${t.text}`}>{isNew ? 'Nuova attività' : 'Modifica attività'}</h3>
        <input value={b.title} onChange={e => setB({ ...b, title: e.target.value })} placeholder="Es. Studio matematica" className={`${t.input} w-full`} autoFocus required />
        <div className="flex items-center gap-2">
          <input type="time" value={b.start} onChange={e => setB({ ...b, start: e.target.value })} className={`${t.input} flex-1`} aria-label="Inizio" />
          <span className={t.sub}>→</span>
          <input type="time" value={b.end} onChange={e => setB({ ...b, end: e.target.value })} className={`${t.input} flex-1`} aria-label="Fine" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(AREAS) as Area[]).map(a => (
            <button type="button" key={a} onClick={() => setB({ ...b, area: a })}
              className={`px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5 ${b.area === a ? 'ring-2 ring-indigo-400 ' + t.text : t.sub} ${t.soft}`}>
              <AreaDot area={a} /> {AREAS[a].label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-1">
          {!isNew && <button type="button" onClick={onDelete} className="p-2 rounded-xl text-red-400 hover:bg-red-500/10" aria-label="Elimina"><Trash2 className="w-4 h-4" /></button>}
          <div className="flex-1" />
          <button type="button" onClick={onClose} className={`px-4 py-2 rounded-xl text-sm ${t.soft} ${t.text}`}>Annulla</button>
          <button type="submit" className="btn-primary text-sm">Salva</button>
        </div>
      </form>
    </div>
  );
}

// ---------- habits ----------

function Habits({ m, today, log, setLog, t }: { m: MindsetData; today: string; log: DayLog; setLog: (k: string, fn: (l: DayLog) => DayLog) => void; t: Theme }) {
  if (!m.habits.length) return null;
  // One tap: done → minimum (Never Zero) → nothing.
  const cycle = (id: string) => setLog(today, l => {
    const habits = { ...(l.habits || {}) };
    const cur = habits[id];
    if (!cur) habits[id] = 'full'; else if (cur === 'full') habits[id] = 'min'; else delete habits[id];
    return { ...l, habits };
  });
  const morningDone = log.morning || [];
  return (
    <Section title="Abitudini · never zero" t={t}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {m.habits.map(h => {
          const mark = log.habits?.[h.id];
          return (
            <button key={h.id} onClick={() => cycle(h.id)}
              className={`flex items-center gap-3 p-3 rounded-xl text-left transition-all ${mark === 'full' ? 'bg-emerald-500/15 ring-1 ring-emerald-400/40' : mark === 'min' ? 'bg-sky-500/10 ring-1 ring-sky-400/30' : `${t.soft} ${t.hover}`}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${mark === 'full' ? 'bg-emerald-500 text-white' : mark === 'min' ? 'bg-sky-500 text-white' : t.dark ? 'border-2 border-white/25' : 'border-2 border-black/20'}`}>
                {mark === 'full' ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : mark === 'min' ? 'MIN' : ''}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${t.text}`}>{h.name}</span>
                <span className={`block text-xs ${t.sub}`}>{mark === 'min' ? `minimo: ${h.min}` : `${h.full} · minimo ${h.min}`}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        <span className={`text-xs self-center mr-1 ${t.sub}`}>Mattino:</span>
        {MORNING_ITEMS.map(item => (
          <Pill key={item} t={t} active={morningDone.includes(item)}
            onClick={() => setLog(today, l => ({ ...l, morning: (l.morning || []).includes(item) ? (l.morning || []).filter(x => x !== item) : [...(l.morning || []), item] }))}>
            {item}
          </Pill>
        ))}
      </div>
    </Section>
  );
}

// ---------- sleep & phone ----------

function SleepPhoneRow({ m, today, log, setLog, t, onEvening }: {
  m: MindsetData; today: string; log: DayLog; setLog: (k: string, fn: (l: DayLog) => DayLog) => void; t: Theme; onEvening: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [bed, setBed] = useState(log.sleep?.bed?.slice(11) || bedtimeFor(m, today));
  const [wake, setWake] = useState(log.sleep?.wake?.slice(11) || alarmOf(m, today));
  const slept = sleepMinutes(log.sleep);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className={`${t.card} p-4`}>
        <div className="flex items-center justify-between">
          <p className={`text-sm font-semibold uppercase tracking-wider flex items-center gap-2 ${t.sub}`}><BedDouble className="w-4 h-4" /> Sonno</p>
          <button onClick={() => setEditing(v => !v)} className={`text-xs ${t.sub} hover:text-indigo-400`}>{editing ? 'Chiudi' : 'Modifica'}</button>
        </div>
        {editing ? (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-14 ${t.sub}`}>A letto</span>
              <input type="time" value={bed} onChange={e => setBed(e.target.value)} className={`${t.input} py-1 px-2 w-28`} />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-14 ${t.sub}`}>Sveglio</span>
              <input type="time" value={wake} onChange={e => setWake(e.target.value)} className={`${t.input} py-1 px-2 w-28`} />
            </div>
            <Scale t={t} label="Qualità" value={log.sleep?.quality} onChange={v => setLog(today, l => ({ ...l, sleep: { ...(l.sleep || {}), quality: v } }))} />
            <button onClick={() => { setLog(today, l => ({ ...l, sleep: { ...(l.sleep || {}), bed: bedStamp(today, bed), wake: `${today}T${wake}` } })); setEditing(false); }}
              className="btn-primary text-sm">Salva</button>
          </div>
        ) : (
          <div className="mt-2">
            <p className={`text-2xl font-bold tabular-nums ${t.text}`}>{slept !== null ? formatDuration(slept) : '–'}</p>
            <p className={`text-xs ${t.sub}`}>
              {log.sleep?.bed || log.sleep?.wake
                ? `${log.sleep?.bed?.slice(11) || '?'} → ${log.sleep?.wake?.slice(11) || '?'}${log.sleep?.quality ? ` · qualità ${log.sleep.quality}/5` : ''}`
                : 'Non registrato: tocca Modifica'} · obiettivo {formatDuration(m.profile.sleepNeed)}
            </p>
          </div>
        )}
      </div>
      <div className={`${t.card} p-4`}>
        <div className="flex items-center justify-between">
          <p className={`text-sm font-semibold uppercase tracking-wider flex items-center gap-2 ${t.sub}`}><Moon className="w-4 h-4" /> Stasera</p>
          <button onClick={onEvening} className={`text-xs ${t.sub} hover:text-indigo-400`}>Apri reset serale</button>
        </div>
        <p className={`text-2xl font-bold tabular-nums mt-2 ${t.text}`}>a letto {bedtimeFor(m, addDays(today, 1))}</p>
        <p className={`text-xs ${t.sub}`}>per la sveglia di domani alle {alarmOf(m, addDays(today, 1))} con {formatDuration(m.profile.sleepNeed)} di sonno</p>
      </div>
    </div>
  );
}

// ---------- disruption ----------

function DisruptionDialog({ blocks, log, nowMin, onSave, onClose, t }: {
  blocks: Block[]; log: DayLog; nowMin: number; onSave: (d: { id: string; cause: string; external: boolean; minutes: number; at: string; blocks: string[] }, affected: string[]) => void; onClose: () => void; t: Theme;
}) {
  const [cause, setCause] = useState('');
  const [external, setExternal] = useState(true);
  const [minutes, setMinutes] = useState(60);
  // Activities still to do (from an hour ago on) are the ones an unexpected event usually hits.
  const candidates = blocks.filter(b => !['sleep', 'meal', 'travel', 'life', 'morning'].includes(b.area) && blockRange(b)[1] > nowMin - 60 && log.status?.[b.id] !== 'done');
  const [affected, setAffected] = useState<string[]>([]);
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Imprevisto"
        className={`w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-scale-in ${t.dark ? 'glass-card bg-gray-900/90' : 'glass-card-light'}`}>
        <div>
          <h3 className={`font-semibold ${t.text}`}>Cos'è successo?</h3>
          <p className={`text-xs mt-1 ${t.sub}`}>Mi serve per imparare quanto spesso capita e organizzare meglio le prossime giornate.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {CAUSES.map(c => (
            <button key={c.id} onClick={() => { setCause(c.id); setExternal(c.external); }}
              className={`p-2.5 rounded-xl text-sm text-left flex items-center gap-2 transition-all ${cause === c.id ? 'ring-2 ring-indigo-400 ' + t.text : t.sub} ${t.soft}`}>
              <span>{c.emoji}</span>{c.label}
            </button>
          ))}
        </div>
        {cause && (
          <>
            <div className="flex gap-2">
              <Pill t={t} active={external} onClick={() => setExternal(true)}>Non dipendeva da me</Pill>
              <Pill t={t} active={!external} onClick={() => setExternal(false)}>Dipendeva da me</Pill>
            </div>
            <div>
              <p className={`text-xs mb-1.5 ${t.sub}`}>Quanto tempo ti è costato?</p>
              <div className="flex flex-wrap gap-1.5">
                {[15, 30, 60, 120, 240].map(v => <Pill key={v} t={t} active={minutes === v} onClick={() => setMinutes(v)}>{v === 240 ? 'mezza giornata' : formatDuration(v)}</Pill>)}
              </div>
            </div>
            {candidates.length > 0 && (
              <div>
                <p className={`text-xs mb-1.5 ${t.sub}`}>Cosa salta? {external ? '(non conterà nel punteggio)' : ''}</p>
                <div className="space-y-1">
                  {candidates.map(b => (
                    <label key={b.id} className={`flex items-center gap-2 p-2 rounded-lg text-sm cursor-pointer ${t.soft} ${t.text}`}>
                      <input type="checkbox" checked={affected.includes(b.id)} className="accent-indigo-500"
                        onChange={() => setAffected(a => (a.includes(b.id) ? a.filter(x => x !== b.id) : [...a, b.id]))} />
                      <span className={`tabular-nums text-xs ${t.sub}`}>{b.start}</span> {b.title}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={`px-4 py-2 rounded-xl text-sm ${t.soft} ${t.text}`}>Annulla</button>
          <button disabled={!cause} onClick={() => onSave({ id: createId(), cause, external, minutes, at: localStamp(new Date()), blocks: affected }, affected)}
            className="btn-primary text-sm disabled:opacity-50">Segna</button>
        </div>
      </div>
    </div>
  );
}

