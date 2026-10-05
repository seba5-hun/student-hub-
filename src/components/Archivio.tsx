import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus, Trash2, Search, FolderOpen, FileText, ExternalLink, ChevronRight, ChevronDown,
  Upload, Image as ImageIcon, File as FileIcon, Link as LinkIcon, Pencil, Check, X, Loader2, Sparkles, RotateCw,
  HardDrive, Cloud, ShieldCheck, CheckSquare, FolderInput, Minus,
} from 'lucide-react';
import { ArchiveItem, createId } from '../lib/store';
import {
  uploadArchiveFile, archiveFileUrl, removeArchiveFiles, storageErrorMessage, MAX_FILE_SIZE,
} from '../lib/supabase';
import { readKind } from '../lib/archiveText';
import {
  driveConfigured, hasDriveToken, ensureDriveToken, loadGoogleIdentity, disconnectDrive, uploadToDrive,
  trashOnDrive, driveInfo, driveViewUrl, DriveInfo, DRIVE_MAX_FILE_SIZE,
} from '../lib/googleDrive';
import { canTranscribe } from '../lib/ai';
import { useDialog } from './Dialog';
import { track } from '../lib/analytics';

interface ArchivioProps {
  userId: string;
  subjectNames?: string[];
  archive: ArchiveItem[];
  darkMode: boolean;
  // Receives a function of the current archive, so uploads finishing later don't lose other edits.
  onUpdate: (update: (archive: ArchiveItem[]) => ArchiveItem[]) => void;
  analyzing: string[];
  onAnalyze: (ids: string[]) => void;
  onOpenGuide: () => void;
}

// Only http(s) links are opened; "www.sito.it" becomes "https://www.sito.it".
function safeLink(link?: string): string | null {
  if (!link) return null;
  const value = /^[a-z][a-z0-9+.-]*:/i.test(link) ? link : `https://${link}`;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

type StorageChoice = 'app' | 'drive';

function readPref(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writePref(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* ignore */ }
}

function formatGB(bytes: number): string {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

// Photos of book pages are usually named IMG_0001, IMG_0002…: keep them in page order.
const byName = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

export default function Archivio({ userId, subjectNames = [], archive, darkMode, onUpdate, analyzing, onAnalyze, onOpenGuide }: ArchivioProps) {
  const dialog = useDialog();
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [formError, setFormError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Selection mode: tick files (or whole topics/subjects) and act on all of them at once.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState<{ subject: string; topic: string } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Where new files go: the app's storage or the student's own Google Drive (per device).
  const storageKey = `studenthub_archive_storage_${userId}`;
  const connectedKey = `studenthub_drive_connected_${userId}`;
  const [storage, setStorageState] = useState<StorageChoice>(() => (readPref(storageKey) === 'drive' ? 'drive' : 'app'));
  const [driveReady, setDriveReady] = useState(hasDriveToken());
  const [driveWasConnected, setDriveWasConnected] = useState(() => readPref(connectedKey) === '1');
  const [driveDetails, setDriveDetails] = useState<DriveInfo | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveError, setDriveError] = useState('');
  const useDrive = storage === 'drive' && driveConfigured;
  const maxSize = useDrive ? DRIVE_MAX_FILE_SIZE : MAX_FILE_SIZE;
  const hasDriveFiles = archive.some(a => a.file?.drive);

  const setStorage = (value: StorageChoice) => {
    setStorageState(value);
    writePref(storageKey, value);
    setFiles(prev => prev.filter(f => f.size <= (value === 'drive' ? DRIVE_MAX_FILE_SIZE : MAX_FILE_SIZE)));
  };

  // Load Google's library in advance, so the permission window opens right on the click.
  useEffect(() => {
    if (driveConfigured && (useDrive || hasDriveFiles)) loadGoogleIdentity().catch(() => { /* shown on use */ });
  }, [useDrive, hasDriveFiles]);

  useEffect(() => {
    if (!driveReady) { setDriveDetails(null); return; }
    let alive = true;
    driveInfo().then(info => { if (alive) setDriveDetails(info); }).catch(() => { /* optional */ });
    return () => { alive = false; };
  }, [driveReady]);

  // The Google token lasts about an hour: notice when it expires.
  useEffect(() => {
    if (!driveReady) return;
    const id = window.setInterval(() => { if (!hasDriveToken()) setDriveReady(false); }, 30_000);
    return () => window.clearInterval(id);
  }, [driveReady]);

  const markConnected = () => {
    setDriveReady(true);
    setDriveWasConnected(true);
    writePref(connectedKey, '1');
    setDriveError('');
  };

  // Must be called straight from a click (it may open Google's window).
  const connectDrive = () => {
    setDriveBusy(true);
    setDriveError('');
    return ensureDriveToken()
      .then(() => { markConnected(); return true; })
      .catch(err => { setDriveError(err instanceof Error ? err.message : String(err)); return false; })
      .finally(() => setDriveBusy(false));
  };

  const unlinkDrive = async () => {
    const ok = await dialog.confirm({
      title: 'Scollegare Google Drive?',
      message: 'I file già caricati restano nel tuo Drive e nell\'archivio. Per aprirli o caricarne altri dovrai ricollegarlo.',
      confirmLabel: 'Scollega',
    });
    if (!ok) return;
    disconnectDrive();
    writePref(connectedKey, null);
    setDriveWasConnected(false);
    setDriveReady(false);
  };

  // Reading a Drive file needs Drive connected on this device.
  const analyze = (ids: string[]) => {
    const needsDrive = ids.some(id => archive.find(a => a.id === id)?.file?.drive);
    if (needsDrive && !hasDriveToken()) {
      connectDrive().then(ok => { if (ok) onAnalyze(ids); });
      return;
    }
    onAnalyze(ids);
  };

  const textColor = darkMode ? 'text-white' : 'text-gray-800';
  const subTextColor = darkMode ? 'text-white/60' : 'text-gray-500';
  const cardClass = darkMode ? 'glass-card' : 'glass-card-light';
  const inputClass = darkMode ? 'input-glass' : 'input-light';

  const subjects = useMemo(() => [...new Set([...subjectNames, ...archive.map(a => a.subject)])], [archive, subjectNames]);
  const topics = useMemo(
    () => [...new Set(archive.filter(a => a.subject.toLowerCase() === subject.trim().toLowerCase()).map(a => a.topic))].sort(),
    [archive, subject],
  );

  const waitingItems = archive.filter(a => a.file && (a.file.textStatus === 'pending' || a.file.textStatus === 'error') && !analyzing.includes(a.id));
  const needsKey = !canTranscribe() && archive.some(a => a.file?.textStatus === 'pending' && a.file.textError);

  const addFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list);
    const tooBig = incoming.filter(f => f.size > maxSize);
    setFormError(tooBig.length
      ? `Troppo grandi (massimo ${useDrive ? '2 GB' : '50 MB'}): ${tooBig.map(f => f.name).join(', ')}${useDrive ? '' : '. Con Google Drive puoi caricare file più grandi.'}`
      : '');
    setFiles(prev => [...prev, ...incoming.filter(f => f.size <= maxSize)].sort(byName));
  };

  const resetForm = () => {
    setName(''); setLink(''); setFiles([]); setFormError(''); setShowForm(false);
  };

  const expand = (subj: string, top: string) => {
    setExpandedSubjects(prev => new Set(prev).add(subj));
    setExpandedTopics(prev => new Set(prev).add(`${subj}::${top}`));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const subj = subject.trim();
    const top = topic.trim();
    if (!subj || !top) return;
    // Asked right away (still inside the click) so Google's window isn't blocked.
    const driveToken = useDrive && files.length > 0 ? ensureDriveToken() : null;

    if (files.length === 0) {
      if (!name.trim()) {
        setFormError('Scrivi un nome oppure scegli dei file da caricare.');
        return;
      }
      onUpdate(prev => [...prev, { id: createId(), subject: subj, topic: top, name: name.trim(), link: link.trim() || undefined }]);
      expand(subj, top);
      resetForm();
      return;
    }

    setFormError('');
    if (driveToken) {
      try {
        await driveToken;
        markConnected();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : String(err));
        return;
      }
    }
    setUploading({ done: 0, total: files.length });
    const newIds: string[] = [];
    const failed: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        let path: string;
        let drive: { id: string; webViewLink?: string } | undefined;
        if (useDrive) {
          drive = await uploadToDrive(file, subj, top);
          path = `drive:${drive.id}`;
        } else {
          path = await uploadArchiveFile(userId, file);
        }
        const itemName = name.trim() ? (files.length > 1 ? `${name.trim()} (${i + 1})` : name.trim()) : baseName(file.name);
        const item: ArchiveItem = {
          id: createId(),
          subject: subj,
          topic: top,
          name: itemName,
          link: files.length === 1 ? link.trim() || undefined : undefined,
          baseTitle: readKind({ mimeType: file.type, originalName: file.name }) === 'image' ? (name.trim() || top) : undefined,
          file: { path, drive, mimeType: file.type || 'application/octet-stream', size: file.size, originalName: file.name, textStatus: 'pending' },
        };
        onUpdate(prev => [...prev, item]);
        newIds.push(item.id);
        track('file_upload', 'archivio');
      } catch (err) {
        console.error('Upload error:', err);
        failed.push(`${file.name}: ${useDrive ? (err instanceof Error ? err.message : String(err)) : storageErrorMessage(err)}`);
      }
      setUploading({ done: i + 1, total: files.length });
    }
    setUploading(null);
    expand(subj, top);
    if (newIds.length > 0) onAnalyze(newIds);
    if (failed.length > 0) {
      setFormError(`Non caricati:\n${failed.join('\n')}`);
      setFiles(prev => prev.filter(f => failed.some(msg => msg.startsWith(`${f.name}:`))));
    } else {
      resetForm();
    }
  };

  const openItem = async (item: ArchiveItem) => {
    if (!item.file) return;
    if (item.file.drive) {
      window.open(driveViewUrl(item.file.drive), '_blank', 'noopener');
      return;
    }
    // Open the tab right away (browsers block pop-ups opened after an await).
    const tab = window.open('', '_blank');
    try {
      const url = await archiveFileUrl(item.file.path);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      tab?.close();
      dialog.alert({ title: 'Impossibile aprire il file', message: storageErrorMessage(err) });
    }
  };

  // Removes the items from the archive, their files from storage and Drive files to Drive's bin.
  const removeItems = async (items: ArchiveItem[]) => {
    const driveItems = items.filter(i => i.file?.drive);
    let leftOnDrive = 0;
    if (driveItems.length > 0) {
      try {
        await ensureDriveToken();
        markConnected();
        for (const i of driveItems) {
          try {
            await trashOnDrive(i.file!.drive!.id);
          } catch (err) {
            console.error('Drive delete error:', err);
            leftOnDrive++;
          }
        }
      } catch (err) {
        console.error('Drive delete error:', err);
        leftOnDrive = driveItems.length;
      }
    }
    const paths = items.flatMap(i => (i.file ? [...(i.file.drive ? [] : [i.file.path]), ...(i.file.textPath ? [i.file.textPath] : [])] : []));
    if (paths.length > 0) {
      try {
        await removeArchiveFiles(paths);
      } catch (err) {
        console.error('Delete error:', err);
      }
    }
    const ids = new Set(items.map(i => i.id));
    onUpdate(prev => prev.filter(a => !ids.has(a.id)));
    setSelected(prev => new Set([...prev].filter(id => !ids.has(id))));
    if (leftOnDrive > 0) {
      dialog.alert({
        title: leftOnDrive > 1 ? 'File tolti dall\'archivio' : 'File tolto dall\'archivio',
        message: `Non sono riuscito a raggiungere Google Drive: ${leftOnDrive > 1 ? `${leftOnDrive} file sono rimasti` : 'il file è rimasto'} nella cartella "Student Hub" del tuo Drive, puoi cancellarli da lì.`,
      });
    }
  };

  const deleteItem = async (item: ArchiveItem) => {
    if (item.file && !(await dialog.confirm({
      title: `Eliminare "${item.name}"?`,
      message: item.file.drive
        ? 'Il file verrà tolto dall\'archivio e spostato nel cestino del tuo Google Drive (recuperabile per 30 giorni).'
        : 'Il file verrà cancellato definitivamente da tutti i tuoi dispositivi.',
      confirmLabel: 'Elimina',
      danger: true,
    }))) return;
    await removeItems([item]);
  };

  const saveName = (id: string) => {
    const newName = editingName.trim();
    // A name chosen by hand is kept: no more automatic renaming for that file.
    if (newName) onUpdate(prev => prev.map(a => (a.id === id ? { ...a, name: newName, baseTitle: undefined } : a)));
    setEditingId(null);
  };

  const hierarchy = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = q ? archive.filter(a => a.subject.toLowerCase().includes(q) || a.topic.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)) : archive;
    const map: Record<string, Record<string, ArchiveItem[]>> = {};
    filtered.forEach(item => {
      if (!map[item.subject]) map[item.subject] = {};
      if (!map[item.subject][item.topic]) map[item.subject][item.topic] = [];
      map[item.subject][item.topic].push(item);
    });
    // Within a topic, files in name order with numbers in order ("pag. 9" before "pag. 10").
    Object.values(map).forEach(topics => Object.values(topics).forEach(list =>
      list.sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true, sensitivity: 'base' }))));
    return map;
  }, [archive, search]);

  // The files in the order they are shown, used by "select all" and by the numbering of "Rinomina".
  const shown = useMemo(() => Object.values(hierarchy).flatMap(topics => Object.values(topics).flat()), [hierarchy]);
  const selectedItems = useMemo(() => {
    const order = new Map(shown.map((item, i) => [item.id, i]));
    return archive.filter(a => selected.has(a.id))
      .sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
  }, [archive, selected, shown]);
  const readable = selectedItems.filter(a => a.file && a.file.textStatus !== 'unsupported' && !analyzing.includes(a.id));

  const toggleIds = (ids: string[]) => setSelected(prev => {
    const next = new Set(prev);
    const all = ids.every(id => next.has(id));
    ids.forEach(id => (all ? next.delete(id) : next.add(id)));
    return next;
  });
  const stopSelecting = () => { setSelecting(false); setSelected(new Set()); setMoving(null); };
  const allShownSelected = shown.length > 0 && shown.every(a => selected.has(a.id));

  useEffect(() => {
    if (!selecting) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !moving) stopSelecting(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [selecting, moving]);

  const startMove = () => {
    const subjects = new Set(selectedItems.map(a => a.subject));
    const topics = new Set(selectedItems.map(a => a.topic));
    setMoving({
      subject: subjects.size === 1 ? [...subjects][0] : '',
      topic: subjects.size === 1 && topics.size === 1 ? [...topics][0] : '',
    });
  };
  const moveTopics = useMemo(
    () => (moving ? [...new Set(archive.filter(a => a.subject.toLowerCase() === moving.subject.trim().toLowerCase()).map(a => a.topic))].sort() : []),
    [archive, moving],
  );
  const confirmMove = () => {
    if (!moving) return;
    const typedSubject = moving.subject.trim();
    const typedTopic = moving.topic.trim();
    if (!typedSubject || !typedTopic) return;
    // Reuse the existing spelling ("storia" goes into "Storia").
    const subj = subjects.find(x => x.toLowerCase() === typedSubject.toLowerCase()) || typedSubject;
    const top = archive.find(a => a.subject === subj && a.topic.toLowerCase() === typedTopic.toLowerCase())?.topic || typedTopic;
    const ids = new Set(selectedItems.map(a => a.id));
    onUpdate(prev => prev.map(a => (ids.has(a.id) ? { ...a, subject: subj, topic: top } : a)));
    expand(subj, top);
    setMoving(null);
    setSelected(new Set());
  };

  const renameSelected = async () => {
    const value = await dialog.prompt({
      title: selectedItems.length > 1 ? `Rinomina ${selectedItems.length} file` : 'Rinomina',
      message: selectedItems.length > 1 ? 'Saranno numerati nell\'ordine in cui li vedi: "Nome (1)", "Nome (2)"…' : undefined,
      defaultValue: selectedItems.length === 1 ? selectedItems[0].name : '',
      placeholder: 'Es. Capitolo 3',
      confirmLabel: 'Rinomina',
    });
    const base = value?.trim();
    if (!base) return;
    const names = new Map(selectedItems.map((a, i) => [a.id, selectedItems.length > 1 ? `${base} (${i + 1})` : base]));
    onUpdate(prev => prev.map(a => (names.has(a.id) ? { ...a, name: names.get(a.id)!, baseTitle: undefined } : a)));
  };

  const deleteSelected = async () => {
    const items = selectedItems;
    if (!items.length) return;
    const onDrive = items.filter(a => a.file?.drive).length;
    const ok = await dialog.confirm({
      title: items.length > 1 ? `Eliminare ${items.length} elementi?` : `Eliminare "${items[0].name}"?`,
      message: [
        'Verranno cancellati definitivamente da tutti i tuoi dispositivi.',
        onDrive ? `${onDrive > 1 ? `I ${onDrive} file` : 'Il file'} di Google Drive ${onDrive > 1 ? 'finiranno' : 'finirà'} nel cestino del tuo Drive (recuperabili per 30 giorni).` : '',
      ].filter(Boolean).join(' '),
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      await removeItems(items);
    } finally {
      setBulkBusy(false);
    }
  };

  // A tick box that also shows "some selected" (a dash) for topics and subjects.
  const tickBox = (ids: string[], label: string) => {
    const count = ids.filter(id => selected.has(id)).length;
    const state = count === 0 ? 'none' : count === ids.length ? 'all' : 'some';
    return (
      <button type="button" role="checkbox" aria-checked={state === 'all' ? true : state === 'some' ? 'mixed' : false} aria-label={label}
        onClick={e => { e.stopPropagation(); toggleIds(ids); }}
        className={`w-5 h-5 flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-all duration-150 ${
          state === 'none'
            ? (darkMode ? 'border-white/30 hover:border-white/60' : 'border-black/25 hover:border-black/50')
            : 'border-transparent bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow shadow-indigo-500/30'
        }`}>
        {state === 'all' && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
        {state === 'some' && <Minus className="w-3.5 h-3.5" strokeWidth={3} />}
      </button>
    );
  };

  const itemIcon = (item: ArchiveItem) => {
    if (!item.file) return item.link ? <LinkIcon className="w-4 h-4 text-sky-400 flex-shrink-0" /> : <FileText className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
    const kind = readKind(item.file);
    if (kind === 'image') return <ImageIcon className="w-4 h-4 text-pink-400 flex-shrink-0" />;
    if (kind === 'pdf') return <FileText className="w-4 h-4 text-red-400 flex-shrink-0" />;
    return <FileIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
  };

  const aiStatus = (item: ArchiveItem) => {
    if (!item.file) return null;
    const base = 'text-xs px-2 py-0.5 rounded-full whitespace-nowrap inline-flex items-center gap-1';
    if (analyzing.includes(item.id)) {
      return <span className={`${base} bg-blue-500/20 text-blue-400`}><Loader2 className="w-3 h-3 animate-spin" /> L'AI sta leggendo…</span>;
    }
    switch (item.file.textStatus) {
      case 'done':
        return <span className={`${base} bg-emerald-500/20 text-emerald-400`}><Sparkles className="w-3 h-3" /> Letto dall'AI</span>;
      case 'unsupported':
        return <span className={`${base} ${darkMode ? 'bg-white/10 text-white/50' : 'bg-black/5 text-gray-500'}`} title="L'AI legge PDF, foto (JPG, PNG, WEBP, HEIC) e file di testo">Non leggibile dall'AI</span>;
      case 'error':
        return (
          <button onClick={() => analyze([item.id])} title={item.file.textError} className={`${base} bg-red-500/20 text-red-400`}>
            <RotateCw className="w-3 h-3" /> Errore, riprova
          </button>
        );
      default:
        return (
          <button onClick={() => analyze([item.id])} title={item.file.textError} className={`${base} bg-amber-500/20 text-amber-400`}>
            <Sparkles className="w-3 h-3" /> Da leggere
          </button>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className={`text-2xl font-bold ${textColor}`}>📁 Archivio</h2>
        <div className="flex items-center gap-2">
          {archive.length > 0 && (
            <button onClick={() => (selecting ? stopSelecting() : setSelecting(true))} aria-pressed={selecting}
              className={`px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors ${
                selecting
                  ? (darkMode ? 'bg-white/20 text-white ring-1 ring-white/30' : 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200')
                  : (darkMode ? 'bg-white/10 hover:bg-white/15 text-white' : 'bg-black/5 hover:bg-black/10 text-gray-800')
              }`}>
              {selecting ? <><X className="w-4 h-4" /> Fine</> : <><CheckSquare className="w-4 h-4" /> Seleziona</>}
            </button>
          )}
          <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Nuovo
          </button>
        </div>
      </div>

      <div className={`${cardClass} p-4 flex items-start gap-3`}>
        <Sparkles className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className={`text-sm ${subTextColor}`}>
          Carica qui PDF, foto delle pagine del libro e dei tuoi appunti. L'AI li legge e nella{' '}
          <button onClick={onOpenGuide} className="text-blue-400 underline">Guida Studio AI</button>{' '}
          puoi chiederle riassunti, spiegazioni e di interrogarti su quello che hai caricato.
        </p>
      </div>

      {(
        <div className={`${cardClass} p-4 space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className={`text-sm font-semibold ${textColor}`}>Dove salvare i file</h3>
            <div className={`flex rounded-xl p-1 ${darkMode ? 'bg-white/10' : 'bg-black/5'}`} role="radiogroup" aria-label="Dove salvare i file">
              {([
                { id: 'app' as const, label: 'Student Hub', icon: <HardDrive className="w-4 h-4" /> },
                { id: 'drive' as const, label: 'Google Drive', icon: <Cloud className="w-4 h-4" /> },
              ]).map(o => (
                <button key={o.id} role="radio" aria-checked={storage === o.id} onClick={() => setStorage(o.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-all ${storage === o.id ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow' : subTextColor}`}>
                  {o.icon}{o.label}
                </button>
              ))}
            </div>
          </div>

          {storage === 'drive' && !driveConfigured ? (
            <p className="text-xs text-amber-400 animate-scale-in">
              Google Drive non è ancora attivo: l'amministratore deve completare la configurazione con Google.
              Intanto i file vengono salvati in Student Hub.
            </p>
          ) : !useDrive ? (
            <p className={`text-xs ${subTextColor}`}>I file vanno nello spazio dell'app, massimo 50 MB ciascuno. Per avere più spazio scegli Google Drive.</p>
          ) : driveReady ? (
            <div className="animate-scale-in space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={`text-sm flex items-center gap-2 ${textColor}`}>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Collegato{driveDetails?.email ? <> come <b className="font-medium">{driveDetails.email}</b></> : ''}
                </p>
                <div className="flex items-center gap-3 text-xs">
                  <a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300 inline-flex items-center gap-1">
                    Apri Drive <ExternalLink className="w-3 h-3" />
                  </a>
                  <button onClick={unlinkDrive} className={`${subTextColor} hover:text-red-400`}>Scollega</button>
                </div>
              </div>
              {driveDetails?.limit ? (
                <div>
                  <div className={`h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-white/10' : 'bg-black/10'}`}>
                    <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-500 transition-all duration-700"
                      style={{ width: `${Math.min(100, (driveDetails.used / driveDetails.limit) * 100)}%` }} />
                  </div>
                  <p className={`text-xs mt-1 ${subTextColor}`}>
                    Usati {formatGB(driveDetails.used)} di {formatGB(driveDetails.limit)} · i file vanno nella cartella “Student Hub”, divisi per materia e argomento
                  </p>
                </div>
              ) : (
                <p className={`text-xs ${subTextColor}`}>I file vanno nella cartella “Student Hub” del tuo Drive, divisi per materia e argomento.</p>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 animate-scale-in">
              <p className={`text-xs flex items-start gap-1.5 max-w-md ${subTextColor}`}>
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                {driveWasConnected
                  ? 'Il collegamento a Google scade dopo circa un\'ora: ricollegalo con un clic.'
                  : 'Usi lo spazio del tuo Google Drive (15 GB gratis). Student Hub vede solo i file che carica lui, non il resto del tuo Drive.'}
              </p>
              <button onClick={connectDrive} disabled={driveBusy} className="btn-primary text-sm flex items-center gap-2 disabled:opacity-60">
                {driveBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                {driveWasConnected ? 'Ricollega Google Drive' : 'Collega Google Drive'}
              </button>
            </div>
          )}
          {driveError && <p className="text-xs text-red-400">{driveError}</p>}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleAdd} className={`${cardClass} p-6 space-y-4`}>
          <h3 className={`font-semibold ${textColor}`}>Aggiungi all'archivio</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm mb-1 ${subTextColor}`}>Materia</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} list="archivio-subjects" className={`${inputClass} w-full`} placeholder="Es. Storia" required />
              <datalist id="archivio-subjects">{subjects.map(s => <option key={s} value={s} />)}</datalist>
            </div>
            <div>
              <label className={`block text-sm mb-1 ${subTextColor}`}>Argomento</label>
              <input value={topic} onChange={e => setTopic(e.target.value)} list="archivio-topics" className={`${inputClass} w-full`} placeholder="Es. Rivoluzione francese" required />
              <datalist id="archivio-topics">{topics.map(t => <option key={t} value={t} />)}</datalist>
            </div>
            <div>
              <label className={`block text-sm mb-1 ${subTextColor}`}>Nome {files.length > 0 && '(facoltativo)'}</label>
              <input value={name} onChange={e => setName(e.target.value)} className={`${inputClass} w-full`} placeholder={files.length > 1 ? 'Es. Capitolo 3 → "Capitolo 3 (1)", "(2)"…' : 'Es. Capitolo 3 del libro'} />
            </div>
            <div>
              <label className={`block text-sm mb-1 ${subTextColor}`}>Link (facoltativo)</label>
              <input value={link} onChange={e => setLink(e.target.value)} className={`${inputClass} w-full`} placeholder="Es. www.sito.it" />
            </div>
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragging ? 'border-blue-400 bg-blue-500/10' : darkMode ? 'border-white/20 hover:bg-white/5' : 'border-black/15 hover:bg-black/5'
            }`}
          >
            <Upload className={`w-8 h-8 mx-auto mb-2 ${subTextColor}`} />
            <p className={`text-sm font-medium ${textColor}`}>Clicca per scegliere i file o trascinali qui</p>
            <p className={`text-xs ${subTextColor} mt-1`}>PDF, foto (anche più pagine insieme), file di testo e altri documenti · max {useDrive ? '2 GB' : '50 MB'} per file</p>
            <p className={`text-xs mt-2 inline-flex items-center gap-1 ${useDrive ? 'text-sky-400' : subTextColor}`}>
              {useDrive ? <><Cloud className="w-3.5 h-3.5" /> Salvati nel tuo Google Drive</> : <><HardDrive className="w-3.5 h-3.5" /> Salvati in Student Hub</>}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="application/pdf,image/*,.heic,.heif,.txt,.md,.csv,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
              className="hidden"
              onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
            />
          </div>

          {files.length > 0 && (
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg ${darkMode ? 'bg-white/5' : 'bg-black/5'}`}>
                  <span className={`flex-1 truncate ${textColor}`}>
                    {name.trim() ? (files.length > 1 ? `${name.trim()} (${i + 1})` : name.trim()) : baseName(f.name)}
                  </span>
                  <span className={`text-xs ${subTextColor}`}>{formatSize(f.size)}</span>
                  {!uploading && (
                    <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-red-400" aria-label="Rimuovi">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {formError && <p className="text-red-400 text-sm whitespace-pre-line">{formError}</p>}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={!!uploading} className="btn-primary text-sm flex items-center gap-2 disabled:opacity-60">
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Caricamento {uploading.done}/{uploading.total}…</> : files.length > 0 ? `Carica ${files.length} file` : 'Aggiungi'}
            </button>
            {!uploading && (
              <button type="button" onClick={resetForm} className={`px-4 py-2 rounded-lg text-sm ${subTextColor}`}>Annulla</button>
            )}
          </div>
        </form>
      )}

      {(waitingItems.length > 0 || needsKey) && (
        <div className={`${cardClass} p-4 flex flex-wrap items-center justify-between gap-3`}>
          <p className={`text-sm ${subTextColor}`}>
            {needsKey
              ? <>Per far leggere <b>foto e PDF scansionati</b> all'AI serve una chiave AI. <button onClick={onOpenGuide} className="text-blue-400 underline">Configurala nella Guida Studio AI</button>, poi torna qui.</>
              : <>{waitingItems.length} file non ancora letti dall'AI.</>}
          </p>
          {waitingItems.length > 0 && (
            <button onClick={() => analyze(waitingItems.map(a => a.id))} className="btn-primary text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Fai leggere all'AI ({waitingItems.length})
            </button>
          )}
        </div>
      )}

      <div className={`${cardClass} p-4`}>
        <div className="relative">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${subTextColor}`} />
          <input value={search} onChange={e => setSearch(e.target.value)} className={`${inputClass} w-full pl-10`} placeholder="Cerca..." />
        </div>
        {selecting && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 animate-scale-in">
            <p className={`text-sm ${subTextColor}`}>Tocca i file da selezionare, oppure la casella di un argomento o di una materia per prenderli tutti.</p>
            <button onClick={() => (allShownSelected ? setSelected(new Set()) : setSelected(new Set(shown.map(a => a.id))))}
              className="text-sm font-medium text-indigo-400 hover:text-indigo-300">
              {allShownSelected ? 'Deseleziona tutto' : search ? `Seleziona i risultati (${shown.length})` : 'Seleziona tutto'}
            </button>
          </div>
        )}
      </div>

      <div className={`space-y-3 ${selecting ? 'pb-24' : ''}`}>
        {Object.keys(hierarchy).length === 0 && <div className={`${cardClass} p-8 text-center`}><p className={subTextColor}>Archivio vuoto</p></div>}
        {Object.entries(hierarchy).map(([subjectName, subjectTopics]) => (
          <div key={subjectName} className={`${cardClass} overflow-hidden`}>
            <div className={`flex items-center ${selecting ? 'pl-4' : ''}`}>
            {selecting && tickBox(Object.values(subjectTopics).flat().map(a => a.id), `Seleziona tutto ${subjectName}`)}
            <button onClick={() => { const next = new Set(expandedSubjects); if (next.has(subjectName)) next.delete(subjectName); else next.add(subjectName); setExpandedSubjects(next); }}
              className={`flex-1 min-w-0 flex items-center gap-3 p-4 ${darkMode ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
              {expandedSubjects.has(subjectName) ? <ChevronDown className="w-5 h-5 text-indigo-400" /> : <ChevronRight className="w-5 h-5 text-indigo-400" />}
              <FolderOpen className="w-5 h-5 text-amber-400" />
              <span className={`font-semibold ${textColor}`}>{subjectName}</span>
              <span className={`text-xs ${subTextColor}`}>{Object.values(subjectTopics).reduce((n, items) => n + items.length, 0)}</span>
            </button>
            </div>
            {expandedSubjects.has(subjectName) && (
              <div className={`border-t ${darkMode ? 'border-white/5' : 'border-black/5'}`}>
                {Object.entries(subjectTopics).map(([topicName, items]) => {
                  const topicKey = `${subjectName}::${topicName}`;
                  return (
                    <div key={topicKey}>
                      <div className={`flex items-center ${selecting ? 'pl-8' : ''}`}>
                      {selecting && tickBox(items.map(a => a.id), `Seleziona tutto ${topicName}`)}
                      <button onClick={() => { const next = new Set(expandedTopics); if (next.has(topicKey)) next.delete(topicKey); else next.add(topicKey); setExpandedTopics(next); }}
                        className={`flex-1 min-w-0 flex items-center gap-3 ${selecting ? 'px-3' : 'px-8'} py-3 ${darkMode ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
                        {expandedTopics.has(topicKey) ? <ChevronDown className="w-4 h-4 text-purple-400" /> : <ChevronRight className="w-4 h-4 text-purple-400" />}
                        <span className={`text-sm font-medium ${textColor}`}>{topicName}</span>
                        <span className={`text-xs ${subTextColor}`}>{items.length}</span>
                      </button>
                      </div>
                      {expandedTopics.has(topicKey) && (
                        <div className="px-4 sm:px-12 pb-2 space-y-1">
                          {items.map(item => (
                            <div key={item.id}
                              onClick={selecting ? () => toggleIds([item.id]) : undefined}
                              className={`flex flex-wrap items-center gap-x-3 gap-y-1 p-2 rounded-lg transition-colors ${selecting ? 'cursor-pointer select-none' : ''} ${
                                selecting && selected.has(item.id)
                                  ? (darkMode ? 'bg-indigo-500/20 ring-1 ring-indigo-400/40' : 'bg-indigo-50 ring-1 ring-indigo-200')
                                  : (darkMode ? 'hover:bg-white/5' : 'hover:bg-black/5')
                              }`}>
                              {selecting && tickBox([item.id], `Seleziona ${item.name}`)}
                              {itemIcon(item)}
                              {selecting ? (
                                <span className={`text-sm ${textColor} flex-1 min-w-0 truncate`}>
                                  {item.name}
                                  {item.file && <span className={`ml-2 text-xs ${subTextColor}`}>{formatSize(item.file.size)}</span>}
                                  {item.file?.drive && <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 align-middle">Drive</span>}
                                </span>
                              ) : editingId === item.id ? (
                                <form onSubmit={e => { e.preventDefault(); saveName(item.id); }} className="flex-1 flex items-center gap-2 min-w-[12rem]">
                                  <input value={editingName} onChange={e => setEditingName(e.target.value)} className={`${inputClass} flex-1 py-1 text-sm`} autoFocus />
                                  <button type="submit" className="text-emerald-400" aria-label="Salva nome"><Check className="w-4 h-4" /></button>
                                  <button type="button" onClick={() => setEditingId(null)} className={subTextColor} aria-label="Annulla"><X className="w-4 h-4" /></button>
                                </form>
                              ) : item.file ? (
                                <button onClick={() => openItem(item)} className={`text-sm ${textColor} flex-1 text-left hover:underline min-w-0 truncate`} title={item.file.drive ? 'Apri in Google Drive' : 'Apri il file'}>
                                  {item.name}
                                  <span className={`ml-2 text-xs ${subTextColor}`}>{formatSize(item.file.size)}</span>
                                  {item.file.drive && <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 align-middle">Drive</span>}
                                </button>
                              ) : (
                                <span className={`text-sm ${textColor} flex-1 min-w-0 truncate`}>{item.name}</span>
                              )}
                              {selecting ? (item.file && <span className="pointer-events-none">{aiStatus(item)}</span>) : aiStatus(item)}
                              {!selecting && safeLink(item.link) && <a href={safeLink(item.link)!} target="_blank" rel="noopener noreferrer" className="text-indigo-400" aria-label="Apri link"><ExternalLink className="w-3.5 h-3.5" /></a>}
                              {!selecting && editingId !== item.id && (
                                <button onClick={() => { setEditingId(item.id); setEditingName(item.name); }} className={subTextColor} aria-label="Rinomina"><Pencil className="w-3.5 h-3.5" /></button>
                              )}
                              {!selecting && <button onClick={() => deleteItem(item)} className="text-red-400" aria-label="Elimina"><Trash2 className="w-3.5 h-3.5" /></button>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {selecting && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 pointer-events-none">
          <div role="toolbar" aria-label="Azioni sui file selezionati"
            className={`pointer-events-auto w-full max-w-2xl rounded-2xl border shadow-2xl p-2 flex flex-wrap items-center gap-1 animate-scale-in ${
              darkMode ? 'bg-[#1b1640]/95 border-white/10 text-white' : 'bg-white/95 border-black/10 text-gray-800'
            }`}>
            <span className="px-3 text-sm font-semibold flex-1 min-w-[7rem]">
              {selectedItems.length === 0 ? 'Nessuno selezionato' : selectedItems.length === 1 ? '1 selezionato' : `${selectedItems.length} selezionati`}
            </span>
            {([
              { label: 'Sposta', icon: <FolderInput className="w-4 h-4" />, onClick: startMove, disabled: !selectedItems.length },
              { label: 'Rinomina', icon: <Pencil className="w-4 h-4" />, onClick: renameSelected, disabled: !selectedItems.length },
              { label: readable.length ? `Leggi con AI (${readable.length})` : 'Leggi con AI', icon: <Sparkles className="w-4 h-4" />, onClick: () => { analyze(readable.map(a => a.id)); setSelected(new Set()); }, disabled: !readable.length },
            ]).map(a => (
              <button key={a.label} onClick={a.onClick} disabled={a.disabled || bulkBusy}
                className={`px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40 ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
                {a.icon}<span className="hidden sm:inline">{a.label}</span>
                <span className="sm:hidden">{a.label.split(' ')[0]}</span>
              </button>
            ))}
            <button onClick={deleteSelected} disabled={!selectedItems.length || bulkBusy}
              className="px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 text-red-400 hover:bg-red-500/10 disabled:opacity-40">
              {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Elimina
            </button>
            <button onClick={stopSelecting} aria-label="Esci dalla selezione" title="Esci dalla selezione"
              className={`p-2 rounded-xl ${darkMode ? 'text-white/60 hover:bg-white/10' : 'text-gray-500 hover:bg-black/5'}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {moving && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setMoving(null)}>
          <form role="dialog" aria-modal="true" aria-label="Sposta"
            onClick={e => e.stopPropagation()}
            onSubmit={e => { e.preventDefault(); confirmMove(); }}
            onKeyDown={e => { if (e.key === 'Escape') setMoving(null); }}
            className={`w-full max-w-sm p-6 space-y-4 animate-scale-in ${darkMode ? 'glass-card bg-gray-900/90' : 'glass-card-light'}`}>
            <div>
              <h2 className={`text-lg font-semibold ${textColor}`}>Sposta {selectedItems.length > 1 ? `${selectedItems.length} elementi` : `"${selectedItems[0]?.name}"`}</h2>
              <p className={`mt-1 text-sm ${subTextColor}`}>Scegli una materia e un argomento esistenti, oppure scrivine di nuovi.</p>
            </div>
            <div>
              <label className={`block text-sm mb-1 ${subTextColor}`}>Materia</label>
              <input value={moving.subject} onChange={e => setMoving({ ...moving, subject: e.target.value })} list="archivio-move-subjects" className={`${inputClass} w-full`} placeholder="Es. Storia" autoFocus required />
              <datalist id="archivio-move-subjects">{subjects.map(x => <option key={x} value={x} />)}</datalist>
            </div>
            <div>
              <label className={`block text-sm mb-1 ${subTextColor}`}>Argomento</label>
              <input value={moving.topic} onChange={e => setMoving({ ...moving, topic: e.target.value })} list="archivio-move-topics" className={`${inputClass} w-full`} placeholder="Es. Rivoluzione francese" required />
              <datalist id="archivio-move-topics">{moveTopics.map(x => <option key={x} value={x} />)}</datalist>
            </div>
            {moveTopics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {moveTopics.slice(0, 8).map(x => (
                  <button key={x} type="button" onClick={() => setMoving({ ...moving, topic: x })}
                    className={`text-xs px-2.5 py-1 rounded-full transition-colors ${moving.topic === x ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white' : (darkMode ? 'bg-white/10 text-white/80 hover:bg-white/15' : 'bg-black/5 text-gray-700 hover:bg-black/10')}`}>
                    {x}
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setMoving(null)} className={`px-4 py-2 rounded-xl text-sm font-medium ${darkMode ? 'text-white/80 bg-white/10 hover:bg-white/15' : 'text-gray-700 bg-black/5 hover:bg-black/10'}`}>Annulla</button>
              <button type="submit" disabled={!moving.subject.trim() || !moving.topic.trim()} className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
                <FolderInput className="w-4 h-4" /> Sposta qui
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
