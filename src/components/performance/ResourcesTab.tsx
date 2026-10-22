import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link2, StickyNote, Search, ExternalLink, Loader2, FileText, FolderOpen, Users, Globe, UploadCloud } from 'lucide-react';
import {
  Member, Project, ProjectsSetupError, Resource, ResourceInput, deleteResource, listResources, memberName, normalizeUrl, resourceFilesReady, saveResource,
} from '../../lib/projects';
import { ShareMode, formatSize, isDriveUrl, shareDocument, sharingGap, syncSharing, unshareDocument, uploadAndShare } from '../../lib/projectFiles';
import { DRIVE_MAX_FILE_SIZE, driveConfigured, driveViewUrl, ensureDriveToken, hasDriveToken, loadGoogleIdentity } from '../../lib/googleDrive';
import type { ArchiveItem } from '../../lib/store';
import { useDialog } from '../Dialog';
import { Sheet, TextField, TextArea, ErrorNote, Empty, MoreMenu, Label, Pills, SectionTitle } from './ui';

const NO_FOLDER = '';

// Notes, links and documents of a project, in folders. A document is a file of someone's Google
// Drive that they chose to publish here: it stays in their Drive, and MYND shares it (read only)
// with the people of the project, keeping the sharing in step with who joins or leaves.
export function ResourcesTab({ project, me, members, canEdit, canManage, archive, notify }: {
  project: Project; me: string; members: Member[]; canEdit: boolean; canManage: boolean; archive: ArchiveItem[];
  notify: (text: string, error?: boolean) => void;
}) {
  const projectId = project.id;
  const dialog = useDialog();
  const [items, setItems] = useState<Resource[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [who, setWho] = useState('tutti');
  const [editing, setEditing] = useState<Resource | 'nota' | 'link' | 'file' | null>(null);
  const [syncing, setSyncing] = useState(false);
  const filesReady = resourceFilesReady();

  const load = useCallback(async () => {
    try { setItems(await listResources(projectId)); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); setItems(x => x || []); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const folders = useMemo(() => [...new Set((items || []).map(r => r.folder || NO_FOLDER).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [items]);
  const authors = useMemo(() => [...new Set((items || []).map(r => r.added_by).filter((x): x is string => !!x))], [items]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || [])
      .filter(r => who === 'tutti' || r.added_by === who)
      .filter(r => !q || [r.title, r.body, r.url, r.folder].some(v => (v || '').toLowerCase().includes(q)));
  }, [items, query, who]);
  const groups = useMemo(() => {
    if (!folders.length) return [{ folder: NO_FOLDER, items: shown }];
    return [...folders, NO_FOLDER].map(f => ({ folder: f, items: shown.filter(r => (r.folder || NO_FOLDER) === f) })).filter(g => g.items.length);
  }, [folders, shown]);

  // My documents that people who joined (or left) since I published them can't see (or still see).
  const outOfStep = useMemo(() => (items || []).filter(r => r.added_by === me && r.kind === 'file').filter(r => {
    const gap = sharingGap(r, members, me);
    return gap.add.length > 0 || gap.remove.length > 0;
  }), [items, members, me]);
  const othersDocs = (items || []).some(r => r.kind === 'file' && r.added_by !== me);
  const myEmail = members.find(m => m.user_id === me)?.email;

  const fixSharing = () => {
    if (syncing) return;
    setSyncing(true);
    // The Google window opens straight from the click (browsers block late pop-ups).
    ensureDriveToken().then(async () => {
      let failed: string[] = [];
      for (const r of outOfStep) {
        const out = await syncSharing(r, members, me);
        failed = failed.concat(out.failed);
        const saved = await saveResource(projectId, { kind: r.kind, title: r.title, body: r.body, url: r.url, sharing: out.sharing }, r.id);
        setItems(xs => (xs || []).map(x => (x.id === saved.id ? saved : x)));
      }
      notify(failed.length ? `Condivisione aggiornata, tranne che con ${[...new Set(failed)].join(', ')}` : 'Condivisione aggiornata', failed.length > 0);
    }).catch(err => notify(err instanceof Error ? err.message : String(err), true)).finally(() => setSyncing(false));
  };

  const remove = async (r: Resource) => {
    const mineDoc = r.kind === 'file' && r.added_by === me && !!r.drive_id;
    const ok = await dialog.confirm({
      title: r.kind === 'file' ? `Togliere “${r.title}” dal progetto?` : `Eliminare “${r.title}”?`,
      message: r.kind === 'nota' ? 'La nota verrà cancellata per sempre.'
        : r.kind === 'file' ? (mineDoc ? 'Il file resta nel tuo Google Drive: MYND smette di condividerlo con le persone del progetto.' : 'Il file resta nel Google Drive di chi l\'ha pubblicato.')
        : 'Il link verrà tolto dal progetto (il file resta dov\'è).',
      confirmLabel: r.kind === 'file' ? 'Togli' : 'Elimina', danger: true,
    });
    if (!ok) return;
    let unshared = true;
    if (mineDoc) {
      try { if (hasDriveToken()) await unshareDocument(r); else unshared = false; }
      catch { unshared = false; }
    }
    try {
      await deleteResource(r.id);
      setItems(xs => (xs || []).filter(x => x.id !== r.id));
      notify(mineDoc && !unshared ? 'Tolto dal progetto. Il file è ancora condiviso su Drive: per smettere, aprilo e togli la condivisione.' : r.kind === 'file' ? 'Tolto dal progetto' : 'Eliminato', mineDoc && !unshared);
    } catch (err) { notify(err instanceof Error ? err.message : String(err), true); }
  };

  const saved = (r: Resource) => { setItems(xs => [r, ...(xs || []).filter(x => x.id !== r.id)]); setEditing(null); };

  return (
    <div className="space-y-5">
      {canEdit && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setEditing('file')} className="btn-primary h-11 px-4 inline-flex items-center gap-2"><UploadCloud className="w-4 h-4" /> Documento</button>
          <button onClick={() => setEditing('nota')} className="btn-secondary h-11 px-4 inline-flex items-center gap-2"><StickyNote className="w-4 h-4" /> Nota</button>
          <button onClick={() => setEditing('link')} className="btn-secondary h-11 px-4 inline-flex items-center gap-2"><Link2 className="w-4 h-4" /> Link</button>
        </div>
      )}

      {outOfStep.length > 0 && (
        <div className="rounded-2xl p-4 flex items-center gap-3 flex-wrap" style={{ background: 'color-mix(in srgb, var(--brand-fill) 12%, transparent)' }}>
          <p className="flex-1 min-w-[200px] text-sm" style={{ color: 'var(--text)' }}>
            Le persone del progetto sono cambiate: {outOfStep.length === 1 ? 'un tuo documento va' : `${outOfStep.length} tuoi documenti vanno`} ricondivis{outOfStep.length === 1 ? 'o' : 'i'} perché lo vedano tutti e solo loro.
          </p>
          <button onClick={fixSharing} disabled={syncing} className="btn-primary h-10 px-4 text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {syncing && <Loader2 className="w-4 h-4 animate-spin" />} Aggiorna condivisione
          </button>
        </div>
      )}

      {((items?.length || 0) > 3 || query) && (
        <label className="relative block">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-subtle)' }} />
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cerca in documenti, note e link" aria-label="Cerca in documenti, note e link" className="input-glass w-full h-12 pl-11 text-[15px]" />
        </label>
      )}
      {authors.length > 1 && (
        <Pills label="Di chi" value={who} onChange={setWho} options={[
          { id: 'tutti', label: 'Tutti' },
          ...authors.map(a => ({ id: a, label: a === me ? 'I miei' : memberName(members, a, me) || 'Altri' })),
        ]} />
      )}
      <ErrorNote text={error} />

      {items === null ? (
        <div className="space-y-2"><div className="skeleton h-16 rounded-2xl" /><div className="skeleton h-16 rounded-2xl" /></div>
      ) : items.length === 0 ? (
        <Empty>Qui il gruppo trova tutto il materiale del progetto: documenti dal tuo Google Drive, appunti, conferme di prenotazione, link utili. Puoi ordinarli in cartelle.</Empty>
      ) : shown.length === 0 ? (
        <Empty>{query.trim() ? `Nessun risultato per “${query.trim()}”.` : 'Niente da mostrare con questo filtro.'}</Empty>
      ) : (
        <div className="space-y-6">
          {groups.map(g => (
            <section key={g.folder || '_'}>
              {folders.length > 0 && <SectionTitle><span className="inline-flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" /> {g.folder || 'Senza cartella'} · {g.items.length}</span></SectionTitle>}
              <ul className="space-y-2">
                {g.items.map(r => <ResourceRow key={r.id} r={r} me={me} members={members} canEdit={canEdit} canManage={canManage} onEdit={() => setEditing(r)} onRemove={() => remove(r)} />)}
              </ul>
            </section>
          ))}
        </div>
      )}
      {othersDocs && myEmail && (
        <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>Per aprire i documenti di Drive degli altri usa l'account Google con la tua email di MYND ({myEmail}).</p>
      )}

      {editing === 'file' && (
        <DocumentSheet project={project} me={me} members={members} folders={folders} archive={archive} filesReady={filesReady}
          onClose={() => setEditing(null)} onSaved={(r, failed) => { saved(r); notify(failed.length ? `Pubblicato, ma non condiviso con ${failed.join(', ')}: riprova da "Aggiorna condivisione".` : 'Documento pubblicato', failed.length > 0); }} />
      )}
      {editing && editing !== 'file' && (
        <ResourceSheet projectId={projectId} resource={typeof editing === 'object' ? editing : null} kind={typeof editing === 'object' ? editing.kind : editing}
          folders={folders} filesReady={filesReady} onClose={() => setEditing(null)} onSaved={saved} />
      )}
    </div>
  );
}

function ResourceRow({ r, me, members, canEdit, canManage, onEdit, onRemove }: {
  r: Resource; me: string; members: Member[]; canEdit: boolean; canManage: boolean; onEdit: () => void; onRemove: () => void;
}) {
  const mine = canEdit && (r.added_by === me || canManage);
  const host = r.url ? (() => { try { return new URL(r.url).hostname.replace(/^www\./, ''); } catch { return r.url; } })() : '';
  const author = members.length > 1 && r.added_by ? memberName(members, r.added_by, me) : '';
  const Icon = r.kind === 'nota' ? StickyNote : r.kind === 'file' || isDriveUrl(r.url) ? FileText : Link2;
  const visibility = r.kind === 'file' ? (r.sharing?.mode === 'link' ? 'Lo vede chiunque abbia il link' : 'Lo vedono le persone del progetto') : '';
  const meta = r.kind === 'file'
    ? [formatSize(r.size_bytes), author && `pubblicato da ${author}`].filter(Boolean)
    : r.kind === 'link' ? [host, author].filter(Boolean)
    : [author, new Date(r.updated_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })].filter(Boolean);
  const body = (
    <>
      <p className="text-[15px] font-medium inline-flex items-center gap-1.5 break-all" style={{ color: 'var(--text)' }}>{r.title} {r.kind !== 'nota' && <ExternalLink className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />}</p>
      {r.kind === 'nota' && r.body && <p className="text-sm mt-0.5 line-clamp-3 whitespace-pre-line" style={{ color: 'var(--text-muted)' }}>{r.body}</p>}
      {meta.length > 0 && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-subtle)' }}>{meta.join(' · ')}</p>}
      {visibility && (
        <p className="text-xs mt-1 inline-flex items-center gap-1" style={{ color: 'var(--text-subtle)' }}>
          {r.sharing?.mode === 'link' ? <Globe className="w-3 h-3" /> : <Users className="w-3 h-3" />} {visibility}
        </p>
      )}
      {r.kind !== 'nota' && r.body && <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{r.body}</p>}
    </>
  );
  return (
    <li className="glass-card rounded-[20px] pl-4 pr-1.5 py-3 flex items-start gap-3">
      <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--brand-ring)' }}><Icon className="w-4 h-4" /></span>
      {r.kind === 'nota'
        ? <button onClick={() => mine && onEdit()} className="flex-1 min-w-0 text-left">{body}</button>
        : <a href={r.url || '#'} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0">{body}</a>}
      {mine && <MoreMenu label={`Azioni per ${r.title}`} items={[
        { label: 'Modifica', onClick: onEdit, hidden: r.kind === 'file' && r.added_by !== me },
        { label: r.kind === 'file' ? 'Togli dal progetto' : 'Elimina', onClick: onRemove, danger: true },
      ]} />}
    </li>
  );
}

function FolderField({ value, onChange, folders }: { value: string; onChange: (v: string) => void; folders: string[] }) {
  return (
    <div>
      <Label htmlFor="rs-folder">Cartella (facoltativa)</Label>
      <input id="rs-folder" list="rs-folders" value={value} onChange={e => onChange(e.target.value)} maxLength={80} placeholder="Es. Prenotazioni" className="input-glass w-full h-12 text-[15px]" />
      <datalist id="rs-folders">{folders.map(f => <option key={f} value={f} />)}</datalist>
    </div>
  );
}

function ResourceSheet({ projectId, resource, kind, folders, filesReady, onClose, onSaved }: {
  projectId: string; resource: Resource | null; kind: Resource['kind']; folders: string[]; filesReady: boolean; onClose: () => void; onSaved: (r: Resource) => void;
}) {
  const isNote = kind === 'nota';
  const isFile = kind === 'file';
  const [title, setTitle] = useState(resource?.title || '');
  const [body, setBody] = useState(resource?.body || '');
  const [url, setUrl] = useState(resource?.url || '');
  const [folder, setFolder] = useState(resource?.folder || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (busy) return;
    const link = isNote ? null : isFile ? resource?.url || null : normalizeUrl(url);
    if (!isNote && !link) { setError('Incolla un indirizzo web valido (es. il link di condivisione di Google Drive).'); return; }
    const finalTitle = title.trim() || (link ? new URL(link).hostname.replace(/^www\./, '') : '');
    if (!finalTitle) { setError('Scrivi un titolo.'); return; }
    setBusy(true); setError('');
    try {
      const input: ResourceInput = { kind, title: finalTitle.slice(0, 200), body: body.trim() || null, url: link, ...(filesReady ? { folder: folder.trim() || null } : {}) };
      onSaved(await saveResource(projectId, input, resource?.id));
    } catch (err) { setError(err instanceof ProjectsSetupError || err instanceof Error ? err.message : String(err)); setBusy(false); }
  };

  return (
    <Sheet title={resource ? (isNote ? 'Modifica nota' : isFile ? 'Modifica documento' : 'Modifica link') : (isNote ? 'Nuova nota' : 'Nuovo link')} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="btn-secondary h-11 px-5">Annulla</button>
        <button onClick={save} disabled={busy || (isNote ? !title.trim() : !isFile && !url.trim())} className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Salva
        </button>
      </>}>
      {!isNote && !isFile && (
        <>
          <TextField id="rs-url" label="Link" value={url} onChange={setUrl} placeholder="https://…" type="url" autoFocus={!resource} />
          {isDriveUrl(url) && <p className="text-xs -mt-2" style={{ color: 'var(--text-subtle)' }}>È un file di Google Drive che MYND non ha creato: controlla su Drive che sia condiviso con le persone del progetto. Per farlo fare a MYND, usa "Documento".</p>}
        </>
      )}
      <TextField id="rs-title" label={isNote ? 'Titolo' : isFile ? 'Nome' : 'Titolo (facoltativo)'} value={title} onChange={setTitle} placeholder={isNote ? 'Es. Idee per la location' : 'Es. Conferma volo'} autoFocus={isNote && !resource} />
      {filesReady && <FolderField value={folder} onChange={setFolder} folders={folders} />}
      <TextArea id="rs-body" label={isNote ? 'Testo' : 'Nota (facoltativa)'} value={body} onChange={setBody} rows={isNote ? 8 : 2} />
      <ErrorNote text={error} />
    </Sheet>
  );
}

// "Documento": a file from this device (uploaded to the person's Drive) or one already in their
// Archivio on Drive, published in the project and shared as chosen.
function DocumentSheet({ project, me, members, folders, archive, filesReady, onClose, onSaved }: {
  project: Project; me: string; members: Member[]; folders: string[]; archive: ArchiveItem[]; filesReady: boolean;
  onClose: () => void; onSaved: (r: Resource, failed: string[]) => void;
}) {
  const fromArchive = useMemo(() => archive.filter(a => a.file?.drive?.id), [archive]);
  const [source, setSource] = useState<'device' | 'archive'>('device');
  const [file, setFile] = useState<File | null>(null);
  const [archiveId, setArchiveId] = useState(fromArchive[0]?.id || '');
  const [title, setTitle] = useState('');
  const [folder, setFolder] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<ShareMode>('progetto');
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const others = members.filter(m => m.user_id !== me).length;

  useEffect(() => { loadGoogleIdentity().catch(() => {}); }, []);

  const picked = source === 'archive' ? fromArchive.find(a => a.id === archiveId) : null;
  const ready = source === 'device' ? !!file : !!picked;

  const publish = () => {
    if (step || !ready) return;
    if (file && file.size > DRIVE_MAX_FILE_SIZE) { setError('Il file è troppo grande (massimo 2 GB).'); return; }
    setError(''); setStep('Collego Google Drive…');
    // The Google window opens straight from the click (browsers block late pop-ups).
    ensureDriveToken().then(async () => {
      let ref: { id: string; webViewLink?: string; mimeType?: string; size?: number };
      let failed: string[];
      let sharing;
      if (source === 'device' && file) {
        setStep('Carico il file sul tuo Google Drive…');
        const out = await uploadAndShare(file, project.name, mode, members, me);
        ({ ref, failed, sharing } = { ref: out.ref, failed: out.failed, sharing: out.sharing });
      } else {
        const f = picked!.file!;
        ref = { id: f.drive!.id, webViewLink: f.drive!.webViewLink, mimeType: f.mimeType, size: f.size };
        setStep(mode === 'link' ? 'Creo il link…' : `Condivido con ${others} ${others === 1 ? 'persona' : 'persone'}…`);
        const out = await shareDocument(ref.id, mode, members, me);
        ({ failed, sharing } = out);
      }
      setStep('Pubblico nel progetto…');
      const name = (title.trim() || (source === 'device' ? file!.name : picked!.file!.originalName || picked!.name)).slice(0, 200);
      const saved = await saveResource(project.id, {
        kind: 'file', title: name, body: note.trim() || null, url: driveViewUrl(ref), folder: folder.trim() || null,
        drive_id: ref.id, mime: ref.mimeType || null, size_bytes: ref.size ?? null, sharing,
      });
      onSaved(saved, failed);
    }).catch(err => { setError(err instanceof Error ? err.message : String(err)); setStep(''); });
  };

  return (
    <Sheet title="Pubblica un documento" onClose={onClose}
      footer={!driveConfigured || !filesReady ? <button onClick={onClose} className="btn-secondary h-11 px-5">Chiudi</button> : <>
        <button onClick={onClose} className="btn-secondary h-11 px-5">Annulla</button>
        <button onClick={publish} disabled={!ready || !!step} className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">
          {step && <Loader2 className="w-4 h-4 animate-spin" />} Pubblica
        </button>
      </>}>
      {!filesReady ? (
        <p className="text-[15px]" style={{ color: 'var(--text-muted)' }}>Per pubblicare documenti serve ancora un passaggio su Supabase: lo script "Documenti dei progetti" (Admin → Guida → Script Supabase).</p>
      ) : !driveConfigured ? (
        <p className="text-[15px]" style={{ color: 'var(--text-muted)' }}>Google Drive non è ancora configurato in questa app.</p>
      ) : (
        <>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Il file resta nel <b>tuo</b> Google Drive (cartella "Student Hub/Progetti/{project.name}"): MYND lo condivide in sola lettura e puoi toglierlo quando vuoi.</p>
          {fromArchive.length > 0 && (
            <div className="flex gap-1 p-1 rounded-full" style={{ background: 'var(--glass-well)' }} role="radiogroup" aria-label="Da dove">
              {([['device', 'Dal dispositivo'], ['archive', 'Dal tuo Archivio']] as const).map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={source === id} onClick={() => setSource(id)}
                  className={`flex-1 h-10 rounded-full text-sm font-medium transition-colors ${source === id ? 'glass-lens' : ''}`}
                  style={{ color: source === id ? 'var(--brand-ring)' : 'var(--text-muted)' }}>{label}</button>
              ))}
            </div>
          )}
          {source === 'device' ? (
            <div>
              <input ref={input} type="file" className="hidden" aria-label="Scegli un file" onChange={e => { const f = e.target.files?.[0] || null; setFile(f); if (f && !title) setTitle(f.name); }} />
              <button type="button" onClick={() => input.current?.click()} className="w-full rounded-2xl px-4 py-5 text-left flex items-center gap-3 border border-dashed hover:bg-white/5"
                style={{ borderColor: 'var(--glass-edge)', color: 'var(--text)' }}>
                <UploadCloud className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--brand-ring)' }} />
                <span className="min-w-0">
                  <span className="block text-[15px] truncate">{file ? file.name : 'Scegli un file'}</span>
                  <span className="block text-xs" style={{ color: 'var(--text-subtle)' }}>{file ? formatSize(file.size) : 'PDF, foto, documenti, fogli… fino a 2 GB'}</span>
                </span>
              </button>
            </div>
          ) : (
            <div>
              <Label htmlFor="rs-archive">File dell'Archivio (su Google Drive)</Label>
              <select id="rs-archive" value={archiveId} onChange={e => setArchiveId(e.target.value)} className="input-glass w-full h-12 text-[15px]">
                {fromArchive.map(a => <option key={a.id} value={a.id}>{a.name} · {a.subject}</option>)}
              </select>
            </div>
          )}
          <TextField id="rs-doc-title" label="Nome nel progetto (facoltativo)" value={title} onChange={setTitle} placeholder={picked?.name || 'Es. Preventivo catering'} />
          <FolderField value={folder} onChange={setFolder} folders={folders} />
          <div>
            <Label>Chi lo può vedere</Label>
            <div className="space-y-1.5">
              {([
                ['progetto', <Users key="u" className="w-4 h-4" />, 'Le persone del progetto', others ? `Ora ${others} ${others === 1 ? 'persona' : 'persone'}; chi entra dopo lo vedrà quando premi "Aggiorna condivisione".` : 'Per ora ci sei solo tu: chi entrerà lo vedrà quando premi "Aggiorna condivisione".'],
                ['link', <Globe key="g" className="w-4 h-4" />, 'Chiunque abbia il link', 'Comodo per chi non usa Google con la stessa email. Non condividere così documenti personali.'],
              ] as const).map(([id, icon, label, hint]) => (
                <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => setMode(id)}
                  className={`w-full text-left rounded-2xl px-4 py-3 flex gap-3 transition-colors ${mode === id ? 'glass-lens' : ''}`} style={mode === id ? undefined : { background: 'var(--glass-well)' }}>
                  <span className="mt-0.5" style={{ color: mode === id ? 'var(--brand-ring)' : 'var(--text-subtle)' }}>{icon}</span>
                  <span><span className="block text-[15px]" style={{ color: 'var(--text)' }}>{label}</span><span className="block text-xs mt-0.5" style={{ color: 'var(--text-subtle)' }}>{hint}</span></span>
                </button>
              ))}
            </div>
          </div>
          <TextArea id="rs-doc-note" label="Nota (facoltativa)" value={note} onChange={setNote} rows={2} />
          {step && <p className="text-sm inline-flex items-center gap-2" style={{ color: 'var(--text-muted)' }}><Loader2 className="w-4 h-4 animate-spin" /> {step}</p>}
        </>
      )}
      <ErrorNote text={error} />
    </Sheet>
  );
}
