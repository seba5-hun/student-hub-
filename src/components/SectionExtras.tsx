import React from 'react';
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

export default function SectionExtras({ section, where, data, darkMode, onUpdateData, onNavigate }: Props) {
  const prof = useProfile();
  const blocks = insideOf(data.settings, section);
  if (!blocks.length) return null;
  const replaced = isReplaced(data.settings, section);
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

  return (
    <div className="space-y-4 mb-6 pt-2">
      {replaced && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <h2 className={`text-[34px] leading-[1.1] font-bold tracking-[-0.035em] ${text}`}>{name}.</h2>
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
      {!replaced && hasReplacement && (customOf(data.settings).original || []).includes(section) && (
        <button onClick={() => onUpdateData(prev => setOriginal(prev, section, false))}
          className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5" style={{ color: 'var(--brand-ring)', background: 'color-mix(in srgb, var(--brand-fill) 12%, transparent)' }}>
          <Sparkles className="w-3.5 h-3.5" /> Usa la tua versione di {name}
        </button>
      )}
      {shown.length > 0 && grid(shown)}
    </div>
  );
}
