import { useMemo, useState } from 'react';
import { AlertTriangle, Inbox, Clock, Wallet, FolderKanban, Users, Building2, CalendarRange, ArrowRight, Sparkles, Database, Loader2, Send } from 'lucide-react';
import { BizRole, Org, Person, projectHealth, nextDue } from '../../lib/business';
import { BizSnapshot, seedDemo } from '../../lib/businessData';
import { attentionList, agendaItems, teamLoad, cashForecast, eur, addDays, diffDays } from '../../lib/businessIntel';
import { inDays } from '../../lib/businessAI';
import type { BusinessTab } from './sections';
import { Empty } from './ui';
import PlanCard from './PlanCard';

const hello = () => { const h = new Date().getHours(); return h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera'; };

export default function Oggi({ org, me, myRole, snap, onOpen, onAskCoach, onChanged }: {
  org: Org; me: Person | null; myRole: BizRole; snap: BizSnapshot | null; onOpen: (tab: BusinessTab, focusId?: string) => void;
  onAskCoach: (text: string) => void; onChanged: () => void;
}) {
  const [ask, setAsk] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState('');
  const today = new Date().toLocaleDateString('sv-SE');
  const canFinance = ['titolare', 'admin', 'finanza'].includes(myRole);

  const data = useMemo(() => {
    if (!snap) return null;
    return {
      attention: attentionList(snap, today, null).slice(0, 5),
      todayItems: agendaItems(snap, today, today),
      next: agendaItems(snap, addDays(today, 1), addDays(today, 7)),
      load: teamLoad(snap.people, snap.tasks, today).filter(l => l.open || l.person.id === me?.id),
      cash: cashForecast(typeof org.settings?.cash_balance === 'number' ? org.settings.cash_balance : null, null, snap.invoices, today, 30),
      projects: snap.projects.filter(p => p.status === 'attivo').map(p => ({ p, h: projectHealth(p, snap.tasks.filter(t => t.project_id === p.id), today) })).sort((a, b) => a.h.score - b.h.score),
      clientDue: snap.terms.map(t => {
        const c = snap.contracts.find(x => x.id === t.contract_id);
        const due = c && c.status === 'attivo' ? nextDue(t, c, today) : null;
        return due && diffDays(today, due) <= 14 ? { t, due, who: snap.clients.find(x => x.id === c!.counterparty_id) } : null;
      }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5),
    };
  }, [snap, today, org.settings, me?.id]);

  const empty = snap && !snap.clients.length && !snap.projects.length && !snap.tasks.length;
  const loadDemo = async () => {
    setSeeding(true); setSeedError('');
    try { await seedDemo(org.id); onChanged(); } catch (err) { setSeedError(err instanceof Error ? err.message : String(err)); } finally { setSeeding(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm" style={{ color: 'var(--text-subtle)' }}>{new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h2 className="text-[34px] leading-[1.1] font-bold tracking-[-0.035em]" style={{ color: 'var(--text)' }}>{hello()}{me ? `, ${me.name.split(' ')[0]}` : ''}.</h2>
      </div>

      {/* The shortest way in: write to the Coach from here. */}
      <form onSubmit={e => { e.preventDefault(); if (ask.trim()) { onAskCoach(ask.trim()); setAsk(''); } }} className="glass-card p-2 pl-4 flex items-center gap-2">
        <Sparkles className="w-[18px] h-[18px] flex-shrink-0" style={{ color: 'var(--brand-ring)' }} />
        <input value={ask} onChange={e => setAsk(e.target.value)} placeholder="Nuovo cliente, un’email, una domanda… scrivilo al Coach" aria-label="Scrivi al Coach"
          className="flex-1 min-w-0 bg-transparent outline-none h-11 text-[15px]" style={{ color: 'var(--text)' }} />
        <button type="submit" aria-label="Invia al Coach" disabled={!ask.trim()} className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40" style={{ background: 'var(--brand-fill)', color: 'var(--on-brand)' }}><Send className="w-4 h-4" /></button>
      </form>

      {!snap ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-subtle)' }} /></div> : (
        <>
          {!snap.part2 && (
            <Panel icon={Database} title="Manca un passaggio">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Per agenda, documenti, fatture, proposte del Coach e dati di prova va eseguito una volta il file <code>supabase/business_2.sql</code> su Supabase (SQL Editor → Run).</p>
            </Panel>
          )}
          {empty && snap.part2 && myRole === 'titolare' && (
            <Panel icon={Database} title="Vuoi vedere MYND Business al lavoro?">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Carico un’azienda di esempio (sponsor, clienti, contratti, progetti, fatture, agenda). Si toglie con un tocco dalle impostazioni.</p>
              <button onClick={loadDemo} disabled={seeding} className="btn-primary h-11 px-5 inline-flex items-center gap-2 w-fit">{seeding && <Loader2 className="w-4 h-4 animate-spin" />} Carica i dati di prova</button>
              {seedError && <p className="text-sm" style={{ color: 'var(--danger)' }}>{seedError}</p>}
            </Panel>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:gap-4 md:grid-cols-2">
            <Panel icon={AlertTriangle} title="Attenzione" wide>
              {data!.attention.length === 0 ? <Empty>Niente che richieda la tua attenzione. Ottimo.</Empty> : (
                <ol className="space-y-1.5">
                  {data!.attention.map((a, i) => (
                    <li key={a.id}>
                      <button onClick={() => onOpen(a.area === 'clienti' ? 'clienti' : a.area === 'finanza' ? 'finanza' : a.area === 'team' ? 'team' : 'progetti', a.targetId)}
                        className="w-full text-left rounded-2xl px-4 py-3 flex gap-3 hover:brightness-110" style={{ background: 'var(--glass-well)' }}>
                        <span className="tabular text-sm font-semibold w-4 flex-shrink-0" style={{ color: i === 0 ? 'var(--brand-ring)' : 'var(--text-subtle)' }}>{i + 1}</span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium" style={{ color: 'var(--text)' }}>{a.title}</span>
                          <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{a.why}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>

            <Panel id="da-confermare" icon={Inbox} title={`Da confermare${snap.proposals.length ? ` · ${snap.proposals.length}` : ''}`} wide={snap.proposals.length > 0}>
              {snap.proposals.length === 0 ? <Empty>Nessuna proposta in attesa. Quando il Coach prepara qualcosa, la trovi qui.</Empty>
                : <div className="space-y-3">{snap.proposals.slice(0, 3).map(p => <PlanCard key={p.id} orgId={org.id} proposal={p} snap={snap} onDone={onChanged} />)}</div>}
            </Panel>

            <Panel icon={Clock} title="La giornata" onMore={() => onOpen('agenda')}>
              {data!.todayItems.length === 0 ? <Empty>Niente in programma oggi.</Empty> : (
                <ul className="space-y-1">
                  {data!.todayItems.map(it => (
                    <li key={it.id} className="flex gap-3 py-1.5 text-sm">
                      <span className="tabular w-12 flex-shrink-0" style={{ color: 'var(--text-subtle)' }}>{it.time || 'oggi'}</span>
                      <span className="min-w-0"><span className="block truncate" style={{ color: 'var(--text)' }}>{it.title}</span>{it.detail && <span className="block text-xs truncate" style={{ color: 'var(--text-subtle)' }}>{it.detail}</span>}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {canFinance && snap.part2 && (
              <Panel icon={Wallet} title="Cassa" onMore={() => onOpen('finanza')}>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Saldo" value={data!.cash.balance != null ? eur(data!.cash.balance) : '—'} />
                  <Stat label="Tra 30 giorni (stima)" value={eur(data!.cash.points[data!.cash.points.length - 1]?.balance ?? 0)} />
                  <Stat label="Da incassare" value={eur(data!.cash.receivable)} />
                  <Stat label="Da pagare" value={eur(data!.cash.payable)} />
                </div>
                {data!.cash.overdueIn > 0 && <p className="text-xs" style={{ color: 'var(--warning)' }}>{eur(data!.cash.overdueIn)} di fatture scadute da incassare.</p>}
              </Panel>
            )}

            <Panel icon={FolderKanban} title="Progetti" onMore={() => onOpen('progetti')}>
              {data!.projects.length === 0 ? <Empty>Nessun progetto attivo.</Empty> : (
                <ul className="space-y-1.5">
                  {data!.projects.slice(0, 4).map(({ p, h }) => (
                    <li key={p.id}>
                      <button onClick={() => onOpen('progetti', p.id)} className="w-full flex items-center gap-3 text-left py-1.5">
                        <span className="tabular text-sm font-semibold w-8" style={{ color: h.score >= 75 ? 'var(--brand-ring)' : h.score >= 50 ? 'var(--warning)' : 'var(--danger)' }}>{h.score}</span>
                        <span className="min-w-0 flex-1"><span className="block text-sm truncate" style={{ color: 'var(--text)' }}>{p.name}</span><span className="block text-xs truncate" style={{ color: 'var(--text-subtle)' }}>{h.notes[0]}</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel icon={Users} title="Team" onMore={() => onOpen('team')}>
              {data!.load.length === 0 ? <Empty>Nessun compito assegnato.</Empty> : (
                <ul className="space-y-2.5">
                  {data!.load.map(l => (
                    <li key={l.person.id}>
                      <div className="flex justify-between text-sm"><span style={{ color: 'var(--text)' }}>{l.person.name}</span><span className="tabular" style={{ color: l.ratio > 1 ? 'var(--warning)' : 'var(--text-subtle)' }}>{l.hours} / {l.capacity} h</span></div>
                      <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--glass-well)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, l.ratio * 100)}%`, background: l.ratio > 1 ? 'var(--warning)' : 'var(--brand-fill)' }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel icon={Building2} title="Clienti" onMore={() => onOpen('clienti')}>
              {data!.clientDue.length === 0 ? <Empty>Nessuna scadenza dei clienti nei prossimi 14 giorni.</Empty> : (
                <ul className="space-y-1">
                  {data!.clientDue.map(({ t, due, who }) => (
                    <li key={t.id + due} className="flex gap-3 py-1.5 text-sm">
                      <span className="w-16 flex-shrink-0 text-xs pt-0.5" style={{ color: 'var(--text-subtle)' }}>{inDays(today, due)}</span>
                      <span className="min-w-0"><span className="block" style={{ color: 'var(--text)' }}>{t.description}</span><span className="block text-xs" style={{ color: 'var(--text-subtle)' }}>{who?.name} · {t.party === 'noi' ? 'tocca a noi' : 'tocca a loro'}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel icon={CalendarRange} title="Prossimi giorni" onMore={() => onOpen('agenda')}>
              {data!.next.length === 0 ? <Empty>Settimana libera.</Empty> : (
                <ul className="space-y-1">
                  {data!.next.slice(0, 6).map(it => (
                    <li key={it.id} className="flex gap-3 py-1 text-sm">
                      <span className="w-16 flex-shrink-0 text-xs pt-0.5" style={{ color: 'var(--text-subtle)' }}>{inDays(today, it.date)}</span>
                      <span className="truncate" style={{ color: 'var(--text)' }}>{it.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function Panel({ id, icon: Icon, title, children, wide, onMore }: { id?: string; icon: typeof Inbox; title: string; children: React.ReactNode; wide?: boolean; onMore?: () => void }) {
  return (
    <section id={id} className={`glass-card p-5 flex flex-col gap-3 ${wide ? 'md:col-span-2' : ''}`}>
      <div className="flex items-center gap-2.5">
        <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} />
        <h3 className="text-[15px] font-semibold flex-1" style={{ color: 'var(--text)' }}>{title}</h3>
        {onMore && <button onClick={onMore} aria-label={`Apri ${title}`} className="w-9 h-9 -mr-2 -my-2 flex items-center justify-center rounded-full hover:bg-white/5" style={{ color: 'var(--text-muted)' }}><ArrowRight className="w-4 h-4" /></button>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl px-3.5 py-3" style={{ background: 'var(--glass-well)' }}>
      <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>{label}</p>
      <p className="text-lg font-semibold tabular mt-0.5" style={{ color: 'var(--text)' }}>{value}</p>
    </div>
  );
}
