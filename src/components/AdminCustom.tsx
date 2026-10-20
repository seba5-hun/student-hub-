import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Check, X, Eye, Code2, ShieldCheck, ShieldAlert, ShieldX, Sparkles, Package, Plus, Minus } from 'lucide-react';
import { CustomRequest, RequestStatus, PlanRow, loadAllRequests, updateRequest, loadPlans, addCredits } from '../lib/customRequests';
import { checkAppCode, SECURITY_REVIEW_SYSTEM, parseReview, AiReview } from '../lib/appSecurity';
import { askAuto, autoReady } from '../lib/ai';
import { createDemoData } from '../lib/demoData';
import { UserData } from '../lib/store';
import MiniApp from './MiniApp';
import { SECTIONS } from './Layout';
import { useDialog } from './Dialog';

// Admin → Personalizzazioni: the functions the students asked for (prepared by the AI). For each
// one: the idea, the automatic security check, the AI's opinion, a preview with example data and
// the code (editable). Approved, it appears only in that student's MYND. Below: the packages.

const FILTERS: { id: RequestStatus | 'all'; label: string }[] = [
  { id: 'pending', label: 'Da controllare' }, { id: 'approved', label: 'Approvate' }, { id: 'rejected', label: 'Rifiutate' }, { id: 'all', label: 'Tutte' },
];
const STATUS: Record<RequestStatus, [string, string]> = { pending: ['Da controllare', 'var(--warning)'], approved: ['Approvata', 'var(--brand-ring)'], rejected: ['Rifiutata', 'var(--danger)'] };
const when = (v: string) => { const d = new Date(v); return `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`; };
const placeText = (r: CustomRequest) => {
  if (r.kind === 'update') return 'Modifica di una sua funzione già attiva';
  const p = r.placement || {};
  if (p.place === 'home') return 'Nella Home';
  const base = SECTIONS.find(x => x.id === p.place)?.label;
  if (base) return `${p.position === 'replace' ? 'Al posto di' : p.position === 'below' ? 'In fondo a' : 'In cima a'} ${base}`;
  return 'Nuova sezione nel menu';
};

export default function AdminCustom({ darkMode, onPendingCount }: { darkMode: boolean; onPendingCount?: (n: number) => void }) {
  const dialog = useDialog();
  const [items, setItems] = useState<CustomRequest[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [filter, setFilter] = useState<RequestStatus | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Record<string, 'preview' | 'code' | undefined>>({});
  const [codes, setCodes] = useState<Record<string, string>>({});   // code being edited
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState(2);
  const [pack, setPack] = useState('');

  const text = darkMode ? 'text-white' : 'text-gray-800';
  const sub = darkMode ? 'text-white/60' : 'text-gray-500';
  const card = darkMode ? 'glass-card' : 'glass-card-light';
  const well = darkMode ? 'bg-white/5' : 'bg-black/5';
  const input = `${darkMode ? 'input-glass' : 'input-light'} text-sm`;
  const small = `text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-40 ${darkMode ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-black/5 text-gray-700 hover:bg-black/10'}`;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [list, pl] = await Promise.all([loadAllRequests(), loadPlans()]);
      setItems(list); setPlans(pl);
      onPendingCount?.(list.filter(x => x.status === 'pending').length);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [onPendingCount]);
  useEffect(() => { load(); }, [load]);

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusy(id); setError('');
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };

  const htmlOf = (r: CustomRequest) => codes[r.id] ?? r.html;

  const approve = (r: CustomRequest) => act(r.id, async () => {
    const report = checkAppCode(htmlOf(r));
    const ai = r.review as AiReview | null;
    if (report.level === 'danger' || ai?.verdict === 'pericolosa') {
      if (!(await dialog.confirm({ title: 'Ci sono problemi di sicurezza', message: 'Il controllo ha trovato problemi gravi. Approvarla comunque?', confirmLabel: 'Approva comunque', danger: true }))) return;
    } else if (!(await dialog.confirm({ title: `Approvare «${r.title}»?`, message: `Comparirà nella MYND di ${r.email || 'questo studente'} (e solo lì) appena apre l'app.`, confirmLabel: 'Approva' }))) return;
    await updateRequest(r.id, { status: 'approved', ...(codes[r.id] !== undefined ? { html: codes[r.id] } : {}) });
  });

  const reject = (r: CustomRequest) => act(r.id, async () => {
    const note = await dialog.prompt({ title: 'Perché non la approvi?', message: 'Lo studente lo legge nell\'Assistente MYND. La personalizzazione torna disponibile nel suo pacchetto.', defaultValue: '', confirmLabel: 'Rifiuta' });
    if (note === null) return;
    await updateRequest(r.id, { status: 'rejected', note: note.trim().slice(0, 1000) || 'Non approvata.' });
  });

  const saveCode = (r: CustomRequest) => act(r.id, async () => {
    await updateRequest(r.id, { html: codes[r.id] ?? r.html });
    setCodes(c => { const n = { ...c }; delete n[r.id]; return n; });
  });

  const aiReview = (r: CustomRequest) => act(r.id, async () => {
    if (!autoReady()) throw new Error('Per l\'analisi AI collega una chiave AI (Guida Studio AI).');
    const raw = await askAuto(SECURITY_REVIEW_SYSTEM, [{ role: 'user', text: `Descrizione: ${r.idea}\n\nPermessi chiesti: legge i dati ${r.placement?.uses_data ? 'sì' : 'no'}, aggiunge dati ${r.placement?.writes_data ? 'sì' : 'no'}.\n\nCODICE:\n${htmlOf(r)}` }]);
    await updateRequest(r.id, { review: { ...parseReview(raw), at: new Date().toISOString() } });
  });

  const givePackage = () => act('plans', async () => {
    if (!email.trim()) throw new Error('Scrivi l\'email dell\'account.');
    const res = await addCredits(email.trim(), amount, pack.trim() || undefined);
    setEmail(''); setPack('');
    await dialog.alert({ title: 'Pacchetto assegnato', message: `${res.email} ora ha ${res.credits} personalizzazioni in totale.` });
  });

  const shown = useMemo(() => items.filter(x => filter === 'all' || x.status === filter), [items, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={`flex rounded-xl p-1 max-w-full overflow-x-auto ${well}`}>
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${filter === f.id ? 'btn-primary !py-1.5' : sub}`}>
              {f.label}{f.id !== 'all' && ` (${items.filter(x => x.status === f.id).length})`}
            </button>
          ))}
        </div>
        <button onClick={load} className={small}><RefreshCw className="w-3.5 h-3.5" /> Aggiorna</button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400 whitespace-pre-line">⚠️ {error}</div>}
      {loading && <p className={`text-sm flex items-center gap-2 ${sub}`}><Loader2 className="w-4 h-4 animate-spin" /> Carico…</p>}
      {!loading && !shown.length && !error && <div className={`${card} p-8 text-center ${sub}`}>Nessuna richiesta {filter === 'pending' ? 'da controllare' : 'qui'}.</div>}

      {shown.map(r => {
        const html = htmlOf(r);
        const report = checkAppCode(html);
        const ai = r.review as AiReview | null;
        const edited = codes[r.id] !== undefined && codes[r.id] !== r.html;
        const ShieldIcon = report.level === 'ok' ? ShieldCheck : report.level === 'warning' ? ShieldAlert : ShieldX;
        const shieldColor = report.level === 'ok' ? 'var(--brand-ring)' : report.level === 'warning' ? 'var(--warning)' : 'var(--danger)';
        return (
          <div key={r.id} className={`${card} p-5 space-y-4`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={`font-semibold ${text}`}>{r.kind === 'update' ? 'Modifica: ' : ''}{r.title}</p>
                <p className={`text-xs ${sub}`}>{r.email || 'account eliminato'} · {when(r.created_at)} · {placeText(r)}</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: STATUS[r.status][1], background: `color-mix(in srgb, ${STATUS[r.status][1]} 14%, transparent)` }}>{STATUS[r.status][0]}</span>
            </div>

            <p className={`text-sm whitespace-pre-line rounded-xl p-3 ${well} ${text}`}>{r.idea}</p>
            <p className={`text-xs ${sub}`}>Permessi: {r.placement?.uses_data ? 'legge materie, impegni e voti' : 'non legge i dati'}{r.placement?.writes_data ? ' · aggiunge dati (studio, impegni, voti, note)' : ''}</p>

            <div className={`rounded-xl p-3 space-y-1.5 ${well}`}>
              <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: shieldColor }}>
                <ShieldIcon className="w-4 h-4" /> Controllo automatico: {report.level === 'ok' ? 'nessun problema' : report.level === 'warning' ? 'da guardare' : 'problemi gravi'}
              </p>
              {report.findings.map((f, i) => (
                <p key={i} className={`text-xs ${f.severity === 'danger' ? 'text-red-400' : f.severity === 'warning' ? 'text-amber-400' : sub}`}>
                  {f.severity === 'danger' ? '✕' : f.severity === 'warning' ? '!' : '·'} {f.text}{f.line ? ` (riga ${f.line})` : ''}
                </p>
              ))}
              {ai && (
                <p className={`text-xs pt-1 ${text}`}>
                  <b style={{ color: ai.verdict === 'sicura' ? 'var(--brand-ring)' : ai.verdict === 'dubbia' ? 'var(--warning)' : 'var(--danger)' }}>Analisi AI: {ai.verdict}.</b> {ai.summary}
                  {ai.issues?.length > 0 && <span className={`block ${sub}`}>{ai.issues.map(x => `• ${x}`).join('\n')}</span>}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={() => setOpen(o => ({ ...o, [r.id]: o[r.id] === 'preview' ? undefined : 'preview' }))} disabled={!html.trim()} className={small}><Eye className="w-3.5 h-3.5" /> Anteprima</button>
              <button onClick={() => setOpen(o => ({ ...o, [r.id]: o[r.id] === 'code' ? undefined : 'code' }))} className={small}><Code2 className="w-3.5 h-3.5" /> Codice</button>
              <button onClick={() => aiReview(r)} disabled={busy === r.id || !html.trim()} className={small}><Sparkles className="w-3.5 h-3.5" /> {ai ? 'Rifai analisi AI' : 'Analisi AI'}</button>
              {r.status !== 'approved' && <button onClick={() => approve(r)} disabled={busy === r.id || !html.trim()} className="btn-primary text-xs !py-1.5 !px-3 flex items-center gap-1 disabled:opacity-40"><Check className="w-3.5 h-3.5" /> Approva</button>}
              {r.status === 'pending' && <button onClick={() => reject(r)} disabled={busy === r.id} className="text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1 bg-red-500/10 text-red-400 hover:bg-red-500/20"><X className="w-3.5 h-3.5" /> Rifiuta</button>}
              {busy === r.id && <Loader2 className={`w-4 h-4 animate-spin self-center ${sub}`} />}
            </div>
            {r.admin_note && <p className={`text-xs ${sub}`}>Nota allo studente: {r.admin_note}</p>}

            {open[r.id] === 'preview' && <Preview key={html} html={html} writes={!!r.placement?.writes_data} darkMode={darkMode} />}
            {open[r.id] === 'code' && (
              <div className="space-y-2">
                <textarea value={html} onChange={e => setCodes(c => ({ ...c, [r.id]: e.target.value }))} spellCheck={false}
                  className={`${input} w-full font-mono text-xs h-80`} />
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => saveCode(r)} disabled={!edited || busy === r.id} className={small}>Salva il codice</button>
                  <span className={`text-xs ${sub}`}>Puoi correggerlo o incollare quello fatto da Claude. Il controllo qui sopra si aggiorna mentre scrivi.</span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className={`${card} p-5 space-y-4`}>
        <div>
          <p className={`font-semibold flex items-center gap-2 ${text}`}><Package className="w-4 h-4" style={{ color: 'var(--brand-ring)' }} /> Pacchetti di personalizzazioni</p>
          <p className={`text-sm ${sub}`}>Ogni account ha 2 personalizzazioni incluse. Dopo il pagamento, aggiungi quelle del pacchetto all'email del cliente (si sommano alle 2). Ogni richiesta inviata ne usa una; se la rifiuti, torna disponibile.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email dell'account" className={`${input} flex-1 min-w-[200px]`} />
          <input value={pack} onChange={e => setPack(e.target.value)} placeholder="Pacchetto (es. Base)" className={`${input} w-40`} />
          <select value={amount} onChange={e => setAmount(Number(e.target.value))} className={`${input} w-24`}>
            {[1, 2, 3, 5, 10].map(n => <option key={n} value={n}>+{n}</option>)}
          </select>
          <button onClick={givePackage} disabled={busy === 'plans'} className="btn-primary text-sm flex items-center gap-1.5"><Plus className="w-4 h-4" /> Aggiungi</button>
        </div>
        {plans.length > 0 && (
          <div className="space-y-1.5">
            {plans.map(p => (
              <div key={p.user_id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm ${well}`}>
                <span className={`truncate ${text}`}>{p.email || '—'}{p.package ? <span className={sub}> · {p.package}</span> : null}</span>
                <span className="flex items-center gap-2">
                  <span className={`text-xs ${sub}`}>usate {p.used} su {p.credits}</span>
                  <button onClick={() => p.email && act('plans', async () => { await addCredits(p.email!, -1); })} aria-label="Togli una personalizzazione" className={small}><Minus className="w-3 h-3" /></button>
                  <button onClick={() => p.email && act('plans', async () => { await addCredits(p.email!, 1); })} aria-label="Aggiungi una personalizzazione" className={small}><Plus className="w-3 h-3" /></button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// The function running on example data: what it would add is shown, never saved anywhere.
function Preview({ html, writes, darkMode }: { html: string; writes: boolean; darkMode: boolean }) {
  const [data, setData] = useState<UserData>(() => createDemoData());
  const [store, setStore] = useState<unknown>(null);
  const [log, setLog] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const sub = darkMode ? 'text-white/60' : 'text-gray-500';
  const counts = (d: UserData) => `${d.sessions.length} sessioni, ${d.tasks.length} impegni, ${d.grades.length} voti`;
  return (
    <div className="space-y-2">
      <p className={`text-xs ${sub}`}>Anteprima con i dati di esempio della demo: niente viene salvato.</p>
      <div className={`rounded-2xl p-3 ${darkMode ? 'bg-black/20' : 'bg-white/60'}`}>
        <MiniApp html={html} store={store} allowData data={data} allowWrite={writes} onSave={setStore} onError={setErr}
          onUpdateData={fn => { setData(fn); setLog(l => [...l.slice(-5), `${new Date().toLocaleTimeString('it-IT')}: ha aggiunto dei dati`]); }} />
      </div>
      {err && <p className="text-xs text-amber-400">Errore nella funzione: {err}</p>}
      {log.length > 0 && <p className={`text-xs ${sub}`}>{log.join(' · ')} — ora i dati di esempio hanno {counts(data)}.</p>}
    </div>
  );
}
