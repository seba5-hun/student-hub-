import { useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { Member, PTask, Project, TASK_STATUS_LABEL, TaskStatus, byPosition, memberName } from '../../lib/projects';
import { Sheet, Label, TextField, TextArea, ErrorNote, CheckButton } from './ui';

const STATUSES: TaskStatus[] = ['da_fare', 'in_corso', 'fatto'];

export interface TaskForm { title: string; description: string | null; status: TaskStatus; due_date: string | null; assignee_id: string | null; phase: string | null }

// A task: only the title is needed; description, status, deadline, who, phase and steps when useful.
export function TaskSheet({ task, project, members, me, subtasks, onClose, onSave, onDelete, onAddSubtask, onToggleSubtask, onDeleteSubtask }: {
  task: PTask | null;
  project: Project;
  members: Member[];
  me: string;
  subtasks: PTask[];
  onClose: () => void;
  onSave: (form: TaskForm) => Promise<void>;
  onDelete?: () => Promise<void>;
  onAddSubtask?: (title: string) => Promise<void>;
  onToggleSubtask?: (t: PTask) => Promise<void>;
  onDeleteSubtask?: (t: PTask) => Promise<void>;
}) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [status, setStatus] = useState<TaskStatus>(task?.status || 'da_fare');
  const [due, setDue] = useState(task?.due_date || '');
  const [assignee, setAssignee] = useState(task?.assignee_id || '');
  const [phase, setPhase] = useState(task?.phase || '');
  const [step, setStep] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const showPhases = !!project.settings.phases && project.phases.length > 0;

  const run = async (fn: () => Promise<void>, keepOpen = false) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await fn(); if (keepOpen) setBusy(false); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  };
  const save = () => (due && (due < '2000-01-01' || due > '2100-12-31') ? setError('Controlla l\'anno della scadenza.') : run(() => onSave({
    title: title.trim(), description: description.trim() || null, status, due_date: due || null,
    assignee_id: assignee || null, phase: showPhases ? phase || null : task?.phase || null,
  })));
  const addStep = () => {
    const v = step.trim();
    if (!v || !onAddSubtask) return;
    run(async () => { await onAddSubtask(v); setStep(''); }, true);
  };

  return (
    <Sheet title={task ? 'Attività' : 'Nuova attività'} onClose={onClose}
      footer={<>
        {onDelete && <button onClick={() => run(onDelete)} className="h-11 px-3 mr-auto rounded-full text-sm font-medium" style={{ color: 'var(--danger)' }}>Elimina</button>}
        <button onClick={onClose} className="btn-secondary h-11 px-5">Annulla</button>
        <button onClick={save} disabled={!title.trim() || busy} className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Salva
        </button>
      </>}>
      <TextField id="pt-title" label="Cosa" value={title} onChange={setTitle} placeholder="Es. Prenotare i voli" autoFocus={!task} />
      <div>
        <Label>Stato</Label>
        <div className="flex gap-1 p-1 rounded-full" style={{ background: 'var(--glass-well)' }} role="radiogroup" aria-label="Stato">
          {STATUSES.map(s => (
            <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => setStatus(s)}
              className={`flex-1 h-10 rounded-full text-sm font-medium transition-colors ${status === s ? 'glass-lens' : ''}`}
              style={{ color: status === s ? 'var(--brand-ring)' : 'var(--text-muted)' }}>{TASK_STATUS_LABEL[s]}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <TextField id="pt-due" label="Scadenza" type="date" value={due} onChange={setDue} />
          {due && (due < '2000-01-01' || due > '2100-12-31')
            ? <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>Controlla l'anno.</p>
            : due && project.due_date && due > project.due_date
              ? <p className="text-xs mt-1" style={{ color: 'var(--warning)' }}>È dopo la scadenza del progetto ({new Date(project.due_date + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}).</p>
              : due && !task && due < new Date().toISOString().slice(0, 10)
                ? <p className="text-xs mt-1" style={{ color: 'var(--warning)' }}>Questa data è già passata.</p> : null}
        </div>
        <div>
          <Label htmlFor="pt-who">Responsabile</Label>
          <select id="pt-who" value={assignee} onChange={e => setAssignee(e.target.value)} className="input-glass w-full h-12 text-[15px]">
            <option value="">Nessuno</option>
            {members.map(m => <option key={m.user_id} value={m.user_id}>{memberName(members, m.user_id, me)}</option>)}
          </select>
        </div>
      </div>
      {showPhases && (
        <div>
          <Label htmlFor="pt-phase">Fase</Label>
          <select id="pt-phase" value={phase} onChange={e => setPhase(e.target.value)} className="input-glass w-full h-12 text-[15px]">
            <option value="">Nessuna fase</option>
            {project.phases.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      )}
      <TextArea id="pt-desc" label="Dettagli (facoltativi)" value={description} onChange={setDescription} rows={2} />
      {task && onAddSubtask && (
        <div>
          <Label>Passaggi {subtasks.length > 0 && `· ${subtasks.filter(s => s.status === 'fatto').length}/${subtasks.length}`}</Label>
          {subtasks.length > 0 && (
            <ul className="space-y-1 mb-2">
              {[...subtasks].sort(byPosition).map(s => (
                <li key={s.id} className="rounded-xl flex items-center pr-1" style={{ background: 'var(--glass-well)' }}>
                  <CheckButton small done={s.status === 'fatto'} label={s.status === 'fatto' ? `Riapri ${s.title}` : `Completa ${s.title}`} onClick={() => onToggleSubtask && run(() => onToggleSubtask(s), true)} />
                  <span className={`flex-1 text-sm ${s.status === 'fatto' ? 'line-through' : ''}`} style={{ color: s.status === 'fatto' ? 'var(--text-subtle)' : 'var(--text)' }}>{s.title}</span>
                  {onDeleteSubtask && (
                    <button onClick={() => run(() => onDeleteSubtask(s), true)} aria-label={`Elimina ${s.title}`} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--text-subtle)' }}>
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); addStep(); }}>
            <input value={step} onChange={e => setStep(e.target.value)} placeholder="Aggiungi un passaggio" aria-label="Nuovo passaggio" maxLength={300} className="input-glass flex-1 h-11 text-sm" />
            <button type="submit" disabled={!step.trim() || busy} aria-label="Aggiungi passaggio" className="btn-secondary !p-0 w-11 h-11 flex items-center justify-center disabled:opacity-40"><Plus className="w-4 h-4 flex-shrink-0" /></button>
          </form>
        </div>
      )}
      <ErrorNote text={error} />
    </Sheet>
  );
}
