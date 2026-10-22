import React, { useMemo } from 'react';
import { FolderPlus, ListPlus, Sparkles, ArrowRight, Users } from 'lucide-react';
import { Member, PTask, Project, TASK_STATUS_LABEL, daysBetween, memberName, nextDue, permsOf, relativeDay } from '../../lib/projects';
import { CheckButton, SectionTitle, shortDate } from './ui';
import { CardActions, FirstProject, NoShared, ProjectCard } from './ProjectList';

interface DueItem { key: string; date: string; title: string; project: Project; kind: 'superata' | 'imminente' | 'completata'; task?: PTask }

export function Overview({ projects, tasks, members, me, today, actions, canCreate, onToggle, onSeeAll, onSeeShared, onNew, onQuickTask, onAskAI }: {
  projects: Project[]; tasks: PTask[]; members: Member[]; me: string; today: string; actions: CardActions; canCreate: boolean;
  onToggle: (t: PTask) => void; onSeeAll: () => void; onSeeShared?: () => void; onNew: () => void; onQuickTask: () => void; onAskAI: () => void;
}) {
  const editable = useMemo(() => new Set(projects.filter(p => permsOf(p, members, me).canEdit).map(p => p.id)), [projects, members, me]);
  const live = useMemo(() => projects.filter(p => !p.archived_at), [projects]);
  const liveIds = useMemo(() => new Set(live.map(p => p.id)), [live]);
  const byId = useMemo(() => new Map(live.map(p => [p.id, p])), [live]);

  // Due today or late, then what is in progress.
  const todo = useMemo(() => tasks
    .filter(t => liveIds.has(t.project_id) && t.status !== 'fatto' && byId.get(t.project_id)?.status !== 'completato')
    .filter(t => (t.due_date && t.due_date <= today) || t.status === 'in_corso')
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')), [tasks, liveIds, byId, today]);

  const active = useMemo(() => live.filter(p => p.status !== 'completato')
    .map(p => ({ p, due: nextDue(p, tasks.filter(t => t.project_id === p.id), today) }))
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || b.p.updated_at.localeCompare(a.p.updated_at))
    .slice(0, 4).map(x => x.p), [live, tasks, today]);

  const deadlines = useMemo(() => {
    const items: DueItem[] = [];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    for (const t of tasks) {
      const p = byId.get(t.project_id);
      if (!p || !t.due_date) continue;
      if (t.status === 'fatto') { if (t.done_at && t.done_at >= weekAgo) items.push({ key: t.id, date: t.due_date, title: t.title, project: p, kind: 'completata', task: t }); }
      else if (p.status !== 'completato' && t.due_date < today) items.push({ key: t.id, date: t.due_date, title: t.title, project: p, kind: 'superata', task: t });
      else if (p.status !== 'completato' && t.due_date >= today && daysBetween(today, t.due_date) <= 30) items.push({ key: t.id, date: t.due_date, title: t.title, project: p, kind: 'imminente', task: t });
    }
    for (const p of live) {
      if (!p.due_date || p.status === 'completato') continue;
      if (p.due_date < today || daysBetween(today, p.due_date) <= 30) items.push({ key: `p-${p.id}`, date: p.due_date, title: `Scadenza del progetto`, project: p, kind: p.due_date < today ? 'superata' : 'imminente' });
    }
    return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10);
  }, [tasks, live, byId, today]);

  if (!live.length) {
    return projects.length ? (
      <div className="glass-card rounded-[24px] p-6 space-y-3">
        <p className="text-[15px]" style={{ color: 'var(--text)' }}>Tutti i tuoi progetti sono archiviati.</p>
        <div className="flex gap-2 flex-wrap">
          {canCreate && <button onClick={onNew} className="btn-primary h-11 px-5">+ Nuovo progetto</button>}
          <button onClick={onSeeAll} className="btn-secondary h-11 px-5">Vedi gli archiviati</button>
        </div>
      </div>
    ) : canCreate ? <FirstProject onNew={onNew} /> : <NoShared />;
  }

  return (
    <div className="space-y-9">
      <section aria-labelledby="pf-today">
        <SectionTitle><span id="pf-today">Da fare oggi</span></SectionTitle>
        {todo.length === 0 ? (
          <div className="rounded-2xl px-5 py-4 text-[15px]" style={{ background: 'var(--glass-well)', color: 'var(--text-muted)' }}>Niente di urgente per oggi. Hai tutto sotto controllo.</div>
        ) : (
          <ul className="space-y-1.5">
            {todo.slice(0, 8).map(t => {
              const p = byId.get(t.project_id)!;
              const late = !!t.due_date && t.due_date < today;
              const who = memberName(members.filter(m => m.project_id === p.id), t.assignee_id, me);
              const meta = [p.name, t.due_date && (late ? `scaduta ${relativeDay(today, t.due_date)}` : relativeDay(today, t.due_date)), t.status === 'in_corso' && TASK_STATUS_LABEL[t.status], who].filter(Boolean);
              return (
                <li key={t.id} className="rounded-2xl pr-3 flex items-center gap-1 transition-colors" style={{ background: 'var(--glass-well)' }}>
                  <CheckButton done={false} label={`Completa ${t.title}`} onClick={() => onToggle(t)} disabled={!editable.has(t.project_id)} />
                  <button onClick={() => actions.onOpen(p)} className="flex-1 min-w-0 py-2.5 text-left">
                    <p className="text-[15px] truncate" style={{ color: 'var(--text)' }}>{t.title}</p>
                    <p className="text-xs truncate" style={{ color: late ? 'var(--danger)' : 'var(--text-subtle)' }}>{meta.join(' · ')}</p>
                  </button>
                </li>
              );
            })}
            {todo.length > 8 && <li className="text-xs px-2 pt-1" style={{ color: 'var(--text-subtle)' }}>e altre {todo.length - 8} nei progetti</li>}
          </ul>
        )}
      </section>

      <section aria-labelledby="pf-projects">
        <SectionTitle action={<button onClick={onSeeAll} className="text-sm font-medium inline-flex items-center gap-1" style={{ color: 'var(--brand-ring)' }}>Vedi tutti <ArrowRight className="w-3.5 h-3.5" /></button>}>
          <span id="pf-projects">I miei progetti</span>
        </SectionTitle>
        {active.length === 0 ? (
          <div className="rounded-2xl px-5 py-4 text-[15px]" style={{ background: 'var(--glass-well)', color: 'var(--text-muted)' }}>Tutti i progetti attivi sono completati.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map(p => <ProjectCard key={p.id} p={p} me={me} today={today} actions={actions} tasks={tasks.filter(t => t.project_id === p.id)} members={members.filter(m => m.project_id === p.id)} />)}
          </div>
        )}
      </section>

      {deadlines.length > 0 && (
        <section aria-labelledby="pf-due">
          <SectionTitle><span id="pf-due">Prossime scadenze</span></SectionTitle>
          <ul className="glass-card rounded-[24px] divide-y" style={{ borderColor: 'var(--glass-edge)' }}>
            {deadlines.map(d => (
              <li key={d.key} style={{ borderColor: 'var(--glass-edge)' }}>
                <button onClick={() => actions.onOpen(d.project)} className="w-full text-left px-5 py-3 flex items-center gap-4">
                  <span className="w-12 flex-shrink-0 text-center">
                    <span className="block text-lg font-semibold leading-none tabular" style={{ color: d.kind === 'superata' ? 'var(--danger)' : 'var(--text)' }}>{new Date(d.date + 'T00:00:00').getDate()}</span>
                    <span className="block text-[11px] uppercase mt-1" style={{ color: 'var(--text-subtle)' }}>{new Date(d.date + 'T00:00:00').toLocaleDateString('it-IT', { month: 'short' })}</span>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-[15px] truncate ${d.kind === 'completata' ? 'line-through' : ''}`} style={{ color: d.kind === 'completata' ? 'var(--text-subtle)' : 'var(--text)' }}>{d.title}</span>
                    <span className="block text-xs truncate" style={{ color: 'var(--text-subtle)' }}>{d.project.name}</span>
                  </span>
                  <span className="text-xs font-medium flex-shrink-0" style={{ color: d.kind === 'superata' ? 'var(--danger)' : d.kind === 'completata' ? 'var(--brand-ring)' : 'var(--text-muted)' }}
                    title={shortDate(d.date)}>
                    {d.kind === 'superata' ? 'Superata' : d.kind === 'completata' ? 'Completata' : relativeDay(today, d.date)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="pf-quick">
        <SectionTitle><span id="pf-quick">Accesso rapido</span></SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {canCreate && <QuickTile icon={<FolderPlus className="w-5 h-5" />} label="Nuovo progetto" onClick={onNew} />}
          {editable.size > 0 && <QuickTile icon={<ListPlus className="w-5 h-5" />} label="Nuova attività" onClick={onQuickTask} />}
          {onSeeShared && <QuickTile icon={<Users className="w-5 h-5" />} label="Condivisi con me" onClick={onSeeShared} />}
          <QuickTile icon={<Sparkles className="w-5 h-5" />} label="Chiedi all'AI" onClick={onAskAI} />
        </div>
      </section>
    </div>
  );
}

function QuickTile({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="glass-card rounded-[20px] px-3 py-4 flex flex-col items-center gap-2 text-center transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.97]">
      <span style={{ color: 'var(--brand-ring)' }}>{icon}</span>
      <span className="text-[13px] sm:text-sm font-medium leading-tight" style={{ color: 'var(--text)' }}>{label}</span>
    </button>
  );
}
