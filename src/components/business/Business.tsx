import { useCallback, useEffect, useState } from 'react';
import { Sun, CalendarDays, Building2, FolderKanban, Users, Wallet, FileText, Lightbulb, Workflow, MessageCircle, Bell, LayoutGrid, X, Settings2, Loader2 } from 'lucide-react';
import { BusinessTab, SECTION_PAGES } from './sections';
import { BizRole, BusinessSetupError, Org, Person, listOrgs, listPeople } from '../../lib/business';
import { SetupNeeded, CreateOrg } from './Setup';
import Team from './Team';
import Settings from './Settings';
import { ErrorNote } from './ui';

// MYND Business (only on the admin account for now). Ten sections: on the phone a floating
// bar with the four most used plus "Altro", on tablets a row of pills, on desktop a side list.
const TABS: { id: BusinessTab; label: string; icon: typeof Sun }[] = [
  { id: 'oggi', label: 'Oggi', icon: Sun },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'clienti', label: 'Clienti', icon: Building2 },
  { id: 'progetti', label: 'Progetti', icon: FolderKanban },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'finanza', label: 'Finanza', icon: Wallet },
  { id: 'documenti', label: 'Documenti', icon: FileText },
  { id: 'insights', label: 'Insights', icon: Lightbulb },
  { id: 'automazioni', label: 'Automazioni', icon: Workflow },
  { id: 'coach', label: 'Coach', icon: MessageCircle },
];
const PHONE_BAR: BusinessTab[] = ['oggi', 'agenda', 'progetti', 'coach'];
const TAB_KEY = 'mynd_business_tab';

const savedTab = (): BusinessTab => {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return TABS.some(x => x.id === v) ? (v as BusinessTab) : 'oggi';
  } catch { return 'oggi'; }
};

type Load =
  | { state: 'loading' }
  | { state: 'setup' }
  | { state: 'error'; message: string }
  | { state: 'none' }
  | { state: 'ready'; org: Org; people: Person[] };

export default function Business({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [tab, setTab] = useState<BusinessTab>(savedTab);
  const [moreOpen, setMoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const pending = 0; // items waiting in "Da confermare" (from phase 4)

  const reload = useCallback(async () => {
    try {
      const orgs = await listOrgs();
      if (orgs.length === 0) { setLoad({ state: 'none' }); return; }
      const org = orgs[0];
      setLoad({ state: 'ready', org, people: await listPeople(org.id) });
    } catch (err) {
      if (err instanceof BusinessSetupError) setLoad({ state: 'setup' });
      else setLoad({ state: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const org = load.state === 'ready' ? load.org : null;
  const people = load.state === 'ready' ? load.people : [];
  const me = people.find(p => p.user_id === userId) || null;
  const myRole: BizRole = me?.role || 'dipendente';
  const canManage = myRole === 'titolare' || myRole === 'admin';
  // Sections the owner switched off for the company (Oggi always stays).
  const hidden = org?.settings?.hidden_sections || [];
  const tabs = TABS.filter(x => x.id === 'oggi' || !hidden.includes(x.id));
  const phoneBar = PHONE_BAR.filter(id => tabs.some(x => x.id === id));
  useEffect(() => { if (!tabs.some(x => x.id === tab)) setTab('oggi'); }, [tabs, tab]);

  useEffect(() => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* ignore */ } }, [tab]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const go = (id: BusinessTab) => { setTab(id); setMoreOpen(false); window.scrollTo({ top: 0 }); };
  const openPending = () => {
    go('oggi');
    window.setTimeout(() => document.getElementById('da-confermare')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
  };
  const Page = SECTION_PAGES[tab];
  const barIndex = phoneBar.indexOf(tab);
  const lensIndex = barIndex >= 0 ? barIndex : phoneBar.length; // "Altro" holds the other sections

  if (load.state !== 'ready') {
    return (
      <div className="pb-10">
        <h1 className="text-xs font-medium uppercase tracking-[0.08em] mb-4" style={{ color: 'var(--text-muted)' }}>Business</h1>
        {load.state === 'loading' && <div className="py-24 flex justify-center"><Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--text-subtle)' }} /></div>}
        {load.state === 'setup' && <SetupNeeded onRetry={() => { setLoad({ state: 'loading' }); reload(); }} />}
        {load.state === 'none' && <CreateOrg defaultName={userEmail.split('@')[0]} onCreated={reload} />}
        {load.state === 'error' && (
          <div className="max-w-xl space-y-4">
            <ErrorNote text={load.message} />
            <button onClick={() => { setLoad({ state: 'loading' }); reload(); }} className="btn-secondary h-11 px-5">Riprova</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pb-28 sm:pb-0">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-xs font-medium uppercase tracking-[0.08em] truncate" style={{ color: 'var(--text-muted)' }}>
          Business<span style={{ color: 'var(--text-subtle)' }}> · {load.org.name}</span>
        </h1>
        <div className="flex items-center gap-2 flex-shrink-0">
        {canManage && (
          <button onClick={() => setSettingsOpen(true)} aria-label="Impostazioni azienda" title="Impostazioni azienda"
            className="w-11 h-11 flex items-center justify-center rounded-full glass-card !rounded-full">
            <Settings2 className="w-[18px] h-[18px]" strokeWidth={1.75} />
          </button>
        )}
        <button onClick={openPending} aria-label={`Da confermare: ${pending}`} title="Da confermare"
          className="relative w-11 h-11 -mr-1.5 flex items-center justify-center rounded-full glass-card !rounded-full">
          <Bell className="w-[18px] h-[18px]" strokeWidth={1.75} />
          {pending > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full text-[11px] font-semibold flex items-center justify-center"
              style={{ background: 'var(--brand-fill)', color: 'var(--on-brand)' }}>{pending}</span>
          )}
        </button>
        </div>
      </div>

      {/* Tablet: all the sections in a row of pills */}
      <nav aria-label="Sezioni Business" className="hidden sm:flex lg:hidden gap-1.5 overflow-x-auto pb-1 mb-5 -mx-1 px-1">
        {tabs.map(x => (
          <button key={x.id} onClick={() => go(x.id)} aria-current={tab === x.id ? 'page' : undefined}
            className={`flex-shrink-0 h-10 px-4 rounded-full text-sm font-medium flex items-center gap-2 transition-colors ${tab === x.id ? 'glass-lens' : 'glass-card !rounded-full'}`}
            style={{ color: tab === x.id ? 'var(--brand-ring)' : 'var(--text-muted)' }}>
            <x.icon className="w-4 h-4" strokeWidth={1.75} /> {x.label}
          </button>
        ))}
      </nav>

      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        {/* Desktop: side list */}
        <nav aria-label="Sezioni Business" className="hidden lg:block">
          <div className="glass-card p-2 space-y-0.5 sticky" style={{ top: 'calc(3.5rem + env(safe-area-inset-top) + 16px)' }}>
            {tabs.map(x => (
              <button key={x.id} onClick={() => go(x.id)} aria-current={tab === x.id ? 'page' : undefined}
                className={`w-full h-11 px-3.5 rounded-2xl flex items-center gap-3 text-[15px] font-medium transition-colors duration-150 ${tab === x.id ? 'glass-lens' : 'hover:bg-white/5'}`}
                style={{ color: tab === x.id ? 'var(--brand-ring)' : 'var(--text-muted)' }}>
                <x.icon className="w-[18px] h-[18px]" strokeWidth={1.75} /> {x.label}
              </button>
            ))}
          </div>
        </nav>

        <div key={tab} className="animate-section-in min-w-0">
          {tab === 'team'
            ? <Team orgId={load.org.id} people={load.people} myRole={myRole} myPersonId={me?.id || null} onChanged={reload} />
            : <Page onOpen={go} />}
        </div>
      </div>

      {/* Phone: floating glass bar, the active item is a sliding lens */}
      <nav aria-label="Business" className="sm:hidden glass-float fixed z-40 left-[14px] right-[14px] h-[68px] rounded-full p-1.5 flex"
        style={{ bottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        <div className="relative flex-1 flex">
          <span aria-hidden className="glass-lens absolute top-0 bottom-0 rounded-full transition-transform duration-[250ms]"
            style={{ width: `${100 / (phoneBar.length + 1)}%`, transform: `translateX(${lensIndex * 100}%)`, transitionTimingFunction: 'var(--ease-spring)' }} />
          {phoneBar.map(id => {
            const x = TABS.find(t => t.id === id)!;
            return (
              <button key={id} onClick={() => go(id)} aria-current={tab === id ? 'page' : undefined}
                className="relative flex-1 flex flex-col items-center justify-center gap-[3px] rounded-full text-[10px] font-semibold transition-colors duration-150"
                style={{ color: tab === id ? 'var(--brand-ring)' : 'var(--text-muted)' }}>
                <x.icon className="w-[22px] h-[22px]" strokeWidth={1.75} /> {x.label}
              </button>
            );
          })}
          <button onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen}
            className="relative flex-1 flex flex-col items-center justify-center gap-[3px] rounded-full text-[10px] font-semibold transition-colors duration-150"
            style={{ color: barIndex < 0 ? 'var(--brand-ring)' : 'var(--text-muted)' }}>
            <LayoutGrid className="w-[22px] h-[22px]" strokeWidth={1.75} /> {barIndex < 0 ? tabs.find(t => t.id === tab)?.label || 'Altro' : 'Altro'}
          </button>
        </div>
      </nav>

      {settingsOpen && (
        <Settings org={load.org} people={load.people} sections={TABS} onClose={() => setSettingsOpen(false)}
          onSaved={() => { setSettingsOpen(false); reload(); }} />
      )}

      {moreOpen && (
        <div className="sm:hidden fixed inset-0 z-[60] sidebar-overlay flex items-end" onClick={() => setMoreOpen(false)}>
          <div role="dialog" aria-label="Altre sezioni" className="w-full glass-panel rounded-t-[28px] p-4 animate-scale-in"
            style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 px-1">
              <p className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Altre sezioni</p>
              <button onClick={() => setMoreOpen(false)} aria-label="Chiudi" className="w-10 h-10 -mr-2 flex items-center justify-center rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {tabs.filter(x => !phoneBar.includes(x.id)).map(x => (
                <button key={x.id} onClick={() => go(x.id)} aria-current={tab === x.id ? 'page' : undefined}
                  className={`h-[84px] rounded-2xl flex flex-col items-center justify-center gap-2 text-[13px] font-medium ${tab === x.id ? 'glass-lens' : 'glass-card !rounded-2xl'}`}
                  style={{ color: tab === x.id ? 'var(--brand-ring)' : 'var(--text)' }}>
                  <x.icon className="w-[22px] h-[22px]" strokeWidth={1.75} /> {x.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
