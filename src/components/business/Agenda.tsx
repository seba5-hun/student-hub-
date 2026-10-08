import { useMemo, useState } from 'react';
import { Plus, Download, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Org, Person } from '../../lib/business';
import { BizSnapshot, BizEvent, EventKind, EVENT_LABEL, saveEvent, deleteEvent } from '../../lib/businessData';
import { agendaItems, agendaICS, addDays, dayKey, diffDays, AgendaItem } from '../../lib/businessIntel';
import type { BusinessTab } from './sections';
import { Sheet, TextField, TextArea, SelectField, Label, ErrorNote, PageTitle, Empty } from './ui';

const KIND_COLOR: Record<string, string> = {
  riunione: 'var(--area-scuola)', appuntamento: 'var(--area-studio)', consegna: 'var(--area-progetto)', scadenza: 'var(--warning)',
  pagamento: 'var(--area-sport)', compito: 'var(--text-muted)', obbligo: 'var(--brand-ring)', diritto: 'var(--area-recupero)', altro: 'var(--text-subtle)',
};

export default function Agenda({ org, snap, people, canEdit, onOpen, onChanged }: {
  org: Org; snap: BizSnapshot | null; people: Person[]; canEdit: boolean; onOpen: (tab: BusinessTab, focusId?: string) => void; onChanged: () => void;
}) {
  const today = dayKey(new Date());
  const [view, setView] = useState<'prossimi' | 'mese'>('prossimi');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState(today);
  const [sheet, setSheet] = useState<BizEvent | { date: string } | null>(null);

  const upcoming = useMemo(() => (snap ? agendaItems(snap, today, addDays(today, 120)) : []), [snap, today]);
  const monthItems = useMemo(() => {
    if (!snap) return [];
    const first = `${month}-01`;
    const d = new Date(first + 'T00:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0);
    return agendaItems(snap, first, dayKey(d));
  }, [snap, month]);

  const groups = useMemo(() => {
    const g: { title: string; items: AgendaItem[] }[] = [
      { title: 'Oggi', items: [] }, { title: 'Domani', items: [] }, { title: 'Questa settimana', items: [] }, { title: 'Questo mese', items: [] }, { title: 'Più avanti', items: [] },
    ];
    for (const it of upcoming) {
      const n = diffDays(today, it.date);
      g[n === 0 ? 0 : n === 1 ? 1 : n <= 7 ? 2 : n <= 30 ? 3 : 4].items.push(it);
    }
    return g.filter(x => x.items.length);
  }, [upcoming, today]);

  const openItem = (it: AgendaItem) => {
    if (it.source === 'evento') { const e = snap?.events.find(x => x.id === it.ref); if (e) setSheet(e); return; }
    if (it.source === 'compito' || it.source === 'progetto') onOpen('progetti', it.source === 'progetto' ? it.ref : snap?.tasks.find(t => t.id === it.ref)?.project_id || undefined);
    else if (it.source === 'fattura') onOpen('finanza');
    else onOpen('clienti', it.ref);
  };
  const exportIcs = () => {
    const blob = new Blob([agendaICS(upcoming, org.name)], { type: 'text/calendar' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `mynd-${org.name.toLowerCase().replace(/\W+/g, '-')}.ics`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="space-y-6">
      <PageTitle title="Agenda." lead="Appuntamenti, consegne e tutte le scadenze: di compiti, contratti e fatture."
        action={canEdit && snap?.part2 ? <button onClick={() => setSheet({ date: view === 'mese' ? day : today })} className="btn-primary h-11 px-4 inline-flex items-center gap-1.5 flex-shrink-0"><Plus className="w-4 h-4" /> Evento</button> : undefined} />
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 p-1 rounded-full" style={{ background: 'var(--glass-well)' }} role="tablist">
          {(['prossimi', 'mese'] as const).map(v => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`h-9 px-4 rounded-full text-sm font-medium ${view === v ? 'glass-lens' : ''}`}
              style={{ color: view === v ? 'var(--brand-ring)' : 'var(--text-muted)' }}>{v === 'prossimi' ? 'Prossimamente' : 'Mese'}</button>
          ))}
        </div>
        <button onClick={exportIcs} className="ml-auto text-sm inline-flex items-center gap-1.5 h-9 px-3 rounded-full hover:bg-white/5" style={{ color: 'var(--text-muted)' }} title="Per Google, Apple o Outlook Calendar">
          <Download className="w-4 h-4" /> Calendario .ics
        </button>
      </div>

      {!snap ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-subtle)' }} /></div>
        : view === 'prossimi' ? (
          groups.length === 0 ? <Empty>Niente in arrivo nei prossimi mesi.</Empty> : groups.map(g => (
            <section key={g.title} className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-subtle)' }}>{g.title}</h3>
              <ul className="glass-card p-2 space-y-0.5">{g.items.map(it => <Row key={it.id} it={it} today={today} onClick={() => openItem(it)} />)}</ul>
            </section>
          ))
        ) : (
          <MonthView month={month} setMonth={setMonth} day={day} setDay={setDay} items={monthItems} today={today} onItem={openItem} />
        )}

      {sheet && (
        <EventSheet orgId={org.id} event={'id' in sheet ? sheet : null} date={'date' in sheet ? sheet.date : today} snap={snap!} people={people}
          onClose={() => setSheet(null)} onSaved={() => { setSheet(null); onChanged(); }} />
      )}
    </div>
  );
}

function Row({ it, today, onClick }: { it: AgendaItem; today: string; onClick: () => void }) {
  const n = diffDays(today, it.date);
  const when = n === 0 ? (it.time || 'oggi') : n === 1 ? `domani${it.time ? ` ${it.time}` : ''}` : new Date(it.date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) + (it.time ? ` ${it.time}` : '');
  return (
    <li>
      <button onClick={onClick} className="w-full text-left rounded-2xl px-3 py-2.5 flex items-start gap-3 hover:bg-white/5">
        <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: KIND_COLOR[it.kind] || 'var(--text-subtle)' }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm" style={{ color: 'var(--text)' }}>{it.title}</span>
          <span className="block text-xs truncate" style={{ color: 'var(--text-subtle)' }}>{[when, it.detail].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="text-[11px] flex-shrink-0 pt-0.5" style={{ color: 'var(--text-subtle)' }}>{it.kind}</span>
      </button>
    </li>
  );
}

function MonthView({ month, setMonth, day, setDay, items, today, onItem }: {
  month: string; setMonth: (m: string) => void; day: string; setDay: (d: string) => void; items: AgendaItem[]; today: string; onItem: (it: AgendaItem) => void;
}) {
  const first = new Date(month + '-01T00:00:00');
  const shift = (n: number) => { const d = new Date(first); d.setMonth(d.getMonth() + n); setMonth(dayKey(d).slice(0, 7)); };
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => (i < lead || i >= lead + days ? null : `${month}-${String(i - lead + 1).padStart(2, '0')}`));
  const byDay = (d: string) => items.filter(it => it.date === d);
  const selected = byDay(day);
  return (
    <div className="space-y-4">
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => shift(-1)} aria-label="Mese precedente" className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5"><ChevronLeft className="w-5 h-5" /></button>
          <p className="text-[15px] font-semibold capitalize" style={{ color: 'var(--text)' }}>{first.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</p>
          <button onClick={() => shift(1)} aria-label="Mese successivo" className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5"><ChevronRight className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((d, i) => <span key={i} className="text-[11px] py-1" style={{ color: 'var(--text-subtle)' }}>{d}</span>)}
          {cells.map((d, i) => {
            if (!d) return <span key={i} />;
            const list = byDay(d);
            const isSel = d === day;
            return (
              <button key={d} onClick={() => setDay(d)} aria-label={`${d}, ${list.length} elementi`} aria-pressed={isSel}
                className={`h-12 rounded-2xl flex flex-col items-center justify-center gap-1 ${isSel ? 'glass-lens' : 'hover:bg-white/5'}`}>
                <span className="text-sm tabular" style={{ color: d === today ? 'var(--brand-ring)' : 'var(--text)', fontWeight: d === today ? 700 : 400 }}>{Number(d.slice(8))}</span>
                <span className="flex gap-0.5 h-1.5">{list.slice(0, 3).map(it => <span key={it.id} className="w-1.5 h-1.5 rounded-full" style={{ background: KIND_COLOR[it.kind] || 'var(--text-subtle)' }} />)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--text-subtle)' }}>{new Date(day + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
        {selected.length === 0 ? <Empty>Niente in questo giorno.</Empty> : <ul className="glass-card p-2 space-y-0.5">{selected.map(it => <Row key={it.id} it={it} today={today} onClick={() => onItem(it)} />)}</ul>}
      </section>
    </div>
  );
}

function EventSheet({ orgId, event, date, snap, people, onClose, onSaved }: {
  orgId: string; event: BizEvent | null; date: string; snap: BizSnapshot; people: Person[]; onClose: () => void; onSaved: () => void;
}) {
  const start = event ? new Date(event.starts_at) : null;
  const end = event?.ends_at ? new Date(event.ends_at) : null;
  const hm = (d: Date | null) => (d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '');
  const [title, setTitle] = useState(event?.title || '');
  const [kind, setKind] = useState<EventKind>(event?.kind || 'appuntamento');
  const [day, setDay] = useState(start ? dayKey(start) : date);
  const [from, setFrom] = useState(event?.all_day ? '' : hm(start) || '10:00');
  const [to, setTo] = useState(event?.all_day ? '' : hm(end));
  const [location, setLocation] = useState(event?.location || '');
  const [cp, setCp] = useState(event?.counterparty_id || '');
  const [prj, setPrj] = useState(event?.project_id || '');
  const [who, setWho] = useState<string[]>(event?.person_ids || []);
  const [notes, setNotes] = useState(event?.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!title.trim() || !day || busy) return;
    setBusy(true); setError('');
    try {
      const allDay = !from;
      const startsAt = new Date(`${day}T${from || '09:00'}`).toISOString();
      const endsAt = !allDay && to ? new Date(`${day}T${to}`).toISOString() : null;
      await saveEvent(orgId, { title: title.trim(), kind, starts_at: startsAt, ends_at: endsAt, all_day: allDay, location: location.trim() || null,
        counterparty_id: cp || null, project_id: prj || null, person_ids: who, notes: notes.trim() || null }, event?.id);
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  };
  return (
    <Sheet title={event ? 'Modifica evento' : 'Nuovo evento'} onClose={onClose}
      footer={<>
        {event && <button onClick={async () => { try { await deleteEvent(event.id); onSaved(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } }} className="h-11 px-3 mr-auto rounded-full text-sm font-medium" style={{ color: 'var(--danger)' }}>Elimina</button>}
        <button onClick={onClose} className="btn-secondary h-11 px-5">Annulla</button>
        <button onClick={save} disabled={!title.trim() || busy} className="btn-primary h-11 px-5 inline-flex items-center gap-2 disabled:opacity-40">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Salva</button>
      </>}>
      <TextField id="ev-title" label="Cosa" value={title} onChange={setTitle} placeholder="Es. Call con Elena di RRD" autoFocus={!event} />
      <SelectField id="ev-kind" label="Tipo" value={kind} onChange={setKind} options={(Object.keys(EVENT_LABEL) as EventKind[]).map(k => ({ value: k, label: EVENT_LABEL[k] }))} />
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-3 sm:col-span-1"><TextField id="ev-day" label="Giorno" type="date" value={day} onChange={setDay} /></div>
        <TextField id="ev-from" label="Dalle" type="time" value={from} onChange={setFrom} />
        <TextField id="ev-to" label="Alle" type="time" value={to} onChange={setTo} />
      </div>
      <p className="text-xs -mt-2" style={{ color: 'var(--text-subtle)' }}>Senza orario vale tutto il giorno.</p>
      <TextField id="ev-loc" label="Dove" value={location} onChange={setLocation} placeholder="Es. Google Meet, Lago di Garda" />
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="ev-cp">Cliente</Label>
          <select id="ev-cp" value={cp} onChange={e => setCp(e.target.value)} className="input-glass w-full h-12 text-[15px]"><option value="">Nessuno</option>{snap.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><Label htmlFor="ev-prj">Progetto</Label>
          <select id="ev-prj" value={prj} onChange={e => setPrj(e.target.value)} className="input-glass w-full h-12 text-[15px]"><option value="">Nessuno</option>{snap.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      </div>
      <div>
        <Label>Chi partecipa</Label>
        <div className="flex flex-wrap gap-1.5">
          {people.filter(p => p.active).map(p => {
            const on = who.includes(p.id);
            return <button key={p.id} type="button" aria-pressed={on} onClick={() => setWho(on ? who.filter(x => x !== p.id) : [...who, p.id])}
              className={`h-9 px-3.5 rounded-full text-sm ${on ? 'glass-lens' : 'glass-card !rounded-full'}`} style={{ color: on ? 'var(--brand-ring)' : 'var(--text-muted)' }}>{p.name}</button>;
          })}
        </div>
      </div>
      <TextArea id="ev-notes" label="Note" value={notes} onChange={setNotes} rows={2} />
      <ErrorNote text={error} />
    </Sheet>
  );
}
