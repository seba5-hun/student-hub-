import { useState } from 'react';
import { Database, Loader2, RotateCw } from 'lucide-react';
import { createOrg } from '../../lib/business';
import { TextField, ErrorNote, PageTitle } from './ui';

// The tables are missing: supabase/business.sql has to be run once in Supabase.
export function SetupNeeded({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="max-w-xl space-y-6">
      <PageTitle title="Quasi pronto." lead="Il database di Business va attivato una volta sola su Supabase." />
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <Database className="w-[18px] h-[18px]" strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} />
          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Come si fa</h3>
        </div>
        <ol className="list-decimal pl-5 space-y-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          <li>Apri il progetto su supabase.com → <b>SQL Editor</b> → <b>New query</b>.</li>
          <li>Incolla tutto il contenuto del file <code>supabase/business.sql</code>.</li>
          <li>Premi <b>Run</b>. Poi torna qui e premi Riprova.</li>
        </ol>
      </div>
      <button onClick={onRetry} className="btn-primary h-12 px-6 inline-flex items-center gap-2"><RotateCw className="w-4 h-4" /> Riprova</button>
    </div>
  );
}

export function CreateOrg({ defaultName, onCreated }: { defaultName: string; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [sector, setSector] = useState('');
  const [owner, setOwner] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await createOrg(name.trim(), sector.trim(), owner.trim());
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-xl space-y-6">
      <PageTitle title="La tua azienda." lead="Crea l'azienda: sarai il titolare e potrai aggiungere il team, i clienti e i progetti." />
      <div className="glass-card p-5 space-y-4">
        <TextField id="biz-name" label="Nome dell'azienda" value={name} onChange={setName} placeholder="Es. Sebaz" autoFocus />
        <TextField id="biz-sector" label="Settore" value={sector} onChange={setSector} placeholder="Es. Sport · atleta e collaborazioni" />
        <TextField id="biz-owner" label="Il tuo nome" value={owner} onChange={setOwner} placeholder="Es. Seba" />
      </div>
      <ErrorNote text={error} />
      <button type="submit" disabled={!name.trim() || busy} className="btn-primary h-12 px-6 inline-flex items-center gap-2 disabled:opacity-40">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Crea l'azienda
      </button>
    </form>
  );
}
