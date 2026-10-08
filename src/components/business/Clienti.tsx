import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, Mail, Phone, FileSignature, Users, FolderKanban, AlertTriangle, Minus, Sparkles } from 'lucide-react';
import {
  BizRole, Person, Counterparty, CounterpartyInput, CpKind, KIND_LABEL, Contact, Contract, ContractTerm, EveryUnit, Project, STATUS_LABEL,
  listCounterparties, saveCounterparty, deleteCounterparty, listContacts, saveContact, deleteContact, listContracts, saveContract, deleteContract,
  listTerms, saveTerm, deleteTerm, setTermUsed, listProjects, nextDue, everyLabel,
} from '../../lib/business';
import { toDateKey } from '../../lib/store';
import { useDialog } from '../Dialog';
import { Sheet, TextField, TextArea, SelectField, ErrorNote, PageTitle, BackButton, Chip, Empty, Label, Switch, shortDate } from './ui';

interface Props { orgId: string; people: Person[]; myRole: BizRole; onOpenProject: (id: string) => void; focusId?: string | null; onFocusUsed?: () => void; onAskCoach?: () => void }

const KIND_PLURAL: Record<CpKind, string> = { cliente: 'Clienti', partner: 'Partner', fornitore: 'Fornitori' };
const CLIENT_EDITORS: BizRole[] = ['titolare', 'admin', 'manager'];
const CONTRACT_READERS: BizRole[] = ['titolare', 'admin', 'manager', 'finanza'];
const money = (v: number | null) => (v == null ? '' : v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export default function Clienti({ orgId, people, myRole, onOpenProject, focusId, onFocusUsed, onAskCoach }: Props) {
  const dialog = useDialog();
  const canEdit = CLIENT_EDITORS.includes(myRole);
  const canSeeContracts = CONTRACT_READERS.includes(myRole);
  const [list, setList] = useState<Counterparty[] | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [terms, setTerms] = useState<ContractTerm[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<CpKind | 'tutti'>('tutti');
  const [openId, setOpenId] = useState<string | null>(focusId || null);
  useEffect(() => { if (focusId) { setOpenId(focusId); onFocusUsed?.(); } }, [focusId, onFocusUsed]);
  const [editing, setEditing] = useState<Counterparty | 'new' | null>(null);
  const today = toDateKey(new Date());

  const load = useCallback(async () => {
    try {
      const [cps, ctrs, tms, prjs] = await Promise.all([
        listCounterparties(orgId),
        canSeeContracts ? listContracts(orgId) : Promise.resolve([]),
        canSeeContracts ? listTerms(orgId) : Promise.resolve([]),
        listProjects(orgId),
      ]);
      setList(cps); setContracts(ctrs); setTerms(tms); setProjects(prjs); setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setList(l => l || []);
    }
  }, [orgId, canSeeContracts]);
  useEffect(() => { load(); }, [load]);

  // The next thing due for each client: the closest obligation or right of its active contracts.
  const nextByCp = useMemo(() => {
    const out: Record<string, { term: ContractTerm; date: string }> = {};
    for (const t of terms) {
      const c = contracts.find(x => x.id === t.contract_id);
      if (!c || c.status !== 'attivo') continue;
      const date = nextDue(t, c, today);
      if (!date) continue;
      const prev = out[c.counterparty_id];
      if (!prev || date < prev.date) out[c.counterparty_id] = { term: t, date };
    }
    return out;
  }, [terms, contracts, today]);

  const open = list?.find(c => c.id === openId) || null;
  if (open) {
    return (
      <ClientDetail cp={open} orgId={orgId} people={people} canEdit={canEdit} canSeeContracts={canSeeContracts} today={today}
        contracts={contracts.filter(c => c.counterparty_id === open.id)} terms={terms}
        projects={projects.filter(p => p.counterparty_id === open.id)}
        onBack={() => setOpenId(null)} onChanged={load} onEdit={() => setEditing(open)} onOpenProject={onOpenProject}
        onDelete={async () => {
          const ok = await dialog.confirm({ title: `Eliminare ${open.name}?`, message: 'Spariscono anche referenti, contratti, obblighi e diritti.', confirmLabel: 'Elimina', danger: true });
          if (!ok) return;
          try { await deleteCounterparty(open.id); setOpenId(null); load(); }
          catch (err) { dialog.alert({ title: 'Non è stato possibile', message: err instanceof Error ? err.message : String(err) }); }
        }}
        sheet={editing && <CounterpartySheet orgId={orgId} cp={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      />
    );
  }

  const kinds = (['cliente', 'partner', 'fornitore'] as CpKind[]).filter(k => list?.some(c => c.kind === k));
  const shown = (list || []).filter(c => filter === 'tutti' || c.kind === filter);

  return (
    <div className="space-y-6">
      <PageTitle title="Clienti." lead="Clienti, partner e fornitori: contratti, obblighi e diritti, e cosa scade."
        action={canEdit && (
          <div className="flex gap-2 flex-shrink-0">
            {onAskCoach && <button onClick={onAskCoach} className="btn-primary h-11 px-4 inline-flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Con il Coach</button>}
            <button onClick={() => setEditing('new')} aria-label="Nuovo a mano" className="btn-secondary h-11 px-4 inline-flex items-center gap-1.5"><Plus className="w-4 h-4" /><span className="hidden sm:inline"> A mano</span></button>
          </div>
        )} />
      {canEdit && onAskCoach && <p className="text-sm -mt-3" style={{ color: 'var(--text-subtle)' }}>Scrivi al Coach nome, referente e accordi (o allega il contratto): crea lui cliente, contratto, obblighi, scadenze e compiti.</p>}
      <ErrorNote text={error} />
      {kinds.length > 1 && (
        <div className="flex gap-1.5 flex-wrap" role="tablist" aria-label="Filtro">
          {(['tutti', ...kinds] as const).map(k => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
              className={`h-9 px-4 rounded-full text-sm font-medium ${filter === k ? 'glass-lens' : 'glass-card !rounded-full'}`}
              style={{ color: filter === k ? 'var(--brand-ring)' : 'var(--text-muted)' }}>
              {k === 'tutti' ? 'Tutti' : KIND_PLURAL[k]}
            </button>
          ))}
        </div>
      )}
      {list === null ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-subtle)' }} /></div>
        : shown.length === 0 ? (
          <Empty>{canEdit ? 'Nessun cliente ancora. Premi “Nuovo” per aggiungere il primo, per esempio un partner o uno sponsor.' : 'Nessun cliente ancora.'}</Empty>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:gap-4 md:grid-cols-2">
            {shown.map(c => {
              const next = nextByCp[c.id];
              const nContracts = contracts.filter(x => x.counterparty_id === c.id && x.status === 'attivo').length;
              const nProjects = projects.filter(p => p.counterparty_id === c.id && p.status === 'attivo').length;
              return (
                <button key={c.id} onClick={() => setOpenId(c.id)} className="glass-card p-5 text-left flex flex-col gap-3 hover:brightness-110 transition">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[17px] font-semibold truncate" style={{ color: 'var(--text)' }}>{c.name}</p>
                      <p className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>{c.sector || c.legal_name || KIND_LABEL[c.kind]}</p>
                    </div>
                    <Chip>{KIND_LABEL[c.kind]}</Chip>
                    <Chip strong={c.importance === 'A'}>{c.importance}</Chip>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                    {[canSeeContracts && `${nContracts} ${nContracts === 1 ? 'contratto attivo' : 'contratti attivi'}`, `${nProjects} ${nProjects === 1 ? 'progetto' : 'progetti'}`].filter(Boolean).join(' · ')}
                  </p>
                  {next && (
                    <div className="rounded-2xl px-3.5 py-2.5 text-sm flex items-center gap-2" style={{ background: 'var(--glass-well)' }}>
                      <span className="tabular font-semibold flex-shrink-0" style={{ color: daysBetween(today, next.date) <= 7 ? 'var(--brand-ring)' : 'var(--text)' }}>{shortDate(next.date)}</span>
                      <span className="truncate" style={{ color: 'var(--text-muted)' }}>{next.term.description}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      {editing && <CounterpartySheet orgId={orgId} cp={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={id => { setEditing(null); load(); if (editing === 'new') setOpenId(id); }} />}
    </div>
  );
}

// ───────────── Scheda del cliente ─────────────

function ClientDetail({ cp, orgId, people, canEdit, canSeeContracts, today, contracts, terms, projects, onBack, onChanged, onEdit, onDelete, onOpenProject, sheet }: {
  cp: Counterparty; orgId: string; people: Person[]; canEdit: boolean; canSeeContracts: boolean; today: string;
  contracts: Contract[]; terms: ContractTerm[]; projects: Project[];
  onBack: () => void; onChanged: () => void; onEdit: () => void; onDelete: () => void; onOpenProject: (id: string) => void; sheet: React.ReactNode;
}) {
  const dialog = useDialog();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSheet, setContactSheet] = useState<Contact | 'new' | null>(null);
  const [contractSheet, setContractSheet] = useState<Contract | 'new' | null>(null);
  const [termSheet, setTermSheet] = useState<{ contract: Contract; term: ContractTerm | null } | null>(null);
  const loadContacts = useCallback(() => { listContacts(cp.id).then(setContacts).catch(() => setContacts([])); }, [cp.id]);
  useEffect(() => { loadContacts(); }, [loadContacts]);

  const facts: [string, string | null][] = [
    ['Ragione sociale', cp.legal_name], ['Partita IVA', cp.vat], ['Codice fiscale', cp.tax_code], ['PEC', cp.pec], ['Codice SDI', cp.sdi_code],
    ['Indirizzo', cp.address], ['Sito', cp.website], ['Pagamenti', cp.payment_terms_days != null ? `a ${cp.payment_terms_days} giorni` : null],
  ];
  const run = async (fn: () => Promise<void>) => {
    try { await fn(); onChanged(); }
    catch (err) { dialog.alert({ title: 'Non è stato possibile', message: err instanceof Error ? err.message : String(err) }); }
  };

  return (
    <div className="space-y-6">
      <BackButton label="Clienti" onClick={onBack} />
      <PageTitle title={`${cp.name}.`} lead={[KIND_LABEL[cp.kind], cp.sector, `importanza ${cp.importance}`].filter(Boolean).join(' · ')}
        action={canEdit && (
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={onEdit} aria-label="Modifica" className="w-11 h-11 rounded-full glass-card !rounded-full flex items-center justify-center"><Pencil className="w-4 h-4" /></button>
            <button onClick={onDelete} aria-label="Elimina" className="w-11 h-11 rounded-full glass-card !rounded-full flex items-center justify-center" style={{ color: 'var(--danger)' }}><Trash2 className="w-4 h-4" /></button>
          </div>
        )} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:gap-4 md:grid-cols-2">
        <section className="glass-card p-5 space-y-3">
          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Anagrafica</h3>
          {facts.some(([, v]) => v) ? (
            <dl className="space-y-1.5 text-sm">
              {facts.filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="flex gap-3"><dt className="w-32 flex-shrink-0" style={{ color: 'var(--text-subtle)' }}>{k}</dt><dd className="min-w-0 break-words" style={{ color: 'var(--text)' }}>{v}</dd></div>
              ))}
            </dl>
          ) : <Empty>Nessun dato. {canEdit && 'Premi la matita per completarli.'}</Empty>}
          {cp.notes && <p className="text-sm whitespace-pre-line" style={{ color: 'var(--text-muted)' }}>{cp.notes}</p>}
        </section>

        <section className="glass-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <Users className="w-[18px] h-[18px]" strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} />
            <h3 className="text-[15px] font-semibold flex-1" style={{ color: 'var(--text)' }}>Referenti</h3>
            {canEdit && <button onClick={() => setContactSheet('new')} aria-label="Aggiungi referente" className="w-9 h-9 -mr-2 rounded-full flex items-center justify-center hover:bg-white/5"><Plus className="w-4 h-4" /></button>}
          </div>
          {contacts.length === 0 ? <Empty>Nessun referente.</Empty> : (
            <ul className="space-y-2">
              {contacts.map(c => (
                <li key={c.id} className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: 'var(--glass-well)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{c.name}{c.role && <span style={{ color: 'var(--text-subtle)' }}> · {c.role}</span>}</p>
                    <div className="flex gap-3 mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{c.email}</a>}
                      {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</a>}
                    </div>
                  </div>
                  {canEdit && <button onClick={() => setContactSheet(c)} aria-label={`Modifica ${c.name}`} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ color: 'var(--text-muted)' }}><Pencil className="w-3.5 h-3.5" /></button>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {canSeeContracts && (
        <section className="space-y-3">
          <div className="flex items-center gap-2.5">
            <FileSignature className="w-[18px] h-[18px]" strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} />
            <h3 className="text-[15px] font-semibold flex-1" style={{ color: 'var(--text)' }}>Contratti, obblighi e diritti</h3>
            {canEdit && <button onClick={() => setContractSheet('new')} className="btn-secondary h-10 px-4 text-sm inline-flex items-center gap-1.5"><Plus className="w-4 h-4" /> Contratto</button>}
          </div>
          {contracts.length === 0 ? <Empty>Nessun contratto. Aggiungilo per tenere traccia di cosa dovete fare voi e cosa spetta a {cp.name}.</Empty>
            : contracts.map(c => (
              <ContractCard key={c.id} contract={c} cpName={cp.name} terms={terms.filter(t => t.contract_id === c.id)} people={people} today={today} canEdit={canEdit}
                onEdit={() => setContractSheet(c)} onAddTerm={() => setTermSheet({ contract: c, term: null })} onEditTerm={t => setTermSheet({ contract: c, term: t })}
                onUse={(t, d) => run(() => setTermUsed(t.id, t.used + d))}
                onDelete={async () => {
                  if (await dialog.confirm({ title: `Eliminare “${c.title}”?`, message: 'Spariscono anche i suoi obblighi e diritti.', confirmLabel: 'Elimina', danger: true })) run(() => deleteContract(c.id));
                }} />
            ))}
        </section>
      )}

      <section className="glass-card p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <FolderKanban className="w-[18px] h-[18px]" strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} />
          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Progetti</h3>
        </div>
        {projects.length === 0 ? <Empty>Nessun progetto collegato. Lo colleghi quando crei un progetto.</Empty> : (
          <ul className="space-y-1.5">
            {projects.map(p => (
              <li key={p.id}>
                <button onClick={() => onOpenProject(p.id)} className="w-full rounded-2xl px-4 h-12 flex items-center gap-3 text-left hover:brightness-110" style={{ background: 'var(--glass-well)' }}>
                  <span className="flex-1 truncate text-sm font-medium" style={{ color: 'var(--text)' }}>{p.name}</span>
                  {p.deadline && <span className="text-xs tabular" style={{ color: 'var(--text-subtle)' }}>{shortDate(p.deadline)}</span>}
                  <Chip>{STATUS_LABEL[p.status]}</Chip>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sheet}
      {contactSheet && (
        <ContactSheet contact={contactSheet === 'new' ? null : contactSheet} onClose={() => setContactSheet(null)}
          onSave={async input => { await saveContact(orgId, cp.id, input, contactSheet === 'new' ? undefined : contactSheet.id); setContactSheet(null); loadContacts(); }}
          onDelete={contactSheet !== 'new' ? async () => { await deleteContact(contactSheet.id); setContactSheet(null); loadContacts(); } : undefined} />
      )}
      {contractSheet && (
        <ContractSheet contract={contractSheet === 'new' ? null : contractSheet} onClose={() => setContractSheet(null)}
          onSave={async input => { await saveContract(orgId, cp.id, input, contractSheet === 'new' ? undefined : contractSheet.id); setContractSheet(null); onChanged(); }} />
      )}
      {termSheet && (
        <TermSheet term={termSheet.term} contractTitle={termSheet.contract.title} cpName={cp.name} people={people} onClose={() => setTermSheet(null)}
          onSave={async input => { await saveTerm(orgId, termSheet.contract.id, input, termSheet.term?.id); setTermSheet(null); onChanged(); }}
          onDelete={termSheet.term ? async () => { await deleteTerm(termSheet.term!.id); setTermSheet(null); onChanged(); } : undefined} />
      )}
    </div>
  );
}

function ContractCard({ contract: c, cpName, terms, people, today, canEdit, onEdit, onDelete, onAddTerm, onEditTerm, onUse }: {
  contract: Contract; cpName: string; terms: ContractTerm[]; people: Person[]; today: string; canEdit: boolean;
  onEdit: () => void; onDelete: () => void; onAddTerm: () => void; onEditTerm: (t: ContractTerm) => void; onUse: (t: ContractTerm, delta: number) => void;
}) {
  // Deadline to cancel a contract that renews by itself: end date minus the notice.
  const cancelBy = c.auto_renew && c.end_date && c.notice_days != null
    ? toDateKey(new Date(Date.parse(c.end_date + 'T00:00:00') - c.notice_days * 86400000)) : null;
  const cancelSoon = cancelBy && cancelBy >= today && daysBetween(today, cancelBy) <= 60;
  const groups: { title: string; items: ContractTerm[] }[] = [
    { title: 'Cosa dobbiamo fare noi', items: terms.filter(t => t.party === 'noi' && t.kind === 'obbligo') },
    { title: 'Cosa spetta a noi', items: terms.filter(t => t.party === 'noi' && t.kind === 'diritto') },
    { title: `Cosa deve fare ${cpName}`, items: terms.filter(t => t.party === 'controparte' && t.kind === 'obbligo') },
    { title: `Cosa spetta a ${cpName}`, items: terms.filter(t => t.party === 'controparte' && t.kind === 'diritto') },
  ].filter(g => g.items.length);

  return (
    <article className="glass-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{c.title}</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {[c.start_date || c.end_date ? `${shortDate(c.start_date) || '…'} → ${shortDate(c.end_date) || '…'}` : null,
              c.auto_renew ? 'rinnovo tacito' : null, money(c.value)].filter(Boolean).join(' · ') || 'Senza date'}
          </p>
        </div>
        <Chip strong={c.status === 'attivo'}>{c.status === 'attivo' ? 'Attivo' : c.status === 'bozza' ? 'Bozza' : c.status === 'scaduto' ? 'Scaduto' : 'Disdetto'}</Chip>
        {canEdit && (
          <div className="flex -my-2 -mr-2">
            <button onClick={onEdit} aria-label="Modifica contratto" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ color: 'var(--text-muted)' }}><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={onDelete} aria-label="Elimina contratto" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ color: 'var(--danger)' }}><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>
      {cancelSoon && (
        <p className="text-sm rounded-2xl px-4 py-3 flex items-center gap-2" style={{ background: 'color-mix(in srgb, var(--warning) 14%, transparent)', color: 'var(--warning)' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> Per non rinnovarlo va disdetto entro il {shortDate(cancelBy)}.
        </p>
      )}
      {groups.length === 0 ? <Empty>Nessun obbligo o diritto registrato.</Empty> : groups.map(g => (
        <div key={g.title} className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--text-subtle)' }}>{g.title}</p>
          <ul className="space-y-1.5">
            {g.items.map(t => {
              const due = nextDue(t, c, today);
              const owner = people.find(p => p.id === t.owner_person_id);
              const over = t.quota != null && t.used > t.quota;
              return (
                <li key={t.id} className="rounded-2xl px-4 py-3 flex items-start gap-3" style={{ background: 'var(--glass-well)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm" style={{ color: 'var(--text)' }}>{t.description}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-subtle)' }}>
                      {[everyLabel(t.every_n, t.every_unit), due && `prossima: ${shortDate(due)}`, owner && `se ne occupa ${owner.name}`].filter(Boolean).join(' · ') || 'senza scadenza'}
                    </p>
                    {t.quota != null && (
                      <p className="text-xs mt-1 font-medium" style={{ color: over ? 'var(--warning)' : 'var(--text-muted)' }}>
                        Usati {t.used} di {t.quota}{over ? ' · oltre il limite: da fatturare a parte' : ''}
                      </p>
                    )}
                  </div>
                  {canEdit && t.quota != null && (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button onClick={() => onUse(t, -1)} disabled={t.used === 0} aria-label="Uno in meno" className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-30"><Minus className="w-3.5 h-3.5" /></button>
                      <button onClick={() => onUse(t, 1)} aria-label="Uno in più" className="w-8 h-8 rounded-full flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                  {canEdit && <button onClick={() => onEditTerm(t)} aria-label="Modifica" className="w-8 h-8 -mr-1 rounded-full flex items-center justify-center flex-shrink-0" style={{ color: 'var(--text-muted)' }}><Pencil className="w-3.5 h-3.5" /></button>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {canEdit && <button onClick={onAddTerm} className="text-sm font-medium inline-flex items-center gap-1.5 h-9" style={{ color: 'var(--brand-ring)' }}><Plus className="w-4 h-4" /> Obbligo o diritto</button>}
    </article>
  );
}

// ───────────── Fogli di modifica ─────────────

function useSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await fn(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  };
  return { busy, error, run };
}

function Footer({ onClose, onSave, busy, disabled, onDelete }: { onClose: () => void; onSave: () => void; busy: boolean; disabled?: boolean; onDelete?: () => void }) {
  return (
    <>
      {onDelete && <button onClick={onDelete} className="h-11 px-3 mr-auto rounded-full text-sm font-medium" style={{ color: 'var(--danger)' }}>Elimina</button>}
      <button onClick={onClose} className="btn-secondary h-11 px-5">Annulla</button>
      <button onClick={onSave} disabled={disabled || busy} className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Salva
      </button>
    </>
  );
}

const nn = (s: string) => (s.trim() ? s.trim() : null);
const num = (s: string) => { const v = Number(s.replace(',', '.')); return s.trim() && Number.isFinite(v) ? v : null; };

function CounterpartySheet({ orgId, cp, onClose, onSaved }: { orgId: string; cp: Counterparty | null; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({
    kind: cp?.kind || 'cliente' as CpKind, name: cp?.name || '', sector: cp?.sector || '', importance: cp?.importance || 'B' as 'A' | 'B' | 'C',
    legal_name: cp?.legal_name || '', vat: cp?.vat || '', tax_code: cp?.tax_code || '', pec: cp?.pec || '', sdi_code: cp?.sdi_code || '',
    address: cp?.address || '', website: cp?.website || '', payment: cp?.payment_terms_days != null ? String(cp.payment_terms_days) : '', notes: cp?.notes || '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF(x => ({ ...x, [k]: v }));
  const { busy, error, run } = useSave();
  const save = () => run(async () => {
    const pay = num(f.payment);
    const input: CounterpartyInput = {
      kind: f.kind, name: f.name.trim(), sector: nn(f.sector), importance: f.importance, legal_name: nn(f.legal_name), vat: nn(f.vat), tax_code: nn(f.tax_code),
      pec: nn(f.pec), sdi_code: nn(f.sdi_code), address: nn(f.address), website: nn(f.website),
      payment_terms_days: pay == null ? null : Math.max(0, Math.min(365, Math.round(pay))), notes: nn(f.notes),
    };
    onSaved(await saveCounterparty(orgId, input, cp?.id));
  });
  return (
    <Sheet title={cp ? `Modifica ${cp.name}` : 'Nuovo cliente o partner'} onClose={onClose}
      footer={<Footer onClose={onClose} onSave={save} busy={busy} disabled={!f.name.trim()} />}>
      <TextField id="cp-name" label="Nome" value={f.name} onChange={set('name')} placeholder="Es. RRD" autoFocus={!cp} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField id="cp-kind" label="Tipo" value={f.kind} onChange={v => setF(x => ({ ...x, kind: v }))}
          options={[{ value: 'cliente', label: 'Cliente' }, { value: 'partner', label: 'Partner' }, { value: 'fornitore', label: 'Fornitore' }]} />
        <SelectField id="cp-imp" label="Importanza" value={f.importance} onChange={v => setF(x => ({ ...x, importance: v }))}
          options={[{ value: 'A', label: 'A · strategico' }, { value: 'B', label: 'B · importante' }, { value: 'C', label: 'C · normale' }]} />
      </div>
      <TextField id="cp-sector" label="Settore" value={f.sector} onChange={set('sector')} placeholder="Es. Abbigliamento e attrezzatura sportiva" />
      <TextField id="cp-legal" label="Ragione sociale" value={f.legal_name} onChange={set('legal_name')} placeholder="Facoltativa" />
      <div className="grid grid-cols-2 gap-3">
        <TextField id="cp-vat" label="Partita IVA" value={f.vat} onChange={set('vat')} />
        <TextField id="cp-cf" label="Codice fiscale" value={f.tax_code} onChange={set('tax_code')} />
        <TextField id="cp-pec" label="PEC" value={f.pec} onChange={set('pec')} />
        <TextField id="cp-sdi" label="Codice SDI" value={f.sdi_code} onChange={set('sdi_code')} />
      </div>
      <TextField id="cp-addr" label="Indirizzo" value={f.address} onChange={set('address')} />
      <div className="grid grid-cols-2 gap-3">
        <TextField id="cp-web" label="Sito" value={f.website} onChange={set('website')} placeholder="www…" />
        <TextField id="cp-pay" label="Pagamento a (giorni)" type="number" value={f.payment} onChange={set('payment')} placeholder="Es. 30" />
      </div>
      <TextArea id="cp-notes" label="Note" value={f.notes} onChange={set('notes')} />
      <ErrorNote text={error} />
    </Sheet>
  );
}

function ContactSheet({ contact, onClose, onSave, onDelete }: {
  contact: Contact | null; onClose: () => void; onSave: (input: { name: string; role: string | null; email: string | null; phone: string | null }) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(contact?.name || '');
  const [role, setRole] = useState(contact?.role || '');
  const [email, setEmail] = useState(contact?.email || '');
  const [phone, setPhone] = useState(contact?.phone || '');
  const { busy, error, run } = useSave();
  return (
    <Sheet title={contact ? `Modifica ${contact.name}` : 'Nuovo referente'} onClose={onClose}
      footer={<Footer onClose={onClose} busy={busy} disabled={!name.trim()} onDelete={onDelete && (() => run(onDelete))}
        onSave={() => run(() => onSave({ name: name.trim(), role: nn(role), email: nn(email), phone: nn(phone) }))} />}>
      <TextField id="ct-name" label="Nome" value={name} onChange={setName} placeholder="Es. Giulia Bianchi" autoFocus={!contact} />
      <TextField id="ct-role" label="Ruolo" value={role} onChange={setRole} placeholder="Es. Marketing manager" />
      <TextField id="ct-email" label="Email" type="email" value={email} onChange={setEmail} />
      <TextField id="ct-phone" label="Telefono" type="tel" value={phone} onChange={setPhone} />
      <ErrorNote text={error} />
    </Sheet>
  );
}

function ContractSheet({ contract, onClose, onSave }: {
  contract: Contract | null; onClose: () => void; onSave: (input: Omit<Contract, 'id' | 'org_id' | 'counterparty_id' | 'currency'>) => Promise<void>;
}) {
  const [title, setTitle] = useState(contract?.title || '');
  const [start, setStart] = useState(contract?.start_date || '');
  const [end, setEnd] = useState(contract?.end_date || '');
  const [autoRenew, setAutoRenew] = useState(contract?.auto_renew || false);
  const [notice, setNotice] = useState(contract?.notice_days != null ? String(contract.notice_days) : '');
  const [value, setValue] = useState(contract?.value != null ? String(contract.value) : '');
  const [status, setStatus] = useState<Contract['status']>(contract?.status || 'attivo');
  const [notes, setNotes] = useState(contract?.notes || '');
  const { busy, error, run } = useSave();
  const save = () => run(async () => {
    if (start && end && end < start) throw new Error('La fine del contratto è prima dell’inizio.');
    const n = num(notice);
    await onSave({ title: title.trim(), start_date: start || null, end_date: end || null, auto_renew: autoRenew,
      notice_days: n == null ? null : Math.max(0, Math.min(730, Math.round(n))), value: num(value), status, notes: nn(notes) });
  });
  return (
    <Sheet title={contract ? 'Modifica contratto' : 'Nuovo contratto'} onClose={onClose}
      footer={<Footer onClose={onClose} onSave={save} busy={busy} disabled={!title.trim()} />}>
      <TextField id="c-title" label="Titolo" value={title} onChange={setTitle} placeholder="Es. Sponsorizzazione 2026" autoFocus={!contract} />
      <div className="grid grid-cols-2 gap-3">
        <TextField id="c-start" label="Inizio" type="date" value={start} onChange={setStart} />
        <TextField id="c-end" label="Fine" type="date" value={end} onChange={setEnd} />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-2xl px-4 h-12" style={{ background: 'var(--glass-well)' }}>
        <span className="text-[15px]" style={{ color: 'var(--text)' }}>Si rinnova da solo</span>
        <Switch on={autoRenew} onChange={setAutoRenew} label="Si rinnova da solo" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField id="c-notice" label="Preavviso disdetta (giorni)" type="number" value={notice} onChange={setNotice} placeholder="Es. 60" />
        <TextField id="c-value" label="Valore (€)" type="number" value={value} onChange={setValue} placeholder="Es. 5000" />
      </div>
      <SelectField id="c-status" label="Stato" value={status} onChange={setStatus}
        options={[{ value: 'attivo', label: 'Attivo' }, { value: 'bozza', label: 'Bozza' }, { value: 'scaduto', label: 'Scaduto' }, { value: 'disdetto', label: 'Disdetto' }]} />
      <TextArea id="c-notes" label="Note" value={notes} onChange={setNotes} />
      <ErrorNote text={error} />
    </Sheet>
  );
}

function TermSheet({ term, contractTitle, cpName, people, onClose, onSave, onDelete }: {
  term: ContractTerm | null; contractTitle: string; cpName: string; people: Person[];
  onClose: () => void; onSave: (input: Omit<ContractTerm, 'id' | 'org_id' | 'contract_id'>) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [who, setWho] = useState<'noi-obbligo' | 'noi-diritto' | 'controparte-obbligo' | 'controparte-diritto'>(term ? `${term.party}-${term.kind}` : 'noi-obbligo');
  const [description, setDescription] = useState(term?.description || '');
  const [when, setWhen] = useState<'ricorrente' | 'data' | 'nessuna'>(term?.every_n ? 'ricorrente' : term?.due_date ? 'data' : 'nessuna');
  const [everyN, setEveryN] = useState(term?.every_n ? String(term.every_n) : '1');
  const [everyUnit, setEveryUnit] = useState<EveryUnit>(term?.every_unit || 'mesi');
  const [due, setDue] = useState(term?.due_date || '');
  const [quota, setQuota] = useState(term?.quota != null ? String(term.quota) : '');
  const [owner, setOwner] = useState(term?.owner_person_id || '');
  const [excerpt, setExcerpt] = useState(term?.source_excerpt || '');
  const { busy, error, run } = useSave();
  const save = () => run(async () => {
    const [party, kind] = who.split('-') as [ContractTerm['party'], ContractTerm['kind']];
    const n = Math.round(num(everyN) || 0);
    if (when === 'ricorrente' && (n < 1 || n > 366)) throw new Error('Indica ogni quanto si ripete (da 1 a 366).');
    const q = num(quota);
    await onSave({
      party, kind, description: description.trim(),
      every_n: when === 'ricorrente' ? n : null, every_unit: when === 'ricorrente' ? everyUnit : null,
      due_date: when === 'data' || (when === 'ricorrente' && due) ? due || null : null,
      quota: q == null ? null : Math.max(0, Math.round(q)), used: term?.used || 0,
      owner_person_id: owner || null, source_excerpt: nn(excerpt),
    });
  });
  return (
    <Sheet title={term ? 'Modifica obbligo o diritto' : 'Nuovo obbligo o diritto'} onClose={onClose}
      footer={<Footer onClose={onClose} onSave={save} busy={busy} disabled={!description.trim()} onDelete={onDelete && (() => run(onDelete))} />}>
      <p className="text-sm -mt-2" style={{ color: 'var(--text-subtle)' }}>{contractTitle}</p>
      <SelectField id="t-who" label="Di chi è" value={who} onChange={setWho} options={[
        { value: 'noi-obbligo', label: 'Un nostro obbligo (lo dobbiamo fare noi)' },
        { value: 'noi-diritto', label: 'Un nostro diritto (ci spetta)' },
        { value: 'controparte-obbligo', label: `Un obbligo di ${cpName}` },
        { value: 'controparte-diritto', label: `Un diritto di ${cpName}` },
      ]} />
      <TextArea id="t-desc" label="Cosa" value={description} onChange={setDescription} rows={2} placeholder="Es. 2 post Instagram al mese con i prodotti RRD" />
      <SelectField id="t-when" label="Quando" value={when} onChange={setWhen} options={[
        { value: 'ricorrente', label: 'Si ripete' }, { value: 'data', label: 'Entro una data' }, { value: 'nessuna', label: 'Senza scadenza' },
      ]} />
      {when === 'ricorrente' && (
        <div className="grid grid-cols-2 gap-3">
          <TextField id="t-n" label="Ogni" type="number" value={everyN} onChange={setEveryN} />
          <SelectField id="t-unit" label="Unità" value={everyUnit} onChange={setEveryUnit}
            options={[{ value: 'giorni', label: 'giorni' }, { value: 'settimane', label: 'settimane' }, { value: 'mesi', label: 'mesi' }, { value: 'anni', label: 'anni' }]} />
        </div>
      )}
      {when !== 'nessuna' && (
        <TextField id="t-due" label={when === 'ricorrente' ? 'Prima volta (facoltativa: altrimenti inizio contratto)' : 'Entro il'} type="date" value={due} onChange={setDue} />
      )}
      <TextField id="t-quota" label="Quante volte in tutto (facoltativo)" type="number" value={quota} onChange={setQuota} placeholder="Es. 2 revisioni gratuite" />
      <div>
        <Label htmlFor="t-owner">Chi se ne occupa</Label>
        <select id="t-owner" value={owner} onChange={e => setOwner(e.target.value)} className="input-glass w-full h-12 text-[15px]">
          <option value="">Nessuno in particolare</option>
          {people.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <TextArea id="t-src" label="Dal contratto (facoltativo)" value={excerpt} onChange={setExcerpt} rows={2} placeholder="Copia qui la frase del contratto" />
      <ErrorNote text={error} />
    </Sheet>
  );
}
