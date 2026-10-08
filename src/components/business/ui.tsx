import React, { useEffect } from 'react';
import { X } from 'lucide-react';

// A sheet on the phone (from the bottom), a centered panel on larger screens.
export function Sheet({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] sidebar-overlay flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[92vh] flex flex-col glass-panel rounded-t-[28px] sm:rounded-[28px] animate-scale-in"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
          <button onClick={onClose} aria-label="Chiudi" className="w-10 h-10 -mr-2 flex items-center justify-center rounded-full hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4">{children}</div>
        {footer && <div className="px-5 py-4 flex gap-2 justify-end" style={{ borderTop: '1px solid var(--glass-edge)' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="block text-xs font-medium uppercase tracking-[0.06em] mb-1.5" style={{ color: 'var(--text-muted)' }}>{children}</label>;
}

export function TextField({ id, label, value, onChange, placeholder, type = 'text', autoFocus }: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; autoFocus?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <input id={id} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
        className="input-glass w-full h-12 text-[15px]" />
    </div>
  );
}

export function ErrorNote({ text }: { text: string }) {
  if (!text) return null;
  return <p role="alert" className="text-sm rounded-2xl px-4 py-3" style={{ background: 'color-mix(in srgb, var(--danger) 14%, transparent)', color: 'var(--danger)' }}>{text}</p>;
}

export function PageTitle({ title, lead, action }: { title: string; lead?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[34px] leading-[1.1] font-bold tracking-[-0.035em]" style={{ color: 'var(--text)' }}>{title}</h2>
        {lead && <p className="mt-2 max-w-xl text-[15px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{lead}</p>}
      </div>
      {action}
    </div>
  );
}
