import { useMemo, useState } from 'react';
import { Upload, Search, Loader2, Sparkles, ExternalLink, Pencil, Lock, Send } from 'lucide-react';
import { BizRole, Org } from '../../lib/business';
import { BizSnapshot, BizDocument, DocKind, DOC_LABEL, uploadDocument, updateDocument, deleteDocument, documentUrl, listDocuments } from '../../lib/businessData';
import { readDocumentText } from '../../lib/businessAI';
import { askTutor, isReady } from '../../lib/ai';
import { useDialog } from '../Dialog';
import { Sheet, TextField, SelectField, Label, ErrorNote, PageTitle, Empty, Chip, Switch, shortDate } from './ui';
import type { CoachPrefill } from './Coach';

const QA_SYSTEM = `Rispondi in italiano usando SOLO i documenti forniti. Ogni affermazione va seguita dalla fonte tra parentesi quadre, con il nome del documento, es. [Contratto RRD.pdf]. Se la risposta non è nei documenti, dillo chiaramente. Breve e preciso: date, importi e obblighi esatti.`;

export default function Documenti({ org, myRole, snap, onChanged, onAskCoach }: {
  org: Org; myRole: BizRole; snap: BizSnapshot | null; onChanged: () => void; onAskCoach: (p: CoachPrefill) => void;
}) {
  const dialog = useDialog();
  const canUpload = myRole !== 'esterno';
  const [q, setQ] = useState('');
  const [uploading, setUploading] = useState('');
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<{ q: string; text: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState<BizDocument | null>(null);
  const docs = snap?.documents || [];
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? docs.filter(d => `${d.name} ${d.summary || ''} ${DOC_LABEL[d.kind]}`.toLowerCase().includes(n)) : docs;
  }, [docs, q]);
  const name = (id: string | null, list: { id: string; name: string }[]) => list.find(x => x.id === id)?.name;

  const upload = async (files: FileList) => {
    setError('');
    for (const f of Array.from(files)) {
      try {
        setUploading(`Leggo ${f.name}…`);
        let text: string | null = null;
        try { text = await readDocumentText(f, s => setUploading(`Servizio occupato, riprovo tra ${s} s…`)); } catch { text = null; }
        const head = (text || f.name).slice(0, 3000).toLowerCase();
        const kind: DocKind = /contratt|accordo|sponsor/.test(head) ? 'contratto' : /fattura/.test(head) ? 'fattura' : /preventiv/.test(head) ? 'preventivo' : /offert|brief/.test(head) ? 'offerta' : /procedur/.test(head) ? 'procedura' : 'altro';
        const cp = snap?.clients.find(c => head.includes(c.name.toLowerCase()));
        setUploading(`Salvo ${f.name}…`);
        await uploadDocument(org.id, f, { name: f.name, kind, text_content: text, counterparty_id: cp?.id || null, summary: text ? text.replace(/\s+/g, ' ').slice(0, 220) : null });
      } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    }
    setUploading('');
    onChanged();
  };

  const ask = async () => {
    const question_ = question.trim();
    if (!question_ || asking) return;
    if (!isReady()) { setError('Serve la chiave AI gratuita: la configuri nel Coach o nella Guida Studio AI.'); return; }
    setAsking(true); setError('');
    try {
      const full = await listDocuments(org.id, true);
      const reply = await askTutor(QA_SYSTEM, async budget => {
        let out = ''; const per = Math.max(2000, Math.floor(budget / Math.max(1, full.length)));
        for (const d of full) out += `\n\n=== ${d.name} (${DOC_LABEL[d.kind]}${d.counterparty_id ? `, ${name(d.counterparty_id, snap?.clients || [])}` : ''}) ===\n${(d.text_content || d.summary || '(nessun testo)').slice(0, per)}`;
        return out.slice(0, budget);
      }, [{ role: 'user', text: question_ }]);
      setAnswer({ q: question_, text: reply });
      setQuestion('');
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setAsking(false); }
  };

  const toCoach = async (d: BizDocument) => {
    const full = (await listDocuments(org.id, true)).find(x => x.id === d.id);
    onAskCoach({ text: `Leggi il documento “${d.name}” e prepara tutto quello che serve (cliente, contratto, obblighi e diritti, scadenze, compiti, appuntamenti, fatture).\n\nTESTO DEL DOCUMENTO:\n${(full?.text_content || d.summary || '').slice(0, 50000)}`, send: true });
  };
  const open = async (d: BizDocument) => {
    if (!d.storage_path) { dialog.alert({ title: d.name, message: d.summary || 'Documento senza file allegato.' }); return; }
    try { window.open(await documentUrl(d.storage_path), '_blank', 'noopener'); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  return (
    <div className="space-y-6">
      <PageTitle title="Documenti." lead="L’archivio dell’azienda: lo cerchi, lo interroghi, e ogni risposta dice da quale documento viene."
        action={canUpload && <label className="btn-primary h-11 px-4 inline-flex items-center gap-1.5 flex-shrink-0 cursor-pointer"><Upload className="w-4 h-4" /> Carica
          <input type="file" multiple className="hidden" accept=".pdf,.txt,.eml,image/*" onChange={e => { const f = e.target.files; if (f?.length) upload(f); e.target.value = ''; }} /></label>} />
      {uploading && <p className="text-sm flex items-center gap-2" style={{ color: 'var(--text-muted)' }}><Loader2 className="w-4 h-4 animate-spin" /> {uploading}</p>}
      <ErrorNote text={error} />

      <section className="glass-card p-5 space-y-3">
        <div className="flex items-center gap-2.5"><Sparkles className="w-[18px] h-[18px]" style={{ color: 'var(--brand-ring)' }} /><h3 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Chiedi all’archivio</h3></div>
        <form onSubmit={e => { e.preventDefault(); ask(); }} className="flex gap-2">
          <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Es. Quali contratti scadono nei prossimi 90 giorni?" aria-label="Domanda all'archivio" className="input-glass flex-1 min-w-0 h-11 text-[15px]" />
          <button type="submit" disabled={!question.trim() || asking} aria-label="Chiedi" className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40" style={{ background: 'var(--brand-fill)', color: 'var(--on-brand)' }}>{asking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</button>
        </form>
        {answer && (
          <div className="rounded-2xl p-4 space-y-1" style={{ background: 'var(--glass-well)' }}>
            <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>{answer.q}</p>
            <p className="text-sm whitespace-pre-line leading-relaxed" style={{ color: 'var(--text)' }}>{answer.text}</p>
          </div>
        )}
      </section>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-subtle)' }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca per nome o contenuto" aria-label="Cerca documenti" className="input-glass w-full h-11 text-[15px]" style={{ paddingLeft: 40 }} />
      </div>
      {!snap ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-subtle)' }} /></div>
        : shown.length === 0 ? <Empty>{docs.length ? 'Nessun documento trovato.' : 'Nessun documento. Carica contratti, offerte, preventivi: li leggo io e li collego ai clienti.'}</Empty> : (
          <ul className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 gap-3">
            {shown.map(d => (
              <li key={d.id} className="glass-card p-4 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <button onClick={() => open(d)} className="flex-1 min-w-0 text-left">
                    <span className="block text-[15px] font-semibold truncate" style={{ color: 'var(--text)' }}>{d.name}</span>
                    <span className="block text-xs" style={{ color: 'var(--text-subtle)' }}>{[DOC_LABEL[d.kind], name(d.counterparty_id, snap.clients), name(d.project_id, snap.projects), shortDate(d.created_at.slice(0, 10))].filter(Boolean).join(' · ')}</span>
                  </button>
                  {d.confidential && <Lock className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: 'var(--text-subtle)' }} aria-label="Riservato" />}
                  <Chip>{DOC_LABEL[d.kind]}</Chip>
                </div>
                {d.summary && <p className="text-sm line-clamp-2" style={{ color: 'var(--text-muted)' }}>{d.summary}</p>}
                <div className="flex gap-1 mt-auto -ml-2">
                  <button onClick={() => toCoach(d)} className="h-9 px-3 rounded-full text-sm font-medium inline-flex items-center gap-1.5 hover:bg-white/5" style={{ color: 'var(--brand-ring)' }}><Sparkles className="w-4 h-4" /> Fai lavorare il Coach</button>
                  {d.storage_path && <button onClick={() => open(d)} aria-label="Apri il file" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--text-muted)' }}><ExternalLink className="w-4 h-4" /></button>}
                  <button onClick={() => setEditing(d)} aria-label="Modifica" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5" style={{ color: 'var(--text-muted)' }}><Pencil className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}

      {editing && snap && <DocSheet doc={editing} snap={snap} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }}
        onDelete={async () => { if (await dialog.confirm({ title: `Eliminare ${editing.name}?`, confirmLabel: 'Elimina', danger: true })) { await deleteDocument(editing).catch(err => setError(err.message)); setEditing(null); onChanged(); } }} />}
    </div>
  );
}

function DocSheet({ doc, snap, onClose, onSaved, onDelete }: { doc: BizDocument; snap: BizSnapshot; onClose: () => void; onSaved: () => void; onDelete: () => void }) {
  const [nameV, setName] = useState(doc.name);
  const [kind, setKind] = useState<DocKind>(doc.kind);
  const [cp, setCp] = useState(doc.counterparty_id || '');
  const [prj, setPrj] = useState(doc.project_id || '');
  const [conf, setConf] = useState(doc.confidential);
  const [error, setError] = useState('');
  const save = async () => {
    try { await updateDocument(doc.id, { name: nameV.trim() || doc.name, kind, counterparty_id: cp || null, project_id: prj || null, confidential: conf }); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  return (
    <Sheet title="Documento" onClose={onClose} footer={<><button onClick={onDelete} className="h-11 px-3 mr-auto rounded-full text-sm font-medium" style={{ color: 'var(--danger)' }}>Elimina</button>
      <button onClick={onClose} className="btn-secondary h-11 px-5">Annulla</button><button onClick={save} className="btn-primary h-11 px-5">Salva</button></>}>
      <TextField id="dc-name" label="Nome" value={nameV} onChange={setName} />
      <SelectField id="dc-kind" label="Tipo" value={kind} onChange={setKind} options={(Object.keys(DOC_LABEL) as DocKind[]).map(k => ({ value: k, label: DOC_LABEL[k] }))} />
      <div><Label htmlFor="dc-cp">Cliente</Label><select id="dc-cp" value={cp} onChange={e => setCp(e.target.value)} className="input-glass w-full h-12 text-[15px]"><option value="">Nessuno</option>{snap.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div><Label htmlFor="dc-prj">Progetto</Label><select id="dc-prj" value={prj} onChange={e => setPrj(e.target.value)} className="input-glass w-full h-12 text-[15px]"><option value="">Nessuno</option>{snap.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="flex items-center justify-between gap-3 rounded-2xl px-4 h-12" style={{ background: 'var(--glass-well)' }}><span className="text-[15px]" style={{ color: 'var(--text)' }}>Riservato (solo titolare, admin, manager, finanza)</span><Switch on={conf} onChange={setConf} label="Riservato" /></div>
      <ErrorNote text={error} />
    </Sheet>
  );
}
