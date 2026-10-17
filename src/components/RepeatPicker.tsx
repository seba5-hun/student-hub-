import React from 'react';
import { Repeat } from 'lucide-react';
import { RepeatRule, formatDate, parseDate, toDateKey } from '../lib/store';
import { occurrences, describeRepeat, schoolYearEnd, untilAfter, weekdayOf, WEEKDAY_SHORT, MAX_OCCURRENCES } from '../lib/recurrence';

// "Ripeti" in the task forms, like the iPhone calendar: how often, on which days, and until when.

export type RepeatPreset = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface RepeatChoice {
  preset: RepeatPreset;
  days: number[];                    // weekly: chosen weekdays (empty = the weekday of the date)
  endMode: 'school' | 'for' | 'until';
  amount: number;
  unit: 'settimane' | 'mesi';
  until: string;
}

export const NO_REPEAT: RepeatChoice = { preset: 'none', days: [], endMode: 'school', amount: 3, unit: 'mesi', until: '' };

const PRESETS: [RepeatPreset, string][] = [
  ['none', 'Mai'], ['daily', 'Ogni giorno'], ['weekly', 'Ogni settimana'], ['biweekly', 'Ogni 2 settimane'], ['monthly', 'Ogni mese'],
];

// The end of the school year after the date (next year's if this year's is already over).
function schoolEndAfter(start: string): string {
  const end = schoolYearEnd(start);
  if (end > start) return end;
  const d = parseDate(end);
  d.setFullYear(d.getFullYear() + 1);
  return toDateKey(d);
}

export function ruleFrom(choice: RepeatChoice, start: string): RepeatRule | null {
  if (choice.preset === 'none' || !start) return null;
  const until = choice.endMode === 'school' ? schoolEndAfter(start)
    : choice.endMode === 'for' ? untilAfter(start, choice.amount, choice.unit)
    : choice.until || start;
  const freq = choice.preset === 'daily' ? 'daily' : choice.preset === 'monthly' ? 'monthly' : 'weekly';
  return {
    freq,
    interval: choice.preset === 'biweekly' ? 2 : 1,
    days: freq === 'weekly' ? (choice.days.length ? [...choice.days].sort() : [weekdayOf(start)]) : undefined,
    until,
  };
}

// The picker filled in from a saved rule (when a repeated task is edited).
export function choiceFrom(rule: RepeatRule | undefined): RepeatChoice {
  if (!rule) return NO_REPEAT;
  const preset: RepeatPreset = rule.freq === 'daily' ? 'daily' : rule.freq === 'monthly' ? 'monthly' : rule.interval === 2 ? 'biweekly' : 'weekly';
  return { ...NO_REPEAT, preset, days: rule.days || [], endMode: 'until', until: rule.until };
}

interface Props {
  value: RepeatChoice;
  onChange: (value: RepeatChoice) => void;
  start: string;        // date of the (first) task
  darkMode: boolean;
}

export default function RepeatPicker({ value, onChange, start, darkMode }: Props) {
  const sub = darkMode ? 'text-white/60' : 'text-gray-500';
  const chip = (on: boolean) => `text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${on
    ? 'bg-[var(--brand-fill)] text-[var(--on-brand)] border-transparent'
    : darkMode ? 'border-white/10 text-white/70 hover:bg-white/10' : 'border-black/10 text-gray-600 hover:bg-black/5'}`;
  const input = darkMode ? 'input-glass' : 'input-light';
  const set = (patch: Partial<RepeatChoice>) => onChange({ ...value, ...patch });

  const weekly = value.preset === 'weekly' || value.preset === 'biweekly';
  const ownDay = start ? weekdayOf(start) : -1;
  const days = value.days.length ? value.days : [ownDay];
  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d];
    set({ days: next.filter(x => x >= 0) });
  };

  const rule = ruleFrom(value, start);
  const dates = rule ? occurrences(start, rule) : [];

  return (
    <div className="space-y-3">
      <div>
        <p className={`text-sm mb-2 flex items-center gap-1.5 ${sub}`}><Repeat className="w-3.5 h-3.5" /> Ripeti</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(([id, label]) => (
            <button key={id} type="button" onClick={() => set({ preset: id, days: id === 'weekly' || id === 'biweekly' ? value.days : [] })} className={chip(value.preset === id)}>{label}</button>
          ))}
        </div>
      </div>

      {value.preset !== 'none' && (
        <div className={`rounded-2xl p-3 space-y-3 ${darkMode ? 'bg-white/5' : 'bg-black/[0.03]'}`}>
          {weekly && (
            <div>
              <p className={`text-xs mb-2 ${sub}`}>Nei giorni</p>
              <div className="flex gap-1.5">
                {WEEKDAY_SHORT.map((label, d) => (
                  <button key={d} type="button" onClick={() => toggleDay(d)} aria-pressed={days.includes(d)}
                    aria-label={['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'][d]}
                    className={`w-9 h-9 rounded-full text-xs font-semibold border transition-colors ${days.includes(d)
                      ? 'bg-[var(--brand-fill)] text-[var(--on-brand)] border-transparent'
                      : darkMode ? 'border-white/10 text-white/60 hover:bg-white/10' : 'border-black/10 text-gray-500 hover:bg-black/5'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {value.preset === 'monthly' && start && (
            <p className={`text-xs ${sub}`}>Il giorno {parseDate(start).getDate()} di ogni mese (i mesi che non hanno quel giorno vengono saltati).</p>
          )}

          <div>
            <p className={`text-xs mb-2 ${sub}`}>Fino a</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => set({ endMode: 'school' })} className={chip(value.endMode === 'school')}>Fine della scuola</button>
              <button type="button" onClick={() => set({ endMode: 'for' })} className={chip(value.endMode === 'for')}>Per…</button>
              <button type="button" onClick={() => set({ endMode: 'until', until: value.until || (rule?.until ?? start) })} className={chip(value.endMode === 'until')}>Fino al…</button>
            </div>
            {value.endMode === 'for' && (
              <div className="flex items-center gap-2 mt-2">
                <input type="number" min={1} max={value.unit === 'settimane' ? 104 : 24} value={value.amount} aria-label="Quante"
                  onChange={e => set({ amount: Math.max(1, parseInt(e.target.value, 10) || 1) })} className={`${input} w-20 text-sm py-1.5`} />
                <select value={value.unit} onChange={e => set({ unit: e.target.value as RepeatChoice['unit'] })} aria-label="Settimane o mesi" className={`${input} text-sm py-1.5`}>
                  <option value="settimane">settimane</option>
                  <option value="mesi">mesi</option>
                </select>
              </div>
            )}
            {value.endMode === 'until' && (
              <input type="date" value={value.until} min={start} onChange={e => set({ until: e.target.value })} aria-label="Ultimo giorno"
                className={`${input} text-sm py-1.5 mt-2`} />
            )}
          </div>

          {rule && start && (
            <p className="text-xs font-medium flex items-start gap-1.5" style={{ color: 'var(--brand-ring)' }}>
              <Repeat className="w-3.5 h-3.5 mt-px flex-shrink-0" />
              <span>
                {describeRepeat(rule, start)} · {dates.length === 1 ? '1 volta' : `${dates.length} volte`}, fino al {formatDate(dates[dates.length - 1])}
                {dates.length >= MAX_OCCURRENCES && ` (massimo ${MAX_OCCURRENCES})`}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
