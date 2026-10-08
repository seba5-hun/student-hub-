import { useCallback, useEffect, useState } from 'react';
import { Workflow, History, Loader2, Play } from 'lucide-react';
import { BizRole, Org } from '../../lib/business';
import { Automation, AutomationRun, listAutomations, listRuns, upsertAutomation } from '../../lib/businessData';
import { AUTOMATION_TEMPLATES } from '../../lib/businessIntel';
import { PageTitle, Empty, Switch, ErrorNote } from './ui';

export default function Automazioni({ org, myRole, onRunNow }: { org: Org; myRole: BizRole; onRunNow: () => Promise<number> }) {
  const canManage = myRole === 'titolare' || myRole === 'admin';
  const [autos, setAutos] = useState<Automation[] | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState('');
  const load = useCallback(async () => {
    try { const [a, r] = await Promise.all([listAutomations(org.id), listRuns(org.id)]); setAutos(a); setRuns(r); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); setAutos([]); }
  }, [org.id]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (template: string, name: string, on: boolean) => {
    try { await upsertAutomation(org.id, template, name, on); load(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  const runNow = async () => {
    setRunning(true); setResult('');
    try { const n = await onRunNow(); setResult(n ? `Fatto: ${n} ${n === 1 ? 'compito creato' : 'compiti creati'}.` : 'Niente da fare adesso: tutto è già in ordine.'); load(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setRunning(false); }
  };

  if (!canManage) return <div className="space-y-6"><PageTitle title="Automazioni." /><Empty>Le automazioni le gestiscono titolare e admin.</Empty></div>;
  return (
    <div className="space-y-6">
      <PageTitle title="Automazioni." lead="Quando succede qualcosa, MYND fa il passo successivo da solo. Girano ogni volta che apri Business."
        action={<button onClick={runNow} disabled={running} className="btn-primary h-11 px-4 inline-flex items-center gap-1.5 flex-shrink-0">{running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Esegui ora</button>} />
      <ErrorNote text={error} />
      {result && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{result}</p>}
      {autos === null ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-subtle)' }} /></div> : (
        <ul className="space-y-3">
          {AUTOMATION_TEMPLATES.map(t => {
            const a = autos.find(x => x.template === t.template);
            const on = a ? a.active : false;
            return (
              <li key={t.template} className="glass-card p-5 flex gap-4 items-start">
                <Workflow className="w-[18px] h-[18px] flex-shrink-0 mt-0.5" strokeWidth={1.75} style={{ color: on ? 'var(--brand-ring)' : 'var(--text-subtle)' }} />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{t.name}</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}><b style={{ color: 'var(--text)' }}>Quando</b> {t.when.toLowerCase()} → <b style={{ color: 'var(--text)' }}>allora</b> {t.then.toLowerCase()}.</p>
                  {a?.last_run_at && <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Ultima esecuzione: {new Date(a.last_run_at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
                </div>
                <Switch on={on} onChange={v => toggle(t.template, t.name, v)} label={t.name} />
              </li>
            );
          })}
        </ul>
      )}
      <section className="glass-card p-5 space-y-3">
        <div className="flex items-center gap-2.5"><History className="w-[18px] h-[18px]" strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} /><h3 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Storico</h3></div>
        {runs.length === 0 ? <Empty>Nessuna esecuzione ancora.</Empty> : (
          <ul className="space-y-1">
            {runs.map(r => (
              <li key={r.id} className="flex gap-3 text-sm py-1">
                <span className="tabular text-xs w-[86px] flex-shrink-0 pt-0.5" style={{ color: 'var(--text-subtle)' }}>{new Date(r.at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <span style={{ color: 'var(--text-muted)' }}>{r.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
