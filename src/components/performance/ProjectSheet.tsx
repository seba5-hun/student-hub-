import { useState } from 'react';
import { Loader2, Sparkles, Check, X, ArrowLeft } from 'lucide-react';
import { KIND_HINT, KIND_LABEL, Project, ProjectInput, ProjectKind, TaskDraft } from '../../lib/projects';
import { ProjectPlan, parsePlan, planSystem } from '../../lib/projectsAI';
import { askAuto, autoReady } from '../../lib/ai';
import { Sheet, Label, TextField, TextArea, ErrorNote, shortDate } from './ui';
import { AINote, ConnectAI } from './AIPanel';

const KINDS: ProjectKind[] = ['personale', 'lavoro'];

// New project (or changes to one): only the name is needed. "Crea con MYND AI" turns the
// description into a first plan, shown here to be changed before anything is created.
export function ProjectSheet({ project, today, onClose, onSave, onConnectAI }: {
  project: Project | null;
  today: string;
  onClose: () => void;
  onSave: (input: ProjectInput, drafts?: TaskDraft[]) => Promise<void>;
  onConnectAI: () => void;
}) {
  const [kind, setKind] = useState<ProjectKind>(project?.kind || 'personale');
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [due, setDue] = useState(project?.due_date || '');
  const [busy, setBusy] = useState<'' | 'save' | 'ai'>('');
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [aiAsk, setAiAsk] = useState(false);

  const save = async (drafts?: TaskDraft[], fromPlan?: ProjectPlan) => {
    if (busy) return;
    const finalName = (fromPlan ? name || fromPlan.name : name).trim();
    if (!finalName) { setError('Scrivi il nome del progetto.'); return; }
    setBusy('save'); setError('');
    try {
      await onSave({
        kind, name: finalName, description: description.trim() || null, due_date: due || null,
        ...(fromPlan ? { phases: fromPlan.phases, settings: { phases: fromPlan.phases.length > 0 } } : project ? {} : { settings: { phases: kind === 'lavoro' } }),
      }, drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy('');
    }
  };

  const makePlan = async () => {
    const idea = [name.trim() && `Nome: ${name.trim()}`, description.trim(), due && `Scadenza desiderata: ${due}`, `Tipo scelto: ${KIND_LABEL[kind]}`].filter(Boolean).join('\n');
    if (!description.trim() && !name.trim()) { setError('Descrivi in poche righe cosa vuoi realizzare.'); return; }
    setBusy('ai'); setError('');
    try {
      const reply = await askAuto(planSystem(today), [{ role: 'user', text: idea }]);
      const p = parsePlan(reply, today);
      if (!p) throw new Error('L\'AI non ha preparato un piano leggibile. Riprova o descrivi meglio l\'idea.');
      setPlan(p);
      if (!name.trim() && p.name) setName(p.name);
      if (p.goal && (aiAsk || !description.trim())) setDescription(p.goal);
      if (!due && p.due_date) setDue(p.due_date);
      setKind(p.kind);
    } catch (err) {
      setError(err instanceof Error ? err.message.split('\n')[0] : String(err));
    }
    setBusy('');
  };

  if (plan) {
    return (
      <Sheet title="La proposta di MYND AI" onClose={onClose}
        footer={<>
          <button onClick={() => setPlan(null)} className="btn-secondary h-11 px-4 mr-auto inline-flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" /> Indietro</button>
          <button onClick={makePlan} disabled={!!busy} className="btn-secondary h-11 px-4 disabled:opacity-40 inline-flex items-center gap-2">{busy === 'ai' && <Loader2 className="w-4 h-4 animate-spin" />} Rifai</button>
          <button onClick={() => save(plan.tasks.map(t => ({ ...t, subtasks: t.subtasks })), plan)} disabled={!!busy || !plan.tasks.length}
            className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">{busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />} Crea progetto</button>
        </>}>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>È solo un punto di partenza: togli, rinomina o aggiungi quello che vuoi. Dopo potrai cambiare tutto.</p>
        <TextField id="pl-name" label="Nome" value={name} onChange={setName} />
        <TextArea id="pl-goal" label="Obiettivo" value={description} onChange={setDescription} rows={2} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Tipo</Label>
            <KindPicker value={kind} onChange={setKind} compact />
          </div>
          <TextField id="pl-due" label="Scadenza" type="date" value={due} onChange={setDue} />
        </div>
        {plan.phases.length > 0 && (
          <div>
            <Label>Fasi</Label>
            <p className="text-sm" style={{ color: 'var(--text)' }}>{plan.phases.join(' → ')}</p>
          </div>
        )}
        <div>
          <Label>Attività · {plan.tasks.length}</Label>
          <ol className="space-y-1.5">
            {plan.tasks.map((t, i) => (
              <li key={i} className="rounded-2xl px-3 py-2.5 flex gap-2.5 items-start" style={{ background: 'var(--glass-well)' }}>
                <span className="tabular text-xs w-5 pt-[11px] text-right flex-shrink-0" style={{ color: 'var(--text-subtle)' }}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <input value={t.title} aria-label={`Attività ${i + 1}`} maxLength={300}
                    onChange={e => setPlan(p => p && { ...p, tasks: p.tasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })}
                    className="w-full bg-transparent text-sm py-2 outline-none" style={{ color: 'var(--text)' }} />
                  {(t.phase || t.due_date || t.subtasks.length > 0) && (
                    <p className="text-xs pb-1" style={{ color: 'var(--text-subtle)' }}>
                      {[t.phase, t.due_date && `entro ${shortDate(t.due_date)}`, t.subtasks.length && `${t.subtasks.length} passaggi: ${t.subtasks.join(', ')}`].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <button onClick={() => setPlan(p => p && { ...p, tasks: p.tasks.filter((_, j) => j !== i) })} aria-label={`Togli ${t.title}`}
                  className="w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--text-subtle)' }}>
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ol>
        </div>
        {plan.questions.length > 0 && (
          <div className="rounded-2xl p-4" style={{ background: 'var(--glass-well)' }}>
            <p className="text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>Da chiarire</p>
            <ul className="space-y-1 text-sm list-disc pl-5" style={{ color: 'var(--text-muted)' }}>{plan.questions.map(q => <li key={q}>{q}</li>)}</ul>
            <p className="text-xs mt-2" style={{ color: 'var(--text-subtle)' }}>Puoi aggiungere queste informazioni alla descrizione e premere "Rifai", oppure segnartele come attività.</p>
          </div>
        )}
        <ErrorNote text={error} />
      </Sheet>
    );
  }

  return (
    <Sheet title={project ? 'Modifica progetto' : 'Nuovo progetto'} onClose={onClose}
      footer={<>
        {!project && (
          <button onClick={() => (autoReady() && description.trim() ? makePlan() : setAiAsk(true))} disabled={!!busy}
            className="btn-secondary h-11 px-4 mr-auto inline-flex items-center gap-2 disabled:opacity-40">
            {busy === 'ai' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" style={{ color: 'var(--brand-ring)' }} />}
            <span className="hidden sm:inline">Crea con MYND AI</span><span className="sm:hidden">Con l'AI</span>
          </button>
        )}
        {project && <button onClick={onClose} className="btn-secondary h-11 px-5">Annulla</button>}
        <button onClick={() => save()} disabled={!!busy || !name.trim()} className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">
          {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />} {project ? 'Salva' : 'Crea progetto'}
        </button>
      </>}>
      <div>
        <Label>Tipo di progetto</Label>
        <KindPicker value={kind} onChange={setKind} />
        <p className="text-xs mt-2" style={{ color: 'var(--text-subtle)' }}>{KIND_HINT[kind]}</p>
      </div>
      <TextField id="pj-name" label="Nome del progetto" value={name} onChange={setName} placeholder="Es. Vacanza in Grecia" autoFocus={!project} />
      <TextArea id="pj-desc" label={aiAsk ? 'Descrivi cosa vuoi realizzare' : 'Descrizione (facoltativa)'} value={description} onChange={setDescription} rows={aiAsk ? 4 : 3}
        placeholder={aiAsk ? 'Es. Una settimana in Grecia a giugno con cinque amici: dobbiamo trovare voli, alloggi e decidere il budget.' : 'Il risultato che vuoi raggiungere'} />
      <TextField id="pj-due" label="Scadenza (facoltativa)" type="date" value={due} onChange={setDue} />
      {aiAsk && (autoReady() ? (
        <div className="space-y-2">
          <button onClick={makePlan} disabled={!!busy || (!description.trim() && !name.trim())} className="btn-primary w-full h-12 inline-flex items-center justify-center gap-2 disabled:opacity-40">
            {busy === 'ai' ? <><Loader2 className="w-4 h-4 animate-spin" /> MYND AI sta preparando il piano…</> : <><Sparkles className="w-4 h-4" /> Prepara il piano</>}
          </button>
          <AINote />
        </div>
      ) : <ConnectAI onConnect={onConnectAI} />)}
      <ErrorNote text={error} />
    </Sheet>
  );
}

export function KindPicker({ value, onChange, compact }: { value: ProjectKind; onChange: (k: ProjectKind) => void; compact?: boolean }) {
  return (
    <div className="flex gap-1 p-1 rounded-full w-full" style={{ background: 'var(--glass-well)' }} role="radiogroup" aria-label="Tipo di progetto">
      {KINDS.map(k => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
          className={`flex-1 ${compact ? 'h-10' : 'h-11'} rounded-full text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${value === k ? 'glass-lens' : ''}`}
          style={{ color: value === k ? 'var(--brand-ring)' : 'var(--text-muted)' }}>
          {value === k && <Check className="w-3.5 h-3.5" />} {KIND_LABEL[k]}
        </button>
      ))}
    </div>
  );
}
