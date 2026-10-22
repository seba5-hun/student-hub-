import { useMemo, useState } from 'react';
import { Plus, Search, CalendarDays } from 'lucide-react';
import { KIND_LABEL, Member, PTask, Project, lateness, nextDue, progressOf, relativeDay } from '../../lib/projects';
import { Avatars, MoreMenu, Pills, ProgressBar, StatusBadge, Empty, shortDate } from './ui';

type Filter = 'tutti' | 'in_corso' | 'da_iniziare' | 'completato' | 'archiviati';

export interface CardActions {
  onOpen: (p: Project) => void;
  onEdit: (p: Project) => void;
  onDuplicate: (p: Project) => void;
  onArchive: (p: Project) => void;
  onDelete: (p: Project) => void;
}

export function ProjectCard({ p, tasks, members, me, today, actions }: { p: Project; tasks: PTask[]; members: Member[]; me: string; today: string; actions: CardActions }) {
  const prog = progressOf(tasks);
  const { late } = lateness(p, tasks, today);
  const due = nextDue(p, tasks, today);
  const open = tasks.filter(t => !t.parent_id && t.status !== 'fatto').length;
  return (
    <article className="glass-card rounded-[24px] p-5 flex flex-col gap-4 cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.99]"
      onClick={() => actions.onOpen(p)} onKeyDown={e => { if (e.key === 'Enter') actions.onOpen(p); }} tabIndex={0} aria-label={`Apri ${p.name}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] mb-1" style={{ color: 'var(--text-subtle)' }}>{KIND_LABEL[p.kind]}{p.archived_at ? ' · Archiviato' : ''}</p>
          <h3 className="text-[17px] font-semibold leading-snug tracking-[-0.01em] break-words" style={{ color: 'var(--text)' }}>{p.name}</h3>
          {p.description && <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{p.description}</p>}
        </div>
        <MoreMenu label={`Azioni per ${p.name}`} items={[
          { label: 'Modifica progetto', onClick: () => actions.onEdit(p) },
          { label: 'Duplica progetto', onClick: () => actions.onDuplicate(p) },
          { label: p.archived_at ? 'Ripristina progetto' : 'Archivia progetto', onClick: () => actions.onArchive(p) },
          { label: 'Elimina progetto', onClick: () => actions.onDelete(p), danger: true, hidden: p.owner_id !== me },
        ]} />
      </div>
      <ProgressBar progress={prog} compact />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <StatusBadge status={p.status} late={late} />
        <div className="flex items-center gap-3">
          {prog.total > 0 && <span className="text-xs tabular" style={{ color: 'var(--text-subtle)' }}>{open ? `${open} da fare` : 'tutto fatto'}</span>}
          {due && <span className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--text-subtle)' }} title={shortDate(due)}><CalendarDays className="w-3.5 h-3.5" />{relativeDay(today, due)}</span>}
          <Avatars members={members} me={me} />
        </div>
      </div>
    </article>
  );
}

export function ProjectList({ projects, tasks, members, me, today, actions, onNew }: {
  projects: Project[]; tasks: PTask[]; members: Member[]; me: string; today: string; actions: CardActions; onNew: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('tutti');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const live = projects.filter(p => !p.archived_at);
    return {
      tutti: live.length,
      in_corso: live.filter(p => p.status === 'in_corso').length,
      da_iniziare: live.filter(p => p.status === 'da_iniziare').length,
      completato: live.filter(p => p.status === 'completato').length,
      archiviati: projects.length - live.length,
    };
  }, [projects]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter(p => (filter === 'archiviati' ? !!p.archived_at : !p.archived_at && (filter === 'tutti' || p.status === filter)))
      .filter(p => !q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
  }, [projects, filter, query]);

  return (
    <div className="space-y-5">
      <label className="relative block">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-subtle)' }} />
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cerca per nome o descrizione" aria-label="Cerca progetti"
          className="input-glass w-full h-12 pl-11 text-[15px]" />
      </label>
      <Pills label="Filtra progetti" value={filter} onChange={setFilter} options={[
        { id: 'tutti', label: 'Tutti', count: counts.tutti },
        { id: 'in_corso', label: 'In corso', count: counts.in_corso },
        { id: 'da_iniziare', label: 'Da iniziare', count: counts.da_iniziare },
        { id: 'completato', label: 'Completati', count: counts.completato },
        { id: 'archiviati', label: 'Archiviati', count: counts.archiviati },
      ]} />
      {shown.length === 0 ? (
        projects.length === 0 ? <FirstProject onNew={onNew} /> : (
          <Empty>{query.trim() ? `Nessun progetto trovato per “${query.trim()}”.` : filter === 'archiviati' ? 'Nessun progetto archiviato.' : 'Nessun progetto in questo elenco.'}</Empty>
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map(p => (
            <ProjectCard key={p.id} p={p} me={me} today={today} actions={actions}
              tasks={tasks.filter(t => t.project_id === p.id)} members={members.filter(m => m.project_id === p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FirstProject({ onNew }: { onNew: () => void }) {
  return (
    <div className="glass-card rounded-[28px] px-6 py-12 text-center flex flex-col items-center animate-scale-in">
      <h3 className="text-2xl font-bold tracking-[-0.03em]" style={{ color: 'var(--text)' }}>Ogni grande progetto inizia da un'idea.</h3>
      <p className="mt-2 max-w-sm text-[15px]" style={{ color: 'var(--text-muted)' }}>Crea il tuo primo progetto e organizza tutto in un unico posto.</p>
      <button onClick={onNew} className="btn-primary h-12 px-6 mt-6 inline-flex items-center gap-2"><Plus className="w-4 h-4" /> Crea il tuo primo progetto</button>
    </div>
  );
}
