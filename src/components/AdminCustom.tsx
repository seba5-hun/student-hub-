import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Check, X, Eye, Code2, ShieldCheck, ShieldAlert, ShieldX, Sparkles, Package, Plus, Minus, Copy, Wand2, RotateCcw } from 'lucide-react';
import { CustomRequest, RequestStatus, PlanRow, loadAllRequests, updateRequest, loadPlans, addCredits } from '../lib/customRequests';
import { checkAppCode, SECURITY_REVIEW_SYSTEM, parseReview, AiReview } from '../lib/appSecurity';
import { askAuto, askForCode, autoReady } from '../lib/ai';
import { createDemoData } from '../lib/demoData';
import { UserData } from '../lib/store';
import MiniApp from './MiniApp';
import { buildClaudeBrief, placeLabel } from '../lib/claudeBrief';
import { useDialog } from './Dialog';

// Admin → Personalizzazioni: the functions on measure the students asked for. When the page opens,
// the AI prepares each new one by itself (code, security check, AI's opinion) so the admin only
// looks at the preview and approves; a correction can be asked in words ("Correggi con l'AI").
// "Copia per Claude" stays as an alternative. Approved, it appears only in that student's MYND.
// Below: the packages.

const CODE_SYSTEM = 'Sei lo sviluppatore di MYND e scrivi funzioni su misura (mini-app) per gli studenti, seguendo esattamente le regole che ti vengono date. Rispondi con UN SOLO blocco ```html con la pagina completa e funzionante, senza parti da completare.';

const FILTERS: { id: RequestStatus | 'all'; label: string }[] = [
  { id: 'pending', label: 'Da controllare' }, { id: 'approved', label: 'Approvate' }, { id: 'rejected', label: 'Rifiutate' }, { id: 'all', label: 'Tutte' },
];
const STATUS: Record<RequestStatus, [string, string]> = { pending: ['Da controllare', 'var(--warning)'], approved: ['Approvata', 'var(--brand-ring)'], rejected: ['Rifiutata', 'var(--danger)'] };
const when = (v: string) => { const d = new Date(v); return `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`; };
// What Claude answered, pasted whole: keep only the page (the ```html block), if there is one.
const extractHtml = (v: string) => v.match(/```(?:html)?[^\n]*\n([\s\S]*?)```/i)?.[1]?.trim() ?? v;

export default function AdminCustom({ darkMode, onPendingCount }: { darkMode: boolean; onPendingCount?: (n: number) => void }) {
  const dialog = useDialog();
  const [items, setItems] = useState<CustomRequest[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [filter, setFilter] = useState<RequestStatus | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Record<string, 'preview' | 'code' | 'none' | undefined>>({});
  const [codes, setCodes] = useState<Record<string, string>>({});   // code being edited
  const [copied, setCopied] = useState('');
  // The AI preparing a function: 'working' or the error. Each request is started once by itself.
  const [gen, setGen] = useState<Record<string, string>>({});
  const [fixes, setFixes] = useState<Record<string, string>>({});
  const started = useRef(new Set<string>());
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

  const copyBrief = async (r: CustomRequest) => {
    const value = buildClaudeBrief(r);
    try { await navigator.clipboard.writeText(value); } catch {
      const t = document.createElement('textarea'); t.value = value; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    setCopied(r.id); window.setTimeout(() => setCopied(c => (c === r.id ? '' : c)), 2500);
  };

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

  // The AI writes the function (or rewrites it with the admin's corrections), then checks it.
  const build = async (r: CustomRequest, correction = '') => {
    started.current.add(r.id);
    setGen(g => ({ ...g, [r.id]: 'working' })); setError('');
    try {
      let prompt = buildClaudeBrief(r);
      if (correction) prompt += `\n\nCODICE ATTUALE:\n\`\`\`html\n${htmlOf(r)}\n\`\`\`\n\nCORREZIONI CHIESTE DAL TEAM MYND:\n${correction}\n\nRiscrivi la pagina completa con queste correzioni.`;
      const html = extractHtml(await askForCode(CODE_SYSTEM, prompt)).trim();
      if (!/<(html|body|div|main|section|script)[\s>]/i.test(html)) throw new Error('L\'AI non ha restituito una pagina valida. Riprova.');
      await updateRequest(r.id, { html: html.slice(0, 150000) });
      setCodes(c => { const n = { ...c }; delete n[r.id]; return n; });
      setFixes(f => ({ ...f, [r.id]: '' }));
      setGen(g => { const n = { ...g }; delete n[r.id]; return n; });
      // Second opinion on security, by itself (if it fails, the automatic check is still there).
      try {
        const raw = await askAuto(SECURITY_REVIEW_SYSTEM, [{ role: 'user', text: `Descrizione: ${r.idea}\n\nPermessi chiesti: legge i dati ${r.placement?.uses_data ? 'sì' : 'no'}, aggiunge dati ${r.placement?.writes_data ? 'sì' : 'no'}.\n\nCODICE:\n${html}` }]);
        await updateRequest(r.id, { review: { ...parseReview(raw), at: new Date().toISOString() } });
      } catch { /* optional */ }
      await load();
    } catch (e) {
      setGen(g => ({ ...g, [r.id]: e instanceof Error ? e.message : String(e) }));
    }
  };

  // New requests without code: prepared one at a time as soon as the page is open.
  useEffect(() => {
    if (Object.values(gen).includes('working')) return;
    const next = items.find(r => r.status === 'pending' && !r.html.trim() && !started.current.has(r.id));
    if (next) build(next);
  }, [items, gen]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // A pending function that is ready opens with its preview.
        const view = open[r.id] ?? (r.status === 'pending' && html.trim() && report.level !== 'danger' ? 'preview' : 'none');
        const ShieldIcon = report.level === 'ok' ? ShieldCheck : report.level === 'warning' ? ShieldAlert : ShieldX;
        const shieldColor = report.level === 'ok' ? 'var(--brand-ring)' : report.level === 'warning' ? 'var(--warning)' : 'var(--danger)';
        return (
          <div key={r.id} className={`${card} p-5 space-y-4`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={`font-semibold ${text}`}>{r.kind === 'update' ? 'Modifica: ' : ''}{r.title}</p>
                <p className={`text-xs ${sub}`}>{r.email || 'account eliminato'} · {when(r.created_at)} · {placeLabel(r)}</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: STATUS[r.status][1], background: `color-mix(in srgb, ${STATUS[r.status][1]} 14%, transparent)` }}>{STATUS[r.status][0]}</span>
            </div>

            <p className={`text-sm whitespace-pre-line rounded-xl p-3 ${well} ${text}`}>{r.idea}</p>
            {r.placement?.spec && (
              <details className={`rounded-xl px-3 py-2 ${well}`}>
                <summary className={`text-xs font-semibold cursor-pointer ${sub}`}>Richiesta dettagliata (scritta dall'Assistente per lo sviluppatore)</summary>
                <p className={`text-xs whitespace-pre-line mt-2 ${text}`}>{r.placement.spec}</p>
              </details>
            )}
            {r.status === 'pending' && gen[r.id] === 'working' && (
              <div className="rounded-xl p-3 flex items-center gap-2.5" style={{ boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--brand-ring) 30%, transparent)' }}>
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: 'var(--brand-ring)' }} />
                <p className={`text-xs ${sub}`}><b className={text}>L'AI sta preparando la funzione</b> e poi la controlla: può volerci qualche minuto, lascia aperta questa pagina.</p>
              </div>
            )}
            {r.status === 'pending' && gen[r.id] && gen[r.id] !== 'working' && (
              <div className="rounded-xl p-3 space-y-2 bg-red-500/10">
                <p className="text-xs text-red-400 whitespace-pre-line">Non sono riuscito a prepararla: {gen[r.id]}</p>
                <button onClick={() => build(r)} className={small}><RotateCcw className="w-3.5 h-3.5" /> Riprova</button>
              </div>
            )}
            {r.status === 'pending' && html.trim() && gen[r.id] !== 'working' && (
              <div className="rounded-xl p-3 space-y-2" style={{ boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--brand-ring) 30%, transparent)' }}>
                <p className={`text-xs ${sub}`}><b className={text}>Pronta:</b> guarda l'anteprima qui sotto e, se va bene, tocca Approva. Se vuoi cambiare qualcosa, scrivilo e l'AI la corregge.</p>
                <div className="flex flex-wrap gap-2">
                  <input value={fixes[r.id] || ''} onChange={e => setFixes(f => ({ ...f, [r.id]: e.target.value }))} placeholder="Es. il pulsante Avvia più grande e la pausa lunga di 20 minuti"
                    onKeyDown={e => { if (e.key === 'Enter' && (fixes[r.id] || '').trim()) build(r, fixes[r.id]); }}
                    className={`${input} flex-1 min-w-[220px]`} />
                  <button onClick={() => build(r, fixes[r.id] || '')} disabled={!(fixes[r.id] || '').trim()} className="btn-primary text-xs !py-1.5 !px-3 flex items-center gap-1.5 disabled:opacity-40"><Wand2 className="w-3.5 h-3.5" /> Correggi con l'AI</button>
                </div>
              </div>
            )}
            <p className={`text-xs ${sub}`}>Permessi: {r.placement?.uses_data ? 'legge materie, impegni e voti' : 'non legge i dati'}{r.placement?.writes_data ? ' · aggiunge dati (studio, impegni, voti, note)' : ''}</p>

            {html.trim() ? <div className={`rounded-xl p-3 space-y-1.5 ${well}`}>
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
            </div> : <p className={`text-xs ${sub}`}>Il controllo di sicurezza compare quando c'è il codice.</p>}

            <div className="flex flex-wrap gap-2">
              <button onClick={() => setOpen(o => ({ ...o, [r.id]: view === 'preview' ? 'none' : 'preview' }))} disabled={!html.trim()} className={small}><Eye className="w-3.5 h-3.5" /> Anteprima</button>
              <button onClick={() => setOpen(o => ({ ...o, [r.id]: view === 'code' ? 'none' : 'code' }))} className={small}><Code2 className="w-3.5 h-3.5" /> Codice</button>
              <button onClick={() => aiReview(r)} disabled={busy === r.id || !html.trim()} className={small}><Sparkles className="w-3.5 h-3.5" /> {ai ? 'Rifai analisi AI' : 'Analisi AI'}</button>
              {r.status !== 'approved' && <button onClick={() => approve(r)} disabled={busy === r.id || !html.trim()} className="btn-primary text-xs !py-1.5 !px-3 flex items-center gap-1 disabled:opacity-40"><Check className="w-3.5 h-3.5" /> Approva</button>}
              {r.status === 'pending' && <button onClick={() => reject(r)} disabled={busy === r.id} className="text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1 bg-red-500/10 text-red-400 hover:bg-red-500/20"><X className="w-3.5 h-3.5" /> Rifiuta</button>}
              {r.status === 'pending' && html.trim() && gen[r.id] !== 'working' && <button onClick={() => build(r)} className={small}><RotateCcw className="w-3.5 h-3.5" /> Rifai da capo</button>}
              {r.status === 'pending' && <button onClick={() => copyBrief(r)} className={small}>{copied === r.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied === r.id ? 'Copiato' : 'Copia per Claude'}</button>}
              {busy === r.id && <Loader2 className={`w-4 h-4 animate-spin self-center ${sub}`} />}
            </div>
            {r.admin_note && <p className={`text-xs ${sub}`}>Nota allo studente: {r.admin_note}</p>}

            {view === 'preview' && html.trim() && <Preview key={html} html={html} writes={!!r.placement?.writes_data} darkMode={darkMode} />}
            {view === 'code' && (
              <div className="space-y-2">
                <textarea value={html} onChange={e => { const v = extractHtml(e.target.value); setCodes(c => ({ ...c, [r.id]: v })); }} spellCheck={false}
                  placeholder="Incolla qui la risposta di Claude" className={`${input} w-full font-mono text-xs h-80`} />
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => saveCode(r)} disabled={!edited || busy === r.id} className={small}>Salva il codice</button>
                  <span className={`text-xs ${sub}`}>Puoi correggere a mano o incollare una versione fatta da Claude (tengo solo la pagina HTML). Salvalo per non perderlo; "Approva" usa comunque quello scritto qui. Il controllo qui sopra si aggiorna mentre scrivi.</span>
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
