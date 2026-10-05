import React, { useEffect, useState } from 'react';
import { AREAS, Area } from '../../lib/mindset';

export interface Theme {
  dark: boolean;
  text: string;
  sub: string;
  card: string;
  input: string;
  soft: string;     // subtle background for rows and chips
  hover: string;
  border: string;
}

export function themeOf(dark: boolean): Theme {
  return {
    dark,
    text: dark ? 'text-white' : 'text-gray-900',
    sub: dark ? 'text-white/55' : 'text-gray-500',
    card: dark ? 'glass-card' : 'glass-card-light',
    input: dark ? 'input-glass' : 'input-light',
    soft: dark ? 'bg-white/[0.06]' : 'bg-black/[0.04]',
    hover: dark ? 'hover:bg-white/10' : 'hover:bg-black/5',
    border: dark ? 'border-white/10' : 'border-black/10',
  };
}

// Re-renders every `ms`, so clocks and "now" markers stay current.
export function useNow(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

export function AreaDot({ area, className = '' }: { area: Area; className?: string }) {
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${className}`} style={{ background: AREAS[area].color }} aria-hidden />;
}

export function Section({ title, icon, action, children, t, className = '' }: {
  title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; t: Theme; className?: string;
}) {
  return (
    <section className={`${t.card} p-4 sm:p-5 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className={`text-sm font-semibold uppercase tracking-wider flex items-center gap-2 ${t.sub}`}>{icon}{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// 1–5 in one tap (tap the chosen value again to clear it).
export function Scale({ label, value, onChange, t, low, high }: {
  label: string; value?: number; onChange: (v: number | undefined) => void; t: Theme; low?: string; high?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`w-20 text-sm ${t.text}`}>{label}</span>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${label} ${n}`}
            onClick={() => onChange(value === n ? undefined : n)}
            className={`w-9 h-9 rounded-xl text-sm font-semibold transition-all ${
              value === n
                ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/30 scale-105'
                : `${t.soft} ${t.sub} ${t.hover}`
            }`}>
            {n}
          </button>
        ))}
      </div>
      {(low || high) && <span className={`hidden sm:block text-xs ${t.sub}`}>{low} → {high}</span>}
    </div>
  );
}

// Score ring 0-100.
export function ScoreRing({ score, size = 88, t }: { score: number | null; size?: number; t: Theme }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const v = score ?? 0;
  const color = score === null ? (t.dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)') : v >= 75 ? '#34d399' : v >= 50 ? '#818cf8' : '#f59e0b';
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={7} className={t.dark ? 'stroke-white/10' : 'stroke-black/10'} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={7} strokeLinecap="round" stroke={color}
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.3s' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold tabular-nums ${t.text}`}>{score ?? '–'}</span>
      </div>
    </div>
  );
}

export function Pill({ active, onClick, children, t, className = '' }: {
  active?: boolean; onClick: () => void; children: React.ReactNode; t: Theme; className?: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`px-3 py-1.5 rounded-full text-sm transition-all ${active ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow' : `${t.soft} ${t.sub} ${t.hover}`} ${className}`}>
      {children}
    </button>
  );
}
