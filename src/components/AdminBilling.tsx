import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Copy, Trash2, Plus, Shuffle, ChevronDown, ChevronRight } from 'lucide-react';
import { AccessCode, BillingAdmin, createCode, deleteCode, euro, loadBilling, randomCode, saveBilling, setCodeActive, shortDate } from '../lib/billing';
import { useDialog } from './Dialog';

const STATUS: Record<string, string> = { active: 'Attivo', trialing: 'In prova', past_due: 'Pagamento da aggiornare', canceled: 'Disdetto', unpaid: 'Non pagato', incomplete: 'Incompleto', incomplete_expired: 'Scaduto', paused: 'In pausa' };

const cents = (v: string) => Math.round(Number(v.replace(',', '.')) * 100);
const euroInput = (c: number) => (c / 100).toFixed(2).replace('.', ',');

// Admin → Abbonamenti: switch the payments on, trial and prices, free codes, who is subscribed.
export default function AdminBilling({ darkMode }: { darkMode: boolean }) {
  const dialog = useDialog();
  const [info, setInfo] = useState<BillingAdmin | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState({ trial: '14', month: '3,99', year: '32,99' });
  const [code, setCode] = useState({ code: randomCode(), note: '', forever: true, months: '3', limited: false, maxUses: '1', expires: '' });
  const [opened, setOpened] = useState<string | null>(null);

  const text = darkMode ? 'text-white' : 'text-gray-800';
  const sub = darkMode ? 'text-white/60' : 'text-gray-500';
  const card = darkMode ? 'glass-card' : 'glass-card-light';
  const input = `${darkMode ? 'input-glass' : 'input-light'} h-10 text-sm`;

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const b = await loadBilling();
      setInfo(b);
      setForm({ trial: String(b.settings.trial_days), month: euroInput(b.settings.price_month_cents), year: euroInput(b.settings.price_year_cents) });
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); await refresh(); }
    catch (err) { await dialog.alert({ title: 'Operazione non riuscita', message: err instanceof Error ? err.message : String(err) }); }
    setBusy('');
  };

  const settingsFrom = (enabled: boolean) => {
    const trial = Math.round(Number(form.trial));
    const m = cents(form.month), y = cents(form.year);
    if (!Number.isFinite(trial) || trial < 0 || trial > 365) throw new Error('I giorni di prova vanno da 0 a 365.');
    if (!(m >= 50) || !(y >= 50)) throw new Error('Scrivi i prezzi in euro, es. 3,99 e 32,99.');
    return { enabled, trial_days: trial, price_month_cents: m, price_year_cents: y };
  };

  const toggle = async () => {
    if (!info) return;
    const on = !info.settings.enabled;
    const ok = await dialog.confirm(on ? {
      title: 'Accendere i pagamenti?',
      message: `Da ora chi usa MYND ha ${form.trial} giorni di prova (chi c'era già li conta da oggi, la prima volta), poi deve abbonarsi o usare un codice. Prima controlla di aver messo le chiavi di Stripe su Vercel e di aver provato un pagamento di prova.`,
      confirmLabel: 'Accendi',
    } : {
      title: 'Spegnere i pagamenti?',
      message: 'Tutti tornano a usare MYND gratis. Gli abbonamenti già attivi su Stripe NON vengono fermati: se vuoi, disdicili dal Dashboard di Stripe.',
      confirmLabel: 'Spegni', danger: true,
    });
    if (ok) run('toggle', () => saveBilling(settingsFrom(on)));
  };

  const addCode = () => run('code', async () => {
    const months = code.forever ? null : Math.round(Number(code.months));
    const max = code.limited ? Math.round(Number(code.maxUses)) : null;
    if (months !== null && !(months >= 1 && months <= 120)) throw new Error('I mesi vanno da 1 a 120.');
    if (max !== null && !(max >= 1)) throw new Error('Il numero di persone deve essere almeno 1.');
    await createCode({ code: code.code, note: code.note, months, max_uses: max, expires_at: code.expires ? new Date(`${code.expires}T23:59:59`).toISOString() : null });
    setCode(c => ({ ...c, code: randomCode(), note: '' }));
  });

  const remove = async (c: AccessCode) => {
    const ok = await dialog.confirm({
      title: `Eliminare ${c.code}?`,
      message: c.uses ? `Le ${c.uses} persone che l'hanno usato perdono l'accesso gratis che dava. Se vuoi solo che non si possa più usare, disattivalo.` : 'Nessuno l\'ha ancora usato.',
      confirmLabel: 'Elimina', danger: true,
    });
    if (ok) run(`del:${c.code}`, () => deleteCode(c.code));
  };

  const copy = (c: string) => { navigator.clipboard?.writeText(c).catch(() => {}); };

  if (loading && !info) return <div className="flex justify-center py-10"><Loader2 className={`w-6 h-6 animate-spin ${sub}`} /></div>;
  if (error) return (
    <div className={`${card} p-5 space-y-3`}>
      <p className="text-sm text-red-400">{error}</p>
      <button onClick={refresh} className="btn-secondary h-10 px-4 text-sm inline-flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Riprova</button>
    </div>
  );
  if (!info) return null;
  const s = info.settings;
  const n = info.counts;

  return (
    <div className="space-y-5">
      <div className={`${card} p-5 space-y-4`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={`font-semibold ${text}`}>Pagamenti {s.enabled ? 'accesi' : 'spenti'}</p>
            <p className={`text-sm mt-0.5 ${sub}`}>{s.enabled ? `Dopo ${s.trial_days} giorni di prova serve l'abbonamento o un codice.` : 'Tutti usano MYND gratis. I codici funzionano già e valgono anche dopo.'}</p>
          </div>
          <button role="switch" aria-checked={s.enabled} aria-label="Pagamenti attivi" onClick={toggle} disabled={busy === 'toggle'}
            className="relative w-12 h-7 rounded-full flex-shrink-0 transition disabled:opacity-50" style={{ background: s.enabled ? 'var(--brand-fill)' : 'var(--glass-well)', border: '1px solid var(--glass-edge)' }}>
            <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: s.enabled ? 24 : 3 }} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className={`text-xs ${sub}`}>Giorni di prova<input value={form.trial} onChange={e => setForm({ ...form, trial: e.target.value })} inputMode="numeric" aria-label="Giorni di prova" className={`${input} w-full mt-1`} /></label>
          <label className={`text-xs ${sub}`}>Mensile €<input value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} inputMode="decimal" aria-label="Prezzo mensile" className={`${input} w-full mt-1`} /></label>
          <label className={`text-xs ${sub}`}>Annuale €<input value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} inputMode="decimal" aria-label="Prezzo annuale" className={`${input} w-full mt-1`} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => run('save', async () => saveBilling(settingsFrom(s.enabled)))} disabled={!!busy} className="btn-primary h-10 px-4 text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />} Salva prova e prezzi
          </button>
          <p className={`text-xs ${sub}`}>Un nuovo prezzo vale per i nuovi abbonati; chi è già abbonato resta al suo.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[['Abbonati', n.active], ['In prova su Stripe', n.trialing], ['Mensile / Annuale', `${n.mensile} / ${n.annuale}`], ['Gratis con codice', n.codes]].map(([l, v]) => (
          <div key={l as string} className={`${card} p-4`}><p className={`text-2xl font-bold ${text}`}>{v}</p><p className={`text-xs mt-1 ${sub}`}>{l}</p></div>
        ))}
      </div>
      <p className={`text-xs ${sub}`}>Incasso al mese circa {euro(n.mensile * s.price_month_cents + Math.round(n.annuale * s.price_year_cents / 12))} lordi (prima di IVA e commissioni Stripe).</p>

      <div className={`${card} p-5 space-y-4`}>
        <p className={`font-semibold ${text}`}>Nuovo codice gratis</p>
        <div className="flex gap-2">
          <input value={code.code} onChange={e => setCode({ ...code, code: e.target.value.toUpperCase() })} aria-label="Codice" maxLength={32} className={`${input} flex-1 min-w-0 tracking-wider`} />
          <button onClick={() => setCode({ ...code, code: randomCode() })} title="Genera un codice" aria-label="Genera un codice" className="btn-secondary !p-0 w-10 h-10 flex items-center justify-center flex-shrink-0"><Shuffle className="w-4 h-4" /></button>
        </div>
        <input value={code.note} onChange={e => setCode({ ...code, note: e.target.value })} placeholder="Per chi è (es. Classe 3B, Marco, influencer…)" aria-label="Nota" maxLength={200} className={`${input} w-full`} />
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <fieldset className="space-y-1.5">
            <legend className={`text-xs mb-1 ${sub}`}>Quanto vale</legend>
            <label className={`flex items-center gap-2 ${text}`}><input type="radio" checked={code.forever} onChange={() => setCode({ ...code, forever: true })} /> Gratis per sempre</label>
            <label className={`flex items-center gap-2 ${text}`}><input type="radio" checked={!code.forever} onChange={() => setCode({ ...code, forever: false })} /> Per
              <input value={code.months} onChange={e => setCode({ ...code, months: e.target.value, forever: false })} onFocus={() => setCode(c => ({ ...c, forever: false }))} inputMode="numeric" aria-label="Mesi" className={`${input} !h-8 w-14 text-center`} /> mesi</label>
          </fieldset>
          <fieldset className="space-y-1.5">
            <legend className={`text-xs mb-1 ${sub}`}>Quante persone</legend>
            <label className={`flex items-center gap-2 ${text}`}><input type="radio" checked={!code.limited} onChange={() => setCode({ ...code, limited: false })} /> Senza limite</label>
            <label className={`flex items-center gap-2 ${text}`}><input type="radio" checked={code.limited} onChange={() => setCode({ ...code, limited: true })} /> Al massimo
              <input value={code.maxUses} onChange={e => setCode({ ...code, maxUses: e.target.value, limited: true })} onFocus={() => setCode(c => ({ ...c, limited: true }))} inputMode="numeric" aria-label="Persone" className={`${input} !h-8 w-14 text-center`} /></label>
          </fieldset>
          <label className={`text-xs ${sub}`}>Si può usare fino al (facoltativo)
            <input type="date" value={code.expires} onChange={e => setCode({ ...code, expires: e.target.value })} aria-label="Scadenza del codice" className={`${input} w-full mt-1.5`} />
          </label>
        </div>
        <button onClick={addCode} disabled={!!busy || code.code.length < 4} className="btn-primary h-10 px-4 text-sm inline-flex items-center gap-2 disabled:opacity-50">
          {busy === 'code' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Crea codice
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className={`font-semibold ${text}`}>Codici ({info.codes.length})</p>
          <button onClick={refresh} aria-label="Aggiorna" className={`w-9 h-9 rounded-full flex items-center justify-center ${sub}`}><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
        {info.codes.length === 0 && <p className={`text-sm ${sub}`}>Nessun codice ancora.</p>}
        {info.codes.map(c => {
          const expired = c.expires_at && Date.parse(c.expires_at) < Date.now();
          const full = c.max_uses !== null && c.uses >= c.max_uses;
          return (
            <div key={c.code} className={`${card} p-4`}>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setOpened(opened === c.code ? null : c.code)} className={`font-mono font-semibold tracking-wider flex items-center gap-1 ${text}`}>
                  {opened === c.code ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}{c.code}
                </button>
                <span className={`text-xs px-2 py-0.5 rounded-full ${!c.active || expired || full ? 'bg-gray-500/30 text-gray-300' : 'bg-emerald-500/20 text-emerald-400'}`}>
                  {!c.active ? 'Disattivato' : expired ? 'Scaduto' : full ? 'Esaurito' : 'Attivo'}
                </span>
                <span className="ml-auto flex items-center gap-1">
                  <button onClick={() => copy(c.code)} aria-label={`Copia ${c.code}`} title="Copia" className={`w-8 h-8 rounded-full flex items-center justify-center ${sub}`}><Copy className="w-4 h-4" /></button>
                  <button onClick={() => run(`act:${c.code}`, () => setCodeActive(c.code, !c.active))} disabled={!!busy} className="btn-secondary h-8 px-3 text-xs disabled:opacity-50">{c.active ? 'Disattiva' : 'Riattiva'}</button>
                  <button onClick={() => remove(c)} aria-label={`Elimina ${c.code}`} disabled={!!busy} className="w-8 h-8 rounded-full flex items-center justify-center text-red-400 disabled:opacity-50"><Trash2 className="w-4 h-4" /></button>
                </span>
              </div>
              <p className={`text-xs mt-1.5 ${sub}`}>
                {c.months ? `${c.months} ${c.months === 1 ? 'mese' : 'mesi'} gratis` : 'Gratis per sempre'} · usato {c.uses}{c.max_uses ? `/${c.max_uses}` : ''} {c.uses === 1 ? 'volta' : 'volte'}
                {c.expires_at ? ` · usabile fino al ${shortDate(c.expires_at)}` : ''}{c.note ? ` · ${c.note}` : ''}
              </p>
              {opened === c.code && (
                <ul className="mt-2 space-y-1">
                  {c.people.length === 0 && <li className={`text-xs ${sub}`}>Nessuno l'ha ancora usato.</li>}
                  {c.people.map(p => <li key={p.email} className={`text-xs ${text}`}>{p.email} <span className={sub}>· dal {shortDate(p.redeemed_at)}{p.free_until ? ` al ${shortDate(p.free_until)}` : ''}</span></li>)}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {info.subscribers.length > 0 && (
        <div className="space-y-2">
          <p className={`font-semibold ${text}`}>Abbonamenti</p>
          <div className={`${card} divide-y ${darkMode ? 'divide-white/10' : 'divide-black/5'}`}>
            {info.subscribers.map(x => (
              <div key={x.email} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className={`flex-1 min-w-0 truncate ${text}`}>{x.email}</span>
                <span className={sub}>{x.plan === 'annuale' ? 'Annuale' : 'Mensile'} · {STATUS[x.status] || x.status}{x.cancel_at_period_end ? ' (disdetto)' : ''}</span>
                {x.current_period_end && <span className={`text-xs ${sub}`}>{x.cancel_at_period_end ? 'fino al' : 'rinnovo'} {shortDate(x.current_period_end)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
