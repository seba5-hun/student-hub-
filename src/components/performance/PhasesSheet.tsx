import { useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, X } from 'lucide-react';
import { Project } from '../../lib/projects';
import { Sheet, Label, ErrorNote, Switch } from './ui';

// Phases group the tasks of longer projects (e.g. Ricerca → Progettazione → Sviluppo → Lancio).
export function PhasesSheet({ project, onClose, onSave }: { project: Project; onClose: () => void; onSave: (on: boolean, phases: string[]) => Promise<void> }) {
  const [on, setOn] = useState(!!project.settings.phases || project.phases.length > 0);
  const [phases, setPhases] = useState<string[]>(project.phases.length ? project.phases : ['']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const move = (i: number, d: number) => setPhases(ps => { const c = [...ps]; const [x] = c.splice(i, 1); c.splice(i + d, 0, x); return c; });
  const save = async () => {
    const clean = [...new Set(phases.map(p => p.trim().slice(0, 80)).filter(Boolean))].slice(0, 10);
    if (on && !clean.length) { setError('Scrivi almeno una fase.'); return; }
    setBusy(true); setError('');
    try { await onSave(on, on ? clean : project.phases); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  };

  return (
    <Sheet title="Fasi del progetto" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn-secondary h-11 px-5">Annulla</button>
        <button onClick={save} disabled={busy} className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Salva</button>
      </>}>
      <div className="flex items-center gap-3">
        <p className="flex-1 text-[15px]" style={{ color: 'var(--text)' }}>Organizza le attività in fasi</p>
        <Switch on={on} onChange={setOn} label="Organizza in fasi" />
      </div>
      <p className="text-sm -mt-2" style={{ color: 'var(--text-muted)' }}>Utile per progetti lunghi o di lavoro. Le attività si raggruppano per fase; se la spegni restano tutte, in un'unica lista.</p>
      {on && (
        <div>
          <Label>Fasi, nell'ordine</Label>
          <ul className="space-y-1.5">
            {phases.map((ph, i) => (
              <li key={i} className="flex gap-1.5 items-center">
                <span className="tabular text-xs w-5 text-right" style={{ color: 'var(--text-subtle)' }}>{i + 1}</span>
                <input value={ph} onChange={e => setPhases(ps => ps.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Es. Progettazione" maxLength={80}
                  aria-label={`Fase ${i + 1}`} className="input-glass flex-1 h-11 text-[15px]" />
                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Sposta su" className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30 hover:bg-white/5"><ArrowUp className="w-4 h-4" /></button>
                <button onClick={() => move(i, 1)} disabled={i === phases.length - 1} aria-label="Sposta giù" className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30 hover:bg-white/5"><ArrowDown className="w-4 h-4" /></button>
                <button onClick={() => setPhases(ps => ps.filter((_, j) => j !== i))} aria-label="Togli fase" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--text-subtle)' }}><X className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
          {phases.length < 10 && <button onClick={() => setPhases(ps => [...ps, ''])} className="mt-2 h-10 px-3 rounded-full text-sm font-medium inline-flex items-center gap-1.5 hover:bg-white/5" style={{ color: 'var(--brand-ring)' }}><Plus className="w-4 h-4" /> Aggiungi fase</button>}
        </div>
      )}
      <ErrorNote text={error} />
    </Sheet>
  );
}
