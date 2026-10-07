import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sun, Timer as TimerIcon, CalendarDays, TrendingUp, MessageCircle } from 'lucide-react';
import { MindsetData, PriorityArea, defaultMindset, normalizeMindset, formatDuration } from '../../lib/mindset';
import { toDateKey } from '../../lib/store';
import { themeOf } from './ui';
import MindsetToday from './MindsetToday';
import MindsetFocus from './MindsetFocus';
import MindsetPlan from './MindsetPlan';
import MindsetProgress from './MindsetProgress';
import MindsetCoach from './MindsetCoach';
import type { StudyInfo } from '../../lib/mindsetCoach';

type Tab = 'oggi' | 'focus' | 'piano' | 'progressi' | 'coach';
const TABS: { id: Tab; label: string; icon: typeof Sun }[] = [
  { id: 'oggi', label: 'Oggi', icon: Sun },
  { id: 'focus', label: 'Focus', icon: TimerIcon },
  { id: 'piano', label: 'Piano', icon: CalendarDays },
  { id: 'progressi', label: 'Andamento', icon: TrendingUp },
  { id: 'coach', label: 'Coach', icon: MessageCircle },
];

interface Props {
  mindset?: MindsetData;
  darkMode: boolean;
  // Receives the saved value (maybe still empty): it is completed with the defaults here.
  onUpdate: (fn: (prev?: MindsetData) => MindsetData) => void;
  subjects: string[];
  onStudySession: (subject: string, minutes: number) => void;
  study: StudyInfo;
  // Opened from an iPhone automation: "sera" shows the evening reset.
  initialView?: string | null;
}

export default function Mindset({ mindset, darkMode, onUpdate, subjects, onStudySession, initialView, study }: Props) {
  const m = useMemo(() => normalizeMindset(mindset) || defaultMindset(), [mindset]);
  const t = themeOf(darkMode);
  const [tab, setTab] = useState<Tab>(initialView === 'focus' ? 'focus' : initialView === 'piano' ? 'piano' : initialView === 'coach' ? 'coach' : 'oggi');
  const [eveningOpen, setEveningOpen] = useState(initialView === 'sera');
  const [focusPreset, setFocusPreset] = useState<{ task: string; area: PriorityArea | 'other' } | null>(null);

  useEffect(() => {
    if (initialView === 'sera') {
      setTab('oggi');
      setEveningOpen(true);
      window.setTimeout(() => document.getElementById('reset-serale')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    }
  }, [initialView]);

  const update = useCallback((fn: (x: MindsetData) => MindsetData) => onUpdate(prev => fn(normalizeMindset(prev) || defaultMindset())), [onUpdate]);
  const usePreset = useCallback(() => setFocusPreset(null), []);

  if (!m.profile.setupDone) {
    return <Welcome m={m} darkMode={darkMode} onStart={() => update(x => ({ ...x, profile: { ...x.profile, setupDone: true, stage: { ...x.profile.stage, since: toDateKey(new Date()) } } }))} />;
  }

  return (
    <div className="space-y-4 pb-28 sm:pb-0">
      <div className="flex items-center justify-between gap-3">
        <h1 className={`text-xs font-medium uppercase tracking-[0.08em] ${t.sub}`}>Performance</h1>
        {m.activeFocus && tab !== 'focus' && (
          <button onClick={() => setTab('focus')} className="text-xs px-3 h-8 rounded-full glass-card !rounded-full inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#C8F25A', boxShadow: '0 0 8px #C8F25A' }} />Focus in corso</button>
        )}
      </div>

      {/* Tabs: a floating glass capsule at the bottom on the phone, a bar on top on larger screens.
          The active tab is a glass "lens" that slides to its place. */}
      <nav aria-label="Performance"
        className="glass-float fixed sm:static z-40 sm:z-auto left-[14px] right-[14px] h-[68px] sm:h-14 rounded-full p-1.5 flex"
        style={{ bottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        <div className="relative flex-1 flex">
          <span aria-hidden className="glass-lens absolute top-0 bottom-0 rounded-full transition-transform duration-[250ms]"
            style={{ width: `${100 / TABS.length}%`, transform: `translateX(${TABS.findIndex(x => x.id === tab) * 100}%)`, transitionTimingFunction: 'var(--ease-spring)' }} />
          {TABS.map(x => (
            <button key={x.id} onClick={() => setTab(x.id)} aria-current={tab === x.id ? 'page' : undefined}
              className="relative flex-1 flex flex-col sm:flex-row items-center justify-center gap-[3px] sm:gap-2 rounded-full text-[10px] sm:text-sm font-semibold transition-colors duration-150"
              style={{ color: tab === x.id ? 'var(--brand-ring)' : 'var(--text-muted)' }}>
              <x.icon className="w-[22px] h-[22px] sm:w-[18px] sm:h-[18px]" strokeWidth={1.75} /> {x.label}
            </button>
          ))}
        </div>
      </nav>

      <div key={tab} className="animate-section-in">
        {tab === 'oggi' && (
          <MindsetToday m={m} update={update} t={t} subjects={subjects} tasks={study.tasks} eveningOpen={eveningOpen} onEveningOpen={setEveningOpen}
            onStartFocus={(task, area) => { setFocusPreset({ task, area }); setTab('focus'); }} />
        )}
        {tab === 'focus' && <MindsetFocus m={m} update={update} t={t} subjects={subjects} preset={focusPreset} onPresetUsed={usePreset} onStudySession={onStudySession} />}
        {tab === 'piano' && <MindsetPlan m={m} update={update} t={t} />}
        {tab === 'progressi' && <MindsetProgress m={m} t={t} />}
        {tab === 'coach' && <MindsetCoach m={m} update={update} t={t} study={study} />}
      </div>
    </div>
  );
}

function Welcome({ m, darkMode, onStart }: { m: MindsetData; darkMode: boolean; onStart: () => void }) {
  const t = themeOf(darkMode);
  const p = m.profile;
  const rows: [string, string][] = [
    ['Sveglia di partenza', `${p.stage.wake} (come adesso)`],
    ['Obiettivo', `${p.targetWake}, scendendo di ${p.stepMinutes} minuti ogni ${p.stepDays} giorni, solo se dormi abbastanza`],
    ['Sonno', `${formatDuration(p.sleepNeed)} a notte: si sveglia prima chi va a letto prima`],
    ['Settimana', 'Lun, Mer, Ven Acqua · Mar, Gio Palestra · Sab weekend attivo · Dom recupero'],
    ['Telefono', `da ridurre per gradi fino a ${formatDuration(p.phoneGoal)} al giorno`],
  ];
  return (
    <div className={`${t.card} p-6 sm:p-8 max-w-2xl mx-auto space-y-6 animate-scale-in`}>
      <div>
        <p className={`text-xs font-bold tracking-[0.3em] ${t.sub}`}>PERFORMANCE</p>
        <h2 className={`text-3xl font-bold mt-2 ${t.text}`}>Ciao {p.name}.</h2>
        <p className={`mt-2 ${t.sub}`}>
          Questo non è un programma da rispettare per forza. È un sistema che osserva le tue giornate, impara da quello
          che succede davvero (anche dagli imprevisti) e ti propone piccoli aggiustamenti, sempre graduali. Decidi sempre tu.
        </p>
      </div>
      <ul className="space-y-2">
        {rows.map(([k, v]) => (
          <li key={k} className={`flex gap-3 p-3 rounded-xl ${t.soft}`}>
            <span className={`w-36 flex-shrink-0 text-sm font-medium ${t.text}`}>{k}</span>
            <span className={`text-sm ${t.sub}`}>{v}</span>
          </li>
        ))}
      </ul>
      <p className={`text-sm ${t.sub}`}>Ho preparato tutto in base alla tua giornata. Puoi cambiare ogni cosa dalla scheda Piano.</p>
      <button onClick={onStart} className="btn-primary w-full py-3 text-base">Inizia</button>
    </div>
  );
}
