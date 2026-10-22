import React, { useEffect, useRef, useState } from 'react';
import { Check, MoreHorizontal } from 'lucide-react';
import { Member, Progress, ProjectStatus, STATUS_LABEL, initials, memberName } from '../../lib/projects';

export { Sheet, Label, TextField, TextArea, ErrorNote, PageTitle, BackButton, Chip, Empty, Switch, shortDate } from '../business/ui';

// Done over total as a thin bar; "Nessuna attività aggiunta" when there is nothing to measure yet.
export function ProgressBar({ progress, compact }: { progress: Progress; compact?: boolean }) {
  if (progress.pct === null) return <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Nessuna attività aggiunta</p>;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>{progress.done} di {progress.total} completate</span>
        <span className={`tabular font-semibold ${compact ? 'text-sm' : 'text-base'}`} style={{ color: progress.pct === 100 ? 'var(--brand-ring)' : 'var(--text)' }}>{progress.pct}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--glass-well)' }} role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${progress.pct}%`, background: 'var(--brand-fill)', transitionTimingFunction: 'var(--ease-out, ease-out)' }} />
      </div>
    </div>
  );
}

export function StatusBadge({ status, late }: { status: ProjectStatus; late?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className="text-xs px-2.5 h-6 rounded-full inline-flex items-center whitespace-nowrap"
        style={status === 'completato' ? { background: 'var(--brand-fill)', color: 'var(--on-brand)', fontWeight: 600 } : { background: 'var(--glass-well)', color: status === 'in_corso' ? 'var(--text)' : 'var(--text-muted)' }}>
        {STATUS_LABEL[status]}
      </span>
      {late && <span className="text-xs px-2.5 h-6 rounded-full inline-flex items-center whitespace-nowrap" style={{ background: 'color-mix(in srgb, var(--danger) 14%, transparent)', color: 'var(--danger)' }}>In ritardo</span>}
    </span>
  );
}

// The initials of the people in a shared project (nothing for a project with only its owner).
export function Avatars({ members, me, max = 4 }: { members: Member[]; me: string; max?: number }) {
  if (members.length < 2) return null;
  return (
    <span className="flex -space-x-1.5" aria-label={`${members.length} partecipanti`}>
      {members.slice(0, max).map(m => (
        <span key={m.user_id} title={memberName(members, m.user_id, me)} className="w-6 h-6 rounded-full text-[10px] font-semibold flex items-center justify-center"
          style={{ background: 'var(--glass-well)', color: 'var(--text-muted)', boxShadow: '0 0 0 2px var(--bg, #0b0c0d)' }}>
          {initials(memberName(members, m.user_id, ''))}
        </span>
      ))}
      {members.length > max && <span className="text-[11px] pl-2.5" style={{ color: 'var(--text-subtle)' }}>+{members.length - max}</span>}
    </span>
  );
}

// The round check of a task (44px target).
export function CheckButton({ done, label, onClick, disabled, small }: { done: boolean; label: string; onClick: () => void; disabled?: boolean; small?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={done}
      className="w-11 h-11 flex-shrink-0 flex items-center justify-center disabled:opacity-40 group">
      <span className={`${small ? 'w-[18px] h-[18px]' : 'w-[22px] h-[22px]'} rounded-full flex items-center justify-center transition-all duration-200 group-active:scale-90`}
        style={done ? { background: 'var(--brand-fill)', color: 'var(--on-brand)' } : { border: '1.5px solid var(--text-subtle)' }}>
        {done && <Check className={small ? 'w-3 h-3' : 'w-3.5 h-3.5'} strokeWidth={3} />}
      </span>
    </button>
  );
}

// A "…" button with a short list of actions.
export function MoreMenu({ label, items }: { label: string; items: { label: string; onClick: () => void; danger?: boolean; hidden?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(o => !o)} aria-label={label} aria-expanded={open} title={label}
        className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors" style={{ color: 'var(--text-muted)' }}>
        <MoreHorizontal className="w-5 h-5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-50 w-52 rounded-2xl glass-float p-1.5 animate-scale-in">
          {items.filter(i => !i.hidden).map(i => (
            <button key={i.label} role="menuitem" onClick={() => { setOpen(false); i.onClick(); }}
              className="w-full text-left px-3.5 py-2.5 rounded-xl text-sm hover:bg-white/5" style={{ color: i.danger ? 'var(--danger)' : 'var(--text)' }}>
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// A row of pills where one is chosen (sections, filters).
export function Pills<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; count?: number }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1" style={{ scrollbarWidth: 'none' }}>
      {options.map(o => (
        <button key={o.id} role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}
          className={`flex-shrink-0 h-9 px-4 rounded-full text-sm font-medium transition-colors ${value === o.id ? 'glass-lens' : 'glass-card !rounded-full'}`}
          style={{ color: value === o.id ? 'var(--brand-ring)' : 'var(--text-muted)' }}>
          {o.label}{o.count !== undefined && <span className="ml-1.5 tabular" style={{ color: 'var(--text-subtle)' }}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h3 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>{children}</h3>
      {action}
    </div>
  );
}

// A short message at the bottom of the screen ("Progetto creato", an error with "Riprova").
export interface ToastMsg { id: number; text: string; error?: boolean; action?: { label: string; run: () => void } }
export function Toasts({ items, onClose }: { items: ToastMsg[]; onClose: (id: number) => void }) {
  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-[95] flex flex-col items-center gap-2 w-[min(92vw,420px)] pointer-events-none"
      style={{ bottom: 'calc(24px + env(safe-area-inset-bottom))' }} aria-live="polite">
      {items.map(t => (
        <div key={t.id} className="pointer-events-auto w-full glass-float rounded-2xl px-4 py-3 flex items-center gap-3 animate-scale-in" role={t.error ? 'alert' : 'status'}>
          <p className="flex-1 text-sm" style={{ color: t.error ? 'var(--danger)' : 'var(--text)' }}>{t.text}</p>
          {t.action && <button onClick={() => { onClose(t.id); t.action!.run(); }} className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--brand-ring)' }}>{t.action.label}</button>}
          <button onClick={() => onClose(t.id)} aria-label="Chiudi" className="text-sm flex-shrink-0" style={{ color: 'var(--text-subtle)' }}>✕</button>
        </div>
      ))}
    </div>
  );
}
