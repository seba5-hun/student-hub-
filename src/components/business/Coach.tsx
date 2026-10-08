import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Square, Paperclip, Loader2, Sparkles, X, FileText, Trash2 } from 'lucide-react';
import { askTutor, isReady, providerLabel, ChatTurn, StoppedError } from '../../lib/ai';
import AISettings from '../AISettings';
import ModelPicker from '../ModelPicker';
import { Org, Person } from '../../lib/business';
import { BizSnapshot, Proposal, createProposal, listProposals, uploadDocument } from '../../lib/businessData';
import { BIZ_COACH_SYSTEM, buildBizContext, parseCoachReply, readDocumentText } from '../../lib/businessAI';
import { parseFatturaPA, xmlFromBytes } from '../../lib/fatturaPA';
import { eur } from '../../lib/businessIntel';
import { PageTitle } from './ui';
import PlanCard from './PlanCard';

export interface CoachPrefill { text: string; file?: File; send?: boolean }
interface Msg { id: string; role: 'user' | 'assistant'; text: string; attachment?: string; proposalId?: string }
const STARTERS = [
  { label: 'Nuovo cliente', text: 'Nuovo cliente: ' },
  { label: 'Ho ricevuto un’email', text: 'Ho ricevuto questa email, fai tu:\n\n' },
  { label: 'Cosa devo fare oggi?', text: 'Cosa devo fare oggi? Dammi le 3 priorità con il perché.' },
  { label: 'Organizza la settimana', text: 'Organizza la prossima settimana del team: proponi le modifiche.' },
  { label: 'Problema più grande', text: 'Qual è il problema più grande dell’azienda adesso e cosa faresti?' },
];
const keyOf = (orgId: string) => `mynd_biz_coach_${orgId}`;
const newId = () => Math.random().toString(36).slice(2, 10);

export default function Coach({ org, me, snap, cash, prefill, onPrefillUsed, onChanged }: {
  org: Org; me: Person | null; snap: BizSnapshot; cash: number | null; prefill: CoachPrefill | null; onPrefillUsed: () => void; onChanged: () => void;
}) {
  const [ready, setReady] = useState(isReady);
  const [settings, setSettings] = useState(false);
  const [, setAiName] = useState(providerLabel);
  const [msgs, setMsgs] = useState<Msg[]>(() => { try { return JSON.parse(localStorage.getItem(keyOf(org.id)) || '[]'); } catch { return []; } });
  const [proposals, setProposals] = useState<Record<string, Proposal>>({});
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const today = new Date().toLocaleDateString('sv-SE');

  useEffect(() => { try { localStorage.setItem(keyOf(org.id), JSON.stringify(msgs.slice(-60))); } catch { /* full */ } }, [msgs, org.id]);
  const loadProposals = useCallback(() => {
    listProposals(org.id).then(list => setProposals(Object.fromEntries(list.map(p => [p.id, p])))).catch(() => {});
  }, [org.id]);
  useEffect(() => { loadProposals(); }, [loadProposals]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs.length, loading]);
  // Text (and maybe a file) sent from another section: written in the box, or sent right away.
  const pendingSend = useRef<CoachPrefill | null>(null);
  useEffect(() => {
    if (prefill == null) return;
    onPrefillUsed();
    if (prefill.send) { pendingSend.current = prefill; return; }
    setInput(prefill.text);
    if (prefill.file) setFile(prefill.file);
    window.setTimeout(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(prefill.text.length, prefill.text.length); }, 50);
  }, [prefill, onPrefillUsed]);

  // A file becomes text for the Coach: an SDI invoice is read exactly, the rest by Gemini.
  // The file is also kept in Documenti, so nothing has to be uploaded twice.
  const readAttachment = async (f: File): Promise<string> => {
    const name = f.name.toLowerCase();
    if (name.endsWith('.xml') || name.endsWith('.p7m')) {
      const invoices = parseFatturaPA(xmlFromBytes(new Uint8Array(await f.arrayBuffer())));
      const mineVat = (org.vat || '').replace(/\s/g, '').toUpperCase();
      return invoices.map(i => {
        const issued = !!mineVat && (i.seller.vat || '').toUpperCase().endsWith(mineVat.replace(/^IT/, ''));
        return `FATTURA ELETTRONICA (letta dal file XML, dati esatti): direzione ${issued ? 'emessa' : 'ricevuta'}, numero ${i.number}, data ${i.issue_date}, scadenza ${i.due_date || 'non indicata'}, fornitore ${i.seller.name} (P.IVA ${i.seller.vat}), cliente ${i.buyer.name} (P.IVA ${i.buyer.vat}), imponibile ${i.taxable}, IVA ${i.vat}, totale ${i.total} (${eur(i.total)}). Righe: ${i.description || '-'}`;
      }).join('\n');
    }
    setLoading('Leggo il documento…');
    const text = await readDocumentText(f, s => setLoading(`Il servizio gratuito è occupato, riprovo tra ${s} s…`));
    if (snap.part2) {
      const kind = /contratt|accordo|sponsor/i.test(text.slice(0, 2000)) ? 'contratto' : /fattura|invoice/i.test(text.slice(0, 2000)) ? 'fattura' : /oggetto:|from:|da:/i.test(text.slice(0, 500)) ? 'email' : 'altro';
      await uploadDocument(org.id, f, { name: f.name, kind, text_content: text }).catch(() => {});
    }
    return text;
  };

  const send = async (raw?: string, attached?: File | null) => {
    const q = (raw ?? input).trim();
    const att = attached !== undefined ? attached : file;
    if ((!q && !att) || loading) return;
    setError('');
    setInput(''); setFile(null);
    const userMsg: Msg = { id: newId(), role: 'user', text: q || 'Ecco il documento: fai tu.', attachment: att?.name };
    setMsgs(m => [...m, userMsg]);
    const controller = new AbortController();
    abort.current = controller;
    setLoading('Il Coach sta pensando…');
    try {
      let extra = '';
      if (att) extra = `\n\nALLEGATO “${att.name}”:\n${await readAttachment(att)}`;
      setLoading('Il Coach sta pensando…');
      const history: ChatTurn[] = [...msgs.slice(-10), userMsg].map(m => ({ role: m.role, text: m.text }));
      history[history.length - 1] = { role: 'user', text: userMsg.text + extra };
      const reply = await askTutor(BIZ_COACH_SYSTEM, async () => buildBizContext(snap, org.name, today, me, cash), history, controller.signal);
      const { text, plan } = parseCoachReply(reply || '');
      let proposalId: string | undefined;
      if (plan && snap.part2) {
        proposalId = await createProposal(org.id, { title: plan.title, summary: text.slice(0, 500), actions: plan.actions, source: att ? 'documento' : 'coach', source_text: (userMsg.text + extra).slice(0, 20000) });
        loadProposals();
        onChanged();
      }
      setMsgs(m => [...m, { id: newId(), role: 'assistant', text: text || (plan ? 'Ecco cosa preparo:' : 'Non ho una risposta, riprova.'), proposalId }]);
    } catch (err) {
      if (!(err instanceof StoppedError) && !controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(''); abort.current = null;
    }
  };

  useEffect(() => {
    const p = pendingSend.current;
    if (!p || !ready) return;
    pendingSend.current = null;
    send(p.text, p.file || null);
  });

  if (!ready || settings) {
    return (
      <div className="space-y-6">
        <PageTitle title="Coach." lead="Per usare il Coach serve una chiave AI gratuita: è la stessa della Guida Studio AI." />
        <AISettings darkMode onDone={() => { setReady(isReady()); setSettings(false); setAiName(providerLabel()); }}
          onCancel={ready ? () => setSettings(false) : undefined}
          geminiGuide={<p className="text-sm" style={{ color: 'var(--text-muted)' }}>Vai su aistudio.google.com/app/apikey, crea una chiave gratuita e incollala qui.</p>} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageTitle title="Coach." lead="Scrivi, incolla un’email o allega un contratto: preparo io clienti, scadenze, compiti e appuntamenti. Tu confermi."
        action={<ModelPicker darkMode compact onChange={() => setAiName(providerLabel())} onOpenSettings={() => setSettings(true)} />} />

      <div className="glass-card p-4 sm:p-5 space-y-4 min-h-[40vh]">
        {msgs.length === 0 && (
          <div className="py-6 text-center space-y-4">
            <Sparkles className="w-8 h-8 mx-auto" style={{ color: 'var(--brand-ring)' }} />
            <p className="text-[15px] max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
              Esempio: “Nuovo cliente RRD, referente Elena elena@rrd.com, sponsorizzazione 6.000 € l’anno, 2 post al mese, shooting entro marzo”. Oppure allega il contratto in PDF.
            </p>
          </div>
        )}
        {msgs.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[92%] sm:max-w-[80%] space-y-2 ${m.role === 'user' ? 'items-end' : ''}`}>
              {(m.text || m.attachment) && (
                <div className={`rounded-3xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-line ${m.role === 'user' ? 'glass-lens' : ''}`}
                  style={{ color: 'var(--text)', background: m.role === 'user' ? undefined : 'transparent' }}>
                  {m.attachment && <span className="flex items-center gap-1.5 text-xs mb-1" style={{ color: 'var(--text-muted)' }}><FileText className="w-3.5 h-3.5" />{m.attachment}</span>}
                  {m.text}
                </div>
              )}
              {m.proposalId && proposals[m.proposalId] && (
                <PlanCard orgId={org.id} proposal={proposals[m.proposalId]} snap={snap} onDone={() => { loadProposals(); onChanged(); }} />
              )}
            </div>
          </div>
        ))}
        {loading && <p className="text-sm flex items-center gap-2" style={{ color: 'var(--text-muted)' }}><Loader2 className="w-4 h-4 animate-spin" /> {loading}</p>}
        {error && <p role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
        <div ref={endRef} />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {STARTERS.map(s => (
          <button key={s.label} onClick={() => { if (s.text.endsWith(' ') || s.text.endsWith('\n')) { setInput(s.text); inputRef.current?.focus(); } else send(s.text); }}
            className="flex-shrink-0 h-9 px-3.5 rounded-full glass-card !rounded-full text-sm" style={{ color: 'var(--text-muted)' }}>{s.label}</button>
        ))}
      </div>

      <div className="glass-card p-2 flex items-end gap-1.5">
        <label className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer flex-shrink-0 hover:bg-white/5" aria-label="Allega un documento" title="Allega PDF, foto, email o fattura XML">
          <Paperclip className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
          <input type="file" className="hidden" accept=".pdf,.xml,.p7m,.txt,.eml,image/*" onChange={e => { setFile(e.target.files?.[0] || null); e.target.value = ''; }} />
        </label>
        <div className="flex-1 min-w-0">
          {file && (
            <span className="inline-flex items-center gap-1.5 text-xs rounded-full pl-3 pr-1 h-7 mb-1" style={{ background: 'var(--glass-well)', color: 'var(--text)' }}>
              <FileText className="w-3.5 h-3.5" />{file.name}
              <button onClick={() => setFile(null)} aria-label="Togli allegato" className="w-6 h-6 rounded-full flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
            </span>
          )}
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} rows={Math.min(6, Math.max(1, input.split('\n').length))}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 640) { e.preventDefault(); send(); } }}
            placeholder="Scrivi al Coach…" aria-label="Messaggio al Coach"
            className="w-full bg-transparent outline-none resize-none text-[15px] leading-relaxed py-2.5 px-1" style={{ color: 'var(--text)' }} />
        </div>
        {loading
          ? <button onClick={() => abort.current?.abort()} aria-label="Ferma" className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 glass-lens"><Square className="w-4 h-4" /></button>
          : <button onClick={() => send()} disabled={!input.trim() && !file} aria-label="Invia" className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40" style={{ background: 'var(--brand-fill)', color: 'var(--on-brand)' }}><Send className="w-4 h-4" /></button>}
      </div>
      {msgs.length > 0 && (
        <button onClick={() => setMsgs([])} className="text-sm inline-flex items-center gap-1.5" style={{ color: 'var(--text-subtle)' }}><Trash2 className="w-3.5 h-3.5" /> Nuova conversazione</button>
      )}
    </div>
  );
}
