import { useMemo, useState } from 'react';
import { Upload, Plus, Check, Loader2, Pencil, Landmark, Receipt, TrendingUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { BizRole, Org, updateOrg } from '../../lib/business';
import { BizSnapshot, Invoice, saveInvoice, deleteInvoice, addTransactions } from '../../lib/businessData';
import { cashForecast, eur, dayKey, diffDays } from '../../lib/businessIntel';
import { parseFatturaPA, xmlFromBytes, parseBankCsv, guessCategory, ParsedInvoice } from '../../lib/fatturaPA';
import { useDialog } from '../Dialog';
import { Sheet, TextField, SelectField, Label, ErrorNote, PageTitle, Empty, Chip, shortDate } from './ui';
import type { CoachPrefill } from './Coach';

export default function Finanza({ org, myRole, snap, onChanged, onAskCoach }: {
  org: Org; myRole: BizRole; snap: BizSnapshot | null; onChanged: () => void; onAskCoach: (p: CoachPrefill) => void;
}) {
  const dialog = useDialog();
  const today = dayKey(new Date());
  const canSee = ['titolare', 'admin', 'finanza'].includes(myRole);
  const canEditBalance = myRole === 'titolare' || myRole === 'admin';
  const [filter, setFilter] = useState<'incassare' | 'pagare' | 'chiuse'>('incassare');
  const [sheet, setSheet] = useState<Invoice | 'new' | null>(null);
  const [xmlPreview, setXmlPreview] = useState<ParsedInvoice[] | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ rows: { date: string; amount: number; description: string; category: string }[]; skipped: number } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const balance = typeof org.settings?.cash_balance === 'number' ? org.settings.cash_balance : null;

  const forecast = useMemo(() => (snap ? cashForecast(balance, org.settings?.cash_balance_date || null, snap.invoices, today, 90) : null), [snap, balance, org.settings, today]);
  const list = useMemo(() => (snap?.invoices || []).filter(i =>
    filter === 'chiuse' ? i.status !== 'aperta' : i.status === 'aperta' && i.direction === (filter === 'incassare' ? 'emessa' : 'ricevuta')), [snap, filter]);
  const cpName = (i: Invoice) => snap?.clients.find(c => c.id === i.counterparty_id)?.name || i.counterparty_name || '—';

  if (!canSee) return <div className="space-y-6"><PageTitle title="Finanza." /><Empty>La sezione Finanza è riservata a titolare, admin e ruolo Finanza.</Empty></div>;

  const onFile = async (f: File) => {
    setError('');
    const name = f.name.toLowerCase();
    try {
      if (name.endsWith('.xml') || name.endsWith('.p7m')) setXmlPreview(parseFatturaPA(xmlFromBytes(new Uint8Array(await f.arrayBuffer()))));
      else if (name.endsWith('.csv') || f.type === 'text/csv') {
        const { rows, skipped } = parseBankCsv(await f.text());
        setCsvPreview({ rows: rows.map(r => ({ ...r, category: guessCategory(r.description, r.amount) })), skipped });
      } else onAskCoach({ text: 'Registra questa fattura (collega il cliente o fornitore se esiste già).', file: f, send: true });
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  const mineVat = (org.vat || '').replace(/\s|^IT/gi, '');
  const saveXml = async () => {
    if (!xmlPreview) return;
    setBusy('xml');
    try {
      for (const p of xmlPreview) {
        const issued = !!mineVat && (p.seller.vat || '').replace(/^IT/i, '') === mineVat;
        const other = issued ? p.buyer : p.seller;
        const cp = snap?.clients.find(c => (c.vat || '').replace(/^IT/i, '') === (other.vat || '').replace(/^IT/i, '') || c.name.toLowerCase() === (other.name || '').toLowerCase());
        await saveInvoice(org.id, { direction: issued ? 'emessa' : 'ricevuta', number: p.number, issue_date: p.issue_date, due_date: p.due_date, counterparty_id: cp?.id || null,
          counterparty_name: cp ? null : other.name, taxable: p.taxable, vat: p.vat, total: p.total, status: 'aperta', source: 'xml', notes: p.description });
      }
      setXmlPreview(null); onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(''); }
  };
  const saveCsv = async () => {
    if (!csvPreview) return;
    setBusy('csv');
    try { await addTransactions(org.id, csvPreview.rows.map(r => ({ date: r.date, amount: r.amount, description: r.description, category: r.category, invoice_id: null }))); setCsvPreview(null); onChanged(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(''); }
  };
  const setBalance = async () => {
    const v = await dialog.prompt({ title: 'Saldo di oggi', message: 'Quanto c’è sul conto adesso? (in euro)', defaultValue: balance != null ? String(balance) : '', confirmLabel: 'Salva' });
    if (v == null) return;
    const n = Number(v.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(n)) return;
    await updateOrg(org.id, { settings: { ...org.settings, cash_balance: n, cash_balance_date: today } }).catch(err => setError(err.message));
    onChanged();
  };
  const markPaid = async (i: Invoice) => { await saveInvoice(org.id, { status: 'pagata', paid_at: today }, i.id).catch(err => setError(err.message)); onChanged(); };

  return (
    <div className="space-y-6">
      <PageTitle title="Finanza." lead="Entrate, uscite e cassa. Quello che è reale è distinto da quello che è stimato."
        action={<label className="btn-primary h-11 px-4 inline-flex items-center gap-1.5 flex-shrink-0 cursor-pointer"><Upload className="w-4 h-4" /> Carica
          <input type="file" className="hidden" accept=".xml,.p7m,.pdf,.csv,image/*" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} /></label>} />
      <p className="text-sm -mt-3" style={{ color: 'var(--text-subtle)' }}>Carica una fattura (XML dello SDI, PDF o foto) o l’estratto conto in CSV: al resto penso io.</p>
      <ErrorNote text={error} />
      {!snap || !forecast ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-subtle)' }} /></div> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Saldo" value={balance != null ? eur(balance) : 'Da inserire'} sub={org.settings?.cash_balance_date ? `reale · al ${shortDate(org.settings.cash_balance_date)}` : 'inseriscilo tu'} onEdit={canEditBalance ? setBalance : undefined} />
            <Stat label="Da incassare" value={eur(forecast.receivable)} sub={forecast.overdueIn ? `${eur(forecast.overdueIn)} scaduti` : 'fatture aperte'} warn={forecast.overdueIn > 0} />
            <Stat label="Da pagare" value={eur(forecast.payable)} sub="fatture ricevute aperte" />
            <Stat label="Tra 90 giorni" value={eur(forecast.points[forecast.points.length - 1].balance)} sub="previsione" />
          </div>

          <section className="glass-card p-5 space-y-3">
            <div className="flex items-center gap-2.5"><TrendingUp className="w-[18px] h-[18px]" strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} /><h3 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Previsione di cassa</h3><Chip>stima</Chip></div>
            <div className="h-48 -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecast.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs><linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C8F25A" stopOpacity={0.35} /><stop offset="100%" stopColor="#C8F25A" stopOpacity={0} /></linearGradient></defs>
                  <XAxis dataKey="day" tickFormatter={d => (d === 0 ? 'oggi' : `+${d}`)} interval={14} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={v => `${Math.round(v / 1000)}k`} width={36} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: number) => eur(v)} labelFormatter={d => (d === 0 ? 'Oggi' : `Tra ${d} giorni`)} />
                  <ReferenceLine y={0} stroke="var(--danger)" strokeDasharray="4 4" />
                  <Area type="stepAfter" dataKey="balance" stroke="var(--brand-ring)" strokeWidth={2} fill="url(#cashFill)" animationDuration={600} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-1 text-xs" style={{ color: 'var(--text-subtle)' }}>
              <li>Parte dal saldo reale e aggiunge le fatture aperte alla loro scadenza.</li>
              {forecast.notes.map(n => <li key={n} style={{ color: n.startsWith('Possibile') ? 'var(--warning)' : undefined }}>{n}</li>)}
            </ul>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Receipt className="w-[18px] h-[18px]" strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} />
              <h3 className="text-[15px] font-semibold flex-1" style={{ color: 'var(--text)' }}>Fatture</h3>
              <button onClick={() => setSheet('new')} className="btn-secondary h-10 px-4 text-sm inline-flex items-center gap-1.5"><Plus className="w-4 h-4" /> A mano</button>
            </div>
            <div className="flex gap-1 p-1 rounded-full w-fit" style={{ background: 'var(--glass-well)' }} role="tablist">
              {([['incassare', 'Da incassare'], ['pagare', 'Da pagare'], ['chiuse', 'Chiuse']] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`h-9 px-4 rounded-full text-sm font-medium ${filter === k ? 'glass-lens' : ''}`}
                  style={{ color: filter === k ? 'var(--brand-ring)' : 'var(--text-muted)' }}>{l}</button>
              ))}
            </div>
            {list.length === 0 ? <Empty>Nessuna fattura qui.</Empty> : (
              <ul className="glass-card p-2 space-y-0.5">
                {list.map(i => {
                  const late = i.status === 'aperta' && i.due_date && i.due_date < today;
                  return (
                    <li key={i.id} className="rounded-2xl px-3 py-2.5 flex items-center gap-3 hover:bg-white/5">
                      <button onClick={() => setSheet(i)} className="flex-1 min-w-0 text-left">
                        <span className="block text-sm truncate" style={{ color: 'var(--text)' }}>{cpName(i)}{i.number ? <span style={{ color: 'var(--text-subtle)' }}> · n. {i.number}</span> : null}</span>
                        <span className="block text-xs" style={{ color: late ? 'var(--danger)' : 'var(--text-subtle)' }}>
                          {i.status === 'pagata' ? `pagata ${shortDate(i.paid_at)}` : i.status === 'annullata' ? 'annullata' : i.due_date ? (late ? `scaduta da ${diffDays(i.due_date, today)} giorni` : `scade ${shortDate(i.due_date)}`) : 'senza scadenza'}
                          {i.source !== 'manuale' ? ` · letta da ${i.source === 'xml' ? 'XML' : 'AI'}` : ''}
                        </span>
                      </button>
                      <span className="text-sm font-semibold tabular" style={{ color: 'var(--text)' }}>{eur(i.total)}</span>
                      {i.status === 'aperta' && <button onClick={() => markPaid(i)} aria-label="Segna come pagata" title="Segna come pagata" className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 hover:bg-white/5" style={{ color: 'var(--text-muted)' }}><Check className="w-4 h-4" /></button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2.5"><Landmark className="w-[18px] h-[18px]" strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} /><h3 className="text-[15px] font-semibold flex-1" style={{ color: 'var(--text)' }}>Movimenti</h3>
              <label className="btn-secondary h-10 px-4 text-sm inline-flex items-center gap-1.5 cursor-pointer"><Upload className="w-4 h-4" /> Estratto conto CSV
                <input type="file" className="hidden" accept=".csv,text/csv" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} /></label>
            </div>
            {snap.transactions.length === 0 ? <Empty>Nessun movimento. Scarica dall’home banking l’elenco movimenti in CSV o Excel (salvato come CSV) e caricalo qui.</Empty> : (
              <ul className="glass-card p-2 space-y-0.5">
                {snap.transactions.slice(0, 15).map(t => (
                  <li key={t.id} className="rounded-2xl px-3 py-2 flex items-center gap-3">
                    <span className="text-xs tabular w-14 flex-shrink-0" style={{ color: 'var(--text-subtle)' }}>{shortDate(t.date)}</span>
                    <span className="flex-1 min-w-0"><span className="block text-sm truncate" style={{ color: 'var(--text)' }}>{t.description || '—'}</span><span className="block text-xs" style={{ color: 'var(--text-subtle)' }}>{t.category}</span></span>
                    <span className="text-sm font-semibold tabular" style={{ color: t.amount >= 0 ? 'var(--success)' : 'var(--text)' }}>{t.amount >= 0 ? '+' : ''}{eur(t.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {xmlPreview && (
        <Sheet title={`${xmlPreview.length === 1 ? 'Fattura letta' : `${xmlPreview.length} fatture lette`} dal file XML`} onClose={() => setXmlPreview(null)}
          footer={<><button onClick={() => setXmlPreview(null)} className="btn-secondary h-11 px-5">Annulla</button><button onClick={saveXml} disabled={busy === 'xml'} className="btn-primary h-11 px-5 inline-flex items-center gap-2">{busy === 'xml' && <Loader2 className="w-4 h-4 animate-spin" />} Registra</button></>}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Dati esatti, presi dal file dello SDI. {mineVat ? '' : 'Inserisci la P.IVA dell’azienda nelle impostazioni per distinguere da solo le fatture emesse da quelle ricevute.'}</p>
          {xmlPreview.map((p, i) => (
            <div key={i} className="rounded-2xl p-4 space-y-1 text-sm" style={{ background: 'var(--glass-well)', color: 'var(--text)' }}>
              <p className="font-semibold">{p.seller.name} → {p.buyer.name}</p>
              <p style={{ color: 'var(--text-muted)' }}>n. {p.number} del {p.issue_date?.split('-').reverse().join('/')} · scadenza {p.due_date ? p.due_date.split('-').reverse().join('/') : 'non indicata'}</p>
              <p style={{ color: 'var(--text-muted)' }}>Imponibile {p.taxable != null ? eur(p.taxable) : '—'} · IVA {p.vat != null ? eur(p.vat) : '—'} · <b style={{ color: 'var(--text)' }}>Totale {eur(p.total)}</b></p>
              {p.description && <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>{p.description}</p>}
            </div>
          ))}
        </Sheet>
      )}
      {csvPreview && (
        <Sheet title="Movimenti letti dal file" onClose={() => setCsvPreview(null)}
          footer={<><button onClick={() => setCsvPreview(null)} className="btn-secondary h-11 px-5">Annulla</button><button onClick={saveCsv} disabled={busy === 'csv' || !csvPreview.rows.length} className="btn-primary h-11 px-5 inline-flex items-center gap-2">{busy === 'csv' && <Loader2 className="w-4 h-4 animate-spin" />} Importa {csvPreview.rows.length}</button></>}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{csvPreview.rows.length} movimenti{csvPreview.skipped ? `, ${csvPreview.skipped} righe saltate (senza data o importo)` : ''}. Categorie proposte in automatico.</p>
          <ul className="space-y-1">
            {csvPreview.rows.slice(0, 12).map((r, i) => (
              <li key={i} className="flex gap-3 text-sm"><span className="tabular w-20 flex-shrink-0" style={{ color: 'var(--text-subtle)' }}>{r.date.split('-').reverse().join('/')}</span><span className="flex-1 truncate" style={{ color: 'var(--text)' }}>{r.description}</span><span className="tabular" style={{ color: r.amount >= 0 ? 'var(--success)' : 'var(--text)' }}>{eur(r.amount)}</span></li>
            ))}
          </ul>
        </Sheet>
      )}
      {sheet && <InvoiceSheet orgId={org.id} invoice={sheet === 'new' ? null : sheet} snap={snap!} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); onChanged(); }}
        onDelete={sheet !== 'new' ? async () => { if (await dialog.confirm({ title: 'Eliminare la fattura?', confirmLabel: 'Elimina', danger: true })) { await deleteInvoice(sheet.id); setSheet(null); onChanged(); } } : undefined} />}
    </div>
  );
}

function Stat({ label, value, sub, warn, onEdit }: { label: string; value: string; sub: string; warn?: boolean; onEdit?: () => void }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between"><p className="text-xs" style={{ color: 'var(--text-subtle)' }}>{label}</p>
        {onEdit && <button onClick={onEdit} aria-label={`Modifica ${label}`} className="w-8 h-8 -mr-2 -my-2 rounded-full flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--text-muted)' }}><Pencil className="w-3.5 h-3.5" /></button>}</div>
      <p className="text-xl font-semibold tabular mt-1" style={{ color: 'var(--text)' }}>{value}</p>
      <p className="text-[11px] mt-0.5" style={{ color: warn ? 'var(--warning)' : 'var(--text-subtle)' }}>{sub}</p>
    </div>
  );
}

function InvoiceSheet({ orgId, invoice, snap, onClose, onSaved, onDelete }: {
  orgId: string; invoice: Invoice | null; snap: BizSnapshot; onClose: () => void; onSaved: () => void; onDelete?: () => void;
}) {
  const [dir, setDir] = useState<Invoice['direction']>(invoice?.direction || 'emessa');
  const [cp, setCp] = useState(invoice?.counterparty_id || '');
  const [cpName, setCpName] = useState(invoice?.counterparty_name || '');
  const [number, setNumber] = useState(invoice?.number || '');
  const [issue, setIssue] = useState(invoice?.issue_date || dayKey(new Date()));
  const [due, setDue] = useState(invoice?.due_date || '');
  const [total, setTotal] = useState(invoice ? String(invoice.total) : '');
  const [status, setStatus] = useState<Invoice['status']>(invoice?.status || 'aperta');
  const [prj, setPrj] = useState(invoice?.project_id || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    const t = Number(total.replace(',', '.'));
    if (!Number.isFinite(t) || !total.trim()) { setError('Indica il totale.'); return; }
    setBusy(true); setError('');
    try {
      await saveInvoice(orgId, { direction: dir, counterparty_id: cp || null, counterparty_name: cp ? null : cpName.trim() || null, number: number.trim() || null, issue_date: issue || null,
        due_date: due || null, total: t, status, paid_at: status === 'pagata' ? invoice?.paid_at || dayKey(new Date()) : null, project_id: prj || null, ...(invoice ? {} : { source: 'manuale' as const }) }, invoice?.id);
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  };
  return (
    <Sheet title={invoice ? 'Fattura' : 'Nuova fattura'} onClose={onClose}
      footer={<>{onDelete && <button onClick={onDelete} className="h-11 px-3 mr-auto rounded-full text-sm font-medium" style={{ color: 'var(--danger)' }}>Elimina</button>}
        <button onClick={onClose} className="btn-secondary h-11 px-5">Annulla</button>
        <button onClick={save} disabled={busy} className="btn-primary h-11 px-5 inline-flex items-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Salva</button></>}>
      <SelectField id="iv-dir" label="Tipo" value={dir} onChange={setDir} options={[{ value: 'emessa', label: 'Emessa (da incassare)' }, { value: 'ricevuta', label: 'Ricevuta (da pagare)' }]} />
      <div><Label htmlFor="iv-cp">Cliente o fornitore</Label>
        <select id="iv-cp" value={cp} onChange={e => setCp(e.target.value)} className="input-glass w-full h-12 text-[15px]"><option value="">Non in anagrafica</option>{snap.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      {!cp && <TextField id="iv-cpn" label="Nome" value={cpName} onChange={setCpName} />}
      <div className="grid grid-cols-2 gap-3">
        <TextField id="iv-num" label="Numero" value={number} onChange={setNumber} />
        <TextField id="iv-total" label="Totale (€)" type="number" value={total} onChange={setTotal} />
        <TextField id="iv-issue" label="Data" type="date" value={issue} onChange={setIssue} />
        <TextField id="iv-due" label="Scadenza" type="date" value={due} onChange={setDue} />
      </div>
      <div><Label htmlFor="iv-prj">Progetto</Label>
        <select id="iv-prj" value={prj} onChange={e => setPrj(e.target.value)} className="input-glass w-full h-12 text-[15px]"><option value="">Nessuno</option>{snap.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <SelectField id="iv-status" label="Stato" value={status} onChange={setStatus} options={[{ value: 'aperta', label: 'Aperta' }, { value: 'pagata', label: 'Pagata' }, { value: 'annullata', label: 'Annullata' }]} />
      <ErrorNote text={error} />
    </Sheet>
  );
}
