import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Member, PTask, Project, ProjectInput, ProjectsSetupError, TaskDraft, TaskInput,
  createProject, createTask, createTaskTree, deleteProject, deleteTask, duplicateProject, listMembers, listProjects, listTasks,
  updateProject, updateTask,
} from '../../lib/projects';

export type Load = { state: 'loading' } | { state: 'setup' } | { state: 'error'; message: string } | { state: 'ready' };

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Everything Performance shows, kept in memory and saved to the database. Changes appear at once
// and go back if saving fails (the caller shows the error).
export function useProjects(me: string) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<PTask[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setLoad(l => (l.state === 'ready' ? l : { state: 'loading' }));
    try {
      const [p, t] = await Promise.all([listProjects(), listTasks()]);
      const m = await listMembers(p.map(x => x.id));
      setProjects(p); setTasks(t); setMembers(m);
      setLoad({ state: 'ready' });
    } catch (err) {
      if (quiet) return;
      if (err instanceof ProjectsSetupError) setLoad({ state: 'setup' });
      else setLoad({ state: 'error', message: message(err) });
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  // Back to the app after a while: the latest version (from another device, later from other people).
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') reload(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  const patchProjectLocal = (id: string, patch: Partial<Project>) =>
    setProjects(ps => ps.map(p => (p.id === id ? { ...p, ...patch, updated_at: new Date().toISOString() } : p)));

  const saveProject = useCallback(async (id: string, patch: Partial<Project>) => {
    const before = projectsRef.current.find(p => p.id === id);
    patchProjectLocal(id, patch);
    try { await updateProject(id, patch); }
    catch (err) { if (before) setProjects(ps => ps.map(p => (p.id === id ? before : p))); throw err; }
  }, []);

  // The first task started or done moves a project "da iniziare" to "in corso" (it can be changed back).
  const markStarted = useCallback((projectId: string) => {
    const p = projectsRef.current.find(x => x.id === projectId);
    if (p && p.status === 'da_iniziare') saveProject(projectId, { status: 'in_corso' }).catch(() => {});
  }, [saveProject]);

  const create = useCallback(async (input: ProjectInput, drafts: TaskDraft[] = []): Promise<Project> => {
    const p = await createProject(input);
    setProjects(ps => [p, ...ps]);
    setMembers(ms => [...ms, { project_id: p.id, user_id: me, role: 'proprietario', name: null, email: null, joined_at: p.created_at }]);
    if (drafts.length) {
      try {
        const added = await createTaskTree(p.id, drafts);
        setTasks(ts => [...ts, ...added]);
      } catch (err) {
        throw new Error(`Il progetto è stato creato, ma non tutte le attività: ${message(err)}`);
      }
    }
    reload(true);
    return p;
  }, [me, reload]);

  const remove = useCallback(async (id: string) => {
    await deleteProject(id);
    setProjects(ps => ps.filter(p => p.id !== id));
    setTasks(ts => ts.filter(t => t.project_id !== id));
  }, []);

  const duplicate = useCallback(async (p: Project) => {
    const copy = await duplicateProject(p, tasksRef.current.filter(t => t.project_id === p.id));
    await reload(true);
    return copy;
  }, [reload]);

  const nextPosition = (projectId: string, parentId: string | null) =>
    Math.max(-1, ...tasksRef.current.filter(t => t.project_id === projectId && t.parent_id === parentId).map(t => t.position)) + 1;

  const addTask = useCallback(async (projectId: string, input: TaskInput) => {
    const t = await createTask(projectId, { position: nextPosition(projectId, input.parent_id || null), ...input }, me);
    setTasks(ts => [...ts, t]);
    if (t.status !== 'da_fare') markStarted(projectId);
    return t;
  }, [me, markStarted]);

  const addTasks = useCallback(async (projectId: string, drafts: TaskDraft[]) => {
    const added = await createTaskTree(projectId, drafts, nextPosition(projectId, null));
    setTasks(ts => [...ts, ...added]);
    return added;
  }, []);

  const addSubtasks = useCallback(async (parent: PTask, titles: string[]) => {
    let pos = nextPosition(parent.project_id, parent.id);
    for (const title of titles) {
      const t = await createTask(parent.project_id, { title, parent_id: parent.id, position: pos++ }, me);
      setTasks(ts => [...ts, t]);
    }
  }, [me]);

  const editTask = useCallback(async (id: string, patch: Partial<PTask>) => {
    const before = tasksRef.current.find(t => t.id === id);
    if (!before) return;
    setTasks(ts => ts.map(t => (t.id === id ? { ...t, ...patch } : t)));
    try {
      const saved = await updateTask(id, patch);
      setTasks(ts => ts.map(t => (t.id === id ? saved : t)));
      if (patch.status && patch.status !== 'da_fare') markStarted(before.project_id);
    } catch (err) {
      setTasks(ts => ts.map(t => (t.id === id ? before : t)));
      throw err;
    }
  }, [markStarted]);

  const toggleTask = useCallback((t: PTask) => editTask(t.id, { status: t.status === 'fatto' ? 'da_fare' : 'fatto' }), [editTask]);

  const removeTask = useCallback(async (id: string) => {
    const before = tasksRef.current;
    setTasks(ts => ts.filter(t => t.id !== id && t.parent_id !== id));
    try { await deleteTask(id); } catch (err) { setTasks(before); throw err; }
  }, []);

  return { load, reload, projects, tasks, members, create, saveProject, remove, duplicate, addTask, addTasks, addSubtasks, editTask, toggleTask, removeTask };
}

export type ProjectsApi = ReturnType<typeof useProjects>;
