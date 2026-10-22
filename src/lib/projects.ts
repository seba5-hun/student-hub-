// MYND Performance: projects, their tasks, notes and links (supabase/progetti.sql).
// Every request goes through Row Level Security: the database decides who sees and changes what,
// so a shared project (phase 2) uses the same calls.
import { supabase } from './supabase';

export type ProjectKind = 'personale' | 'lavoro';
export type ProjectStatus = 'da_iniziare' | 'in_corso' | 'completato';
export type TaskStatus = 'da_fare' | 'in_corso' | 'fatto';
export type MemberRole = 'proprietario' | 'responsabile' | 'membro' | 'osservatore';

export const KIND_LABEL: Record<ProjectKind, string> = { personale: 'Personale', lavoro: 'Lavoro' };
export const KIND_HINT: Record<ProjectKind, string> = {
  personale: 'Vacanze, feste, studio, idee tue: semplice, una lista e via.',
  lavoro: 'Progetti di lavoro o d\'azienda: fasi, responsabili, scadenze.',
};
export const STATUS_LABEL: Record<ProjectStatus, string> = { da_iniziare: 'Da iniziare', in_corso: 'In corso', completato: 'Completato' };
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { da_fare: 'Da fare', in_corso: 'In corso', fatto: 'Completata' };

export interface ProjectSettings { phases?: boolean }
export interface Project {
  id: string;
  owner_id: string;
  kind: ProjectKind;
  name: string;
  description: string | null;
  status: ProjectStatus;
  due_date: string | null;
  phases: string[];
  settings: ProjectSettings;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}
export interface Member { project_id: string; user_id: string; role: MemberRole; name: string | null; email: string | null; joined_at: string }
export interface PTask {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_date: string | null;
  assignee_id: string | null;
  phase: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  done_at: string | null;
}
// How a published Drive document is shared: with the people of the project (one permission per
// email, kept in step with who takes part) or with anyone who has the link.
export interface DriveSharing { mode?: 'progetto' | 'link'; perms?: { email: string; id: string }[]; anyone_id?: string }
export interface Resource {
  id: string;
  project_id: string;
  kind: 'nota' | 'link' | 'file';
  title: string;
  body: string | null;
  url: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
  // Phase 3 (supabase/progetti_file.sql): folders and Drive documents.
  folder?: string | null;
  drive_id?: string | null;
  mime?: string | null;
  size_bytes?: number | null;
  sharing?: DriveSharing;
}
export interface ProjectUpdate { id: number; project_id: string; actor_id: string | null; text: string; at: string }

// The tables are not there yet: supabase/progetti.sql has not been run.
export class ProjectsSetupError extends Error {}

function db() {
  if (!supabase) throw new Error('Supabase non configurato');
  return supabase;
}

type PgError = { code?: string; message?: string } | null;
function fail(error: PgError): never {
  const code = error?.code || '';
  if (code === 'PGRST205' || code === '42P01' || code === 'PGRST202' || code === '42883') {
    throw new ProjectsSetupError('Il database dei progetti non è ancora pronto.');
  }
  if (code === '42501') throw new Error('Non hai il permesso per questa modifica.');
  if (code === 'P0001' || code === '23514') throw new Error(error?.message?.startsWith('new row') ? 'Alcuni dati non sono validi.' : error?.message || 'Modifica non valida.');
  if (/fetch|network/i.test(error?.message || '')) throw new Error('Connessione assente: controlla internet e riprova.');
  throw new Error(error?.message || 'Qualcosa non ha funzionato. Riprova.');
}

const PROJECT_COLS = 'id, owner_id, kind, name, description, status, due_date, phases, settings, created_at, updated_at, archived_at';
const TASK_COLS = 'id, project_id, parent_id, title, description, status, due_date, assignee_id, phase, position, created_by, created_at, updated_at, done_at';
const RES_BASE = 'id, project_id, kind, title, body, url, added_by, created_at, updated_at';
const RES_COLS = `${RES_BASE}, folder, drive_id, mime, size_bytes, sharing`;

const cleanProject = (p: Project): Project => ({
  ...p,
  phases: Array.isArray(p.phases) ? p.phases.filter((x): x is string => typeof x === 'string') : [],
  settings: p.settings && typeof p.settings === 'object' ? p.settings : {},
});

// ───────────── Projects ─────────────

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await db().from('prj_projects').select(PROJECT_COLS).order('updated_at', { ascending: false });
  if (error) fail(error);
  return ((data || []) as Project[]).map(cleanProject);
}

export type ProjectInput = Pick<Project, 'kind' | 'name' | 'description' | 'due_date'> & Partial<Pick<Project, 'status' | 'phases' | 'settings'>>;

export async function createProject(input: ProjectInput): Promise<Project> {
  const { data, error } = await db().from('prj_projects').insert(input).select(PROJECT_COLS).single();
  if (error) fail(error);
  return cleanProject(data as Project);
}

export async function updateProject(id: string, patch: Partial<Omit<Project, 'id' | 'owner_id' | 'created_at' | 'updated_at'>>): Promise<void> {
  const { error } = await db().from('prj_projects').update(patch).eq('id', id);
  if (error) fail(error);
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await db().from('prj_projects').delete().eq('id', id);
  if (error) fail(error);
}

// A copy with the same tasks, all to do again; notes and links stay in the original.
export async function duplicateProject(p: Project, tasks: PTask[]): Promise<Project> {
  const copy = await createProject({ kind: p.kind, name: `${p.name} (copia)`.slice(0, 120), description: p.description, due_date: p.due_date, phases: p.phases, settings: p.settings });
  await createTaskTree(copy.id, tasks.filter(t => t.parent_id === null).sort(byPosition).map(t => ({
    title: t.title, description: t.description, due_date: t.due_date, phase: t.phase,
    subtasks: tasks.filter(s => s.parent_id === t.id).sort(byPosition).map(s => s.title),
  })));
  return copy;
}

// ───────────── Members and updates ─────────────

export async function listMembers(projectIds: string[]): Promise<Member[]> {
  if (!projectIds.length) return [];
  const { data, error } = await db().from('prj_members').select('project_id, user_id, role, name, email, joined_at').in('project_id', projectIds);
  if (error) fail(error);
  return (data || []) as Member[];
}

export async function listUpdates(projectId: string, limit = 20): Promise<ProjectUpdate[]> {
  const { data, error } = await db().from('prj_updates').select('id, project_id, actor_id, text, at').eq('project_id', projectId).order('id', { ascending: false }).limit(limit);
  if (error) fail(error);
  return (data || []) as ProjectUpdate[];
}

// ───────────── Tasks ─────────────

export const byPosition = (a: PTask, b: PTask) => a.position - b.position || a.created_at.localeCompare(b.created_at);

// All the tasks of the projects the person can see.
export async function listTasks(): Promise<PTask[]> {
  const { data, error } = await db().from('prj_tasks').select(TASK_COLS).order('position').limit(10000);
  if (error) fail(error);
  return (data || []) as PTask[];
}

export type TaskInput = Pick<PTask, 'title'> & Partial<Pick<PTask, 'description' | 'status' | 'due_date' | 'assignee_id' | 'phase' | 'parent_id' | 'position'>>;

export async function createTask(projectId: string, input: TaskInput, me: string): Promise<PTask> {
  const { data, error } = await db().from('prj_tasks').insert({ ...input, project_id: projectId, created_by: me }).select(TASK_COLS).single();
  if (error) fail(error);
  return data as PTask;
}

export async function updateTask(id: string, patch: Partial<Omit<PTask, 'id' | 'project_id' | 'created_by' | 'created_at' | 'updated_at' | 'done_at'>>): Promise<PTask> {
  const { data, error } = await db().from('prj_tasks').update(patch).eq('id', id).select(TASK_COLS).single();
  if (error) fail(error);
  return data as PTask;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await db().from('prj_tasks').delete().eq('id', id);
  if (error) fail(error);
}

export interface TaskDraft { title: string; description?: string | null; due_date?: string | null; phase?: string | null; subtasks?: string[] }

// Several tasks at once (a plan from the AI, a duplicated project), in their order, with their subtasks.
export async function createTaskTree(projectId: string, drafts: TaskDraft[], startAt = 0): Promise<PTask[]> {
  if (!drafts.length) return [];
  const me = (await db().auth.getUser()).data.user?.id;
  const { data, error } = await db().from('prj_tasks').insert(drafts.map((d, i) => ({
    project_id: projectId, title: d.title, description: d.description || null, due_date: d.due_date || null, phase: d.phase || null,
    position: startAt + i, created_by: me,
  }))).select(TASK_COLS);
  if (error) fail(error);
  const parents = ((data || []) as PTask[]).sort(byPosition);
  const children = drafts.flatMap((d, i) => (d.subtasks || []).filter(Boolean).map((title, j) => ({
    project_id: projectId, parent_id: parents[i]?.id, title, position: j, created_by: me,
  }))).filter(c => c.parent_id);
  if (!children.length) return parents;
  const res = await db().from('prj_tasks').insert(children).select(TASK_COLS);
  if (res.error) fail(res.error);
  return [...parents, ...((res.data || []) as PTask[])];
}

// ───────────── Notes and links ─────────────

// Folders and Drive documents need supabase/progetti_file.sql: without it notes and links still work.
let filesReady: boolean | null = null;
const missingColumn = (e: PgError) => e?.code === '42703' || e?.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(e?.message || '');
export const resourceFilesReady = () => filesReady !== false;

export async function listResources(projectId: string): Promise<Resource[]> {
  const run = (cols: string) => db().from('prj_resources').select(cols).eq('project_id', projectId).order('updated_at', { ascending: false });
  let { data, error } = await run(filesReady === false ? RES_BASE : RES_COLS);
  if (error && filesReady !== false && missingColumn(error)) { filesReady = false; ({ data, error } = await run(RES_BASE)); }
  else if (!error && filesReady === null) filesReady = true;
  if (error) fail(error);
  return ((data || []) as unknown as Resource[]);
}

export type ResourceInput = Pick<Resource, 'kind' | 'title' | 'body' | 'url'> & Partial<Pick<Resource, 'folder' | 'drive_id' | 'mime' | 'size_bytes' | 'sharing'>>;

export async function saveResource(projectId: string, input: ResourceInput, id?: string): Promise<Resource> {
  const q = id
    ? db().from('prj_resources').update(input).eq('id', id)
    : db().from('prj_resources').insert({ ...input, project_id: projectId });
  const { data, error } = await q.select(filesReady === false ? RES_BASE : RES_COLS).single();
  if (error) {
    if (missingColumn(error)) { filesReady = false; throw new ProjectsSetupError('Per cartelle e documenti di Drive serve lo script "Documenti dei progetti" su Supabase.'); }
    fail(error);
  }
  return data as unknown as Resource;
}

export async function deleteResource(id: string): Promise<void> {
  const { error } = await db().from('prj_resources').delete().eq('id', id);
  if (error) fail(error);
}

// A link typed without https:// still works; anything that is not a web address is refused.
export function normalizeUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch { return null; }
}

// ───────────── Progress, lateness, dates ─────────────

export interface Progress { total: number; done: number; pct: number | null }

// Done tasks over all the tasks (subtasks are steps of their task, they don't count on their own).
export function progressOf(tasks: PTask[]): Progress {
  const top = tasks.filter(t => t.parent_id === null);
  const done = top.filter(t => t.status === 'fatto').length;
  return { total: top.length, done, pct: top.length ? Math.round((done / top.length) * 100) : null };
}

export const openTasks = (tasks: PTask[]) => tasks.filter(t => t.status !== 'fatto');

// "In ritardo": shown next to the status the person chose, never instead of it.
export function lateness(p: Project, tasks: PTask[], today: string): { late: boolean; overdue: PTask[] } {
  if (p.status === 'completato') return { late: false, overdue: [] };
  const overdue = tasks.filter(t => t.status !== 'fatto' && t.due_date && t.due_date < today);
  return { late: overdue.length > 0 || (!!p.due_date && p.due_date < today), overdue };
}

export function nextDue(p: Project, tasks: PTask[], today: string): string | null {
  const dates = tasks.filter(t => t.status !== 'fatto' && t.due_date && t.due_date >= today).map(t => t.due_date as string);
  if (p.due_date && p.due_date >= today && p.status !== 'completato') dates.push(p.due_date);
  return dates.sort()[0] || null;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000);
}

// "oggi", "domani", "tra 5 giorni", "3 giorni fa".
export function relativeDay(today: string, key: string): string {
  const n = daysBetween(today, key);
  if (n === 0) return 'oggi';
  if (n === 1) return 'domani';
  if (n === -1) return 'ieri';
  return n > 0 ? `tra ${n} giorni` : `${-n} giorni fa`;
}

export function memberName(members: Member[], userId: string | null, me?: string): string {
  if (!userId) return '';
  if (userId === me) return 'Tu';
  const m = members.find(x => x.user_id === userId);
  return m?.name || m?.email?.split('@')[0] || 'Membro';
}

export const initials = (name: string) => name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?';

// ───────────── Sharing (supabase/progetti_condivisione.sql) ─────────────

export type InviteRole = Exclude<MemberRole, 'proprietario'>;
export const ROLE_LABEL: Record<MemberRole, string> = { proprietario: 'Proprietario', responsabile: 'Responsabile', membro: 'Membro', osservatore: 'Solo lettura' };
export const roleLabel = (role: MemberRole, kind: ProjectKind) => (kind === 'personale' && role === 'membro' ? 'Partecipante' : ROLE_LABEL[role]);
export const ROLE_HINT: Record<InviteRole, string> = {
  responsabile: 'Modifica tutto il progetto e invita altre persone.',
  membro: 'Aggiunge e completa attività, note e link.',
  osservatore: 'Vede tutto, senza modificare.',
};

// What the person logged in can do in a project (the database checks the same rules).
export interface Perms { role: MemberRole | null; isOwner: boolean; canEdit: boolean; canManage: boolean; canEditProject: boolean; canInvite: boolean }
export function permsOf(p: Project, members: Member[], me: string): Perms {
  const role = p.owner_id === me ? 'proprietario' : members.find(m => m.project_id === p.id && m.user_id === me)?.role || null;
  const canEdit = role === 'proprietario' || role === 'responsabile' || role === 'membro';
  const canManage = role === 'proprietario' || role === 'responsabile';
  return { role, isOwner: role === 'proprietario', canEdit, canManage, canEditProject: canManage || (p.kind === 'personale' && canEdit), canInvite: canManage || (p.kind === 'personale' && canEdit) };
}

export interface ProjectInvite { id: string; project_id: string; invited_email: string; invited_user: string | null; invited_by: string | null; role: InviteRole; status: string; created_at: string }
export interface MyInvite { id: string; project_id: string; project_name: string; project_kind: ProjectKind; role: InviteRole; invited_by_email: string | null; created_at: string }
export type InviteResult = { status: 'invited' | 'waiting'; name: string } | { status: 'already_member' | 'already_invited' | 'self' };

export async function inviteByEmail(projectId: string, email: string, role: InviteRole): Promise<InviteResult> {
  const { data, error } = await db().rpc('prj_invite', { p_project: projectId, p_email: email, p_role: role });
  if (error) fail(error);
  return data as InviteResult;
}

export async function listProjectInvites(projectId: string): Promise<ProjectInvite[]> {
  const { data, error } = await db().from('prj_invites').select('id, project_id, invited_email, invited_user, invited_by, role, status, created_at')
    .eq('project_id', projectId).eq('status', 'in_attesa').order('created_at', { ascending: false });
  if (error) fail(error);
  return (data || []) as ProjectInvite[];
}

export async function cancelInvite(id: string): Promise<void> {
  const { error } = await db().rpc('prj_cancel_invite', { p_invite: id });
  if (error) fail(error);
}

// The invitations waiting for the person logged in ([] when sharing is not set up yet).
export async function listMyInvites(): Promise<MyInvite[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('prj_my_invites');
  if (error) return [];
  return (data || []) as MyInvite[];
}

export async function answerInvite(id: string, accept: boolean): Promise<string> {
  const { data, error } = await db().rpc('prj_answer_invite', { p_invite: id, p_accept: accept });
  if (error) fail(error);
  return data as string;
}

export async function setMemberRole(projectId: string, userId: string, role: InviteRole): Promise<void> {
  const { error } = await db().rpc('prj_set_member_role', { p_project: projectId, p_user: userId, p_role: role });
  if (error) fail(error);
}

export async function removeMember(projectId: string, userId: string): Promise<void> {
  const { error } = await db().rpc('prj_remove_member', { p_project: projectId, p_user: userId });
  if (error) fail(error);
}

// Whether the person takes part in at least one project (Performance opens for them too).
export async function hasProjects(userId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.from('prj_members').select('project_id').eq('user_id', userId).limit(1);
  return !error && !!data?.length;
}
