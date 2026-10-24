import { useState } from 'react';
import { Check, Loader2, Ticket, CreditCard, Download, LogOut } from 'lucide-react';
import { Access, Plan, accessKind, daysLeft, euro, isPaid, openPortal, paysFrom, redeemCode, shortDate, startCheckout, yearlySaving } from '../lib/billing';
import { ErrorNote, Sheet } from './business/ui';
import { ManifestoScreen } from './Auth';

const PERKS = ['Tutta MYND, senza limiti', 'Guida Studio AI, Archivio, Calendario e il resto', 'Disdici quando vuoi, in due tocchi'];

// The two plans and the "Abbonati" button (it opens Stripe's payment page).
export function Plans({ access }: { access: Access }) {
  const [plan, setPlan] = useState<Plan>('annuale');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = yearlySaving(access);
  const freeUntil = paysFrom(access);

  const pay = async () => {
    setBusy(true); setError('');
    try { await startCheckout(plan); } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  };

  const card = (id: Plan, title: string, price: string, note: string, badge?: string) => (
    <button type="button" role="radio" aria-checked={plan === id} onClick={() => setPlan(id)}
      className="w-full text-left rounded-2xl p-4 flex items-center gap-3 transition"
      style={{ background: 'var(--glass-well)', border: `1.5px solid ${plan === id ? 'var(--brand-ring)' : 'var(--glass-edge)'}` }}>
      <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ border: `1.5px solid ${plan === id ? 'var(--brand-ring)' : 'var(--text-subtle)'}` }}>
        {plan === id && <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--brand-ring)' }} />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2 flex-wrap">
          <span className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{title}</span>
          {badge && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--brand-fill)', color: 'var(--on-brand)' }}>{badge}</span>}
        </span>
        <span className="block text-xs mt-0.5" style={{ color: 'var(--text-subtle)' }}>{note}</span>
      </span>
      <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: 'var(--text)' }}>{price}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Piano" className="space-y-2">
        {card('annuale', 'Annuale', `${euro(access.price_year_cents)}/anno`, `Come ${euro(Math.round(access.price_year_cents / 12))} al mese`, saving > 0 ? `Risparmi il ${saving}%` : undefined)}
        {card('mensile', 'Mensile', `${euro(access.price_month_cents)}/mese`, 'Rinnovo ogni mese')}
      </div>
      <button onClick={pay} disabled={busy} className="btn-primary w-full h-12 !rounded-full text-base inline-flex items-center justify-center gap-2 disabled:opacity-50">
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />} {busy ? 'Apro il pagamento…' : 'Abbonati'}
      </button>
      <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--text-subtle)' }}>
        {freeUntil ? <>Non paghi niente fino al <b>{shortDate(freeUntil)}</b>: l'addebito parte solo dopo. </> : null}
        Paghi con Apple Pay, Google Pay, carta o Link sulla pagina sicura di Stripe. Prezzi IVA inclusa.
      </p>
      <ErrorNote text={error} />
    </div>
  );
}

// "Ho un codice": unlocks the app at once, no card.
export function CodeBox({ onRedeemed }: { onRedeemed: (a: Access) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const use = async () => {
    if (!code.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const a = await redeemCode(code);
      setDone(a.code_forever ? 'Codice attivato: MYND è gratis per te, per sempre.' : `Codice attivato: MYND è gratis fino al ${shortDate(a.code_until!)}.`);
      setCode('');
      onRedeemed(a);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    setBusy(false);
  };

  if (done) return <p className="text-sm flex items-start gap-2 rounded-2xl p-3" style={{ background: 'var(--glass-well)', color: 'var(--text)' }}><Check className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--brand-ring)' }} />{done}</p>;
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full h-11 rounded-full text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>
        <Ticket className="w-4 h-4" /> Ho un codice
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === 'Enter') use(); }} autoFocus
          placeholder="Il tuo codice" aria-label="Codice" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={40}
          className="input-glass flex-1 min-w-0 h-11 text-[15px] tracking-wider uppercase" />
        <button onClick={use} disabled={!code.trim() || busy} className="btn-secondary h-11 px-4 flex-shrink-0 inline-flex items-center gap-1.5 disabled:opacity-40">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Usa
        </button>
      </div>
      <ErrorNote text={error} />
    </div>
  );
}

// Account → Abbonamento.
export function AbbonamentoSheet({ access, onClose, onChange }: { access: Access; onClose: () => void; onChange: (a: Access) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const kind = accessKind(access);
  const manage = async () => {
    setBusy(true); setError('');
    try { await openPortal(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  };

  const status = (() => {
    switch (kind) {
      case 'admin': return { title: 'Account admin', text: 'Hai tutto incluso. Da qui puoi comunque provare il pagamento (con le chiavi di prova di Stripe).' };
      case 'spento': return { title: 'MYND è gratis', text: 'Per ora l\'abbonamento non serve.' };
      case 'abbonato': return access.status === 'past_due'
        ? { title: 'Pagamento non riuscito', text: 'Stripe sta ritentando. Aggiorna la carta da "Gestisci abbonamento" per non perdere l\'accesso.' }
        : { title: `Abbonamento ${access.plan === 'annuale' ? 'annuale' : 'mensile'} attivo`, text: access.period_end ? (access.cancel_at_period_end ? `Disdetto: resta attivo fino al ${shortDate(access.period_end)}.` : `${access.status === 'trialing' ? 'Primo addebito' : 'Prossimo rinnovo'} il ${shortDate(access.period_end)}.`) : 'Grazie per sostenere MYND!' };
      case 'codice': return { title: 'Gratis con codice', text: access.code_forever ? 'Per sempre.' : `Fino al ${shortDate(access.code_until!)}.${paysFrom(access) ? ' Puoi abbonarti già ora: paghi solo da quel giorno.' : ' Abbonati per continuare senza interruzioni.'}` };
      case 'prova': { const d = daysLeft(access.trial_end); return { title: `Prova gratuita · ${d} ${d === 1 ? 'giorno' : 'giorni'}`, text: `Finisce il ${shortDate(access.trial_end)}.${paysFrom(access) ? ' Se ti abboni ora paghi solo da quel giorno.' : ' Abbonati per continuare senza interruzioni.'}` }; }
      default: return { title: 'La prova è finita', text: 'Abbonati o usa un codice per continuare.' };
    }
  })();

  return (
    <Sheet title="Abbonamento" onClose={onClose}>
      <div className="rounded-2xl p-4" style={{ background: 'var(--glass-well)' }}>
        <p className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{status.title}</p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{status.text}</p>
      </div>
      {access.has_customer && (isPaid(access) || access.status === 'canceled' || access.status === 'unpaid') && (
        <button onClick={manage} disabled={busy} className="btn-secondary w-full h-11 inline-flex items-center justify-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />} Gestisci abbonamento
        </button>
      )}
      {access.has_customer && isPaid(access) && <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Cambia carta o piano, scarica le ricevute o disdici: si apre la pagina sicura di Stripe.</p>}
      <ErrorNote text={error} />
      {!isPaid(access) && kind !== 'spento' && <Plans access={access} />}
      {kind !== 'abbonato' && kind !== 'admin' && kind !== 'spento' && !access.code_forever && <CodeBox onRedeemed={onChange} />}
    </Sheet>
  );
}

// After the trial, without subscription or code: the app waits here (the data stays safe).
export function Paywall({ access, email, onChange, onLogout, onExport }: { access: Access; email: string; onChange: (a: Access) => void; onLogout: () => void; onExport: () => void }) {
  const [manageError, setManageError] = useState('');
  const pastDue = access.status === 'unpaid' || access.status === 'canceled';
  return (
    <ManifestoScreen glow="right" footer={
      <div className="flex gap-2.5">
        <button onClick={onExport} className="btn-secondary flex-1 h-12 text-sm inline-flex items-center justify-center gap-1.5"><Download className="w-4 h-4" /> I miei dati</button>
        <button onClick={onLogout} className="btn-secondary flex-1 h-12 text-sm inline-flex items-center justify-center gap-1.5"><LogOut className="w-4 h-4" /> Esci</button>
      </div>
    }>
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-3">
          <h1 className="text-[46px] font-bold" style={{ letterSpacing: '-0.05em', lineHeight: 0.98 }}>{pastDue ? <>Abbonamento<br />scaduto.</> : <>La prova<br />è finita.</>}</h1>
          <p className="text-base leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            I tuoi impegni, voti, file e chat sono al sicuro. Abbonati o usa un codice per ritrovarli subito.
          </p>
          <p className="text-[13px]" style={{ color: 'var(--text-subtle)' }}>{email}</p>
        </div>
        <ul className="space-y-1.5">
          {PERKS.map(p => <li key={p} className="text-sm flex items-center gap-2" style={{ color: 'var(--text)' }}><Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--brand-ring)' }} />{p}</li>)}
        </ul>
        <Plans access={access} />
        <CodeBox onRedeemed={onChange} />
        {access.has_customer && (
          <button onClick={() => openPortal().catch(err => setManageError(err instanceof Error ? err.message : String(err)))} className="text-xs underline self-center" style={{ color: 'var(--text-subtle)' }}>
            Ricevute e dati di pagamento
          </button>
        )}
        <ErrorNote text={manageError} />
      </div>
    </ManifestoScreen>
  );
}
