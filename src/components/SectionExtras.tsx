import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, Sparkles } from 'lucide-react';
import { UserData, CustomBlock } from '../lib/store';
import { insideOf, isReplaced, customOf, updateBlock, blockWide, setOriginal } from '../lib/custom';
import { useProfile } from '../lib/profile';
import { openAssistant } from '../lib/assistantBus';
import CustomBlockView from './CustomBlockView';
import { SECTIONS } from './Layout';

// What the student's version adds to one of MYND's own sections: blocks and mini-apps above or
// below its content, or in place of it ("replace"). MYND's original stays one tap away.

interface Props {
  section: string;
  where: 'above' | 'below';
  data: UserData;
  darkMode: boolean;
  onUpdateData: (update: (prev: UserData) => UserData) => void;
  onNavigate: (section: string) => void;
}

// MYND's sections that open with their big title: what goes "in cima" is shown just under it, so
// it looks like part of the section (the section itself is not changed).
const TITLED = ['impegni', 'voti', 'timer', 'archivio', 'cosa-studiare', 'calendario'];

function useSlotUnderTitle(active: boolean, key: string): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!active) { setSlot(null); return; }
    const main = document.querySelector('main');
    if (!main) return;
    const el = document.createElement('div');
    // The section loads a moment later: put the slot under its title as soon as the title is there.
    const place = () => {
      if (el.isConnected) return;
      const h2 = main.querySelector('h2:not([data-extras])');
      const parent = h2?.parentElement;
      if (!h2 || !parent) return;
      (parent.classList.contains('space-y-6') ? h2 : parent).insertAdjacentElement('afterend', el);
    };
    place();
    setSlot(el);
    const watch = new MutationObserver(place);
    watch.observe(main, { childList: true, subtree: true });
    return () => { watch.disconnect(); el.remove(); };
  }, [active, key]);
  return slot;
}

export default function SectionExtras({ section, where, data, darkMode, onUpdateData, onNavigate }: Props) {
  const prof = useProfile();
  const blocks = insideOf(data.settings, section);
  const replaced = isReplaced(data.settings, section);
  const underTitle = where === 'above' && !replaced && TITLED.includes(section) && blocks.some(b => b.at === 'above');
  const slot = useSlotUnderTitle(underTitle, section);
  if (!blocks.length) return null;
  const hasReplacement = blocks.some(b => b.at === 'replace');
  const sub = darkMode ? 'text-white/60' : 'text-gray-500';
  const text = darkMode ? 'text-white' : 'text-gray-800';
  const name = prof.section(section, SECTIONS.find(x => x.id === section)?.label || section);

  // Above: the student's version of the section (when it replaces MYND's) and what goes on top.
  // Below: what goes under the content.
  const shown = where === 'above'
    ? blocks.filter(b => (b.at === 'replace' && replaced) || b.at === 'above')
    : blocks.filter(b => b.at === 'below' || !b.at);

  const grid = (list: CustomBlock[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 md:grid-flow-row-dense gap-4">
      {list.map(b => (
        <div key={b.id} className={blockWide(b.kind) || b.at === 'replace' ? 'md:col-span-2' : ''}>
          <CustomBlockView block={b} data={data} darkMode={darkMode} onNavigate={onNavigate} onUpdateData={onUpdateData}
            onChange={next => onUpdateData(prev => updateBlock(prev, b.id, () => next))}
            onRemove={() => onUpdateData(prev => updateBlock(prev, b.id, () => null))} />
        </div>
      ))}
    </div>
  );

  if (where === 'below') return shown.length ? <div className="mt-6">{grid(shown)}</div> : null;

  const useMine = !replaced && hasReplacement && (customOf(data.settings).original || []).includes(section);
  // Under the section's title (the section stays as it is).
  if (underTitle && slot && !useMine) return shown.length ? createPortal(grid(shown), slot) : null;

  return (
    <div className="space-y-4 mb-6 pt-2">
      {replaced && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <h2 data-extras className={`text-[34px] leading-[1.1] font-bold tracking-[-0.035em] ${text}`}>{name}.</h2>
          <div className="flex items-center gap-1">
            <button onClick={() => openAssistant(`Modifica la sezione ${name}: `, blocks.find(b => b.at === 'replace')?.id)}
              className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5" style={{ color: 'var(--brand-ring)' }}>
              <Sparkles className="w-3.5 h-3.5" /> Modifica con l'AI
            </button>
            <button onClick={() => onUpdateData(prev => setOriginal(prev, section, true))} title={`Torna a ${name} originale di MYND (la tua versione resta salvata)`}
              className={`text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 ${sub} ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
              <RotateCcw className="w-3.5 h-3.5" /> Originale
            </button>
          </div>
        </div>
      )}
      {useMine && (
        <button onClick={() => onUpdateData(prev => setOriginal(prev, section, false))}
          className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5" style={{ color: 'var(--brand-ring)', background: 'color-mix(in srgb, var(--brand-fill) 12%, transparent)' }}>
          <Sparkles className="w-3.5 h-3.5" /> Usa la tua versione di {name}
        </button>
      )}
      {shown.length > 0 && (underTitle && slot ? createPortal(grid(shown), slot) : grid(shown))}
    </div>
  );
}
