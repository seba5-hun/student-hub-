import { useState } from 'react';
import { Check, Loader2, Undo2, Sparkles } from 'lucide-react';
import { BizSnapshot, PlanAction, Proposal, updateProposal } from '../../lib/businessData';
import { applyPlan, describeAction, undoApplied } from '../../lib/businessAI';

// A plan proposed by the Coach: each action can be unticked; nothing changes until "Applica".
// After applying, "Annulla" removes what was created and restores what was changed.
export default function PlanCard({ orgId, proposal, snap, onDone }: {
  orgId: string; proposal: Proposal; snap: BizSnapshot; onDone: () => void;
}) {
  const [actions, setActions] = useState<PlanAction[]>(proposal.actions.map(a => ({ ...a, on: a.on !== false })));
  const [status, setStatus] = useState(proposal.status);
  const [applied, setApplied] = useState(proposal.applied || []);
  const [busy, setBusy] = useState<'' | 'apply' | 'undo' | 'drop'>('');
  const [error, setError] = useState('');
  const chosen = actions.filter(a => a.on).length;

  const run = async (kind: 'apply' | 'undo' | 'drop', fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind); setError('');
    try { await fn(); onDone(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(''); }
  };
  const apply = () => run('apply', async () => {
    const rows = await applyPlan(orgId, actions, snap);
    await updateProposal(proposal.id, { status: 'applicata', applied: rows, actions });
    setApplied(rows); setStatus('applicata');
  });
  const undo = () => run('undo', async () => {
    await undoApplied(applied);
    await updateProposal(proposal.id, { status: 'annullata' });
    setStatus('annullata');
  });
  const drop = () => run('drop', async () => { await updateProposal(proposal.id, { status: 'scartata' }); setStatus('scartata'); });

  return (
    <div className="rounded-3xl p-4 space-y-3" style={{ background: 'var(--glass-well)', border: '1px solid var(--glass-edge)' }}>
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--brand-ring)' }} />
        <p className="text-sm font-semibold flex-1" style={{ color: 'var(--text)' }}>{proposal.title}</p>
        <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
          {status === 'in_attesa' ? `${chosen} di ${actions.length}` : status === 'applicata' ? 'Applicata' : status === 'annullata' ? 'Annullata' : 'Scartata'}
        </span>
      </div>
      <ul className="space-y-1">
        {actions.map((a, i) => {
          const d = describeAction(a, snap);
          const editable = status === 'in_attesa';
          return (
            <li key={i}>
              <button type="button" disabled={!editable} onClick={() => setActions(actions.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                className="w-full flex items-start gap-3 text-left rounded-2xl px-2 py-2 hover:bg-white/5 disabled:hover:bg-transparent" aria-pressed={a.on}>
                <span className="mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                  style={a.on ? { background: status === 'annullata' || status === 'scartata' ? 'var(--border)' : 'var(--brand-fill)', color: 'var(--on-brand)' } : { border: '1.5px solid var(--text-subtle)' }}>
                  {a.on && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--text-subtle)' }}>{d.label}</span>
                  <span className={`block text-sm ${a.on ? '' : 'line-through'}`} style={{ color: a.on ? 'var(--text)' : 'var(--text-subtle)' }}>{d.text || '—'}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
      {status === 'in_attesa' && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={apply} disabled={!chosen || !!busy} className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">
            {busy === 'apply' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Applica
          </button>
          <button onClick={drop} disabled={!!busy} className="btn-secondary h-11 px-5">Scarta</button>
        </div>
      )}
      {status === 'applicata' && (
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm flex-1" style={{ color: 'var(--text-muted)' }}>Fatto: {applied.filter(r => r.kind === 'creato').length} elementi creati{applied.some(r => r.kind === 'modificato') ? `, ${applied.filter(r => r.kind === 'modificato').length} modificati` : ''}.</p>
          <button onClick={undo} disabled={!!busy} className="btn-secondary h-10 px-4 text-sm inline-flex items-center gap-1.5">
            {busy === 'undo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />} Annulla
          </button>
        </div>
      )}
    </div>
  );
}
