import { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2, Mail, UserPlus, Check } from 'lucide-react';
import {
  InviteResult, InviteRole, Member, PTask, Perms, Project, ProjectInvite, ProjectsSetupError, ROLE_HINT,
  cancelInvite, initials, inviteByEmail, listProjectInvites, memberName, removeMember, roleLabel, setMemberRole,
} from '../../lib/projects';
import { useDialog } from '../Dialog';
import { ErrorNote, MoreMenu, SectionTitle, Label } from './ui';

const ROLES: InviteRole[] = ['responsabile', 'membro', 'osservatore'];

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}

// The people of a project: who they are, their role, what they have to do; invitations by email.
export function PeopleTab({ p, members, tasks, me, perms, onChanged, onLeft, notify }: {
  p: Project; members: Member[]; tasks: PTask[]; me: string; perms: Perms;
  onChanged: () => Promise<void> | void; onLeft: () => void; notify: (text: string, error?: boolean) => void;
}) {
  const dialog = useDialog();
  const [invites, setInvites] = useState<ProjectInvite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('membro');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ email: string; res: InviteResult } | null>(null);
  const [copied, setCopied] = useState('');
  const roles = p.kind === 'personale' ? (['membro', 'osservatore'] as InviteRole[]) : ROLES;
  const link = `${window.location.origin}/accedi`;
  const setupMsg = 'La condivisione non è ancora attiva: esegui lo script "Condivisione progetti" su Supabase (Admin → Guida → Script Supabase).';

  const loadInvites = useCallback(async () => {
    try { setInvites(await listProjectInvites(p.id)); }
    catch { setInvites([]); }
  }, [p.id]);
  useEffect(() => { loadInvites(); }, [loadInvites]);

  const invite = async () => {
    const value = email.trim();
    if (!value || busy) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await inviteByEmail(p.id, value, role);
      setResult({ email: value.toLowerCase(), res });
      if (res.status === 'invited' || res.status === 'waiting') { setEmail(''); loadInvites(); onChanged(); }
    } catch (err) {
      setError(err instanceof ProjectsSetupError ? setupMsg : err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  };

  const doCopy = async (what: 'link' | 'msg', text: string) => {
    if (await copy(text)) { setCopied(what); window.setTimeout(() => setCopied(''), 2000); }
  };

  const changeRole = async (m: Member, r: InviteRole) => {
    try { await setMemberRole(p.id, m.user_id, r); await onChanged(); notify('Ruolo aggiornato'); }
    catch (err) { notify(err instanceof Error ? err.message : String(err), true); }
  };
  const remove = async (m: Member) => {
    const self = m.user_id === me;
    const ok = await dialog.confirm({
      title: self ? `Uscire da “${p.name}”?` : `Togliere ${memberName(members, m.user_id, me)} dal progetto?`,
      message: self ? 'Non lo vedrai più. Per rientrare servirà un nuovo invito.' : 'Non vedrà più il progetto. Le sue attività restano, senza responsabile.',
      confirmLabel: self ? 'Esci' : 'Togli', danger: true,
    });
    if (!ok) return;
    try {
      await removeMember(p.id, m.user_id);
      if (self) { notify('Sei uscito dal progetto'); onLeft(); }
      else { await onChanged(); notify('Persona tolta dal progetto'); }
    } catch (err) { notify(err instanceof Error ? err.message : String(err), true); }
  };
  const cancel = async (inv: ProjectInvite) => {
    try { await cancelInvite(inv.id); setInvites(xs => xs.filter(x => x.id !== inv.id)); notify('Invito annullato'); }
    catch (err) { notify(err instanceof Error ? err.message : String(err), true); }
  };

  const sorted = [...members].sort((a, b) => (a.role === 'proprietario' ? -1 : b.role === 'proprietario' ? 1 : 0) || memberName(members, a.user_id, me).localeCompare(memberName(members, b.user_id, me)));

  return (
    <div className="space-y-8">
      <section>
        <SectionTitle>Persone · {members.length}</SectionTitle>
        {members.length < 2 && <p className="text-[15px] mb-3" style={{ color: 'var(--text-muted)' }}>Per ora il progetto è solo tuo. {perms.canInvite ? 'Invita qualcuno quando vuoi lavorarci insieme.' : ''}</p>}
        <ul className="space-y-1.5">
          {sorted.map(m => {
            const open = tasks.filter(t => t.assignee_id === m.user_id && t.status !== 'fatto').length;
            const self = m.user_id === me;
            const items = [
              ...(perms.isOwner && !self && m.role !== 'proprietario' ? roles.filter(r => r !== m.role).map(r => ({ label: `Rendi ${roleLabel(r, p.kind).toLowerCase()}`, onClick: () => changeRole(m, r) })) : []),
              ...(!self && m.role !== 'proprietario' && perms.canManage ? [{ label: 'Togli dal progetto', onClick: () => remove(m), danger: true }] : []),
              ...(self && m.role !== 'proprietario' ? [{ label: 'Esci dal progetto', onClick: () => remove(m), danger: true }] : []),
            ];
            return (
              <li key={m.user_id} className="rounded-2xl pl-3 pr-1.5 py-2.5 flex items-center gap-3" style={{ background: 'var(--glass-well)' }}>
                <span className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold glass-card !rounded-full" style={{ color: 'var(--text-muted)' }}>
                  {initials(memberName(members, m.user_id, '__'))}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] truncate" style={{ color: 'var(--text)' }}>{memberName(members, m.user_id, '__')}{self ? ' (tu)' : ''}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-subtle)' }}>
                    {[roleLabel(m.role, p.kind), m.email, open ? `${open} attività da fare` : ''].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {items.length > 0 && <MoreMenu label={`Azioni per ${memberName(members, m.user_id, me)}`} items={items} />}
              </li>
            );
          })}
        </ul>
      </section>

      {perms.canInvite && (
        <section>
          <SectionTitle>Invita qualcuno</SectionTitle>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); invite(); }}>
            <div>
              <Label htmlFor="pp-email">Email</Label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-subtle)' }} />
                <input id="pp-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@email.com" autoComplete="off"
                  className="input-glass w-full h-12 pl-11 text-[15px]" />
              </div>
            </div>
            <div>
              <Label>Cosa può fare</Label>
              <div className="flex gap-1 p-1 rounded-full" style={{ background: 'var(--glass-well)' }} role="radiogroup" aria-label="Ruolo">
                {roles.map(r => (
                  <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => setRole(r)}
                    className={`flex-1 h-10 rounded-full text-sm font-medium transition-colors ${role === r ? 'glass-lens' : ''}`}
                    style={{ color: role === r ? 'var(--brand-ring)' : 'var(--text-muted)' }}>{roleLabel(r, p.kind)}</button>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--text-subtle)' }}>{ROLE_HINT[role]}</p>
            </div>
            <button type="submit" disabled={busy || !email.trim()} className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Invita
            </button>
          </form>
          <ErrorNote text={error} />
          {result && (
            <div className="mt-3 rounded-2xl p-4 space-y-3 animate-scale-in" style={{ background: 'var(--glass-well)' }} role="status">
              {result.res.status === 'invited' && <p className="text-[15px] flex gap-2" style={{ color: 'var(--text)' }}><Check className="w-4 h-4 mt-1 flex-shrink-0" style={{ color: 'var(--brand-ring)' }} /> Invito inviato a {result.email}. Lo troverà nel menu del suo account (il cerchio in alto a destra).</p>}
              {result.res.status === 'already_member' && <p className="text-[15px]" style={{ color: 'var(--text)' }}>{result.email} partecipa già al progetto.</p>}
              {result.res.status === 'already_invited' && <p className="text-[15px]" style={{ color: 'var(--text)' }}>{result.email} è già stato invitato: deve solo accettare.</p>}
              {result.res.status === 'self' && <p className="text-[15px]" style={{ color: 'var(--text)' }}>Questa è la tua email: sei già nel progetto.</p>}
              {result.res.status === 'waiting' && (
                <>
                  <p className="text-[15px] font-medium" style={{ color: 'var(--text)' }}>Utente non trovato</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{result.email} non ha ancora un account MYND. Mandagli questo link: quando si registra con questa email, troverà l'invito già pronto.</p>
                  <div className="flex gap-2 items-center rounded-xl px-3 py-2" style={{ background: 'var(--glass-well)' }}>
                    <span className="flex-1 min-w-0 truncate text-sm" style={{ color: 'var(--text)' }}>{link}</span>
                    <button onClick={() => doCopy('link', link)} className="btn-secondary h-9 px-3 text-sm inline-flex items-center gap-1.5 flex-shrink-0">
                      {copied === 'link' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied === 'link' ? 'Copiato' : 'Copia link'}
                    </button>
                  </div>
                  <button onClick={() => doCopy('msg', `Ti ho invitato al progetto “${p.name}” su MYND. Registrati con questa email (${result.email}) qui: ${link}`)}
                    className="text-sm font-medium inline-flex items-center gap-1.5" style={{ color: 'var(--brand-ring)' }}>
                    {copied === 'msg' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied === 'msg' ? 'Messaggio copiato' : 'Copia un messaggio pronto da inviare'}
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {invites.length > 0 && (
        <section>
          <SectionTitle>In attesa di risposta</SectionTitle>
          <ul className="space-y-1.5">
            {invites.map(inv => (
              <li key={inv.id} className="rounded-2xl pl-4 pr-2 py-2.5 flex items-center gap-3" style={{ background: 'var(--glass-well)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] truncate" style={{ color: 'var(--text)' }}>{inv.invited_email}</p>
                  <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>{roleLabel(inv.role, p.kind)} · {inv.invited_user ? 'deve accettare' : 'non ha ancora un account'}</p>
                </div>
                {(perms.canInvite || inv.invited_by === me) && <button onClick={() => cancel(inv)} className="h-9 px-3 rounded-full text-sm hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>Annulla</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
