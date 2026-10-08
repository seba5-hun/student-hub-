import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, X, ListChecks } from 'lucide-react';
import { BizRole, Person, PersonInput, ROLE_LABEL, ROLE_HINT, Skill, Project, Task, addPerson, updatePerson, removePerson, listTasks, listProjects, saveTask, setTaskStatus, deleteTask, taskPriority } from '../../lib/business';
import { toDateKey } from '../../lib/store';
import { TaskRow, TaskSheet } from './Tasks';
import { useDialog } from '../Dialog';
import { Sheet, TextField, Label, ErrorNote, PageTitle, Empty } from './ui';

const ROLES: BizRole[] = ['titolare', 'admin', 'manager', 'dipendente', 'finanza', 'esterno'];
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('');

export default function Team({ orgId, people, myRole, myPersonId, onChanged }: {
  orgId: string; people: Person[]; myRole: BizRole; myPersonId: string | null; onChanged: () => void;
}) {
  const dialog = useDialog();
  const canManage = myRole === 'titolare' || myRole === 'admin';
  const [editing, setEditing] = useState<Person | 'new' | null>(null);

  const remove = async (p: Person) => {
    const ok = await dialog.confirm({ title: `Togliere ${p.name} dal team?`, message: 'I compiti assegnati restano, senza responsabile.', confirmLabel: 'Togli', danger: true });
    if (!ok) return;
    try { await removePerson(p.id); onChanged(); }
    catch (err) { await dialog.alert({ title: 'Non è stato possibile', message: err instanceof Error ? err.message : String(err) }); }
  };

  return (
    <div className="space-y-6">
      <PageTitle title="Team." lead="Le persone, cosa sanno fare e quanto sono disponibili."
        action={canManage && (
          <button onClick={() => setEditing('new')} className="btn-primary h-11 px-4 inline-flex items-center gap-1.5 flex-shrink-0"><Plus className="w-4 h-4" /> Persona</button>
        )} />

      {myPersonId && <MyTasks orgId={orgId} people={people} myPersonId={myPersonId} />}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:gap-4 md:grid-cols-2">
        {people.map(p => (
          <article key={p.id} className="glass-card p-5 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="w-11 h-11 rounded-full glass-lens flex items-center justify-center text-sm font-semibold flex-shrink-0" aria-hidden>{initials(p.name)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold truncate" style={{ color: 'var(--text)' }}>
                  {p.name}{p.id === myPersonId && <span className="font-normal" style={{ color: 'var(--text-subtle)' }}> · tu</span>}
                </p>
                <p className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>{[p.job_title, p.department].filter(Boolean).join(' · ') || p.email || '—'}</p>
              </div>
              <span className="text-xs px-2.5 h-6 rounded-full inline-flex items-center flex-shrink-0"
                style={p.role === 'titolare' ? { background: 'var(--brand-fill)', color: 'var(--on-brand)', fontWeight: 600 } : { background: 'var(--glass-well)', color: 'var(--text-muted)' }}>
                {ROLE_LABEL[p.role]}
              </span>
            </div>
            {p.skills.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Competenze">
                {p.skills.map(s => (
                  <li key={s.name} className="text-xs h-7 px-2.5 rounded-full inline-flex items-center gap-1.5" style={{ background: 'var(--glass-well)', color: 'var(--text)' }}>
                    {s.name}<span className="tabular" style={{ color: 'var(--text-subtle)' }}>{s.level}/5</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between gap-2 mt-auto">
              <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                {p.availability?.hours_week ? `${p.availability.hours_week} h a settimana` : 'Disponibilità non indicata'}
                {!p.user_id && p.email ? ' · invito da collegare' : ''}
              </p>
              {canManage && (
                <div className="flex -mr-2">
                  <button onClick={() => setEditing(p)} aria-label={`Modifica ${p.name}`} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/5" style={{ color: 'var(--text-muted)' }}><Pencil className="w-4 h-4" /></button>
                  {p.id !== myPersonId && (
                    <button onClick={() => remove(p)} aria-label={`Togli ${p.name}`} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/5" style={{ color: 'var(--danger)' }}><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      {people.length === 1 && canManage && (
        <p className="text-sm" style={{ color: 'var(--text-subtle)' }}>Ci sei solo tu, per ora. Aggiungi le persone con cui lavori: potrai assegnare loro progetti e compiti.</p>
      )}

      {editing && (
        <PersonSheet orgId={orgId} person={editing === 'new' ? null : editing} myRole={myRole}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />
      )}
    </div>
  );
}

function PersonSheet({ orgId, person, myRole, onClose, onSaved }: {
  orgId: string; person: Person | null; myRole: BizRole; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(person?.name || '');
  const [email, setEmail] = useState(person?.email || '');
  const [role, setRole] = useState<BizRole>(person?.role || 'dipendente');
  const [jobTitle, setJobTitle] = useState(person?.job_title || '');
  const [department, setDepartment] = useState(person?.department || '');
  const [hours, setHours] = useState(person?.availability?.hours_week ? String(person.availability.hours_week) : '');
  const [skills, setSkills] = useState<Skill[]>(person?.skills || []);
  const [newSkill, setNewSkill] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Only an owner can appoint another owner.
  const roles = ROLES.filter(r => r !== 'titolare' || myRole === 'titolare' || person?.role === 'titolare');

  const addSkill = () => {
    const n = newSkill.trim();
    if (!n || skills.some(s => s.name.toLowerCase() === n.toLowerCase())) { setNewSkill(''); return; }
    setSkills([...skills, { name: n, level: 3 }]);
    setNewSkill('');
  };

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    const h = Number(hours.replace(',', '.'));
    const input: PersonInput = {
      name: name.trim(), email: email.trim() || null, role, job_title: jobTitle.trim() || null, department: department.trim() || null,
      skills, availability: h > 0 && h <= 80 ? { hours_week: Math.round(h) } : {},
    };
    try {
      if (person) await updatePerson(person.id, input);
      else await addPerson(orgId, input);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Sheet title={person ? `Modifica ${person.name}` : 'Nuova persona'} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn-secondary h-11 px-5">Annulla</button>
        <button onClick={save} disabled={!name.trim() || busy} className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Salva
        </button>
      </>}>
      <TextField id="p-name" label="Nome" value={name} onChange={setName} placeholder="Es. Marco Rossi" autoFocus={!person} />
      <TextField id="p-email" label="Email (per collegare il suo account)" type="email" value={email} onChange={setEmail} placeholder="nome@esempio.it" />
      <div>
        <Label htmlFor="p-role">Ruolo</Label>
        <select id="p-role" value={role} onChange={e => setRole(e.target.value as BizRole)} className="input-glass w-full h-12 text-[15px]">
          {roles.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-subtle)' }}>{ROLE_HINT[role]}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField id="p-job" label="Mansione" value={jobTitle} onChange={setJobTitle} placeholder="Es. Videomaker" />
        <TextField id="p-dep" label="Reparto" value={department} onChange={setDepartment} placeholder="Es. Contenuti" />
      </div>
      <TextField id="p-hours" label="Ore a settimana" type="number" value={hours} onChange={setHours} placeholder="Es. 40" />
      <div>
        <Label htmlFor="p-skill">Competenze</Label>
        {skills.length > 0 && (
          <ul className="space-y-1.5 mb-2">
            {skills.map((s, i) => (
              <li key={s.name} className="flex items-center gap-2 rounded-2xl pl-3.5 pr-1.5 h-11" style={{ background: 'var(--glass-well)' }}>
                <span className="flex-1 text-sm truncate" style={{ color: 'var(--text)' }}>{s.name}</span>
                <div className="flex gap-0.5" role="radiogroup" aria-label={`Livello ${s.name}`}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" role="radio" aria-checked={s.level === n} aria-label={`${s.name} livello ${n}`}
                      onClick={() => setSkills(skills.map((x, j) => (j === i ? { ...x, level: n } : x)))}
                      className="w-7 h-7 rounded-full text-xs font-semibold tabular"
                      style={s.level >= n ? { background: 'var(--brand-fill)', color: 'var(--on-brand)' } : { color: 'var(--text-subtle)' }}>{n}</button>
                  ))}
                </div>
                <button type="button" onClick={() => setSkills(skills.filter((_, j) => j !== i))} aria-label={`Togli ${s.name}`}
                  className="w-8 h-8 flex items-center justify-center rounded-full" style={{ color: 'var(--text-subtle)' }}><X className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input id="p-skill" value={newSkill} onChange={e => setNewSkill(e.target.value)} placeholder="Es. Montaggio video"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }} className="input-glass flex-1 h-11 text-[15px]" />
          <button type="button" onClick={addSkill} className="btn-secondary h-11 px-4">Aggiungi</button>
        </div>
      </div>
      <ErrorNote text={error} />
    </Sheet>
  );
}

// "I tuoi compiti": the open tasks of the person using the app, in order of priority,
// each with the reason it is where it is.
function MyTasks({ orgId, people, myPersonId }: { orgId: string; people: Person[]; myPersonId: string }) {
  const dialog = useDialog();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sheet, setSheet] = useState<Task | 'new' | null>(null);
  const today = toDateKey(new Date());
  const load = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([listTasks(orgId), listProjects(orgId)]);
      setTasks(t.filter(x => x.assignee_person_id === myPersonId)); setProjects(p);
    } catch { setTasks([]); }
  }, [orgId, myPersonId]);
  useEffect(() => { load(); }, [load]);
  const project = (t: Task) => projects.find(p => p.id === t.project_id);
  const open = (tasks || []).filter(t => t.status !== 'fatto')
    .sort((a, b) => taskPriority(b, today, project(b)).score - taskPriority(a, today, project(a)).score);
  const doneToday = (tasks || []).filter(t => t.status === 'fatto' && t.completed_at && toDateKey(new Date(t.completed_at)) === today);

  return (
    <section className="glass-card p-5 space-y-3">
      <div className="flex items-center gap-2.5">
        <ListChecks className="w-[18px] h-[18px]" strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} />
        <h3 className="text-[15px] font-semibold flex-1" style={{ color: 'var(--text)' }}>I tuoi compiti</h3>
        <button onClick={() => setSheet('new')} aria-label="Nuovo compito" className="w-9 h-9 -mr-2 rounded-full flex items-center justify-center hover:bg-white/5"><Plus className="w-4 h-4" /></button>
      </div>
      {tasks === null ? null : open.length === 0 && doneToday.length === 0 ? <Empty>Niente da fare. Aggiungi un compito o assegnatelo da un progetto.</Empty> : (
        <ul className="space-y-1.5">
          {[...open, ...doneToday].map(t => (
            <TaskRow key={t.id} task={t} people={people} project={project(t)} today={today} showProject canToggle
              onToggle={async () => {
                try { await setTaskStatus(t.id, t.status === 'fatto' ? 'da_fare' : 'fatto'); load(); }
                catch (err) { dialog.alert({ title: 'Non è stato possibile', message: err instanceof Error ? err.message : String(err) }); }
              }}
              onOpen={() => setSheet(t)} />
          ))}
        </ul>
      )}
      {sheet && (
        <TaskSheet task={sheet === 'new' ? null : sheet} projects={projects} people={people} defaultAssignee={myPersonId} onClose={() => setSheet(null)}
          onSave={async input => { await saveTask(orgId, input, sheet === 'new' ? undefined : sheet.id); setSheet(null); load(); }}
          onDelete={sheet !== 'new' ? async () => { await deleteTask(sheet.id); setSheet(null); load(); } : undefined} />
      )}
    </section>
  );
}
