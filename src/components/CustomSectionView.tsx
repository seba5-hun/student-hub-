import React, { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { UserData, CustomSection, BlockKind } from '../lib/store';
import { BLOCK_KINDS, blockWide, makeBlock, updateBlock, removeSection, customOf } from '../lib/custom';
import CustomBlockView from './CustomBlockView';
import { sectionIcon } from './sectionIcons';
import { useDialog } from './Dialog';

// A section of the menu built from MYND's blocks (created by the student or the Assistente MYND).
interface Props {
  section: CustomSection;
  data: UserData;
  darkMode: boolean;
  onUpdateData: (update: (prev: UserData) => UserData) => void;
  onNavigate: (section: string) => void;
}

export default function CustomSectionView({ section, data, darkMode, onUpdateData, onNavigate }: Props) {
  const dialog = useDialog();
  const [adding, setAdding] = useState(false);
  const Icon = sectionIcon(section.icon);
  const text = darkMode ? 'text-white' : 'text-gray-800';
  const sub = darkMode ? 'text-white/60' : 'text-gray-500';

  const updateSection = (fn: (s: CustomSection) => CustomSection) => onUpdateData(prev => {
    const c = customOf(prev.settings);
    return { ...prev, settings: { ...prev.settings, custom: { ...c, sections: c.sections.map(s => (s.id === section.id ? fn(s) : s)) } } };
  });
  const addBlock = (kind: BlockKind) => { updateSection(s => ({ ...s, blocks: [...s.blocks, makeBlock(kind, BLOCK_KINDS.find(b => b.kind === kind)!.label)] })); setAdding(false); };
  const rename = async () => {
    const name = await dialog.prompt({ title: 'Nome della sezione', defaultValue: section.name, confirmLabel: 'Salva' });
    if (name?.trim()) updateSection(s => ({ ...s, name: name.trim().slice(0, 28) }));
  };
  const remove = async () => {
    if (!(await dialog.confirm({ title: `Eliminare la sezione "${section.name}"?`, message: 'Spariscono la sezione e i suoi blocchi. Impegni, voti e file non vengono toccati.', confirmLabel: 'Elimina', danger: true }))) return;
    onNavigate('home');
    onUpdateData(prev => removeSection(prev, section.id));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={`text-[34px] leading-[1.1] font-bold tracking-[-0.035em] flex items-center gap-3 ${text}`}>
          <Icon className="w-7 h-7" style={{ color: 'var(--brand-ring)' }} /> {section.name}.
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={() => setAdding(v => !v)} className="btn-primary text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> Blocco</button>
          <button onClick={rename} aria-label="Rinomina la sezione" className={`p-2.5 rounded-xl ${sub} ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}><Pencil className="w-4 h-4" /></button>
          <button onClick={remove} aria-label="Elimina la sezione" className="p-2.5 rounded-xl text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      {adding && (
        <div className="flex flex-wrap gap-2 animate-scale-in">
          {BLOCK_KINDS.map(b => (
            <button key={b.kind} onClick={() => addBlock(b.kind)}
              className={`text-sm px-3 py-1.5 rounded-full border ${darkMode ? 'border-white/15 text-white/80 hover:bg-white/10' : 'border-black/10 text-gray-700 hover:bg-black/5'}`}>{b.label}</button>
          ))}
        </div>
      )}

      {section.blocks.length === 0 ? (
        <div className={`${darkMode ? 'glass-card' : 'glass-card-light'} p-8 text-center`}>
          <p className={text}>Questa sezione è vuota.</p>
          <p className={`text-sm mt-1 ${sub}`}>Aggiungi un blocco qui sopra, oppure chiedi all'Assistente MYND in Personalizza.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 md:grid-flow-row-dense gap-4">
          {section.blocks.map(b => (
            <div key={b.id} className={blockWide(b.kind) ? 'md:col-span-2' : ''}>
              <CustomBlockView block={b} data={data} darkMode={darkMode} onNavigate={onNavigate}
                onChange={next => onUpdateData(prev => updateBlock(prev, b.id, () => next))}
                onRemove={() => onUpdateData(prev => updateBlock(prev, b.id, () => null))} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
