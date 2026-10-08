import { useMemo } from 'react';
import { Loader2, TrendingUp, AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react';
import { BizSnapshot } from '../../lib/businessData';
import { insights, dayKey } from '../../lib/businessIntel';
import { PageTitle, Empty } from './ui';

export default function Insights({ snap, canFinance }: { snap: BizSnapshot | null; canFinance: boolean }) {
  const today = dayKey(new Date());
  const list = useMemo(() => (snap ? insights(snap, today) : []), [snap, today]);
  return (
    <div className="space-y-6">
      <PageTitle title="Insights." lead="Poche analisi, quelle che contano, ognuna con il suo perché." />
      {!canFinance && <p className="text-sm" style={{ color: 'var(--text-subtle)' }}>Gli insight economici sono visibili solo a titolare, admin e Finanza.</p>}
      {!snap ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-subtle)' }} /></div>
        : list.length === 0 ? <Empty>Servono un po’ di dati (fatture, compiti, movimenti) per trovare qualcosa di utile.</Empty> : (
          <ul className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 gap-3 sm:gap-4">
            {list.map(i => {
              const Icon = i.tone === 'attenzione' ? AlertTriangle : i.tone === 'buono' ? CheckCircle2 : i.id === 'conc' ? TrendingUp : Lightbulb;
              const color = i.tone === 'attenzione' ? 'var(--warning)' : i.tone === 'buono' ? 'var(--brand-ring)' : 'var(--text-muted)';
              return (
                <li key={i.id} className="glass-card p-5 space-y-2">
                  <div className="flex items-start gap-2.5">
                    <Icon className="w-[18px] h-[18px] flex-shrink-0 mt-0.5" style={{ color }} />
                    <p className="text-[15px] font-semibold flex-1" style={{ color: 'var(--text)' }}>{i.title}</p>
                  </div>
                  <p className="text-2xl font-semibold tabular" style={{ color: 'var(--text)' }}>{i.value}</p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}><b style={{ color: 'var(--text)' }}>Perché conta: </b>{i.why}</p>
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}
