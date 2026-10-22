import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, Sparkles, X } from 'lucide-react';

// MYND AI windows reduced with "−": they keep working; a small bar at the bottom says when they
// are done, wherever the person is in the app (like a minimised window).
export interface DockEntry { label: string; busy: boolean; minimized: boolean; done: boolean }
export interface DockProps { minimized: boolean; onMinimize: () => void; onBusy: (busy: boolean) => void }

export function useAIDock(onShow: () => void) {
  const [dock, setDock] = useState<Record<string, DockEntry>>({});
  const baseTitle = useRef(document.title);

  const report = useCallback((key: string, label: string, busy: boolean) => setDock(d => {
    const cur = d[key];
    if (!cur && !busy) return d;
    if (cur && cur.busy === busy && cur.label === label) return d;
    const finished = !!cur?.busy && !busy;
    return { ...d, [key]: { label, busy, minimized: cur?.minimized || false, done: (cur?.done || finished) && !!cur?.minimized } };
  }), []);

  const props = useCallback((key: string, label: string): DockProps => ({
    minimized: !!dock[key]?.minimized,
    onMinimize: () => setDock(d => ({ ...d, [key]: { label, busy: d[key]?.busy || false, minimized: true, done: false } })),
    onBusy: (busy: boolean) => report(key, label, busy),
  }), [dock, report]);

  const restore = useCallback((key: string) => {
    setDock(d => (d[key] ? { ...d, [key]: { ...d[key], minimized: false, done: false } } : d));
    onShow();
  }, [onShow]);
  const forget = useCallback((key: string) => setDock(d => { const n = { ...d }; delete n[key]; return n; }), []);

  // Done while the app is in the background: the browser tab says so.
  const anyDone = Object.values(dock).some(e => e.done);
  useEffect(() => {
    if (!anyDone) return;
    const original = baseTitle.current;
    if (document.hidden) document.title = '✓ MYND AI ha finito';
    navigator.vibrate?.(30);
    const back = () => { if (!document.hidden) document.title = original; };
    document.addEventListener('visibilitychange', back);
    return () => { document.removeEventListener('visibilitychange', back); document.title = original; };
  }, [anyDone]);

  return { dock, props, restore, forget };
}

export function AIDock({ dock, onOpen, onClose }: { dock: Record<string, DockEntry>; onOpen: (key: string) => void; onClose: (key: string) => void }) {
  const shown = Object.entries(dock).filter(([, e]) => e.minimized);
  if (!shown.length) return null;
  return createPortal(
    <div className="fixed left-4 z-[96] flex flex-col gap-2 max-w-[calc(100vw-96px)]" style={{ bottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
      {shown.map(([key, e]) => (
        <div key={key} className={`glass-float rounded-full pl-1.5 pr-1 h-12 flex items-center gap-1 animate-scale-in ${e.done ? 'shadow-lg' : ''}`}
          style={e.done ? { boxShadow: '0 0 0 1.5px var(--brand-fill), var(--shadow-float, 0 8px 30px rgba(0,0,0,.35))' } : undefined} role="status" aria-live="polite">
          <button onClick={() => onOpen(key)} className="h-10 pl-2.5 pr-3 rounded-full flex items-center gap-2 min-w-0 hover:bg-white/5" aria-label={`${e.busy ? 'In corso' : 'Pronto'}: ${e.label}. Apri`}>
            <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
              style={e.busy ? { color: 'var(--brand-ring)' } : { background: 'var(--brand-fill)', color: 'var(--on-brand)' }}>
              {e.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : e.done ? <Check className="w-4 h-4" strokeWidth={3} /> : <Sparkles className="w-4 h-4" />}
            </span>
            <span className="min-w-0 text-left">
              <span className="block text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{e.busy ? 'MYND AI sta pensando…' : e.done ? 'Pronto · Apri' : 'Apri'}</span>
              <span className="block text-[11px] truncate -mt-0.5" style={{ color: 'var(--text-subtle)' }}>{e.label}</span>
            </span>
          </button>
          {!e.busy && (
            <button onClick={() => onClose(key)} aria-label={`Chiudi ${e.label}`} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 hover:bg-white/5" style={{ color: 'var(--text-subtle)' }}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}
