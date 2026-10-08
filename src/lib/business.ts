// MYND Business: reads and writes the company tables (supabase/business.sql).
// Every request goes through Row Level Security: the database decides what each person sees.
import { supabase } from './supabase';

export type BizRole = 'titolare' | 'admin' | 'manager' | 'dipendente' | 'finanza' | 'esterno';

export const ROLE_LABEL: Record<BizRole, string> = {
  titolare: 'Titolare',
  admin: 'Admin',
  manager: 'Manager',
  dipendente: 'Dipendente',
  finanza: 'Finanza',
  esterno: 'Collaboratore esterno',
};
export const ROLE_HINT: Record<BizRole, string> = {
  titolare: "Tutto, comprese le impostazioni e l'eliminazione dell'azienda.",
  admin: 'Gestione operativa: team, clienti, progetti. Niente Finanza se non abilitata.',
  manager: 'Guida i suoi progetti e decide cosa vede ogni membro.',
  dipendente: 'I suoi compiti e i progetti a cui partecipa.',
  finanza: 'Fatture, pagamenti e cassa.',
  esterno: 'Solo i progetti, i compiti e i documenti condivisi con lui.',
};

export interface Skill { name: string; level: number }
export interface Org {
  id: string;
  name: string;
  sector: string | null;
  vat: string | null;
  settings: { hidden_sections?: string[]; cash_balance?: number; cash_balance_date?: string };
  created_at: string;
}
export interface Person {
  id: string;
  org_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  role: BizRole;
  job_title: string | null;
  department: string | null;
  skills: Skill[];
  availability: { hours_week?: number };
  active: boolean;
}
export interface AuditEntry {
  id: number;
  at: string;
  actor_user: string | null;
  actor_kind: 'persona' | 'ai' | 'automazione' | 'sistema';
  table_name: string;
  action: 'crea' | 'modifica' | 'elimina';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

// The tables are not there yet: supabase/business.sql has not been run.
export class BusinessSetupError extends Error {}

function db() {
  if (!supabase) throw new Error('Supabase non configurato');
  return supabase;
}

type PgError = { code?: string; message?: string } | null;
function fail(error: PgError): never {
  const code = error?.code || '';
  if (code === 'PGRST205' || code === '42P01' || code === 'PGRST202' || code === '42883') {
    throw new BusinessSetupError('Il database di Business non è ancora pronto.');
  }
  if (code === '42501') throw new Error(error?.message?.includes('MYND') ? error.message : 'Non hai il permesso per questa modifica.');
  if (code === '23505') throw new Error('Esiste già una persona con questa email nel team.');
  if (code === '23514' || code === 'P0001') throw new Error(error?.message || 'Modifica non valida.');
  throw new Error(error?.message || 'Qualcosa non ha funzionato. Riprova.');
}

// Updates the row with this id, or inserts it and returns the new id.
async function upsertRow(table: string, values: Record<string, unknown>, id?: string): Promise<string> {
  if (id) {
    const { error } = await db().from(table).update(values).eq('id', id);
    if (error) fail(error);
    return id;
  }
  const { data, error } = await db().from(table).insert(values).select('id').single();
  if (error) fail(error);
  return (data as { id: string }).id;
}

export async function listOrgs(): Promise<Org[]> {
  const { data, error } = await db().from('biz_orgs').select('id, name, sector, vat, settings, created_at').order('created_at');
  if (error) fail(error);
  return (data || []) as Org[];
}

export async function createOrg(name: string, sector: string, ownerName: string): Promise<string> {
  const { data, error } = await db().rpc('biz_create_org', { p_name: name, p_sector: sector, p_owner_name: ownerName });
  if (error) fail(error);
  return data as string;
}

export async function updateOrg(id: string, patch: Partial<Pick<Org, 'name' | 'sector' | 'vat' | 'settings'>>): Promise<void> {
  const { error } = await db().from('biz_orgs').update(patch).eq('id', id);
  if (error) fail(error);
}

const PERSON_COLS = 'id, org_id, user_id, name, email, role, job_title, department, skills, availability, active';

export async function listPeople(orgId: string): Promise<Person[]> {
  const { data, error } = await db().from('biz_people').select(PERSON_COLS).eq('org_id', orgId).order('created_at');
  if (error) fail(error);
  return (data || []) as Person[];
}

export type PersonInput = Pick<Person, 'name' | 'email' | 'role' | 'job_title' | 'department' | 'skills' | 'availability'>;

export async function addPerson(orgId: string, p: PersonInput): Promise<void> {
  const { error } = await db().from('biz_people').insert({ ...p, email: p.email?.trim().toLowerCase() || null, org_id: orgId });
  if (error) fail(error);
}

export async function updatePerson(id: string, p: Partial<PersonInput & { active: boolean }>): Promise<void> {
  const patch = 'email' in p ? { ...p, email: p.email?.trim().toLowerCase() || null } : p;
  const { error } = await db().from('biz_people').update(patch).eq('id', id);
  if (error) fail(error);
}

export async function removePerson(id: string): Promise<void> {
  const { error } = await db().from('biz_people').delete().eq('id', id);
  if (error) fail(error);
}

export async function listAudit(orgId: string, limit = 40): Promise<AuditEntry[]> {
  const { data, error } = await db().from('biz_audit_log')
    .select('id, at, actor_user, actor_kind, table_name, action, before, after')
    .eq('org_id', orgId).order('at', { ascending: false }).limit(limit);
  if (error) fail(error);
  return (data || []) as AuditEntry[];
}

// "Seba ha aggiunto Marco al team": a readable line for each entry of the activity log.
const AREA: Record<string, { label: string; what: string }> = {
  biz_orgs: { label: 'Azienda', what: "l'azienda" },
  biz_people: { label: 'Team', what: 'una persona' },
  biz_counterparties: { label: 'Clienti', what: 'un cliente' },
  biz_contacts: { label: 'Clienti', what: 'un referente' },
  biz_contracts: { label: 'Clienti', what: 'un contratto' },
  biz_contract_terms: { label: 'Clienti', what: 'un obbligo o diritto' },
  biz_projects: { label: 'Progetti', what: 'un progetto' },
  biz_project_members: { label: 'Progetti', what: 'un membro di progetto' },
  biz_tasks: { label: 'Progetti', what: 'un compito' },
};
export function describeAudit(e: AuditEntry, people: Person[]): { area: string; text: string } {
  const area = AREA[e.table_name] || { label: 'Altro', what: 'un elemento' };
  const row = e.after || e.before || {};
  const name = (row.name || row.title || row.description) as string | undefined;
  const who = e.actor_kind === 'ai' ? "L'AI" : e.actor_kind === 'automazione' ? "Un'automazione"
    : people.find(p => p.user_id && p.user_id === e.actor_user)?.name || 'Qualcuno';
  const verb = e.action === 'crea' ? 'ha aggiunto' : e.action === 'modifica' ? 'ha modificato' : 'ha eliminato';
  const target = name ? `“${String(name).slice(0, 60)}”` : area.what;
  return { area: area.label, text: `${who} ${verb} ${target}` };
}

// ───────────── Clienti, contratti, obblighi e diritti ─────────────

export type CpKind = 'cliente' | 'fornitore' | 'partner';
export const KIND_LABEL: Record<CpKind, string> = { cliente: 'Cliente', fornitore: 'Fornitore', partner: 'Partner' };

export interface Counterparty {
  id: string;
  org_id: string;
  kind: CpKind;
  name: string;
  legal_name: string | null;
  vat: string | null;
  tax_code: string | null;
  address: string | null;
  pec: string | null;
  sdi_code: string | null;
  website: string | null;
  sector: string | null;
  importance: 'A' | 'B' | 'C';
  payment_terms_days: number | null;
  notes: string | null;
}
export type CounterpartyInput = Omit<Counterparty, 'id' | 'org_id'>;

export interface Contact { id: string; org_id: string; counterparty_id: string; name: string; role: string | null; email: string | null; phone: string | null }
export type ContactInput = Pick<Contact, 'name' | 'role' | 'email' | 'phone'>;

export interface Contract {
  id: string;
  org_id: string;
  counterparty_id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  auto_renew: boolean;
  notice_days: number | null;
  value: number | null;
  currency: string;
  status: 'bozza' | 'attivo' | 'scaduto' | 'disdetto';
  notes: string | null;
}
export type ContractInput = Omit<Contract, 'id' | 'org_id' | 'counterparty_id' | 'currency'>;

export type EveryUnit = 'giorni' | 'settimane' | 'mesi' | 'anni';
export interface ContractTerm {
  id: string;
  org_id: string;
  contract_id: string;
  party: 'noi' | 'controparte';
  kind: 'obbligo' | 'diritto';
  description: string;
  every_n: number | null;
  every_unit: EveryUnit | null;
  due_date: string | null;
  quota: number | null;
  used: number;
  owner_person_id: string | null;
  source_excerpt: string | null;
}
export type TermInput = Omit<ContractTerm, 'id' | 'org_id' | 'contract_id'>;

const orderByName = { ascending: true };

export async function listCounterparties(orgId: string): Promise<Counterparty[]> {
  const { data, error } = await db().from('biz_counterparties').select('*').eq('org_id', orgId).order('name', orderByName);
  if (error) fail(error);
  return (data || []) as Counterparty[];
}
export async function saveCounterparty(orgId: string, input: CounterpartyInput, id?: string): Promise<string> {
  if (id) {
    const { error } = await db().from('biz_counterparties').update(input).eq('id', id);
    if (error) fail(error);
    return id;
  }
  const { data, error } = await db().from('biz_counterparties').insert({ ...input, org_id: orgId }).select('id').single();
  if (error) fail(error);
  return (data as { id: string }).id;
}
export async function deleteCounterparty(id: string): Promise<void> {
  const { error } = await db().from('biz_counterparties').delete().eq('id', id);
  if (error) fail(error.code === '23503' ? { code: 'P0001', message: 'Ci sono progetti collegati a questo cliente: scollegali prima di eliminarlo.' } : error);
}

export async function listContacts(counterpartyId: string): Promise<Contact[]> {
  const { data, error } = await db().from('biz_contacts').select('*').eq('counterparty_id', counterpartyId).order('created_at');
  if (error) fail(error);
  return (data || []) as Contact[];
}
export async function saveContact(orgId: string, counterpartyId: string, input: ContactInput, id?: string): Promise<string> {
  return upsertRow('biz_contacts', id ? input : { ...input, org_id: orgId, counterparty_id: counterpartyId }, id);
}
export async function deleteContact(id: string): Promise<void> {
  const { error } = await db().from('biz_contacts').delete().eq('id', id);
  if (error) fail(error);
}

export async function listContracts(orgId: string, counterpartyId?: string): Promise<Contract[]> {
  let q = db().from('biz_contracts').select('*').eq('org_id', orgId);
  if (counterpartyId) q = q.eq('counterparty_id', counterpartyId);
  const { data, error } = await q.order('start_date', { ascending: false, nullsFirst: false });
  if (error) fail(error);
  return (data || []) as Contract[];
}
export async function saveContract(orgId: string, counterpartyId: string, input: ContractInput, id?: string): Promise<string> {
  return upsertRow('biz_contracts', id ? input : { ...input, org_id: orgId, counterparty_id: counterpartyId }, id);
}
export async function deleteContract(id: string): Promise<void> {
  const { error } = await db().from('biz_contracts').delete().eq('id', id);
  if (error) fail(error);
}

export async function listTerms(orgId: string): Promise<ContractTerm[]> {
  const { data, error } = await db().from('biz_contract_terms').select('*').eq('org_id', orgId).order('created_at');
  if (error) fail(error);
  return (data || []) as ContractTerm[];
}
export async function saveTerm(orgId: string, contractId: string, input: TermInput, id?: string): Promise<string> {
  return upsertRow('biz_contract_terms', id ? input : { ...input, org_id: orgId, contract_id: contractId }, id);
}
export async function setTermUsed(id: string, used: number): Promise<void> {
  const { error } = await db().from('biz_contract_terms').update({ used: Math.max(0, used) }).eq('id', id);
  if (error) fail(error);
}
export async function deleteTerm(id: string): Promise<void> {
  const { error } = await db().from('biz_contract_terms').delete().eq('id', id);
  if (error) fail(error);
}

// Next date an obligation or right falls due: the fixed date, or the next repetition counted
// from the start of the contract (never before today). null when it has no dates.
export function nextDue(term: ContractTerm, contract: Contract | undefined, today: string): string | null {
  if (!term.every_n || !term.every_unit) return term.due_date;
  const startKey = term.due_date || contract?.start_date;
  if (!startKey) return null;
  const d = new Date(startKey + 'T00:00:00');
  for (let i = 0; i < 2000 && toKey(d) < today; i++) {
    if (term.every_unit === 'giorni') d.setDate(d.getDate() + term.every_n);
    else if (term.every_unit === 'settimane') d.setDate(d.getDate() + 7 * term.every_n);
    else if (term.every_unit === 'mesi') d.setMonth(d.getMonth() + term.every_n);
    else d.setFullYear(d.getFullYear() + term.every_n);
  }
  const key = toKey(d);
  if (contract?.end_date && key > contract.end_date) return null;
  return key;
}
function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function everyLabel(n: number | null, unit: EveryUnit | null): string {
  if (!n || !unit) return '';
  const one: Record<EveryUnit, string> = { giorni: 'ogni giorno', settimane: 'ogni settimana', mesi: 'ogni mese', anni: 'ogni anno' };
  return n === 1 ? one[unit] : `ogni ${n} ${unit}`;
}

// ───────────── Progetti e compiti ─────────────

export type ProjectStatus = 'attivo' | 'in_pausa' | 'completato' | 'annullato';
export const STATUS_LABEL: Record<ProjectStatus, string> = { attivo: 'Attivo', in_pausa: 'In pausa', completato: 'Completato', annullato: 'Annullato' };

export interface Project {
  id: string;
  org_id: string;
  name: string;
  objective: string | null;
  counterparty_id: string | null;
  owner_person_id: string | null;
  start_date: string | null;
  deadline: string | null;
  budget: number | null;
  status: ProjectStatus;
}
export type ProjectInput = Omit<Project, 'id' | 'org_id'>;

export interface ProjectSees { tasks: boolean; documents: boolean; client: boolean; finance: boolean }
export interface ProjectMember { project_id: string; person_id: string; project_role: string | null; sees: ProjectSees }

export type TaskStatus = 'da_fare' | 'in_corso' | 'fatto';
export interface Task {
  id: string;
  org_id: string;
  project_id: string | null;
  title: string;
  notes: string | null;
  assignee_person_id: string | null;
  due_date: string | null;
  estimate_minutes: number | null;
  importance: number;
  status: TaskStatus;
  completed_at: string | null;
}
export type TaskInput = Pick<Task, 'title' | 'notes' | 'assignee_person_id' | 'due_date' | 'estimate_minutes' | 'importance' | 'project_id'>;

export async function listProjects(orgId: string): Promise<Project[]> {
  const { data, error } = await db().from('biz_projects').select('*').eq('org_id', orgId).order('deadline', { ascending: true, nullsFirst: false });
  if (error) fail(error);
  return (data || []) as Project[];
}
export async function saveProject(orgId: string, input: ProjectInput, id?: string): Promise<string> {
  if (id) {
    const { error } = await db().from('biz_projects').update(input).eq('id', id);
    if (error) fail(error);
    return id;
  }
  const { data, error } = await db().from('biz_projects').insert({ ...input, org_id: orgId }).select('id').single();
  if (error) fail(error);
  return (data as { id: string }).id;
}
export async function deleteProject(id: string): Promise<void> {
  const { error } = await db().from('biz_projects').delete().eq('id', id);
  if (error) fail(error);
}

export async function listMembers(projectId: string): Promise<ProjectMember[]> {
  const { data, error } = await db().from('biz_project_members').select('project_id, person_id, project_role, sees').eq('project_id', projectId);
  if (error) fail(error);
  return (data || []) as ProjectMember[];
}
export async function addMember(orgId: string, projectId: string, personId: string): Promise<void> {
  const { error } = await db().from('biz_project_members').insert({ org_id: orgId, project_id: projectId, person_id: personId });
  if (error) fail(error);
}
export async function updateMember(projectId: string, personId: string, patch: Partial<Pick<ProjectMember, 'sees' | 'project_role'>>): Promise<void> {
  const { error } = await db().from('biz_project_members').update(patch).eq('project_id', projectId).eq('person_id', personId);
  if (error) fail(error);
}
export async function removeMember(projectId: string, personId: string): Promise<void> {
  const { error } = await db().from('biz_project_members').delete().eq('project_id', projectId).eq('person_id', personId);
  if (error) fail(error);
}

export async function listTasks(orgId: string): Promise<Task[]> {
  const { data, error } = await db().from('biz_tasks').select('id, org_id, project_id, title, notes, assignee_person_id, due_date, estimate_minutes, importance, status, completed_at')
    .eq('org_id', orgId).order('due_date', { ascending: true, nullsFirst: false });
  if (error) fail(error);
  return (data || []) as Task[];
}
export async function saveTask(orgId: string, input: TaskInput, id?: string): Promise<string> {
  return upsertRow('biz_tasks', id ? input : { ...input, org_id: orgId }, id);
}
export async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const { error } = await db().from('biz_tasks').update({ status, completed_at: status === 'fatto' ? new Date().toISOString() : null }).eq('id', id);
  if (error) fail(error);
}
export async function deleteTask(id: string): Promise<void> {
  const { error } = await db().from('biz_tasks').delete().eq('id', id);
  if (error) fail(error);
}

// Priority of an open task (higher = sooner): deadline, importance, project deadline.
// Explainable on purpose: every point comes from a rule that can be said in words.
export function taskPriority(t: Task, today: string, project?: Project): { score: number; why: string } {
  if (t.status === 'fatto') return { score: -1, why: 'Fatto' };
  let score = t.importance * 10;
  let why = t.importance >= 4 ? 'importante' : '';
  if (t.due_date) {
    const days = Math.round((Date.parse(t.due_date) - Date.parse(today)) / 86400000);
    if (days < 0) { score += 60; why = `in ritardo di ${-days} ${-days === 1 ? 'giorno' : 'giorni'}`; }
    else if (days === 0) { score += 45; why = 'scade oggi'; }
    else if (days === 1) { score += 35; why = 'scade domani'; }
    else if (days <= 7) { score += 25 - days * 2; why = why || `scade tra ${days} giorni`; }
  }
  if (project?.deadline && project.status === 'attivo') {
    const pd = Math.round((Date.parse(project.deadline) - Date.parse(today)) / 86400000);
    if (pd >= 0 && pd <= 7) { score += 10; why = why || 'il progetto scade a breve'; }
  }
  if (t.status === 'in_corso') score += 5;
  return { score, why: why || 'da fare' };
}

// Project health 0-100 with the reasons, from simple rules (no AI): tasks late, deadline close
// with work left, nobody responsible.
export function projectHealth(p: Project, tasks: Task[], today: string): { score: number; notes: string[] } {
  if (p.status !== 'attivo') return { score: p.status === 'completato' ? 100 : 0, notes: [STATUS_LABEL[p.status]] };
  const open = tasks.filter(t => t.status !== 'fatto');
  const done = tasks.length - open.length;
  const late = open.filter(t => t.due_date && t.due_date < today).length;
  const notes: string[] = [];
  let score = 100;
  if (late) { score -= Math.min(45, late * 15); notes.push(`${late} ${late === 1 ? 'compito in ritardo' : 'compiti in ritardo'}`); }
  if (p.deadline) {
    const days = Math.round((Date.parse(p.deadline) - Date.parse(today)) / 86400000);
    const progress = tasks.length ? done / tasks.length : 0;
    if (days < 0) { score -= 40; notes.push(`scadenza superata di ${-days} giorni`); }
    else if (days <= 7 && progress < 0.7 && tasks.length) { score -= 25; notes.push(`scade tra ${days} giorni con il ${Math.round(progress * 100)}% fatto`); }
  }
  if (!p.owner_person_id) { score -= 10; notes.push('nessun capo progetto'); }
  if (open.some(t => !t.assignee_person_id)) { score -= 5; notes.push('compiti senza responsabile'); }
  if (!notes.length) notes.push(tasks.length ? 'tutto in linea' : 'nessun compito ancora');
  return { score: Math.max(0, Math.min(100, score)), notes };
}
