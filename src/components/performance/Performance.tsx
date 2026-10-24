import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Sparkles, Loader2 } from 'lucide-react';
import { PTask, Project, ProjectInput, TaskDraft, TaskInput, permsOf } from '../../lib/projects';
import { AIAction, OVERVIEW_AI_SYSTEM, PROJECT_AI_SYSTEM, overviewContext, projectContext } from '../../lib/projectsAI';
import { listResources, listUpdates } from '../../lib/projects';
import { toDateKey } from '../../lib/store';
import type { ArchiveItem } from '../../lib/store';
import { useDialog } from '../Dialog';
import { useProjects } from './useProjects';
import { useTools, TOOLS_CHANGED } from './useTools';
import { ToolSheet } from './ToolSheet';
import { AIDock, useAIDock } from './AIDock';
import { Tool, ToolConfig, ToolItem, checkItem, cleanItemData, createTool, peopleOf, sameItem, saveItems } from '../../lib/tools';
import type { ToolWithItems } from '../../lib/projectsAI';
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

const PROJECT_QUICK = ['Cosa devo fare adesso?', 'Cosa rischia di ritardare il progetto?', 'Che altri strumenti mi servirebbero?', 'Quali sono le prossime scadenze?', 'Riassumi gli ultimi aggiornamenti'];
const OVERVIEW_QUICK = ['Da cosa parto oggi?', 'Cosa è in ritardo?', 'Cosa scade questa settimana?'];

// canCreate: the admin account. Anyone else opens Performance only for the projects shared with them.
// active: Performance is on screen (it stays loaded when hidden, so MYND AI can finish its work).
export default function Performance({ userId, canCreate, archiveItems = [], focusProjectId, onFocusUsed, onConnectAI, active = true, onShow }: {
  userId: string; canCreate: boolean; archiveItems?: ArchiveItem[]; focusProjectId?: string | null; onFocusUsed?: () => void; onConnectAI: () => void;
  active?: boolean; onShow?: () => void;
}) {
  const api = useProjects(userId);

  const { load, projects, tasks, members } = api;
  const dialog = useDialog();
  const [tab, setTab] = useState<Tab>(savedTab);
  const [openId, setOpenId] = useState<string | null>(null);
  const toolsApi = useTools(openId, active);
  const showMe = useCallback(() => onShow?.(), [onShow]);
  const { dock, props: dockProps, restore, forget } = useAIDock(showMe);
  const [toolSheet, setToolSheet] = useState<{ project: Project; tool: Tool | null } | null>(null);
  const [focusTool, setFocusTool] = useState<string | null>(null);
  const clearFocusTool = useCallback(() => setFocusTool(null), []);
  const activeRef = useRef(active);
  activeRef.current = active;
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
    const id = window.setInterval(() => { if (document.visibilityState === 'visible' && activeRef.current) reload(true); }, 30_000);
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

  // A new project opens at once; its tasks and tools (with their ready-made items) are added
  // right after, in parallel, while the page is already on screen.
  const [preparing, setPreparing] = useState<string | null>(null);
  const saveSheet = async (input: ProjectInput, drafts?: TaskDraft[], tools?: ToolWithItems[]) => {
    if (sheet?.kind === 'edit') {
      await api.saveProject(sheet.project.id, input);
      setSheet(null);
      notify('Modifiche salvate');
      return;
    }
    const p = await api.create(input);
    setSheet(null);
    setTab(canCreate ? 'progetti' : 'condivisi');
    openProject(p);
    if (!drafts?.length && !tools?.length) { notify('Progetto creato'); return; }
    setPreparing(p.id);
    const toolJobs = (tools || []).map(async ({ items, ...spec }, i) => {
      const t = await createTool(p.id, spec, i);
      if (items?.length) await saveItems(t, sensibleItems(t.config, items.map(x => cleanItemData(t.config, x, [], { guess: true })), []).ok);
    });
    const results = await Promise.allSettled([drafts?.length ? api.addTasks(p.id, drafts) : Promise.resolve([]), ...toolJobs]);
    window.dispatchEvent(new CustomEvent(TOOLS_CHANGED, { detail: p.id }));
    setPreparing(null);
    const failed = results.filter(r => r.status === 'rejected').length;
    notify(failed ? `Progetto creato, ma ${failed === 1 ? 'una parte non è stata salvata' : `${failed} parti non sono state salvate`}: riprova ad aggiungerle.` : 'Progetto pronto', failed > 0);
  };

  const toggle = useCallback((t: PTask) => { api.toggleTask(t).then(() => { if (t.status !== 'fatto') notify(`“${t.title}” completata`, false, { label: 'Annulla', run: () => { api.editTask(t.id, { status: t.status }).catch(err => fail(err)); } }); }).catch(err => fail(err, () => toggle(t))); }, [api, notify, fail]);

  // MYND AI's changes, applied only after "Applica": everything at once (in parallel, lists in one
  // request) and visible immediately; the tool that changed is opened behind the chat.
  const applyActions = async (actions: AIAction[]) => {
    if (!open) return;
    const newTasks: TaskDraft[] = [];
    const jobs: Promise<unknown>[] = [];
    const itemsFor = (toolId: string) => toolsApi.items.filter(i => i.tool_id === toolId);
    for (const a of actions) {
      if (a.type === 'add_task') newTasks.push({ title: a.title, description: a.description || null, due_date: a.due_date || null, phase: a.phase || null, subtasks: a.subtasks });
      else if (a.type === 'add_subtasks') { const parent = tasks.find(t => t.id === a.task_id); if (parent) jobs.push(api.addSubtasks(parent, a.titles)); }
      else if (a.type === 'set_due') jobs.push(api.editTask(a.task_id, { due_date: a.due_date }));
      else if (a.type === 'set_status') jobs.push(api.editTask(a.task_id, { status: a.status }));
      else if (a.type === 'set_phases') jobs.push(api.saveProject(open.id, { phases: a.phases, settings: { ...open.settings, phases: true } }));
      else if (a.type === 'update_project') { const { type: _type, ...patch } = a; jobs.push(api.saveProject(open.id, patch)); }
      else if (a.type === 'add_tool') {
        jobs.push(toolsApi.addTool(a.tool).then(async t => {
          setFocusTool(t.id);
          if (a.items?.length) await toolsApi.putItems(t, sensibleItems(t.config, a.items.map(x => cleanItemData(t.config, x, peopleOf(t, [], openMembers), { members: openMembers, me: userId, guess: true })), []).ok);
        }));
      } else if (a.type === 'add_item' || a.type === 'add_items') {
        const tool = toolsApi.tools.find(t => t.id === a.tool_id);
        if (!tool) continue;
        const people = peopleOf(tool, itemsFor(tool.id), openMembers);
        const list = a.type === 'add_item' ? [a.values] : a.items;
        const { ok, skipped } = sensibleItems(tool.config, list.map(x => cleanItemData(tool.config, x, people, { members: openMembers, me: userId })), itemsFor(tool.id));
        if (skipped) notify(`${skipped} ${skipped === 1 ? 'voce saltata perché incompleta o già presente' : 'voci saltate perché incomplete o già presenti'}`);
        if (ok.length) jobs.push(toolsApi.putItems(tool, ok));
        setFocusTool(tool.id);
      }
    }
    if (newTasks.length) jobs.push(api.addTasks(open.id, newTasks));
    const results = await Promise.allSettled(jobs);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
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
        <ProjectPage key={open.id} project={open} tasks={openTasks} members={openMembers} me={userId} today={today} api={api} toolsApi={toolsApi} archive={archiveItems}
          onBack={() => setOpenId(null)} onEdit={() => setSheet({ kind: 'edit', project: open })} onDuplicate={() => duplicate(open)}
          onArchive={() => archive(open)} onDelete={() => remove(open)} onAskAI={() => setAi('project')} notify={notify}
          onLeft={() => { setOpenId(null); reload(true); }}
          preparing={preparing === open.id} onToolSheet={t => { forget('strumento'); setToolSheet({ project: open, tool: t === 'new' ? null : t }); }} focusToolId={focusTool} onFocusToolUsed={clearFocusTool} />
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
        <ProjectSheet project={sheet.kind === 'edit' ? sheet.project : null} today={today} onClose={() => { setSheet(null); forget('progetto'); }} onSave={async (...a) => { await saveSheet(...a); forget('progetto'); }}
          onConnectAI={() => { setSheet(null); forget('progetto'); onConnectAI(); }} dock={dockProps('progetto', 'Nuovo progetto')} />
      )}
      {quickTask && (
        <QuickTaskSheet projects={projects.filter(p => !p.archived_at && p.status !== 'completato' && permsOf(p, members, userId).canEdit)} onClose={() => setQuickTask(false)}
          onSave={async (projectId, input) => { await api.addTask(projectId, input); setQuickTask(false); notify('Attività aggiunta'); }} />
      )}
      {ai === 'overview' && (
        <AIPanel title="MYND AI · i tuoi progetti" system={OVERVIEW_AI_SYSTEM} quick={OVERVIEW_QUICK}
          context={() => overviewContext(projects, tasks, today)} onClose={() => { setAi(null); forget('ai'); }} onConnect={() => { setAi(null); forget('ai'); onConnectAI(); }}
          dock={dockProps('ai', 'I tuoi progetti')} chat={{ userId, topic: 'panoramica' }} />
      )}
      {ai === 'project' && open && (
        <AIPanel title={`MYND AI · ${open.name}`} system={PROJECT_AI_SYSTEM} quick={PROJECT_QUICK} project={open} tasks={openTasks}
          tools={toolsApi.tools} toolItems={toolsApi.items} members={openMembers} me={userId}
          context={() => projectContext(open, openTasks, openMembers, aiExtra.res, aiExtra.upd, today, userId, toolsApi.tools, toolsApi.items)}
          onApply={permsOf(open, members, userId).canEdit ? applyActions : undefined} onClose={() => { setAi(null); forget('ai'); }} onConnect={() => { setAi(null); forget('ai'); onConnectAI(); }}
          dock={dockProps('ai', open.name)} chat={{ userId, topic: open.id }} />
      )}
      {toolSheet && (
        <ToolSheet project={toolSheet.project} tools={toolSheet.project.id === openId ? toolsApi.tools : []} tool={toolSheet.tool}
          onClose={() => { setToolSheet(null); forget('strumento'); }} dock={dockProps('strumento', toolSheet.tool ? toolSheet.tool.name : `Strumento per ${toolSheet.project.name}`)}
          onSave={async spec => {
            const ts = toolSheet;
            if (!ts.tool) {
              const t = await toolsApi.addTool(spec, ts.project.id);
              if (ts.project.id === openId) setFocusTool(t.id);
              notify(`“${t.name}” aggiunto a ${ts.project.name}`, false, ts.project.id === openId ? undefined : { label: 'Apri', run: () => { setOpenId(ts.project.id); setFocusTool(t.id); onShow?.(); } });
            } else {
              await toolsApi.editTool(ts.tool.id, { name: spec.name, icon: spec.icon || 'list', description: spec.description || null, config: spec.config });
              notify('Strumento aggiornato');
            }
            setToolSheet(null); forget('strumento');
          }} />
      )}
      <AIDock dock={dock} onOpen={restore}
        onClose={key => { forget(key); if (key === 'ai') setAi(null); if (key === 'progetto') setSheet(null); if (key === 'strumento') setToolSheet(null); }} />
      <Toasts items={toasts} onClose={closeToast} />
    </div>
  );
}

// Only items that make sense: complete, with plausible numbers, and not already there.
function sensibleItems(cfg: ToolConfig, list: Record<string, unknown>[], existing: ToolItem[]): { ok: Record<string, unknown>[]; skipped: number } {
  const ok: Record<string, unknown>[] = [];
  for (const d of list) {
    if (checkItem(cfg, d).error) continue;
    if (existing.some(it => sameItem(it.data, d)) || ok.some(x => sameItem(x, d))) continue;
    ok.push(d);
  }
  return { ok, skipped: list.length - ok.length };
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
