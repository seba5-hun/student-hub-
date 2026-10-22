import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, StickyNote, Search, ExternalLink, Loader2 } from 'lucide-react';
import { Member, Resource, ResourceInput, deleteResource, listResources, memberName, normalizeUrl, saveResource } from '../../lib/projects';
import { useDialog } from '../Dialog';
import { Sheet, TextField, TextArea, ErrorNote, Empty, MoreMenu } from './ui';

// Notes and links of a project. A file is shared as its link (Google Drive, Dropbox…): nothing is
// uploaded here, so there is no upload button that could not work.
export function ResourcesTab({ projectId, me, members, canManage, notify }: {
  projectId: string; me: string; members: Member[]; canManage: boolean; notify: (text: string, error?: boolean) => void;
}) {
  const dialog = useDialog();
  const [items, setItems] = useState<Resource[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Resource | 'nota' | 'link' | null>(null);

  const load = useCallback(async () => {
    try { setItems(await listResources(projectId)); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); setItems(x => x || []); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || []).filter(r => !q || [r.title, r.body, r.url].some(v => (v || '').toLowerCase().includes(q)));
  }, [items, query]);

  const remove = async (r: Resource) => {
    const ok = await dialog.confirm({ title: `Eliminare “${r.title}”?`, message: r.kind === 'nota' ? 'La nota verrà cancellata per sempre.' : 'Il link verrà tolto dal progetto (il file resta dov\'è).', confirmLabel: 'Elimina', danger: true });
    if (!ok) return;
    try { await deleteResource(r.id); setItems(xs => (xs || []).filter(x => x.id !== r.id)); notify('Eliminato'); }
    catch (err) { notify(err instanceof Error ? err.message : String(err), true); }
  };

  const save = async (input: ResourceInput) => {
    const id = editing && typeof editing === 'object' ? editing.id : undefined;
    const saved = await saveResource(projectId, input, id);
    setItems(xs => [saved, ...(xs || []).filter(x => x.id !== saved.id)]);
    setEditing(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setEditing('nota')} className="btn-primary h-11 px-4 inline-flex items-center gap-2"><StickyNote className="w-4 h-4" /> Nota</button>
        <button onClick={() => setEditing('link')} className="btn-secondary h-11 px-4 inline-flex items-center gap-2"><Link2 className="w-4 h-4" /> Link o documento</button>
      </div>
      {(items?.length || 0) > 3 && (
        <label className="relative block">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-subtle)' }} />
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cerca nelle note e nei link" aria-label="Cerca nelle note e nei link" className="input-glass w-full h-12 pl-11 text-[15px]" />
        </label>
      )}
      <ErrorNote text={error} />
      {items === null ? (
        <div className="space-y-2"><div className="skeleton h-16 rounded-2xl" /><div className="skeleton h-16 rounded-2xl" /></div>
      ) : items.length === 0 ? (
        <Empty>Qui tieni le informazioni del progetto: appunti, idee, conferme di prenotazione, link a documenti di Google Drive o di altri servizi.</Empty>
      ) : shown.length === 0 ? (
        <Empty>Nessun risultato per “{query.trim()}”.</Empty>
      ) : (
        <ul className="space-y-2">
          {shown.map(r => {
            const mine = r.added_by === me || canManage;
            const host = r.url ? (() => { try { return new URL(r.url).hostname.replace(/^www\./, ''); } catch { return r.url; } })() : '';
            const who = members.length > 1 ? memberName(members, r.added_by, me) : '';
            return (
              <li key={r.id} className="glass-card rounded-[20px] pl-4 pr-1.5 py-3 flex items-start gap-3">
                <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--brand-ring)' }}>{r.kind === 'nota' ? <StickyNote className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}</span>
                {r.kind === 'nota' ? (
                  <button onClick={() => mine && setEditing(r)} className="flex-1 min-w-0 text-left">
                    <p className="text-[15px] font-medium" style={{ color: 'var(--text)' }}>{r.title}</p>
                    {r.body && <p className="text-sm mt-0.5 line-clamp-3 whitespace-pre-line" style={{ color: 'var(--text-muted)' }}>{r.body}</p>}
                    <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>{[who, new Date(r.updated_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}</p>
                  </button>
                ) : (
                  <a href={r.url || '#'} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium inline-flex items-center gap-1.5" style={{ color: 'var(--text)' }}>{r.title} <ExternalLink className="w-3.5 h-3.5 opacity-60" /></p>
                    <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-subtle)' }}>{[host, who].filter(Boolean).join(' · ')}</p>
                    {r.body && <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{r.body}</p>}
                  </a>
                )}
                {mine && <MoreMenu label={`Azioni per ${r.title}`} items={[
                  { label: 'Modifica', onClick: () => setEditing(r) },
                  { label: 'Elimina', onClick: () => remove(r), danger: true },
                ]} />}
              </li>
            );
          })}
        </ul>
      )}
      {editing && <ResourceSheet resource={typeof editing === 'object' ? editing : null} kind={typeof editing === 'object' ? editing.kind : editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function ResourceSheet({ resource, kind, onClose, onSave }: { resource: Resource | null; kind: Resource['kind']; onClose: () => void; onSave: (input: ResourceInput) => Promise<void> }) {
  const isNote = kind === 'nota';
  const [title, setTitle] = useState(resource?.title || '');
  const [body, setBody] = useState(resource?.body || '');
  const [url, setUrl] = useState(resource?.url || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (busy) return;
    const link = isNote ? null : normalizeUrl(url);
    if (!isNote && !link) { setError('Incolla un indirizzo web valido (es. il link di condivisione di Google Drive).'); return; }
    const finalTitle = title.trim() || (link ? new URL(link).hostname.replace(/^www\./, '') : '');
    if (!finalTitle) { setError('Scrivi un titolo.'); return; }
    setBusy(true); setError('');
    try { await onSave({ kind: isNote ? 'nota' : 'link', title: finalTitle.slice(0, 200), body: body.trim() || null, url: link }); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  };

  return (
    <Sheet title={resource ? (isNote ? 'Modifica nota' : 'Modifica link') : (isNote ? 'Nuova nota' : 'Nuovo link o documento')} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn-secondary h-11 px-5">Annulla</button>
        <button onClick={save} disabled={busy || (isNote ? !title.trim() : !url.trim())} className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Salva
        </button>
      </>}>
      {!isNote && (
        <>
          <TextField id="rs-url" label="Link" value={url} onChange={setUrl} placeholder="https://drive.google.com/…" type="url" autoFocus={!resource} />
          <p className="text-xs -mt-2" style={{ color: 'var(--text-subtle)' }}>Per un file di Google Drive: apri il file, "Condividi" → "Copia link". Chi apre il link deve avere il permesso di vederlo su Drive.</p>
        </>
      )}
      <TextField id="rs-title" label={isNote ? 'Titolo' : 'Titolo (facoltativo)'} value={title} onChange={setTitle} placeholder={isNote ? 'Es. Idee per la location' : 'Es. Conferma volo'} autoFocus={isNote && !resource} />
      <TextArea id="rs-body" label={isNote ? 'Testo' : 'Nota (facoltativa)'} value={body} onChange={setBody} rows={isNote ? 8 : 2} />
      <ErrorNote text={error} />
    </Sheet>
  );
}
