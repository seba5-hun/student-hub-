import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Sparkles, CalendarDays, AlertTriangle, ListChecks } from 'lucide-react';
import {
  KIND_LABEL, Member, PTask, Project, ProjectStatus, ProjectUpdate, STATUS_LABEL, TASK_STATUS_LABEL, byPosition, lateness, listUpdates,
  memberName, permsOf, progressOf, relativeDay, removeMember,
} from '../../lib/projects';
import { useDialog } from '../Dialog';
import { PeopleTab } from './PeopleTab';
import { Avatars, BackButton, CheckButton, MoreMenu, Pills, ProgressBar, SectionTitle, StatusBadge, shortDate } from './ui';
import { TaskForm, TaskSheet } from './TaskSheet';
import { ResourcesTab } from './ResourcesTab';
import { PhasesSheet } from './PhasesSheet';
import type { ProjectsApi } from './useProjects';

type Tab = 'panoramica' | 'attivita' | 'file' | 'persone';
type Sort = 'ordine' | 'scadenza' | 'stato' | 'responsabile';
const STATUSES: ProjectStatus[] = ['da_iniziare', 'in_corso', 'completato'];

export function ProjectPage({ project: p, tasks, members, me, today, api, onBack, onEdit, onDuplicate, onArchive, onDelete, onAskAI, onLeft, notify }: {
  project: Project; tasks: PTask[]; members: Member[]; me: string; today: string; api: ProjectsApi;
  onBack: () => void; onEdit: () => void; onDuplicate: () => void; onArchive: () => void; onDelete: () => void; onAskAI: () => void;
  onLeft: () => void; notify: (text: string, error?: boolean) => void;
}) {
  const dialog = useDialog();
  const perms = permsOf(p, members, me);
  const owner = members.find(m => m.role === 'proprietario');
  const [tab, setTab] = useState<Tab>('panoramica');
  const [editing, setEditing] = useState<PTask | 'new' | null>(null);
  const [phasesOpen, setPhasesOpen] = useState(false);
  const [updates, setUpdates] = useState<ProjectUpdate[] | null>(null);
  const prog = progressOf(tasks);
  const { late, overdue } = lateness(p, tasks, today);
  const top = useMemo(() => tasks.filter(t => !t.parent_id), [tasks]);
  const fail = useCallback((err: unknown) => notify(err instanceof Error ? err.message : String(err), true), [notify]);
  const toggle = useCallback((t: PTask) => { api.toggleTask(t).catch(fail); }, [api, fail]);
  const openTask = useCallback((t: PTask) => { if (perms.canEdit) setEditing(t); }, [perms.canEdit]);
  const leave = async () => {
    const ok = await dialog.confirm({ title: `Uscire da “${p.name}”?`, message: 'Non lo vedrai più. Per rientrare servirà un nuovo invito.', confirmLabel: 'Esci', danger: true });
    if (!ok) return;
    try { await removeMember(p.id, me); notify('Sei uscito dal progetto'); onLeft(); }
    catch (err) { fail(err); }
  };

  // "Ultimi aggiornamenti", read again shortly after every change.
  const stamp = tasks.map(t => t.updated_at).sort().pop() + p.updated_at;
  useEffect(() => {
    let alive = true;
    const id = window.setTimeout(() => { listUpdates(p.id, 12).then(u => { if (alive) setUpdates(u); }).catch(() => { if (alive) setUpdates(x => x || []); }); }, 600);
    return () => { alive = false; window.clearTimeout(id); };
  }, [p.id, stamp]);

  const saveTask = async (form: TaskForm) => {
    if (editing === 'new') await api.addTask(p.id, form);
    else if (editing) await api.editTask(editing.id, form);
    setEditing(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <BackButton label="Progetti" onClick={onBack} />
        <div className="flex items-start gap-3 mt-2">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] mb-1" style={{ color: 'var(--text-subtle)' }}>Progetto {KIND_LABEL[p.kind].toLowerCase()}{!perms.isOwner && owner ? ` · di ${memberName(members, owner.user_id, me)}` : ''}{p.archived_at ? ' · Archiviato' : ''}</p>
            <h2 className="text-[28px] sm:text-[34px] leading-[1.1] font-bold tracking-[-0.035em] break-words" style={{ color: 'var(--text)' }}>{p.name}</h2>
          </div>
          <MoreMenu label="Impostazioni del progetto" items={[
            { label: 'Modifica progetto', onClick: onEdit, hidden: !perms.canEditProject },
            { label: p.settings.phases ? 'Modifica le fasi' : 'Organizza in fasi', onClick: () => setPhasesOpen(true), hidden: !perms.canEditProject },
            { label: 'Persone e inviti', onClick: () => setTab('persone') },
            { label: 'Duplica progetto', onClick: onDuplicate },
            { label: p.archived_at ? 'Ripristina progetto' : 'Archivia progetto', onClick: onArchive, hidden: !perms.canEditProject },
            { label: 'Elimina progetto', onClick: onDelete, danger: true, hidden: !perms.isOwner },
            { label: 'Esci dal progetto', onClick: leave, danger: true, hidden: perms.isOwner },
          ]} />
        </div>
        {p.description && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-muted)' }}>{p.description}</p>}
        <div className="flex items-center gap-3 flex-wrap mt-4">
          <StatusBadge status={p.status} late={late} />
          {p.due_date && (
            <span className="text-xs inline-flex items-center gap-1.5" style={{ color: p.due_date < today && p.status !== 'completato' ? 'var(--danger)' : 'var(--text-muted)' }}>
              <CalendarDays className="w-3.5 h-3.5" /> Scadenza {shortDate(p.due_date)} · {relativeDay(today, p.due_date)}
            </span>
          )}
          <Avatars members={members} me={me} />
        </div>
        <div className="mt-4 max-w-xl"><ProgressBar progress={prog} /></div>
        <div className="flex gap-2 mt-5">
          {perms.canEdit && <button onClick={() => setEditing('new')} className="btn-primary h-11 px-4 inline-flex items-center gap-1.5"><Plus className="w-4 h-4" /> Attività</button>}
          <button onClick={onAskAI} className="btn-secondary h-11 px-4 inline-flex items-center gap-2"><Sparkles className="w-4 h-4" style={{ color: 'var(--brand-ring)' }} /> MYND AI</button>
        </div>
      </div>

      <Pills label="Sezioni del progetto" value={tab} onChange={setTab} options={[
        { id: 'panoramica', label: 'Panoramica' },
        { id: 'attivita', label: 'Attività', count: prog.total ? prog.total - prog.done : undefined },
        { id: 'file', label: 'File e note' },
        { id: 'persone', label: 'Persone', count: members.length > 1 ? members.length : undefined },
      ]} />
      {perms.role === 'osservatore' && <p className="text-sm -mt-2" style={{ color: 'var(--text-subtle)' }}>Sei in sola lettura: vedi tutto, ma non puoi modificare.</p>}

      {tab === 'panoramica' && (
        <OverviewTab p={p} tasks={tasks} top={top} members={members} me={me} today={today} overdue={overdue} updates={updates} readOnly={!perms.canEdit}
          onStatus={perms.canEditProject ? s => { api.saveProject(p.id, { status: s }).catch(fail); } : undefined} onToggle={toggle} onOpenTask={openTask}
          onAdd={() => setEditing('new')} onAskAI={onAskAI} onEditGoal={onEdit} onSeeTasks={() => setTab('attivita')} />
      )}
      {tab === 'attivita' && (
        <TasksTab p={p} tasks={tasks} top={top} members={members} me={me} today={today} api={api} readOnly={!perms.canEdit} onToggle={toggle} onOpenTask={openTask}
          onAdd={() => setEditing('new')} onAskAI={onAskAI} fail={fail} />
      )}
      {tab === 'file' && <ResourcesTab projectId={p.id} me={me} members={members} canEdit={perms.canEdit} canManage={perms.canManage} notify={notify} />}
      {tab === 'persone' && <PeopleTab p={p} members={members} tasks={tasks} me={me} perms={perms} onChanged={() => api.reload(true)} onLeft={onLeft} notify={notify} />}

      {editing && (
        <TaskSheet task={editing === 'new' ? null : editing} project={p} members={members.filter(m => m.role !== 'osservatore')} me={me}
          subtasks={editing === 'new' ? [] : tasks.filter(t => t.parent_id === editing.id)}
          onClose={() => setEditing(null)} onSave={saveTask}
          onDelete={editing === 'new' ? undefined : async () => { await api.removeTask(editing.id); setEditing(null); notify('Attività eliminata'); }}
          onAddSubtask={editing === 'new' ? undefined : async title => { await api.addSubtasks(editing, [title]); }}
          onToggleSubtask={async t => { await api.toggleTask(t); }}
          onDeleteSubtask={async t => { await api.removeTask(t.id); }} />
      )}
      {phasesOpen && (
        <PhasesSheet project={p} onClose={() => setPhasesOpen(false)}
          onSave={async (on, phases) => {
            // A phase renamed in place keeps its tasks.
            const renames = phases.length === p.phases.length ? p.phases.map((old, i) => [old, phases[i]]).filter(([o, n]) => o !== n && !phases.includes(o)) : [];
            await api.saveProject(p.id, { phases, settings: { ...p.settings, phases: on } });
            for (const [o, n] of renames) for (const t of tasks.filter(x => x.phase === o)) await api.editTask(t.id, { phase: n });
            setPhasesOpen(false);
          }} />
      )}
    </div>
  );
}

function OverviewTab({ p, tasks, top, members, me, today, overdue, updates, readOnly, onStatus, onToggle, onOpenTask, onAdd, onAskAI, onEditGoal, onSeeTasks }: {
  p: Project; tasks: PTask[]; top: PTask[]; members: Member[]; me: string; today: string; overdue: PTask[]; updates: ProjectUpdate[] | null; readOnly: boolean;
  onStatus?: (s: ProjectStatus) => void; onToggle: (t: PTask) => void; onOpenTask: (t: PTask) => void; onAdd: () => void; onAskAI: () => void; onEditGoal: () => void; onSeeTasks: () => void;
}) {
  const prog = progressOf(tasks);
  const next = top.filter(t => t.status !== 'fatto')
    .sort((a, b) => (a.status === 'in_corso' ? 0 : 1) - (b.status === 'in_corso' ? 0 : 1) || (a.due_date || '9999').localeCompare(b.due_date || '9999') || byPosition(a, b))
    .slice(0, 5);
  const upcoming = tasks.filter(t => t.status !== 'fatto' && t.due_date && t.due_date >= today).sort((a, b) => a.due_date!.localeCompare(b.due_date!)).slice(0, 5);
  const projectLate = !!p.due_date && p.due_date < today && p.status !== 'completato';

  return (
    <div className="space-y-8">
      {prog.pct === 100 && p.status !== 'completato' && onStatus && (
        <div className="rounded-2xl p-4 flex items-center gap-3 flex-wrap animate-scale-in" style={{ background: 'color-mix(in srgb, var(--brand-fill) 14%, transparent)' }}>
          <p className="flex-1 min-w-[200px] text-[15px]" style={{ color: 'var(--text)' }}>Tutte le attività sono completate. Vuoi segnare il progetto come completato?</p>
          <button onClick={() => onStatus('completato')} className="btn-primary h-10 px-4 text-sm">Segna come completato</button>
        </div>
      )}

      <section>
        <SectionTitle>Obiettivo</SectionTitle>
        {p.description
          ? <p className="text-[15px] leading-relaxed whitespace-pre-line" style={{ color: 'var(--text)' }}>{p.description}</p>
          : onStatus ? <button onClick={onEditGoal} className="text-[15px]" style={{ color: 'var(--text-subtle)' }}>Nessun obiettivo scritto. <span style={{ color: 'var(--brand-ring)' }}>Aggiungilo</span></button>
          : <p className="text-[15px]" style={{ color: 'var(--text-subtle)' }}>Nessun obiettivo scritto.</p>}
      </section>

      <section>
        <SectionTitle>Stato</SectionTitle>
        <div className="flex gap-1 p-1 rounded-full max-w-md" style={{ background: 'var(--glass-well)' }} role="radiogroup" aria-label="Stato del progetto">
          {STATUSES.map(s => (
            <button key={s} role="radio" aria-checked={p.status === s} disabled={!onStatus} onClick={() => p.status !== s && onStatus?.(s)}
              className={`flex-1 h-10 rounded-full text-sm font-medium transition-colors ${p.status === s ? 'glass-lens' : ''}`}
              style={{ color: p.status === s ? 'var(--brand-ring)' : 'var(--text-muted)' }}>{STATUS_LABEL[s]}</button>
          ))}
        </div>
      </section>

      {top.length === 0 ? (
        readOnly ? <p className="text-[15px]" style={{ color: 'var(--text-muted)' }}>Nel progetto non ci sono ancora attività.</p> : <ReadyToStart onAdd={onAdd} onAskAI={onAskAI} />
      ) : (
        <>
          {(overdue.length > 0 || projectLate) && (
            <section>
              <SectionTitle>Da sbloccare</SectionTitle>
              <div className="rounded-2xl p-4 space-y-2" style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)' }}>
                {projectLate && <p className="text-sm flex gap-2" style={{ color: 'var(--danger)' }}><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> La scadenza del progetto è passata ({shortDate(p.due_date)}): aggiornala o chiudi le ultime attività.</p>}
                {overdue.slice(0, 5).map(t => (
                  <button key={t.id} onClick={() => onOpenTask(t)} className="w-full text-left text-sm flex gap-2" style={{ color: 'var(--text)' }}>
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
                    <span>“{t.title}” doveva essere fatta {relativeDay(today, t.due_date!)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionTitle action={<button onClick={onSeeTasks} className="text-sm font-medium" style={{ color: 'var(--brand-ring)' }}>Tutte le attività</button>}>Prossime attività</SectionTitle>
            {next.length === 0
              ? <p className="text-[15px]" style={{ color: 'var(--text-muted)' }}>Nessuna attività aperta.</p>
              : <ul className="space-y-1.5">{next.map(t => <TaskRow key={t.id} t={t} tasks={tasks} members={members} me={me} today={today} readOnly={readOnly} onToggle={onToggle} onOpen={onOpenTask} />)}</ul>}
          </section>

          {upcoming.length > 0 && (
            <section>
              <SectionTitle>Prossime scadenze</SectionTitle>
              <ul className="space-y-1">
                {upcoming.map(t => (
                  <li key={t.id}><button onClick={() => onOpenTask(t)} className="w-full text-left flex items-center gap-3 py-1.5">
                    <span className="text-xs tabular w-16 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{shortDate(t.due_date)}</span>
                    <span className="flex-1 text-[15px] truncate" style={{ color: 'var(--text)' }}>{t.title}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-subtle)' }}>{relativeDay(today, t.due_date!)}</span>
                  </button></li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section>
        <SectionTitle>Ultimi aggiornamenti</SectionTitle>
        {updates === null ? <div className="skeleton h-16 rounded-2xl" /> : updates.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-subtle)' }}>Ancora nessun aggiornamento.</p>
        ) : (
          <ul className="space-y-2">
            {updates.map(u => (
              <li key={u.id} className="text-sm flex gap-3">
                <span className="w-20 flex-shrink-0 text-xs pt-0.5" style={{ color: 'var(--text-subtle)' }}>{ago(u.at)}</span>
                <span style={{ color: 'var(--text-muted)' }}><span style={{ color: 'var(--text)' }}>{memberName(members, u.actor_id, me) || 'Qualcuno'}</span> {u.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ReadyToStart({ onAdd, onAskAI }: { onAdd: () => void; onAskAI: () => void }) {
  return (
    <div className="glass-card rounded-[24px] px-6 py-8 text-center flex flex-col items-center">
      <ListChecks className="w-7 h-7 mb-3" style={{ color: 'var(--brand-ring)' }} strokeWidth={1.75} />
      <p className="text-xl font-semibold tracking-[-0.02em]" style={{ color: 'var(--text)' }}>Il tuo progetto è pronto per partire.</p>
      <div className="flex gap-2 mt-5 flex-wrap justify-center">
        <button onClick={onAdd} className="btn-primary h-11 px-5">Aggiungi la prima attività</button>
        <button onClick={onAskAI} className="btn-secondary h-11 px-4 inline-flex items-center gap-2"><Sparkles className="w-4 h-4" style={{ color: 'var(--brand-ring)' }} /> Fatti aiutare</button>
      </div>
    </div>
  );
}

function TaskRow({ t, tasks, members, me, today, readOnly, onToggle, onOpen }: {
  t: PTask; tasks: PTask[]; members: Member[]; me: string; today: string; readOnly?: boolean; onToggle: (t: PTask) => void; onOpen: (t: PTask) => void;
}) {
  const done = t.status === 'fatto';
  const late = !done && !!t.due_date && t.due_date < today;
  const subs = tasks.filter(s => s.parent_id === t.id);
  const meta = [
    t.status === 'in_corso' && TASK_STATUS_LABEL.in_corso,
    t.due_date && (late ? `scaduta ${relativeDay(today, t.due_date)}` : done ? shortDate(t.due_date) : relativeDay(today, t.due_date)),
    subs.length > 0 && `${subs.filter(s => s.status === 'fatto').length}/${subs.length} passaggi`,
    members.length > 1 && memberName(members, t.assignee_id, me),
  ].filter(Boolean);
  return (
    <li className="rounded-2xl pr-3 flex items-center gap-1" style={{ background: 'var(--glass-well)' }}>
      <CheckButton done={done} label={done ? `Riapri ${t.title}` : `Completa ${t.title}`} onClick={() => onToggle(t)} disabled={readOnly} />
      <button onClick={() => onOpen(t)} disabled={readOnly} className="flex-1 min-w-0 py-2.5 text-left disabled:cursor-default">
        <p className={`text-[15px] break-words transition-colors ${done ? 'line-through' : ''}`} style={{ color: done ? 'var(--text-subtle)' : 'var(--text)' }}>{t.title}</p>
        {meta.length > 0 && <p className="text-xs truncate" style={{ color: late ? 'var(--danger)' : t.status === 'in_corso' ? 'var(--brand-ring)' : 'var(--text-subtle)' }}>{meta.join(' · ')}</p>}
      </button>
    </li>
  );
}

function TasksTab({ p, tasks, top, members, me, today, api, readOnly, onToggle, onOpenTask, onAdd, onAskAI, fail }: {
  p: Project; tasks: PTask[]; top: PTask[]; members: Member[]; me: string; today: string; api: ProjectsApi; readOnly: boolean;
  onToggle: (t: PTask) => void; onOpenTask: (t: PTask) => void; onAdd: () => void; onAskAI: () => void; fail: (err: unknown) => void;
}) {
  const [sort, setSort] = useState<Sort>('ordine');
  const [quick, setQuick] = useState('');
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const usePhases = !!p.settings.phases && p.phases.length > 0;

  const open = top.filter(t => t.status !== 'fatto');
  const done = top.filter(t => t.status === 'fatto').sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
  const STATUS_ORDER: Record<string, number> = { in_corso: 0, da_fare: 1, fatto: 2 };
  const sorted = [...open].sort((a, b) => {
    if (sort === 'scadenza') return (a.due_date || '9999').localeCompare(b.due_date || '9999') || byPosition(a, b);
    if (sort === 'stato') return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || byPosition(a, b);
    if (sort === 'responsabile') return memberName(members, a.assignee_id, me).localeCompare(memberName(members, b.assignee_id, me)) || byPosition(a, b);
    return byPosition(a, b);
  });
  const groups: { phase: string | null; items: PTask[] }[] = sort === 'ordine' && usePhases
    ? [...p.phases.map(ph => ({ phase: ph as string | null, items: sorted.filter(t => t.phase === ph) })), { phase: null, items: sorted.filter(t => !t.phase || !p.phases.includes(t.phase)) }].filter(g => g.items.length)
    : [{ phase: null, items: sorted }];

  const addQuick = async () => {
    const title = quick.trim();
    if (!title || adding) return;
    setAdding(true);
    try { await api.addTask(p.id, { title }); setQuick(''); } catch (err) { fail(err); }
    setAdding(false);
  };

  if (!top.length) {
    return (
      <div className="space-y-4">
        {readOnly ? <p className="text-[15px]" style={{ color: 'var(--text-muted)' }}>Nel progetto non ci sono ancora attività.</p> : <>
          <QuickAdd value={quick} onChange={setQuick} onSubmit={addQuick} busy={adding} />
          <ReadyToStart onAdd={onAdd} onAskAI={onAskAI} />
        </>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!readOnly && <QuickAdd value={quick} onChange={setQuick} onSubmit={addQuick} busy={adding} />}
      <div className="flex items-center gap-2">
        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-subtle)' }}>Ordina per</span>
        <Pills label="Ordina le attività" value={sort} onChange={setSort} options={[
          { id: 'ordine', label: usePhases ? 'Fase' : 'Ordine' },
          { id: 'scadenza', label: 'Scadenza' },
          { id: 'stato', label: 'Stato' },
          ...(members.length > 1 ? [{ id: 'responsabile' as Sort, label: 'Responsabile' }] : []),
        ]} />
      </div>
      {open.length === 0 && <p className="text-[15px]" style={{ color: 'var(--text-muted)' }}>Hai completato tutte le attività.</p>}
      {groups.map(g => (
        <section key={g.phase || '_'}>
          {usePhases && sort === 'ordine' && <SectionTitle>{g.phase || 'Senza fase'}</SectionTitle>}
          <ul className="space-y-1.5">{g.items.map(t => <TaskRow key={t.id} t={t} tasks={tasks} members={members} me={me} today={today} readOnly={readOnly} onToggle={onToggle} onOpen={onOpenTask} />)}</ul>
        </section>
      ))}
      {done.length > 0 && (
        <section>
          <button onClick={() => setShowDone(s => !s)} aria-expanded={showDone} className="text-sm font-medium py-2" style={{ color: 'var(--text-muted)' }}>
            {showDone ? 'Nascondi' : 'Mostra'} le completate · {done.length}
          </button>
          {showDone && <ul className="space-y-1.5 mt-2">{done.map(t => <TaskRow key={t.id} t={t} tasks={tasks} members={members} me={me} today={today} readOnly={readOnly} onToggle={onToggle} onOpen={onOpenTask} />)}</ul>}
        </section>
      )}
    </div>
  );
}

function QuickAdd({ value, onChange, onSubmit, busy }: { value: string; onChange: (v: string) => void; onSubmit: () => void; busy: boolean }) {
  return (
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); onSubmit(); }}>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder="Aggiungi un'attività e premi Invio" aria-label="Nuova attività" maxLength={300}
        className="input-glass flex-1 h-12 text-[15px]" />
      <button type="submit" disabled={!value.trim() || busy} aria-label="Aggiungi attività" className="btn-primary !p-0 w-12 h-12 flex items-center justify-center flex-shrink-0 disabled:opacity-40">
        <Plus className="w-5 h-5 flex-shrink-0" />
      </button>
    </form>
  );
}

// "adesso", "5 min fa", "3 ore fa", "ieri", "12 ott".
function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'adesso';
  if (s < 3600) return `${Math.floor(s / 60)} min fa`;
  if (s < 86400) return `${Math.floor(s / 3600)} ${Math.floor(s / 3600) === 1 ? 'ora' : 'ore'} fa`;
  if (s < 172800) return 'ieri';
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}
