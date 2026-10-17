import React, { useEffect, useRef, useState } from 'react';
import { Layers, ChevronDown, Check, Plus, Pencil, Trash2 } from 'lucide-react';
import { UserSettings } from '../lib/store';
import { listLayouts, DEFAULT_LAYOUT_ID } from '../lib/layouts';
import { useDialog } from './Dialog';

// "Le tue MYND": the default MYND and the versions the student created, to switch in one tap.
// `compact`: a pill with a menu (Home, next to "Personalizza"); otherwise the full list (in Personalizza).

export interface LayoutActions {
  onSwitch: (id: string) => void;
  onNew: () => void;
  onEdit: () => void;
  onDelete: (id: string) => void;
}

interface Props extends LayoutActions {
  settings: UserSettings;
  darkMode: boolean;
  compact?: boolean;
}

export default function LayoutSwitcher({ settings, darkMode, compact = false, onSwitch, onNew, onEdit, onDelete }: Props) {
  const dialog = useDialog();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const layouts = listLayouts(settings);
  const active = layouts.find(l => l.active)!;
  const text = darkMode ? 'text-white' : 'text-gray-800';
  const sub = darkMode ? 'text-white/60' : 'text-gray-500';
  const hover = darkMode ? 'hover:bg-white/10' : 'hover:bg-black/5';

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [open]);

  const remove = async (id: string, name: string) => {
    const ok = await dialog.confirm({
      title: `Eliminare «${name}»?`,
      message: 'Sparisce solo questa versione di MYND (nomi, voti in scala, tutor, Home e menu). Impegni, voti e file restano.',
      confirmLabel: 'Elimina', danger: true,
    });
    if (ok) onDelete(id);
  };

  const list = (
    <div className="space-y-1">
      {layouts.map(l => (
        <div key={l.id} className={`flex items-center gap-1 rounded-xl ${l.active ? (darkMode ? 'bg-white/10' : 'bg-black/5') : ''}`}>
          <button onClick={() => { onSwitch(l.id); setOpen(false); }} aria-pressed={l.active}
            className={`flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 rounded-xl text-left ${hover}`}>
            <span className="text-lg" aria-hidden>{l.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm font-semibold truncate ${text}`}>{l.name}</span>
              <span className={`block text-xs ${sub}`}>{l.custom ? 'La tua versione' : 'Predefinita'}</span>
            </span>
            {l.active && <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--brand-ring)' }} />}
          </button>
          {l.custom && l.active && (
            <button onClick={() => { onEdit(); setOpen(false); }} aria-label={`Modifica ${l.name}`} title="Modifica" className={`p-2 rounded-lg ${sub} ${hover}`}>
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {l.custom && (
            <button onClick={() => remove(l.id, l.name)} aria-label={`Elimina ${l.name}`} title="Elimina" className="p-2 rounded-lg text-red-400 hover:bg-red-500/10">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button onClick={() => { onNew(); setOpen(false); }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold" style={{ color: 'var(--brand-ring)' }}>
        <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--brand-fill) 16%, transparent)' }}><Plus className="w-4 h-4" /></span>
        Crea una nuova MYND
      </button>
    </div>
  );

  if (!compact) {
    return (
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className={`text-xs font-semibold uppercase tracking-wide ${sub}`}>Le tue MYND</p>
          {active.id !== DEFAULT_LAYOUT_ID && <span className={`text-xs ${sub}`}>Stai usando «{active.name}»</span>}
        </div>
        <p className={`text-sm mb-3 ${sub}`}>Ogni versione ha i suoi nomi, voti, tutor, Home e menu. I tuoi impegni, voti e file sono gli stessi in tutte.</p>
        {list}
      </div>
    );
  }

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="menu" title="Cambia versione di MYND"
        className={`text-sm px-3 py-1.5 rounded-lg flex items-center gap-2 ${darkMode ? 'text-white/80 hover:bg-white/10' : 'text-gray-700 hover:bg-black/5'}`}>
        <Layers className="w-4 h-4" /> <span className="max-w-[9rem] truncate">{active.name}</span> <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className={`absolute right-0 top-full mt-2 z-40 w-72 p-2 rounded-2xl animate-scale-in ${darkMode ? 'glass-float' : 'glass-card-light'}`}>
          <p className={`px-3 pt-1 pb-2 text-xs font-semibold uppercase tracking-wide ${sub}`}>Le tue MYND</p>
          {list}
        </div>
      )}
    </div>
  );
}
