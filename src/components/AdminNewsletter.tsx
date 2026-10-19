import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Copy, Download, RefreshCw, Loader2, Check } from 'lucide-react';
import { loadNewsletter, Subscriber } from '../lib/legal';

// Admin → Newsletter: the verified emails that agreed to receive news (optional box at sign-up or
// "Privacy e dati"). Copy them or download a CSV for the newsletter service (Brevo, Mailchimp…).
export default function AdminNewsletter({ darkMode }: { darkMode: boolean }) {
  const [list, setList] = useState<Subscriber[]>([]);
  const [verified, setVerified] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const text = darkMode ? 'text-white' : 'text-gray-800';
  const sub = darkMode ? 'text-white/60' : 'text-gray-500';
  const card = darkMode ? 'glass-card' : 'glass-card-light';
  const well = darkMode ? 'bg-white/5' : 'bg-black/[0.04]';

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { const r = await loadNewsletter(); setList(r.subscribers); setVerified(r.verifiedUsers); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const copyAll = async () => {
    try { await navigator.clipboard.writeText(list.map(s => s.email).join(', ')); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* not allowed */ }
  };
  const csv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [['email', 'nome', 'iscritto_il'], ...list.map(s => [s.email, s.name, s.subscribed_at])].map(r => r.map(esc).join(','));
    const url = URL.createObjectURL(new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `mynd-newsletter-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const button = `text-sm px-3 py-2 rounded-xl flex items-center gap-1.5 disabled:opacity-40 ${darkMode ? 'bg-white/10 text-white/80 hover:bg-white/15' : 'bg-black/5 text-gray-700 hover:bg-black/10'}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className={`${card} p-4`}>
          <p className={`text-xs ${sub}`}>Iscritti alla newsletter</p>
          <p className={`text-3xl font-bold tracking-tight mt-1 ${text}`}>{loading ? '…' : list.length}</p>
          <p className={`text-xs mt-0.5 ${sub}`}>email verificate con consenso</p>
        </div>
        <div className={`${card} p-4`}>
          <p className={`text-xs ${sub}`}>Account con email verificata</p>
          <p className={`text-3xl font-bold tracking-tight mt-1 ${text}`}>{loading ? '…' : verified}</p>
          <p className={`text-xs mt-0.5 ${sub}`}>{verified ? `${Math.round((list.length / verified) * 100)}% iscritti` : '—'}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={copyAll} disabled={!list.length} className={button}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copiate' : 'Copia tutte le email'}</button>
        <button onClick={csv} disabled={!list.length} className={button}><Download className="w-4 h-4" /> Scarica CSV</button>
        <button onClick={refresh} disabled={loading} className={`${button} ml-auto`}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Aggiorna</button>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">⚠️ {error}</div>}

      <div className={`${card} p-5`}>
        {!loading && !error && list.length === 0 ? (
          <div className="text-center py-6">
            <Mail className={`w-8 h-8 mx-auto mb-2 ${sub}`} />
            <p className={text}>Ancora nessun iscritto.</p>
            <p className={`text-sm mt-1 ${sub}`}>Gli utenti si iscrivono con la casella facoltativa alla registrazione o da "Privacy e dati".</p>
          </div>
        ) : (
          <ul className={`divide-y ${darkMode ? 'divide-white/10' : 'divide-black/10'}`}>
            {list.map(s => (
              <li key={s.email} className="py-2.5 flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className={`block text-sm font-medium truncate ${text}`}>{s.email}</span>
                  {s.name && <span className={`block text-xs ${sub}`}>{s.name}</span>}
                </span>
                <span className={`text-xs flex-shrink-0 ${sub}`}>{new Date(s.subscribed_at).toLocaleDateString('it-IT')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`rounded-2xl p-4 text-sm space-y-1.5 ${well} ${sub}`}>
        <p className={`font-semibold ${text}`}>Prima di mandare una newsletter</p>
        <p>• Usa un servizio di newsletter (Brevo, Mailchimp, MailerLite…): importa il CSV, non scrivere a tutti dalla tua email.</p>
        <p>• In ogni email deve esserci il link per <b className={text}>disiscriversi</b>; chi si disiscrive lì va tolto anche qui (o lo fa da solo in "Privacy e dati").</p>
        <p>• Scarica sempre la lista aggiornata prima dell'invio: chi ha tolto il consenso non deve ricevere email.</p>
        <p>• Solo contenuti su MYND e sullo studio, come promesso nella casella di iscrizione.</p>
      </div>
    </div>
  );
}
