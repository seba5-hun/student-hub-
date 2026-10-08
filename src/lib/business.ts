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
  settings: { hidden_sections?: string[] };
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
