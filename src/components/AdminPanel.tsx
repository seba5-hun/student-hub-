import React, { useCallback, useEffect, useState } from 'react';
import { Users, Activity, Check, X, Ban, RotateCcw, Search, Loader2, RefreshCw, Clock } from 'lucide-react';
import DeveloperDashboard, { formatDuration } from './DeveloperDashboard';
import { AdminUser, AccountStatus, loadAdminUsers, setUserStatus, setRequireApproval } from '../lib/admin';
import { useDialog } from './Dialog';

const STATUS_INFO: Record<AccountStatus, { label: string; badge: string }> = {
  pending: { label: 'In attesa', badge: 'bg-amber-500/20 text-amber-400' },
  approved: { label: 'Approvato', badge: 'bg-emerald-500/20 text-emerald-400' },
  rejected: { label: 'Rifiutato', badge: 'bg-red-500/20 text-red-400' },
  blocked: { label: 'Bloccato', badge: 'bg-gray-500/30 text-gray-300' },
};

const FILTERS: { id: AccountStatus | 'all'; label: string }[] = [
  { id: 'pending', label: 'In attesa' },
  { id: 'approved', label: 'Approvati' },
  { id: 'rejected', label: 'Rifiutati' },
  { id: 'blocked', label: 'Bloccati' },
  { id: 'all', label: 'Tutti' },
];

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return `${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function AdminPanel({ darkMode, onPendingChange }: { darkMode: boolean; onPendingChange?: (n: number) => void }) {
  const dialog = useDialog();
  const [tab, setTab] = useState<'users' | 'stats'>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [requireApproval, setRequire] = useState(true);
  const [filter, setFilter] = useState<AccountStatus | 'all'>('pending');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await loadAdminUsers();
      setUsers(result.users);
      setRequire(result.requireApproval);
      onPendingChange?.(result.users.filter(u => u.status === 'pending').length);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [onPendingChange]);

  useEffect(() => { refresh(); }, [refresh]);

  const counts = Object.fromEntries(FILTERS.map(f => [f.id, f.id === 'all' ? users.length : users.filter(u => u.status === f.id).length]));
  const shown = users
    .filter(u => filter === 'all' || u.status === filter)
    .filter(u => u.email?.toLowerCase().includes(query.trim().toLowerCase()));

  const change = async (user: AdminUser, status: AccountStatus) => {
    if (status === 'blocked' || status === 'rejected') {
      const ok = await dialog.confirm({
        title: `${status === 'blocked' ? 'Bloccare' : 'Rifiutare'} ${user.email}?`,
        message: status === 'blocked'
          ? 'Non potrà più usare l\'app né vedere i suoi dati finché non lo riattivi. I dati non vengono cancellati.'
          : 'Vedrà un messaggio che la richiesta non è stata accettata. Potrai approvarlo in seguito.',
        confirmLabel: status === 'blocked' ? 'Blocca' : 'Rifiuta',
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(user.user_id);
    try {
      await setUserStatus(user.user_id, status);
      setUsers(prev => {
        const next = prev.map(u => (u.user_id === user.user_id ? { ...u, status, reviewed_at: new Date().toISOString() } : u));
        onPendingChange?.(next.filter(u => u.status === 'pending').length);
        return next;
      });
    } catch (err) {
      dialog.alert({ title: 'Operazione non riuscita', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const toggleApproval = async () => {
    const value = !requireApproval;
    try {
      await setRequireApproval(value);
      setRequire(value);
    } catch (err) {
      dialog.alert({ title: 'Operazione non riuscita', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const actionButton = (label: string, icon: React.ReactNode, className: string, onClick: () => void, disabled: boolean) => (
    <button onClick={onClick} disabled={disabled} className={`text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-40 ${className}`}>
      {icon}{label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={`text-[34px] leading-[1.1] font-bold tracking-[-0.035em] flex items-center gap-2 ${textColor}`}>Admin.</h2>
        <div className={`flex rounded-xl p-1 ${darkMode ? 'bg-white/10' : 'bg-black/5'}`} role="tablist">
          {[{ id: 'users' as const, label: 'Utenti', icon: <Users className="w-4 h-4" /> }, { id: 'stats' as const, label: 'Statistiche', icon: <Activity className="w-4 h-4" /> }].map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 ${tab === t.id ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-[var(--on-brand)]' : subTextColor}`}>
              {t.icon}{t.label}
              {t.id === 'users' && counts.pending > 0 && <span className="ml-1 min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center">{counts.pending}</span>}
            </button>
          ))}
        </div>
      </div>

      {tab === 'stats' ? <DeveloperDashboard darkMode={darkMode} /> : (
        <>
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">⚠️ {error}</div>}

          <div className={`${cardClass} p-5 flex flex-wrap items-center justify-between gap-4`}>
            <div>
              <h3 className={`font-semibold ${textColor}`}>Approvazione dei nuovi utenti</h3>
              <p className={`text-sm ${subTextColor}`}>
                {requireApproval
                  ? 'Chi si registra resta in attesa finché non lo approvi.'
                  : 'Disattivata: chi si registra può usare subito l\'app.'}
              </p>
            </div>
            <button onClick={toggleApproval} role="switch" aria-checked={requireApproval} aria-label="Approvazione obbligatoria"
              className={`w-12 h-7 rounded-full relative transition-colors flex-shrink-0 ${requireApproval ? 'bg-gradient-to-r from-indigo-500 to-purple-600' : darkMode ? 'bg-white/15' : 'bg-black/15'}`}>
              <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${requireApproval ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          <div className={`${cardClass} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap gap-2">
                {FILTERS.map(f => (
                  <button key={f.id} onClick={() => setFilter(f.id)}
                    className={`text-sm px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${filter === f.id
                      ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-300'
                      : darkMode ? 'border-white/10 text-white/70 hover:bg-white/5' : 'border-black/10 text-gray-600 hover:bg-black/5'}`}>
                    {f.label} <span className="text-xs opacity-70">{counts[f.id]}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${subTextColor}`} />
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cerca email…"
                    className={`${darkMode ? 'input-glass' : 'input-light'} pl-9 py-1.5 text-sm`} />
                </div>
                <button onClick={refresh} disabled={loading} aria-label="Aggiorna" title="Aggiorna"
                  className={`p-2 rounded-xl ${darkMode ? 'bg-white/10 hover:bg-white/15 text-white' : 'bg-black/5 hover:bg-black/10 text-gray-700'}`}>
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {loading && users.length === 0 ? (
              <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
            ) : shown.length === 0 ? (
              <p className={`text-sm py-8 text-center ${subTextColor}`}>
                {filter === 'pending' ? 'Nessuna richiesta in attesa 🎉' : 'Nessun utente in questo elenco.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {shown.map(u => {
                  const info = STATUS_INFO[u.status];
                  const working = busy === u.user_id;
                  return (
                    <li key={u.user_id} className={`flex flex-wrap items-center gap-3 p-3 rounded-xl ${darkMode ? 'bg-white/5' : 'bg-black/5'}`}>
                      <div className="flex-1 min-w-[14rem]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`font-medium ${textColor}`}>{u.email}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${info.badge}`}>{info.label}</span>
                          {u.is_admin && <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">Admin</span>}
                          {!u.email_confirmed && <span className={`text-xs ${subTextColor}`}>· email non confermata</span>}
                        </div>
                        <p className={`text-xs mt-1 flex flex-wrap gap-x-3 ${subTextColor}`}>
                          <span>Registrato: {formatDate(u.created_at)}</span>
                          <span>Ultimo accesso: {formatDate(u.last_seen)}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(u.seconds)}</span>
                        </p>
                      </div>
                      {!u.is_admin && (
                        <div className="flex flex-wrap gap-1.5">
                          {working && <Loader2 className="w-4 h-4 animate-spin text-indigo-400 self-center" />}
                          {u.status !== 'approved' && actionButton('Approva', <Check className="w-3.5 h-3.5" />, 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30', () => change(u, 'approved'), working)}
                          {u.status === 'pending' && actionButton('Rifiuta', <X className="w-3.5 h-3.5" />, 'bg-red-500/15 text-red-400 hover:bg-red-500/25', () => change(u, 'rejected'), working)}
                          {u.status === 'approved' && actionButton('Blocca', <Ban className="w-3.5 h-3.5" />, 'bg-red-500/15 text-red-400 hover:bg-red-500/25', () => change(u, 'blocked'), working)}
                          {(u.status === 'rejected' || u.status === 'blocked') && actionButton('Rimetti in attesa', <RotateCcw className="w-3.5 h-3.5" />, darkMode ? 'bg-white/10 text-white/70 hover:bg-white/15' : 'bg-black/5 text-gray-600 hover:bg-black/10', () => change(u, 'pending'), working)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
