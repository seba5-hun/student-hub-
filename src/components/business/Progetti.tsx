import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, ListChecks, Users, Gauge, X } from 'lucide-react';
import {
  BizRole, Person, Project, ProjectInput, ProjectMember, ProjectSees, ProjectStatus, STATUS_LABEL, Task, Counterparty,
  listProjects, saveProject, deleteProject, listMembers, addMember, updateMember, removeMember, listTasks, saveTask, setTaskStatus, deleteTask,
  listCounterparties, projectHealth, taskPriority,
} from '../../lib/business';
import { toDateKey } from '../../lib/store';
import { useDialog } from '../Dialog';
import { Sheet, TextField, TextArea, SelectField, ErrorNote, PageTitle, BackButton, Chip, Empty, Label, Switch, shortDate } from './ui';
import { TaskRow, TaskSheet } from './Tasks';

interface Props { orgId: string; people: Person[]; myRole: BizRole; myPersonId: string | null; focusId: string | null; onFocusUsed: () => void }

const SEES_LABEL: Record<keyof ProjectSees, string> = { tasks: 'Compiti', documents: 'Documenti', client: 'Cliente', finance: 'Dati economici' };
const money = (v: number | null) => (v == null ? '' : v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }));

export default function Progetti({ orgId, people, myRole, myPersonId, focusId, onFocusUsed }: Props) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Counterparty[]>([]);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(focusId);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<Project | 'new' | null>(null);
  const today = toDateKey(new Date());
  const canCreate = myRole === 'titolare' || myRole === 'admin' || myRole === 'manager';

  useEffect(() => { if (focusId) { setOpenId(focusId); onFocusUsed(); } }, [focusId, onFocusUsed]);

  const load = useCallback(async () => {
    try {
      const [p, t, c] = await Promise.all([listProjects(orgId), listTasks(orgId), myRole === 'esterno' ? Promise.resolve([]) : listCounterparties(orgId)]);
      setProjects(p); setTasks(t); setClients(c); setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProjects(x => x || []);
    }
  }, [orgId, myRole]);
  useEffect(() => { load(); }, [load]);

  const open = projects?.find(p => p.id === openId) || null;
  if (open) {
    return (
      <ProjectDetail project={open} orgId={orgId} people={people} clients={clients} projects={projects || []} myRole={myRole} myPersonId={myPersonId}
        tasks={tasks.filter(t => t.project_id === open.id)} today={today} onBack={() => setOpenId(null)} onChanged={load}
        onDeleted={() => { setOpenId(null); load(); }} />
    );
  }

  const shown = (projects || []).filter(p => showAll || p.status === 'attivo' || p.status === 'in_pausa');
  return (
    <div className="space-y-6">
      <PageTitle title="Progetti." lead="Obiettivi, persone, scadenze e soldi di ogni progetto, con la sua salute spiegata."
        action={canCreate && <button onClick={() => setEditing('new')} className="btn-primary h-11 px-4 inline-flex items-center gap-1.5 flex-shrink-0"><Plus className="w-4 h-4" /> Progetto</button>} />
      <ErrorNote text={error} />
      {projects && projects.some(p => p.status === 'completato' || p.status === 'annullato') && (
        <button onClick={() => setShowAll(v => !v)} className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{showAll ? 'Solo quelli in corso' : 'Mostra anche i chiusi'}</button>
      )}
      {projects === null ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-subtle)' }} /></div>
        : shown.length === 0 ? <Empty>{canCreate ? 'Nessun progetto. Premi “Progetto” per crearne uno, per esempio uno shooting per un partner.' : 'Nessun progetto condiviso con te.'}</Empty>
        : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:gap-4 md:grid-cols-2">
            {shown.map(p => {
              const pt = tasks.filter(t => t.project_id === p.id);
              const done = pt.filter(t => t.status === 'fatto').length;
              const h = projectHealth(p, pt, today);
              const client = clients.find(c => c.id === p.counterparty_id);
              const owner = people.find(x => x.id === p.owner_person_id);
              return (
                <button key={p.id} onClick={() => setOpenId(p.id)} className="glass-card p-5 text-left flex flex-col gap-3 hover:brightness-110 transition">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[17px] font-semibold truncate" style={{ color: 'var(--text)' }}>{p.name}</p>
                      <p className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>{[client?.name, owner && `guida ${owner.name}`].filter(Boolean).join(' · ') || 'Interno'}</p>
                    </div>
                    <HealthBadge score={h.score} status={p.status} />
                  </div>
                  <div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--glass-well)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pt.length ? (done / pt.length) * 100 : 0}%`, background: 'var(--brand-fill)' }} />
                    </div>
                    <p className="text-xs mt-1.5" style={{ color: 'var(--text-subtle)' }}>
                      {[`${done}/${pt.length} compiti`, p.deadline && `scade ${shortDate(p.deadline)}`, p.status !== 'attivo' && STATUS_LABEL[p.status]].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{h.notes.join(' · ')}</p>
                </button>
              );
            })}
          </div>
        )}
      {editing && (
        <ProjectSheet orgId={orgId} project={editing === 'new' ? null : editing} people={people} clients={clients} myPersonId={myPersonId}
          onClose={() => setEditing(null)} onSaved={id => { setEditing(null); load(); if (editing === 'new') setOpenId(id); }} />
      )}
    </div>
  );
}

function HealthBadge({ score, status }: { score: number; status: ProjectStatus }) {
  if (status !== 'attivo') return <Chip>{STATUS_LABEL[status]}</Chip>;
  const color = score >= 75 ? 'var(--brand-ring)' : score >= 50 ? 'var(--warning)' : 'var(--danger)';
  return (
    <span className="w-12 h-12 rounded-full flex flex-col items-center justify-center flex-shrink-0" style={{ background: 'var(--glass-well)', boxShadow: `inset 0 0 0 2px ${color}` }}
      aria-label={`Salute ${score} su 100`}>
      <span className="text-[15px] font-semibold tabular leading-none" style={{ color }}>{score}</span>
    </span>
  );
}

// ───────────── Scheda del progetto ─────────────

function ProjectDetail({ project: p, orgId, people, clients, projects, myRole, myPersonId, tasks, today, onBack, onChanged, onDeleted }: {
  project: Project; orgId: string; people: Person[]; clients: Counterparty[]; projects: Project[]; myRole: BizRole; myPersonId: string | null;
  tasks: Task[]; today: string; onBack: () => void; onChanged: () => void; onDeleted: () => void;
}) {
  const dialog = useDialog();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [editing, setEditing] = useState(false);
  const [taskSheet, setTaskSheet] = useState<Task | 'new' | null>(null);
  const [adding, setAdding] = useState('');
  const canManage = myRole === 'titolare' || myRole === 'admin' || (!!myPersonId && p.owner_person_id === myPersonId);
  const canDelete = myRole === 'titolare' || myRole === 'admin';
  const mine = members.find(m => m.person_id === myPersonId);
  const seesFinance = canManage || !!mine?.sees.finance;
  const seesClient = canManage || mine?.sees.client !== false;
  const seesTasks = canManage || mine?.sees.tasks !== false;
  const loadMembers = useCallback(() => { listMembers(p.id).then(setMembers).catch(() => setMembers([])); }, [p.id]);
  useEffect(() => { loadMembers(); }, [loadMembers]);

  const h = projectHealth(p, tasks, today);
  const client = clients.find(c => c.id === p.counterparty_id);
  const owner = people.find(x => x.id === p.owner_person_id);
  const sorted = useMemo(() => [...tasks].sort((a, b) => taskPriority(b, today, p).score - taskPriority(a, today, p).score), [tasks, today, p]);
  const run = async (fn: () => Promise<void>, after = onChanged) => {
    try { await fn(); after(); }
    catch (err) { dialog.alert({ title: 'Non è stato possibile', message: err instanceof Error ? err.message : String(err) }); }
  };
  const facts: [string, string | null][] = [
    ['Obiettivo', p.objective], ['Cliente', seesClient ? client?.name || null : null], ['Capo progetto', owner?.name || null],
    ['Inizio', p.start_date ? shortDate(p.start_date) : null], ['Scadenza', p.deadline ? shortDate(p.deadline) : null],
    ['Budget', seesFinance ? money(p.budget) || null : null],
  ];

  return (
    <div className="space-y-6">
      <BackButton label="Progetti" onClick={onBack} />
      <PageTitle title={`${p.name}.`} lead={[STATUS_LABEL[p.status], client && seesClient ? client.name : null].filter(Boolean).join(' · ')}
        action={canManage && (
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={() => setEditing(true)} aria-label="Modifica" className="w-11 h-11 rounded-full glass-card !rounded-full flex items-center justify-center"><Pencil className="w-4 h-4" /></button>
            {canDelete && (
              <button aria-label="Elimina" className="w-11 h-11 rounded-full glass-card !rounded-full flex items-center justify-center" style={{ color: 'var(--danger)' }}
                onClick={async () => {
                  if (await dialog.confirm({ title: `Eliminare ${p.name}?`, message: 'Spariscono anche i suoi compiti.', confirmLabel: 'Elimina', danger: true })) run(() => deleteProject(p.id), onDeleted);
                }}><Trash2 className="w-4 h-4" /></button>
            )}
          </div>
        )} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:gap-4 md:grid-cols-2">
        <section className="glass-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <Gauge className="w-[18px] h-[18px]" strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} />
            <h3 className="text-[15px] font-semibold flex-1" style={{ color: 'var(--text)' }}>Salute del progetto</h3>
            <HealthBadge score={h.score} status={p.status} />
          </div>
          <ul className="space-y-1 text-sm" style={{ color: 'var(--text-muted)' }}>{h.notes.map(n => <li key={n}>· {n}</li>)}</ul>
        </section>
        <section className="glass-card p-5 space-y-3">
          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Dettagli</h3>
          {facts.some(([, v]) => v) ? (
            <dl className="space-y-1.5 text-sm">
              {facts.filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="flex gap-3"><dt className="w-28 flex-shrink-0" style={{ color: 'var(--text-subtle)' }}>{k}</dt><dd className="min-w-0 break-words" style={{ color: 'var(--text)' }}>{v}</dd></div>
              ))}
            </dl>
          ) : <Empty>Nessun dettaglio.</Empty>}
        </section>
      </div>

      {seesTasks && (
        <section className="glass-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <ListChecks className="w-[18px] h-[18px]" strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} />
            <h3 className="text-[15px] font-semibold flex-1" style={{ color: 'var(--text)' }}>Compiti</h3>
            {canManage && <button onClick={() => setTaskSheet('new')} className="btn-secondary h-10 px-4 text-sm inline-flex items-center gap-1.5"><Plus className="w-4 h-4" /> Compito</button>}
          </div>
          {sorted.length === 0 ? <Empty>Nessun compito. Spezza il progetto in passi concreti, ognuno con un responsabile e una scadenza.</Empty> : (
            <ul className="space-y-1.5">
              {sorted.map(t => {
                const mineTask = !!myPersonId && t.assignee_person_id === myPersonId;
                return (
                  <TaskRow key={t.id} task={t} people={people} project={p} today={today} canToggle={canManage || mineTask}
                    onToggle={() => run(() => setTaskStatus(t.id, t.status === 'fatto' ? 'da_fare' : 'fatto'))}
                    onOpen={canManage ? () => setTaskSheet(t) : undefined} />
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="glass-card p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <Users className="w-[18px] h-[18px]" strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} />
          <h3 className="text-[15px] font-semibold flex-1" style={{ color: 'var(--text)' }}>Team del progetto</h3>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-subtle)' }}>Titolare e admin vedono tutto. Gli altri vedono il progetto solo se sono qui, e solo le parti accese.</p>
        {members.length === 0 ? <Empty>Nessun membro oltre al capo progetto.</Empty> : (
          <ul className="space-y-2">
            {members.map(m => {
              const person = people.find(x => x.id === m.person_id);
              return (
                <li key={m.person_id} className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--glass-well)' }}>
                  <div className="flex items-center gap-3">
                    <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{person?.name || 'Persona'}</span>
                    {canManage && (
                      <button onClick={() => run(() => removeMember(p.id, m.person_id), loadMembers)} aria-label={`Togli ${person?.name}`}
                        className="w-9 h-9 -mr-2 rounded-full flex items-center justify-center" style={{ color: 'var(--text-subtle)' }}><X className="w-4 h-4" /></button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(SEES_LABEL) as (keyof ProjectSees)[]).map(k => (
                      <div key={k} className="flex items-center justify-between gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                        <span>{SEES_LABEL[k]}</span>
                        {canManage
                          ? <Switch on={!!m.sees[k]} label={`${person?.name} vede ${SEES_LABEL[k]}`} onChange={v => run(() => updateMember(p.id, m.person_id, { sees: { ...m.sees, [k]: v } }), loadMembers)} />
                          : <span>{m.sees[k] ? 'sì' : 'no'}</span>}
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {canManage && (
          <div className="flex gap-2">
            <select value={adding} onChange={e => setAdding(e.target.value)} aria-label="Aggiungi al progetto" className="input-glass flex-1 h-11 text-[15px]">
              <option value="">Aggiungi una persona…</option>
              {people.filter(x => x.active && x.id !== p.owner_person_id && !members.some(m => m.person_id === x.id)).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <button disabled={!adding} onClick={() => run(async () => { await addMember(orgId, p.id, adding); setAdding(''); }, loadMembers)} className="btn-secondary h-11 px-4 disabled:opacity-40">Aggiungi</button>
          </div>
        )}
      </section>

      {editing && <ProjectSheet orgId={orgId} project={p} people={people} clients={clients} myPersonId={myPersonId} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} />}
      {taskSheet && (
        <TaskSheet task={taskSheet === 'new' ? null : taskSheet} projects={projects} people={people} defaultProjectId={p.id} onClose={() => setTaskSheet(null)}
          onSave={async input => { await saveTask(orgId, input, taskSheet === 'new' ? undefined : taskSheet.id); setTaskSheet(null); onChanged(); }}
          onDelete={taskSheet !== 'new' ? async () => { await deleteTask(taskSheet.id); setTaskSheet(null); onChanged(); } : undefined} />
      )}
    </div>
  );
}

function ProjectSheet({ orgId, project, people, clients, myPersonId, onClose, onSaved }: {
  orgId: string; project: Project | null; people: Person[]; clients: Counterparty[]; myPersonId: string | null; onClose: () => void; onSaved: (id: string) => void;
}) {
  const [name, setName] = useState(project?.name || '');
  const [objective, setObjective] = useState(project?.objective || '');
  const [clientId, setClientId] = useState(project?.counterparty_id || '');
  const [ownerId, setOwnerId] = useState(project ? project.owner_person_id || '' : myPersonId || '');
  const [start, setStart] = useState(project?.start_date || '');
  const [deadline, setDeadline] = useState(project?.deadline || '');
  const [budget, setBudget] = useState(project?.budget != null ? String(project.budget) : '');
  const [status, setStatus] = useState<ProjectStatus>(project?.status || 'attivo');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!name.trim() || busy) return;
    if (start && deadline && deadline < start) { setError('La scadenza è prima dell’inizio.'); return; }
    setBusy(true); setError('');
    const b = Number(budget.replace(',', '.'));
    const input: ProjectInput = { name: name.trim(), objective: objective.trim() || null, counterparty_id: clientId || null, owner_person_id: ownerId || null,
      start_date: start || null, deadline: deadline || null, budget: budget.trim() && Number.isFinite(b) ? b : null, status };
    try { onSaved(await saveProject(orgId, input, project?.id)); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  };
  return (
    <Sheet title={project ? `Modifica ${project.name}` : 'Nuovo progetto'} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn-secondary h-11 px-5">Annulla</button>
        <button onClick={save} disabled={!name.trim() || busy} className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Salva
        </button>
      </>}>
      <TextField id="pr-name" label="Nome" value={name} onChange={setName} placeholder="Es. Shooting collezione estiva RRD" autoFocus={!project} />
      <TextArea id="pr-obj" label="Obiettivo" value={objective} onChange={setObjective} rows={2} placeholder="Es. 20 foto e 3 video per la campagna" />
      <div>
        <Label htmlFor="pr-client">Cliente o partner</Label>
        <select id="pr-client" value={clientId} onChange={e => setClientId(e.target.value)} className="input-glass w-full h-12 text-[15px]">
          <option value="">Interno (nessun cliente)</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <Label htmlFor="pr-owner">Capo progetto</Label>
        <select id="pr-owner" value={ownerId} onChange={e => setOwnerId(e.target.value)} className="input-glass w-full h-12 text-[15px]">
          <option value="">Nessuno</option>
          {people.filter(x => x.active).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField id="pr-start" label="Inizio" type="date" value={start} onChange={setStart} />
        <TextField id="pr-deadline" label="Scadenza" type="date" value={deadline} onChange={setDeadline} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField id="pr-budget" label="Budget (€)" type="number" value={budget} onChange={setBudget} />
        <SelectField id="pr-status" label="Stato" value={status} onChange={setStatus}
          options={(Object.keys(STATUS_LABEL) as ProjectStatus[]).map(s => ({ value: s, label: STATUS_LABEL[s] }))} />
      </div>
      <ErrorNote text={error} />
    </Sheet>
  );
}
