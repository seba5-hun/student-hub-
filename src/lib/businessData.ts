// MYND Business, part 2: agenda, documents, invoices, bank movements, Coach proposals,
// automations and demo data (supabase/business_2.sql).
import { supabase } from './supabase';
import { BusinessSetupError, Counterparty, Contract, ContractTerm, Project, Task, Person, listCounterparties, listContracts, listTerms, listProjects, listTasks } from './business';

function db() {
  if (!supabase) throw new Error('Supabase non configurato');
  return supabase;
}
type PgError = { code?: string; message?: string } | null;
function fail(error: PgError): never {
  const code = error?.code || '';
  if (code === 'PGRST205' || code === '42P01' || code === 'PGRST202' || code === '42883' || code === '42703') {
    throw new BusinessSetupError('Manca la seconda parte del database di Business (business_2.sql).');
  }
  if (code === '42501') throw new Error(error?.message?.includes('titolare') ? error.message : 'Non hai il permesso per questa modifica.');
  throw new Error(error?.message || 'Qualcosa non ha funzionato. Riprova.');
}

// ───────────── Agenda ─────────────
export type EventKind = 'riunione' | 'appuntamento' | 'consegna' | 'scadenza' | 'pagamento' | 'altro';
export const EVENT_LABEL: Record<EventKind, string> = { riunione: 'Riunione', appuntamento: 'Appuntamento', consegna: 'Consegna', scadenza: 'Scadenza', pagamento: 'Pagamento', altro: 'Altro' };
export interface BizEvent {
  id: string; org_id: string; title: string; kind: EventKind; starts_at: string; ends_at: string | null; all_day: boolean;
  location: string | null; counterparty_id: string | null; project_id: string | null; person_ids: string[]; notes: string | null;
  source: 'manuale' | 'ai' | 'automazione';
}
export type EventInput = Omit<BizEvent, 'id' | 'org_id' | 'source'> & { source?: BizEvent['source'] };

export async function listEvents(orgId: string, fromIso?: string): Promise<BizEvent[]> {
  let q = db().from('biz_events').select('id, org_id, title, kind, starts_at, ends_at, all_day, location, counterparty_id, project_id, person_ids, notes, source').eq('org_id', orgId);
  if (fromIso) q = q.gte('starts_at', fromIso);
  const { data, error } = await q.order('starts_at').limit(500);
  if (error) fail(error);
  return (data || []) as BizEvent[];
}
export async function saveEvent(orgId: string, input: EventInput, id?: string): Promise<string> {
  if (id) {
    const { error } = await db().from('biz_events').update(input).eq('id', id);
    if (error) fail(error);
    return id;
  }
  const { data, error } = await db().from('biz_events').insert({ ...input, org_id: orgId }).select('id').single();
  if (error) fail(error);
  return (data as { id: string }).id;
}
export async function deleteEvent(id: string): Promise<void> {
  const { error } = await db().from('biz_events').delete().eq('id', id);
  if (error) fail(error);
}

// ───────────── Documenti ─────────────
export type DocKind = 'contratto' | 'fattura' | 'offerta' | 'preventivo' | 'procedura' | 'email' | 'altro';
export const DOC_LABEL: Record<DocKind, string> = { contratto: 'Contratto', fattura: 'Fattura', offerta: 'Offerta', preventivo: 'Preventivo', procedura: 'Procedura', email: 'Email', altro: 'Altro' };
export interface BizDocument {
  id: string; org_id: string; name: string; kind: DocKind; storage_path: string | null; mime: string | null; size_bytes: number | null;
  summary: string | null; counterparty_id: string | null; project_id: string | null; contract_id: string | null; confidential: boolean; created_at: string;
  text_content?: string | null;
}
const DOC_COLS = 'id, org_id, name, kind, storage_path, mime, size_bytes, summary, counterparty_id, project_id, contract_id, confidential, created_at';

export async function listDocuments(orgId: string, withText = false): Promise<BizDocument[]> {
  const { data, error } = await db().from('biz_documents').select(withText ? `${DOC_COLS}, text_content` : DOC_COLS).eq('org_id', orgId).order('created_at', { ascending: false });
  if (error) fail(error);
  return (data || []) as unknown as BizDocument[];
}
export async function uploadDocument(orgId: string, file: File, meta: Partial<BizDocument> & { text_content?: string | null }): Promise<string> {
  const safe = file.name.replace(/[^\w.\- ]+/g, '_').slice(-80);
  const path = `${orgId}/${Date.now()}-${safe}`;
  const up = await db().storage.from('business').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (up.error) throw new Error(up.error.message.includes('row-level') ? 'Non hai il permesso di caricare file.' : `Caricamento non riuscito: ${up.error.message}`);
  const { data, error } = await db().from('biz_documents').insert({
    org_id: orgId, name: meta.name || file.name, kind: meta.kind || 'altro', storage_path: path, mime: file.type || null, size_bytes: file.size,
    text_content: meta.text_content || null, summary: meta.summary || null, counterparty_id: meta.counterparty_id || null,
    project_id: meta.project_id || null, contract_id: meta.contract_id || null, confidential: !!meta.confidential,
  }).select('id').single();
  if (error) fail(error);
  return (data as { id: string }).id;
}
export async function updateDocument(id: string, patch: Partial<Pick<BizDocument, 'name' | 'kind' | 'summary' | 'counterparty_id' | 'project_id' | 'contract_id' | 'confidential'>> & { text_content?: string | null }): Promise<void> {
  const { error } = await db().from('biz_documents').update(patch).eq('id', id);
  if (error) fail(error);
}
export async function deleteDocument(doc: BizDocument): Promise<void> {
  if (doc.storage_path) await db().storage.from('business').remove([doc.storage_path]);
  const { error } = await db().from('biz_documents').delete().eq('id', doc.id);
  if (error) fail(error);
}
export async function documentUrl(path: string): Promise<string> {
  const { data, error } = await db().storage.from('business').createSignedUrl(path, 300);
  if (error || !data) throw new Error('File non disponibile.');
  return data.signedUrl;
}

// ───────────── Finanza ─────────────
export interface Invoice {
  id: string; org_id: string; direction: 'emessa' | 'ricevuta'; number: string | null; issue_date: string | null; due_date: string | null;
  counterparty_id: string | null; counterparty_name: string | null; project_id: string | null; taxable: number | null; vat: number | null; total: number;
  status: 'aperta' | 'pagata' | 'annullata'; paid_at: string | null; source: 'manuale' | 'xml' | 'ai'; document_id: string | null; notes: string | null;
}
export type InvoiceInput = Omit<Invoice, 'id' | 'org_id'>;
export interface Transaction { id: string; org_id: string; date: string; amount: number; description: string | null; category: string | null; invoice_id: string | null }

export async function listInvoices(orgId: string): Promise<Invoice[]> {
  const { data, error } = await db().from('biz_invoices').select('*').eq('org_id', orgId).order('due_date', { ascending: true, nullsFirst: false });
  if (error) fail(error);
  return (data || []).map(x => ({ ...x, total: Number(x.total), taxable: x.taxable == null ? null : Number(x.taxable), vat: x.vat == null ? null : Number(x.vat) })) as Invoice[];
}
export async function saveInvoice(orgId: string, input: Partial<InvoiceInput>, id?: string): Promise<string> {
  if (id) {
    const { error } = await db().from('biz_invoices').update(input).eq('id', id);
    if (error) fail(error);
    return id;
  }
  const { data, error } = await db().from('biz_invoices').insert({ ...input, org_id: orgId }).select('id').single();
  if (error) fail(error);
  return (data as { id: string }).id;
}
export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await db().from('biz_invoices').delete().eq('id', id);
  if (error) fail(error);
}
export async function listTransactions(orgId: string): Promise<Transaction[]> {
  const { data, error } = await db().from('biz_transactions').select('id, org_id, date, amount, description, category, invoice_id').eq('org_id', orgId).order('date', { ascending: false }).limit(1000);
  if (error) fail(error);
  return (data || []).map(x => ({ ...x, amount: Number(x.amount) })) as Transaction[];
}
export async function addTransactions(orgId: string, rows: Omit<Transaction, 'id' | 'org_id'>[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db().from('biz_transactions').insert(rows.slice(i, i + 200).map(r => ({ ...r, org_id: orgId })));
    if (error) fail(error);
  }
}
export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await db().from('biz_transactions').delete().eq('id', id);
  if (error) fail(error);
}

// ───────────── Proposte del Coach ─────────────
export interface PlanAction {
  tipo: 'cliente' | 'referente' | 'contratto' | 'termine' | 'progetto' | 'compito' | 'evento' | 'fattura' | 'modifica_progetto' | 'modifica_compito';
  rif?: string;              // reference used by later actions of the same plan (e.g. "c1")
  cliente?: string;          // ref or existing id or existing name
  contratto?: string;
  progetto?: string;
  compito?: string;
  dati: Record<string, unknown>;
  on?: boolean;              // the user can untick an action before applying
}
export interface AppliedRow { table: string; id: string; kind: 'creato' | 'modificato'; before?: Record<string, unknown> }
export interface Proposal {
  id: string; org_id: string; title: string; summary: string | null; actions: PlanAction[]; source: 'coach' | 'documento' | 'email' | 'automazione';
  source_text: string | null; status: 'in_attesa' | 'applicata' | 'scartata' | 'annullata'; applied: AppliedRow[]; created_at: string;
}
export async function listProposals(orgId: string, status?: Proposal['status']): Promise<Proposal[]> {
  let q = db().from('biz_proposals').select('*').eq('org_id', orgId);
  if (status) q = q.eq('status', status);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(100);
  if (error) fail(error);
  return (data || []) as Proposal[];
}
export async function createProposal(orgId: string, p: Pick<Proposal, 'title' | 'summary' | 'actions' | 'source'> & { source_text?: string | null }): Promise<string> {
  const { data, error } = await db().from('biz_proposals').insert({ org_id: orgId, ...p }).select('id').single();
  if (error) fail(error);
  return (data as { id: string }).id;
}
export async function updateProposal(id: string, patch: Partial<Pick<Proposal, 'status' | 'applied' | 'actions'>>): Promise<void> {
  const extra = patch.status && patch.status !== 'in_attesa' ? { decided_at: new Date().toISOString() } : {};
  const { error } = await db().from('biz_proposals').update({ ...patch, ...extra }).eq('id', id);
  if (error) fail(error);
}
export async function tagAI(orgId: string, rowIds: string[]): Promise<void> {
  if (!rowIds.length) return;
  await db().rpc('biz_tag_ai', { p_org: orgId, p_row_ids: rowIds });
}

// ───────────── Automazioni ─────────────
export interface Automation { id: string; org_id: string; template: string; name: string; active: boolean; config: Record<string, unknown>; last_run_at: string | null }
export interface AutomationRun { id: number; org_id: string; automation_id: string | null; at: string; summary: string }
export async function listAutomations(orgId: string): Promise<Automation[]> {
  const { data, error } = await db().from('biz_automations').select('*').eq('org_id', orgId).order('created_at');
  if (error) fail(error);
  return (data || []) as Automation[];
}
export async function upsertAutomation(orgId: string, template: string, name: string, active: boolean): Promise<void> {
  const { error } = await db().from('biz_automations').upsert({ org_id: orgId, template, name, active }, { onConflict: 'org_id,template' });
  if (error) fail(error);
}
export async function markAutomationRun(id: string): Promise<void> {
  await db().from('biz_automations').update({ last_run_at: new Date().toISOString() }).eq('id', id);
}
export async function listRuns(orgId: string): Promise<AutomationRun[]> {
  const { data, error } = await db().from('biz_automation_runs').select('id, org_id, automation_id, at, summary').eq('org_id', orgId).order('at', { ascending: false }).limit(50);
  if (error) fail(error);
  return (data || []) as AutomationRun[];
}
export async function addRun(orgId: string, automationId: string, summary: string, details: Record<string, unknown> = {}): Promise<void> {
  await db().from('biz_automation_runs').insert({ org_id: orgId, automation_id: automationId, summary, details });
}

// ───────────── Dati di prova ─────────────
export async function seedDemo(orgId: string): Promise<void> {
  const { error } = await db().rpc('biz_seed_demo', { p_org: orgId });
  if (error) fail(error);
}
export async function clearDemo(orgId: string): Promise<void> {
  const { error } = await db().rpc('biz_clear_demo', { p_org: orgId });
  if (error) fail(error);
}

// ───────────── Tutto in una volta (Oggi, Agenda, Insights, Coach) ─────────────
export interface BizSnapshot {
  clients: Counterparty[]; contracts: Contract[]; terms: ContractTerm[]; projects: Project[]; tasks: Task[];
  events: BizEvent[]; invoices: Invoice[]; transactions: Transaction[]; documents: BizDocument[]; proposals: Proposal[];
  people: Person[]; part2: boolean;
}
const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => { try { return await p; } catch (err) { if (err instanceof BusinessSetupError) throw err; return fallback; } };

// Loads what the person can see (the database filters by role). Finance is read only by those
// who can see it; part2 is false when business_2.sql has not been run yet.
export async function loadSnapshot(orgId: string, people: Person[], canFinance: boolean, canContracts: boolean): Promise<BizSnapshot> {
  const [clients, contracts, terms, projects, tasks] = await Promise.all([
    safe(listCounterparties(orgId), []), canContracts ? safe(listContracts(orgId), []) : [], canContracts ? safe(listTerms(orgId), []) : [],
    safe(listProjects(orgId), []), safe(listTasks(orgId), []),
  ]);
  let part2 = true;
  let events: BizEvent[] = [], invoices: Invoice[] = [], transactions: Transaction[] = [], documents: BizDocument[] = [], proposals: Proposal[] = [];
  try {
    [events, documents, proposals] = await Promise.all([
      listEvents(orgId, new Date(Date.now() - 31 * 86400000).toISOString()), listDocuments(orgId), listProposals(orgId, 'in_attesa'),
    ]);
    if (canFinance) [invoices, transactions] = await Promise.all([listInvoices(orgId), listTransactions(orgId)]);
  } catch (err) {
    if (err instanceof BusinessSetupError) part2 = false; else throw err;
  }
  return { clients, contracts, terms, projects, tasks, events, invoices, transactions, documents, proposals, people, part2 };
}
