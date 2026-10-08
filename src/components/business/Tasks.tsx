import { useMemo, useState } from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { Person, Project, Task, TaskInput, taskPriority } from '../../lib/business';
import { matchPeople, dayKey } from '../../lib/businessIntel';
import { Sheet, TextField, TextArea, Label, ErrorNote, shortDate } from './ui';

// One task: a round check (44px target), title, who and when, and why it is high in the list.
export function TaskRow({ task, people, project, today, showProject, canToggle, onToggle, onOpen }: {
  task: Task; people: Person[]; project?: Project; today: string; showProject?: boolean;
  canToggle: boolean; onToggle: () => void; onOpen?: () => void;
}) {
  const done = task.status === 'fatto';
  const who = people.find(p => p.id === task.assignee_person_id);
  const pr = taskPriority(task, today, project);
  const late = !done && task.due_date && task.due_date < today;
  const meta = [showProject && project?.name, who ? who.name : 'nessun responsabile', task.due_date && shortDate(task.due_date),
    task.estimate_minutes ? `${task.estimate_minutes >= 60 ? `${Math.round(task.estimate_minutes / 6) / 10} h` : `${task.estimate_minutes} min`}` : null].filter(Boolean).join(' · ');
  return (
    <li className="rounded-2xl pr-3 flex items-center gap-1" style={{ background: 'var(--glass-well)' }}>
      <button onClick={onToggle} disabled={!canToggle} aria-label={done ? `Riapri ${task.title}` : `Segna come fatto ${task.title}`}
        className="w-11 h-11 flex-shrink-0 flex items-center justify-center disabled:opacity-40">
        <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center transition-colors"
          style={done ? { background: 'var(--brand-fill)', color: 'var(--on-brand)' } : { border: '1.5px solid var(--text-subtle)' }}>
          {done && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
        </span>
      </button>
      <button onClick={onOpen} disabled={!onOpen} className="flex-1 min-w-0 py-2.5 text-left">
        <p className={`text-sm ${done ? 'line-through' : ''}`} style={{ color: done ? 'var(--text-subtle)' : 'var(--text)' }}>{task.title}</p>
        <p className="text-xs truncate" style={{ color: late ? 'var(--danger)' : 'var(--text-subtle)' }}>{meta}</p>
      </button>
      {!done && pr.why !== 'da fare' && (
        <span className="text-[11px] font-medium flex-shrink-0 text-right max-w-[38%]" style={{ color: late || pr.score >= 70 ? 'var(--brand-ring)' : 'var(--text-subtle)' }}>{pr.why}</span>
      )}
    </li>
  );
}

export function TaskSheet({ task, projects, people, allTasks = [], defaultProjectId, defaultAssignee, onClose, onSave, onDelete }: {
  task: Task | null; projects: Project[]; people: Person[]; allTasks?: Task[]; defaultProjectId?: string | null; defaultAssignee?: string | null;
  onClose: () => void; onSave: (input: TaskInput) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [title, setTitle] = useState(task?.title || '');
  const [notes, setNotes] = useState(task?.notes || '');
  const [projectId, setProjectId] = useState(task ? task.project_id || '' : defaultProjectId || '');
  const [assignee, setAssignee] = useState(task ? task.assignee_person_id || '' : defaultAssignee || '');
  const [due, setDue] = useState(task?.due_date || '');
  const [estimate, setEstimate] = useState(task?.estimate_minutes ? String(task.estimate_minutes) : '');
  const [importance, setImportance] = useState(task?.importance || 3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Who fits best: declared skills, free hours this week, similar work done. A suggestion, explained.
  const matches = useMemo(() => (title.trim().length >= 4 && people.length > 1 ? matchPeople(title, people, allTasks.filter(t => t.id !== task?.id), dayKey(new Date())).slice(0, 3) : []), [title, people, allTasks, task?.id]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  };
  const save = () => run(() => {
    const est = Number(estimate);
    return onSave({ title: title.trim(), notes: notes.trim() || null, project_id: projectId || null, assignee_person_id: assignee || null,
      due_date: due || null, estimate_minutes: estimate && est > 0 ? Math.min(10000, Math.round(est)) : null, importance });
  });

  return (
    <Sheet title={task ? 'Modifica compito' : 'Nuovo compito'} onClose={onClose}
      footer={<>
        {onDelete && <button onClick={() => run(onDelete)} className="h-11 px-3 mr-auto rounded-full text-sm font-medium" style={{ color: 'var(--danger)' }}>Elimina</button>}
        <button onClick={onClose} className="btn-secondary h-11 px-5">Annulla</button>
        <button onClick={save} disabled={!title.trim() || busy} className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Salva
        </button>
      </>}>
      <TextField id="tk-title" label="Cosa" value={title} onChange={setTitle} placeholder="Es. Scegliere la location dello shooting" autoFocus={!task} />
      <div>
        <Label htmlFor="tk-project">Progetto</Label>
        <select id="tk-project" value={projectId} onChange={e => setProjectId(e.target.value)} className="input-glass w-full h-12 text-[15px]">
          <option value="">Nessun progetto</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <Label htmlFor="tk-who">Responsabile</Label>
        <select id="tk-who" value={assignee} onChange={e => setAssignee(e.target.value)} className="input-glass w-full h-12 text-[15px]">
          <option value="">Nessuno</option>
          {people.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {matches.length > 0 && (
          <div className="mt-2 rounded-2xl p-3 space-y-1.5" style={{ background: 'var(--glass-well)' }}>
            <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-subtle)' }}><Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--brand-ring)' }} /> Chi è più adatto</p>
            {matches.map((m, i) => (
              <button key={m.person.id} type="button" onClick={() => setAssignee(m.person.id)} aria-pressed={assignee === m.person.id}
                className="w-full text-left flex items-start gap-3 rounded-xl px-2 py-1.5 hover:bg-white/5">
                <span className="tabular text-sm font-semibold w-10 flex-shrink-0" style={{ color: i === 0 ? 'var(--brand-ring)' : 'var(--text-muted)' }}>{m.score}%</span>
                <span className="min-w-0 flex-1"><span className="block text-sm" style={{ color: 'var(--text)' }}>{m.person.name}{assignee === m.person.id ? ' ✓' : ''}</span>
                  <span className="block text-xs" style={{ color: 'var(--text-subtle)' }}>{m.reasons.join(' · ')}</span></span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField id="tk-due" label="Scadenza" type="date" value={due} onChange={setDue} />
        <TextField id="tk-est" label="Durata (minuti)" type="number" value={estimate} onChange={setEstimate} placeholder="Es. 90" />
      </div>
      <div>
        <Label>Importanza</Label>
        <div className="flex gap-1 p-1 rounded-full w-fit" style={{ background: 'var(--glass-well)' }} role="radiogroup" aria-label="Importanza">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" role="radio" aria-checked={importance === n} aria-label={`Importanza ${n}`} onClick={() => setImportance(n)}
              className={`w-10 h-10 rounded-full text-base font-semibold tabular ${importance === n ? 'glass-lens' : ''}`}
              style={{ color: importance === n ? 'var(--brand-ring)' : 'var(--text-muted)' }}>{n}</button>
          ))}
        </div>
      </div>
      <TextArea id="tk-notes" label="Note" value={notes} onChange={setNotes} rows={2} />
      <ErrorNote text={error} />
    </Sheet>
  );
}
