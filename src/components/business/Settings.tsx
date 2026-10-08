import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AuditEntry, Org, Person, describeAudit, listAudit, updateOrg } from '../../lib/business';
import { Sheet, TextField, Label, ErrorNote } from './ui';

// Company settings (owner and admin): details, sections shown to the team, activity log.
export default function Settings({ org, people, sections, onClose, onSaved }: {
  org: Org; people: Person[]; sections: { id: string; label: string }[]; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(org.name);
  const [sector, setSector] = useState(org.sector || '');
  const [vat, setVat] = useState(org.vat || '');
  const [hidden, setHidden] = useState<string[]>(org.settings?.hidden_sections || []);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { listAudit(org.id).then(setAudit).catch(() => setAudit([])); }, [org.id]);

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await updateOrg(org.id, { name: name.trim(), sector: sector.trim() || null, vat: vat.trim() || null, settings: { ...org.settings, hidden_sections: hidden } });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Sheet title="Impostazioni azienda" onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn-secondary h-11 px-5">Annulla</button>
        <button onClick={save} disabled={!name.trim() || busy} className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Salva
        </button>
      </>}>
      <TextField id="o-name" label="Nome" value={name} onChange={setName} />
      <TextField id="o-sector" label="Settore" value={sector} onChange={setSector} placeholder="Es. Sport · atleta e collaborazioni" />
      <TextField id="o-vat" label="Partita IVA" value={vat} onChange={setVat} placeholder="Facoltativa" />

      <div>
        <Label>Sezioni visibili al team</Label>
        <p className="text-xs mb-2" style={{ color: 'var(--text-subtle)' }}>Togli quelle che non usate. Oggi resta sempre.</p>
        <ul className="rounded-2xl overflow-hidden" style={{ background: 'var(--glass-well)' }}>
          {sections.filter(s => s.id !== 'oggi').map(s => {
            const on = !hidden.includes(s.id);
            return (
              <li key={s.id}>
                <button type="button" role="switch" aria-checked={on} onClick={() => setHidden(on ? [...hidden, s.id] : hidden.filter(x => x !== s.id))}
                  className="w-full h-12 px-4 flex items-center justify-between text-[15px]" style={{ color: 'var(--text)' }}>
                  {s.label}
                  <span className="w-11 h-[26px] rounded-full p-[3px] transition-colors" style={{ background: on ? 'var(--brand-fill)' : 'var(--border)' }}>
                    <span className="block w-5 h-5 rounded-full bg-white transition-transform" style={{ transform: on ? 'translateX(18px)' : 'none' }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <Label>Attività recenti</Label>
        {audit === null ? <p className="text-sm" style={{ color: 'var(--text-subtle)' }}>Caricamento…</p>
          : audit.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-subtle)' }}>Nessuna attività.</p> : (
            <ul className="space-y-1">
              {audit.map(e => {
                const d = describeAudit(e, people);
                return (
                  <li key={e.id} className="flex items-baseline gap-3 py-1.5 text-sm">
                    <span className="tabular text-xs w-[86px] flex-shrink-0" style={{ color: 'var(--text-subtle)' }}>
                      {new Date(e.at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="flex-1 min-w-0" style={{ color: 'var(--text-muted)' }}>{d.text}</span>
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-subtle)' }}>{d.area}</span>
                  </li>
                );
              })}
            </ul>
          )}
      </div>
      <ErrorNote text={error} />
    </Sheet>
  );
}
