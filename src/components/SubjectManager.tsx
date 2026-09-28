import React, { useEffect, useState } from 'react';
import { Plus, Trash2, X, Check } from 'lucide-react';
import { SubjectDef, SUBJECT_COLORS, nextSubjectColor } from '../lib/store';
import { useDialog } from './Dialog';

interface SubjectManagerProps {
  subjects: SubjectDef[];
  darkMode: boolean;
  onChange: (subjects: SubjectDef[]) => void;
  onRename: (oldName: string, newName: string) => void;
  onClose: () => void;
}

// Color picker shown under a subject: the palette plus any custom color.
function ColorPicker({ value, darkMode, onPick }: { value: string; darkMode: boolean; onPick: (color: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      {SUBJECT_COLORS.map(c => (
        <button key={c} type="button" onClick={() => onPick(c)} aria-label={`Colore ${c}`}
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${value.toLowerCase() === c ? 'ring-2 ring-offset-2 ring-white scale-110' : ''} ${darkMode ? 'ring-offset-gray-900' : 'ring-offset-white'}`}
          style={{ backgroundColor: c }}>
          {value.toLowerCase() === c && <Check className="w-3.5 h-3.5 text-white" />}
        </button>
      ))}
      <label title="Altro colore"
        className={`relative w-7 h-7 rounded-full cursor-pointer flex items-center justify-center border-2 ${SUBJECT_COLORS.includes(value.toLowerCase()) ? `border-dashed ${darkMode ? 'border-white/40' : 'border-black/30'}` : 'border-white ring-2 ring-offset-2 ring-white'} ${darkMode ? 'ring-offset-gray-900' : 'ring-offset-white'}`}
        style={SUBJECT_COLORS.includes(value.toLowerCase()) ? undefined : { backgroundColor: value }}>
        {SUBJECT_COLORS.includes(value.toLowerCase()) && <Plus className={`w-3.5 h-3.5 ${darkMode ? 'text-white/60' : 'text-gray-500'}`} />}
        <input type="color" value={value} onChange={e => onPick(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Altro colore" />
      </label>
    </div>
  );
}

function SubjectRow({ subject, all, darkMode, open, onToggleColor, onColor, onRename, onRemove }: {
  subject: SubjectDef;
  all: SubjectDef[];
  darkMode: boolean;
  open: boolean;
  onToggleColor: () => void;
  onColor: (color: string) => void;
  onRename: (newName: string) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(subject.name);
  const [error, setError] = useState('');
  useEffect(() => setName(subject.name), [subject.name]);

  const commit = () => {
    const next = name.trim();
    if (!next || next === subject.name) { setName(subject.name); setError(''); return; }
    if (all.some(s => s !== subject && s.name.toLowerCase() === next.toLowerCase())) {
      setError('Esiste già una materia con questo nome.');
      return;
    }
    setError('');
    onRename(next);
  };

  return (
    <li className={`rounded-xl px-2 py-1.5 transition-colors ${open ? (darkMode ? 'bg-white/10' : 'bg-black/5') : darkMode ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onToggleColor} title="Cambia colore" aria-label={`Colore di ${subject.name}`}
          className="w-7 h-7 rounded-full flex-shrink-0 border-2 border-white/30 hover:scale-110 transition-transform"
          style={{ backgroundColor: subject.color }} />
        <input
          value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { setName(subject.name); setError(''); (e.target as HTMLInputElement).blur(); }
          }}
          aria-label={`Nome di ${subject.name}`}
          maxLength={40}
          className={`flex-1 min-w-0 bg-transparent rounded-lg px-2 py-1 text-sm outline-none border border-transparent focus:border-indigo-500/60 ${darkMode ? 'text-white hover:bg-white/5 focus:bg-white/5' : 'text-gray-800 hover:bg-black/5 focus:bg-white'}`}
        />
        <button type="button" onClick={onRemove} className="text-red-400 p-1.5 rounded-lg hover:bg-red-500/10" aria-label={`Togli ${subject.name}`} title="Togli">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {error && <p className="text-xs text-red-400 pl-9 pt-1">{error}</p>}
      {open && <div className="pl-9 pb-1"><ColorPicker value={subject.color} darkMode={darkMode} onPick={onColor} /></div>}
    </li>
  );
}

// "Le mie materie": every subject is editable in place (name, color) and removable.
export default function SubjectManager({ subjects, darkMode, onChange, onRename, onClose }: SubjectManagerProps) {
  const dialog = useDialog();
  const [openColor, setOpenColor] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(() => nextSubjectColor(subjects));
  const [newError, setNewError] = useState('');
  const [pickNewColor, setPickNewColor] = useState(false);

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (subjects.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      setNewError('Questa materia c\'è già.');
      return;
    }
    const next = [...subjects, { name, color: newColor }];
    onChange(next);
    setNewName('');
    setNewError('');
    setPickNewColor(false);
    setNewColor(nextSubjectColor(next));
  };

  const remove = async (subject: SubjectDef) => {
    const ok = await dialog.confirm({
      title: `Togliere "${subject.name}"?`,
      message: 'La materia viene tolta dal tuo elenco su tutti i dispositivi. Voti, sessioni e file già salvati restano.',
      confirmLabel: 'Togli',
      danger: true,
    });
    if (ok) onChange(subjects.filter(s => s !== subject));
  };

  return (
    <div className={`text-left max-w-md mx-auto mb-6 p-4 rounded-2xl ${darkMode ? 'bg-white/5 border border-white/10' : 'bg-black/5 border border-black/5'}`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className={`font-semibold ${textColor}`}>Le mie materie</h3>
        <button onClick={onClose} className={`p-1 rounded-lg ${subTextColor}`} aria-label="Chiudi"><X className="w-4 h-4" /></button>
      </div>
      <p className={`text-xs mb-3 ${subTextColor}`}>Tocca il nome per modificarlo, il pallino per cambiare colore.</p>

      {subjects.length === 0 && <p className={`text-sm mb-3 ${subTextColor}`}>Nessuna materia: aggiungi quelle che studi qui sotto.</p>}
      <ul className="space-y-1 mb-4">
        {subjects.map(s => (
          <SubjectRow
            key={s.name}
            subject={s}
            all={subjects}
            darkMode={darkMode}
            open={openColor === s.name}
            onToggleColor={() => setOpenColor(openColor === s.name ? null : s.name)}
            onColor={color => onChange(subjects.map(x => (x === s ? { ...x, color } : x)))}
            onRename={newName => { if (openColor === s.name) setOpenColor(newName); onRename(s.name, newName); }}
            onRemove={() => remove(s)}
          />
        ))}
      </ul>

      <form onSubmit={add} className={`rounded-xl p-2 ${darkMode ? 'bg-white/5' : 'bg-white/70'}`}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPickNewColor(v => !v)} title="Scegli colore" aria-label="Colore della nuova materia"
            className="w-7 h-7 rounded-full flex-shrink-0 border-2 border-white/30 hover:scale-110 transition-transform" style={{ backgroundColor: newColor }} />
          <input value={newName} onChange={e => { setNewName(e.target.value); setNewError(''); }}
            placeholder="Nuova materia (es. Matematica)" maxLength={40}
            className={`flex-1 min-w-0 bg-transparent px-2 py-1 text-sm outline-none ${darkMode ? 'text-white placeholder-white/40' : 'text-gray-800 placeholder-gray-400'}`} />
          <button type="submit" disabled={!newName.trim()} className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1 disabled:opacity-40">
            <Plus className="w-4 h-4" /> Aggiungi
          </button>
        </div>
        {pickNewColor && <div className="pl-9"><ColorPicker value={newColor} darkMode={darkMode} onPick={c => setNewColor(c)} /></div>}
        {newError && <p className="text-xs text-red-400 pl-9 pt-1">{newError}</p>}
      </form>
    </div>
  );
}
