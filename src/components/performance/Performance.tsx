import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Sparkles, Loader2 } from 'lucide-react';
import { PTask, Project, ProjectInput, TaskDraft, TaskInput, permsOf } from '../../lib/projects';
import { AIAction, OVERVIEW_AI_SYSTEM, PROJECT_AI_SYSTEM, overviewContext, projectContext } from '../../lib/projectsAI';
import { listResources, listUpdates } from '../../lib/projects';
import { toDateKey } from '../../lib/store';
import { useDialog } from '../Dialog';
import { useProjects } from './useProjects';
import { Overview } from './Overview';
import { CardActions, ProjectList } from './ProjectList';
import { ProjectPage } from './ProjectPage';
import { ProjectSheet } from './ProjectSheet';
import { AIPanel } from './AIPanel';
import { Sheet, TextField, Label, ErrorNote, Pills, Toasts, ToastMsg } from './ui';

// Performance (only on the admin account for now): one place to turn ideas into projects, personal
// or for work, with their tasks, deadlines, notes and links, and MYND AI to plan them.
type Tab = 'panoramica' | 'progetti' | 'condivisi';
const TAB_KEY = 'mynd_performance_tab';
const savedTab = (): Tab => { try { const v = localStorage.getItem(TAB_KEY); return v === 'progetti' || v === 'condivisi' ? v : 'panoramica'; } catch { return 'panoramica'; } };

const PROJECT_QUICK = ['Cosa devo fare adesso?', 'Quali attività sono ancora aperte?', 'Quali sono le prossime scadenze?', 'Cosa rischia di ritardare il progetto?', 'Riassumi gli ultimi aggiornamenti'];
const OVERVIEW_QUICK = ['Da cosa parto oggi?', 'Cosa è in ritardo?', 'Cosa scade questa settimana?'];

// canCreate: the admin account. Anyone else opens Performance only for the projects shared with them.
export default function Performance({ userId, canCreate, focusProjectId, onFocusUsed, onConnectAI }: {
  userId: string; canCreate: boolean; focusProjectId?: string | null; onFocusUsed?: () => void; onConnectAI: () => void;
}) {
  const api = useProjects(userId);
  const { load, projects, tasks, members } = api;
  const dialog = useDialog();
  const [tab, setTab] = useState<Tab>(savedTab);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ kind: 'new' } | { kind: 'edit'; project: Project } | null>(null);
  const [quickTask, setQuickTask] = useState(false);
  const [ai, setAi] = useState<'overview' | 'project' | null>(null);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastId = useRef(0);
  const today = toDateKey(new Date());

  useEffect(() => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* private mode */ } }, [tab]);

  const notify = useCallback((text: string, error?: boolean, action?: ToastMsg['action']) => {
    const id = ++toastId.current;
    setToasts(ts => [...ts.slice(-2), { id, text, error, action }]);
    window.setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), error ? 7000 : 3500);
  }, []);
  const closeToast = useCallback((id: number) => setToasts(ts => ts.filter(t => t.id !== id)), []);
  const fail = useCallback((err: unknown, retry?: () => void) => notify(err instanceof Error ? err.message : String(err), true, retry ? { label: 'Riprova', run: retry } : undefined), [notify]);

  const open = projects.find(p => p.id === openId) || null;
  const openTasks = useMemo(() => tasks.filter(t => t.project_id === openId), [tasks, openId]);
  const openMembers = useMemo(() => members.filter(m => m.project_id === openId), [members, openId]);
  // A project deleted (or no longer visible) while open: back to the list.
  useEffect(() => { if (openId && load.state === 'ready' && !open) setOpenId(null); }, [openId, open, load.state]);

  const shared = useMemo(() => projects.filter(p => p.owner_id !== userId), [projects, userId]);
  const mine = useMemo(() => projects.filter(p => p.owner_id === userId), [projects, userId]);
  useEffect(() => { if (!canCreate && tab === 'progetti') setTab('condivisi'); }, [canCreate, tab]);

  // A project opened from an invitation just accepted: read again (it is new here) and open it.
  const { reload } = api;
  useEffect(() => {
    if (!focusProjectId || load.state !== 'ready') return;
    if (projects.some(p => p.id === focusProjectId)) { setOpenId(focusProjectId); onFocusUsed?.(); return; }
    reload(true).then(() => setOpenId(focusProjectId)).finally(() => onFocusUsed?.());
  }, [focusProjectId, load.state, projects, reload, onFocusUsed]);

  // The others' changes (and who accepted an invitation) arrive every 30 seconds while the page is open.
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') reload(true); }, 30_000);
    return () => window.clearInterval(id);
  }, [reload]);

  const openProject = useCallback((p: Project) => { setOpenId(p.id); window.scrollTo({ top: 0 }); }, []);

  const archive = useCallback((p: Project) => {
    const restore = !!p.archived_at;
    api.saveProject(p.id, { archived_at: restore ? null : new Date().toISOString() })
      .then(() => notify(restore ? 'Progetto ripristinato' : 'Progetto archiviato', false, restore ? undefined : { label: 'Annulla', run: () => { api.saveProject(p.id, { archived_at: null }).catch(err => fail(err)); } }))
      .catch(err => fail(err, () => archive(p)));
  }, [api, notify, fail]);

  const remove = useCallback(async (p: Project) => {
    const n = tasks.filter(t => t.project_id === p.id && !t.parent_id).length;
    const ok = await dialog.confirm({
      title: `Eliminare “${p.name}”?`,
      message: `${n ? `Verranno eliminate anche le sue ${n} attività, ` : 'Verranno eliminati anche '}le note e i link. Non si può annullare: se vuoi solo toglierlo di mezzo, archivialo.`,
      confirmLabel: 'Elimina', danger: true,
    });
    if (!ok) return;
    try { await api.remove(p.id); if (openId === p.id) setOpenId(null); notify('Progetto eliminato'); }
    catch (err) { fail(err); }
  }, [tasks, dialog, api, openId, notify, fail]);

  const duplicate = useCallback(async (p: Project) => {
    try { const copy = await api.duplicate(p); notify('Copia creata', false, { label: 'Apri', run: () => openProject(copy) }); }
    catch (err) { fail(err); }
  }, [api, notify, fail, openProject]);

  const cardActions: CardActions = { onOpen: openProject, onEdit: p => setSheet({ kind: 'edit', project: p }), onDuplicate: duplicate, onArchive: archive, onDelete: remove };

  const saveSheet = async (input: ProjectInput, drafts?: TaskDraft[]) => {
    if (sheet?.kind === 'edit') {
      await api.saveProject(sheet.project.id, input);
      setSheet(null);
      notify('Modifiche salvate');
      return;
    }
    const p = await api.create(input, drafts);
    setSheet(null);
    setTab(canCreate ? 'progetti' : 'condivisi');
    openProject(p);
    notify(drafts?.length ? `Progetto creato con ${drafts.length} attività` : 'Progetto creato');
  };

  const toggle = useCallback((t: PTask) => { api.toggleTask(t).then(() => { if (t.status !== 'fatto') notify(`“${t.title}” completata`, false, { label: 'Annulla', run: () => { api.editTask(t.id, { status: t.status }).catch(err => fail(err)); } }); }).catch(err => fail(err, () => toggle(t))); }, [api, notify, fail]);

  // MYND AI's changes, applied only after "Applica".
  const applyActions = async (actions: AIAction[]) => {
    if (!open) return;
    const newTasks: TaskDraft[] = [];
    for (const a of actions) {
      if (a.type === 'add_task') newTasks.push({ title: a.title, description: a.description || null, due_date: a.due_date || null, phase: a.phase || null, subtasks: a.subtasks });
      else if (a.type === 'add_subtasks') { const parent = tasks.find(t => t.id === a.task_id); if (parent) await api.addSubtasks(parent, a.titles); }
      else if (a.type === 'set_due') await api.editTask(a.task_id, { due_date: a.due_date });
      else if (a.type === 'set_status') await api.editTask(a.task_id, { status: a.status });
      else if (a.type === 'set_phases') await api.saveProject(open.id, { phases: a.phases, settings: { ...open.settings, phases: true } });
      else if (a.type === 'update_project') {
        const { type: _type, ...patch } = a;
        await api.saveProject(open.id, patch);
      }
    }
    if (newTasks.length) await api.addTasks(open.id, newTasks);
    notify('Modifiche applicate');
  };

  // The project's notes, links and latest updates, read when the AI panel opens.
  const [aiExtra, setAiExtra] = useState<{ res: Awaited<ReturnType<typeof listResources>>; upd: Awaited<ReturnType<typeof listUpdates>> }>({ res: [], upd: [] });
  useEffect(() => {
    if (ai !== 'project' || !openId) return;
    let alive = true;
    Promise.all([listResources(openId).catch(() => []), listUpdates(openId, 15).catch(() => [])]).then(([res, upd]) => { if (alive) setAiExtra({ res, upd }); });
    return () => { alive = false; };
  }, [ai, openId]);

  if (load.state !== 'ready') {
    return (
      <div className="pb-10">
        <h1 className="text-xs font-medium uppercase tracking-[0.08em] mb-4" style={{ color: 'var(--text-muted)' }}>Performance</h1>
        {load.state === 'loading' && (
          <div className="space-y-4" aria-busy="true" aria-label="Caricamento">
            <div className="skeleton h-10 w-56 rounded-2xl" />
            <div className="skeleton h-5 w-80 max-w-full rounded-xl" />
            <div className="grid gap-3 sm:grid-cols-2 pt-4"><div className="skeleton h-40 rounded-[24px]" /><div className="skeleton h-40 rounded-[24px]" /></div>
          </div>
        )}
        {load.state === 'setup' && (
          <div className="glass-card rounded-[24px] p-6 max-w-xl space-y-3">
            <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Manca un passaggio su Supabase</p>
            <p className="text-[15px]" style={{ color: 'var(--text-muted)' }}>Il database dei progetti non è ancora pronto. Esegui lo script "Progetti" (Admin → Guida → Script Supabase), poi premi Riprova.</p>
            <button onClick={() => api.reload()} className="btn-primary h-11 px-5">Riprova</button>
          </div>
        )}
        {load.state === 'error' && (
          <div className="max-w-xl space-y-4">
            <ErrorNote text={load.message} />
            <button onClick={() => api.reload()} className="btn-secondary h-11 px-5">Riprova</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pb-28 sm:pb-10">
      {open ? (
        <ProjectPage key={open.id} project={open} tasks={openTasks} members={openMembers} me={userId} today={today} api={api}
          onBack={() => setOpenId(null)} onEdit={() => setSheet({ kind: 'edit', project: open })} onDuplicate={() => duplicate(open)}
          onArchive={() => archive(open)} onDelete={() => remove(open)} onAskAI={() => setAi('project')} notify={notify}
          onLeft={() => { setOpenId(null); reload(true); }} />
      ) : (
        <div className="space-y-7 animate-fade-in">
          <header className="flex items-end justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-[34px] sm:text-[40px] leading-[1.05] font-bold tracking-[-0.04em]" style={{ color: 'var(--text)' }}>Performance</h1>
              <p className="mt-2 text-[15px]" style={{ color: 'var(--text-muted)' }}>Organizza le tue idee. Trasformale in progetti.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAi('overview')} className="btn-secondary h-11 px-4 inline-flex items-center gap-2"><Sparkles className="w-4 h-4" style={{ color: 'var(--brand-ring)' }} /> MYND AI</button>
              {canCreate && <button onClick={() => setSheet({ kind: 'new' })} className="btn-primary h-11 px-4 inline-flex items-center gap-1.5"><Plus className="w-4 h-4" /> Nuovo progetto</button>}
            </div>
          </header>
          <Pills label="Performance" value={tab} onChange={setTab} options={[
            { id: 'panoramica', label: 'Panoramica' },
            ...(canCreate ? [{ id: 'progetti' as Tab, label: 'I miei progetti' }] : []),
            { id: 'condivisi', label: 'Condivisi con me', count: shared.filter(p => !p.archived_at).length || undefined },
          ]} />
          {tab === 'panoramica' ? (
            <Overview projects={projects} tasks={tasks} members={members} me={userId} today={today} actions={cardActions} onToggle={toggle} canCreate={canCreate}
              onSeeAll={() => setTab(canCreate ? 'progetti' : 'condivisi')} onSeeShared={shared.length ? () => setTab('condivisi') : undefined}
              onNew={() => setSheet({ kind: 'new' })} onQuickTask={() => setQuickTask(true)} onAskAI={() => setAi('overview')} />
          ) : (
            <ProjectList key={tab} mode={tab === 'condivisi' ? 'shared' : 'mine'} projects={tab === 'condivisi' ? shared : mine} tasks={tasks} members={members} me={userId} today={today}
              actions={cardActions} onNew={canCreate ? () => setSheet({ kind: 'new' }) : undefined} />
          )}
        </div>
      )}

      {/* Phone: the main action always at hand. */}
      {!open && canCreate && projects.length > 0 && (
        <button onClick={() => setSheet({ kind: 'new' })} aria-label="Nuovo progetto"
          className="sm:hidden fixed right-5 z-40 w-14 h-14 rounded-full btn-primary !p-0 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          style={{ bottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
          <Plus className="w-6 h-6 flex-shrink-0" />
        </button>
      )}

      {sheet && (
        <ProjectSheet project={sheet.kind === 'edit' ? sheet.project : null} today={today} onClose={() => setSheet(null)} onSave={saveSheet}
          onConnectAI={() => { setSheet(null); onConnectAI(); }} />
      )}
      {quickTask && (
        <QuickTaskSheet projects={projects.filter(p => !p.archived_at && p.status !== 'completato' && permsOf(p, members, userId).canEdit)} onClose={() => setQuickTask(false)}
          onSave={async (projectId, input) => { await api.addTask(projectId, input); setQuickTask(false); notify('Attività aggiunta'); }} />
      )}
      {ai === 'overview' && (
        <AIPanel title="MYND AI · i tuoi progetti" system={OVERVIEW_AI_SYSTEM} quick={OVERVIEW_QUICK}
          context={() => overviewContext(projects, tasks, today)} onClose={() => setAi(null)} onConnect={() => { setAi(null); onConnectAI(); }} />
      )}
      {ai === 'project' && open && (
        <AIPanel title={`MYND AI · ${open.name}`} system={PROJECT_AI_SYSTEM} quick={PROJECT_QUICK} project={open} tasks={openTasks}
          context={() => projectContext(open, openTasks, openMembers, aiExtra.res, aiExtra.upd, today, userId)}
          onApply={permsOf(open, members, userId).canEdit ? applyActions : undefined} onClose={() => setAi(null)} onConnect={() => { setAi(null); onConnectAI(); }} />
      )}
      <Toasts items={toasts} onClose={closeToast} />
    </div>
  );
}

// "Nuova attività" from the overview: which project, what, by when.
function QuickTaskSheet({ projects, onClose, onSave }: { projects: Project[]; onClose: () => void; onSave: (projectId: string, input: TaskInput) => Promise<void> }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!projectId || !title.trim() || busy) return;
    setBusy(true); setError('');
    try { await onSave(projectId, { title: title.trim(), due_date: due || null }); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  };
  return (
    <Sheet title="Nuova attività" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn-secondary h-11 px-5">Annulla</button>
        <button onClick={save} disabled={busy || !title.trim() || !projectId} className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Aggiungi</button>
      </>}>
      {projects.length === 0 ? <p className="text-[15px]" style={{ color: 'var(--text-muted)' }}>Prima crea un progetto: le attività stanno sempre dentro un progetto.</p> : (
        <>
          <div>
            <Label htmlFor="qt-project">Progetto</Label>
            <select id="qt-project" value={projectId} onChange={e => setProjectId(e.target.value)} className="input-glass w-full h-12 text-[15px]">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <TextField id="qt-title" label="Cosa" value={title} onChange={setTitle} placeholder="Es. Chiedere i preventivi" autoFocus />
          <TextField id="qt-due" label="Scadenza (facoltativa)" type="date" value={due} onChange={setDue} />
        </>
      )}
      <ErrorNote text={error} />
    </Sheet>
  );
}
