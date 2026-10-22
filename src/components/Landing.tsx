import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Eye, Mic, Volume2, ShieldCheck, Smartphone, Lock, Check, Plus, BookOpen, Sparkles, Target, Timer, CalendarDays, Layers, Repeat } from 'lucide-react';
import Logo from './Logo';
import './landing.css';

// The site before the login (myndspace.world): what MYND is and how it works, in the quiet style of
// the app. MYND is presented as a personal study coach that helps to understand and to organise,
// never as an AI that does the homework. "Prova MYND" opens the sign-up, "Accedi" the login,
// "Guarda la demo" the app with example data.

interface Props {
  onStart: () => void;
  onLogin: () => void;
  onDemo: () => void;
}

const STATEMENT = 'Un\'AI che fa i compiti al posto tuo ti salva una sera. Un coach che ti aiuta a capire ti cambia l\'anno. MYND è il secondo.'.split(' ');
const LIME_WORDS = new Set(['coach', 'capire', 'cambia', 'l\'anno.', 'secondo.']);
const KINDS = ['🎒 Scuola superiore', '🎓 Università', '💻 Scuola online', '📝 Test d\'ingresso', '📚 Scuola media', '✨ A modo tuo'];
const NAMES = ['Verifiche', 'Esami', 'Prove', 'Scadenze', 'Test'];

// The five steps of the story told while scrolling.
const STEPS: { icon: React.ReactNode; kicker: string; title: string; text: string; screen: Screen }[] = [
  { icon: <CalendarDays size={18} />, kicker: 'Organizza', title: 'Tutto quello che hai da fare, in un posto solo.', text: 'Verifiche, compiti, allenamenti e impegni, anche ripetuti: «ogni martedì alle 18, fino a giugno». MYND li mette in ordine di importanza e ti avvisa per tempo.', screen: 'tasks' },
  { icon: <Target size={18} />, kicker: 'Decidi', title: 'Sai sempre da dove partire.', text: '«Cosa studiare» guarda scadenze, voti e tempo già dedicato e ti propone la prossima mossa, con il perché. Niente più ansia da pagina bianca.', screen: 'plan' },
  { icon: <Sparkles size={18} />, kicker: 'Capisci', title: 'Un coach che ti fa ragionare.', text: 'Studia sul tuo materiale: ti spiega con esempi su misura, ti fa domande, ti dà indizi e ti mostra la pagina del libro da cui arriva ogni cosa. La soluzione la trovi tu.', screen: 'coach' },
  { icon: <Layers size={18} />, kicker: 'Allenati', title: 'Ripeti finché diventa tuo.', text: 'Interrogazioni simulate, flashcard, schemi, quiz e simulazioni d\'esame. Ti corregge con gentilezza e ti dice esattamente cosa ripassare.', screen: 'train' },
  { icon: <Timer size={18} />, kicker: 'Migliora', title: 'Vedi i progressi, non solo i voti.', text: 'Il Timer Studio misura il tempo vero per ogni materia, le statistiche mostrano dove stai crescendo e gli obiettivi settimanali ti tengono costante.', screen: 'progress' },
];
type Screen = 'tasks' | 'plan' | 'coach' | 'train' | 'progress';

// "Coach, not shortcut": the conversation typed live when it comes into view.
const COACH_CHAT: { me?: boolean; text: string }[] = [
  { me: true, text: 'Risolvimi x² − 5x + 6 = 0' },
  { text: 'Proviamoci insieme 💪 Che tipo di equazione è? E che forma ha quando la scomponi?' },
  { me: true, text: 'Di secondo grado… (x − a)(x − b)?' },
  { text: 'Esatto! Allora cerca due numeri che moltiplicati fanno 6 e sommati fanno 5.' },
  { me: true, text: '2 e 3!' },
  { text: 'Perfetto 👏 Quindi le soluzioni sono x = 2 e x = 3. Vuoi provarne una da solo?' },
];

const FAQ: [string, string][] = [
  ['MYND fa i compiti al posto mio?', 'No, e non è pensato per questo. MYND è un coach: ti spiega, ti fa domande, ti dà indizi e ti corregge, così arrivi alla soluzione e la capisci davvero. Se vuoi, ti mostra anche i passaggi completi per controllare il tuo lavoro.'],
  ['Su cosa si basa il coach AI?', 'Sul materiale che carichi tu: PDF, foto del libro e appunti. Ti indica da quale file e da quale pagina prende ogni informazione, e ti dice chiaramente quando qualcosa non è nel tuo materiale.'],
  ['Serve pagare un\'AI?', 'No: puoi usare Google Gemini gratis, con la tua chiave (la crei in un minuto, ti guidiamo noi). Se vuoi la massima qualità puoi collegare Claude o ChatGPT.'],
  ['Per chi è MYND?', 'Per chi studia: scuola media e superiore, università, scuola online, test d\'ingresso. Si adatta al tuo percorso, dai nomi delle sezioni al modo in cui calcola le medie.'],
  ['I miei dati sono al sicuro?', 'Li vedi solo tu. Puoi scaricarli o cancellare l\'account quando vuoi, direttamente dall\'app. Niente pubblicità e niente vendita di dati.'],
  ['Funziona su telefono?', 'Sì: iPhone, Android, tablet e computer, sempre sincronizzati. Dal browser puoi aggiungerla alla schermata Home e si apre come un\'app.'],
];

export default function Landing({ onStart, onLogin, onDemo }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const story = useRef<HTMLDivElement>(null);
  const words = useRef<HTMLSpanElement[]>([]);
  const [scrolled, setScrolled] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(0);
  const [swapOut, setSwapOut] = useState(false);
  const [faq, setFaq] = useState<number | null>(0);

  // Reveal on scroll.
  useEffect(() => {
    const els = root.current?.querySelectorAll('[data-reveal]') || [];
    const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Scroll: nav glass, hero parallax, the statement lighting up, the step of the story.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY, vh = window.innerHeight;
      setScrolled(y > 12);
      hero.current?.style.setProperty('--p', String(Math.min(1, Math.max(0, y / (vh * 0.9)))));
      for (const w of words.current) if (w) w.classList.toggle('on', w.getBoundingClientRect().top < vh * 0.62);
      const s = story.current;
      if (s && s.offsetParent) {
        const r = s.getBoundingClientRect();
        const p = Math.min(0.999, Math.max(0, -r.top / Math.max(1, r.height - vh)));
        s.style.setProperty('--sp', String(p));
        setStep(Math.floor(p * STEPS.length));
      }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame); };
  }, []);

  // "Verifiche" → "Esami" → …: the names change with the kind of student.
  useEffect(() => {
    const id = window.setInterval(() => {
      setSwapOut(true);
      window.setTimeout(() => { setName(n => (n + 1) % NAMES.length); setSwapOut(false); }, 380);
    }, 2200);
    return () => window.clearInterval(id);
  }, []);

  // The app tilts a little with the pointer; the cards light up where the pointer is.
  const tilt = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    hero.current?.style.setProperty('--rx', String(((e.clientX - r.left) / r.width - 0.5) * 8));
    hero.current?.style.setProperty('--ry', String(-((e.clientY - r.top) / r.height - 0.5) * 6));
  };
  const spot = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  const scrollTo = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const delay = (d: number) => ({ ['--d' as string]: `${d}s` } as React.CSSProperties);

  return (
    <div className="lp" ref={root}>
      <header className={`lp-nav ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="lp-wrap lp-nav-in">
          <a href="/" aria-label="MYND" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Logo size={19} /></a>
          <nav className="lp-nav-links" aria-label="Sezioni">
            <a href="#come-funziona" onClick={scrollTo('come-funziona')}>Come funziona</a>
            <a href="#coach" onClick={scrollTo('coach')}>Coach AI</a>
            <a href="#funzioni" onClick={scrollTo('funzioni')}>Funzioni</a>
            <a href="#domande" onClick={scrollTo('domande')}>Domande</a>
          </nav>
          <div className="lp-nav-cta">
            <button className="lp-link" onClick={onLogin}>Accedi</button>
            <button className="lp-btn lp-btn-lime lp-btn-sm" onClick={onStart}>Prova MYND</button>
          </div>
        </div>
      </header>

      <main>
        {/* ---- Hero ---- */}
        <section className="lp-hero" ref={hero} onPointerMove={tilt} onPointerLeave={() => { hero.current?.style.setProperty('--rx', '0'); hero.current?.style.setProperty('--ry', '0'); }}>
          <div className="lp-wrap" style={{ position: 'relative' }}>
            <p className="lp-eyebrow"><b>M</b>ake <b>Y</b>our <b>N</b>ext <b>D</b>ecision</p>
            <h1 className="lp-h1">
              <span className="lp-line"><span>Il coach che ti aiuta</span></span>
              <span className="lp-line"><span>a <span className="lp-y">capire</span>.</span></span>
            </h1>
            <p className="lp-sub">MYND organizza il tuo studio e ti accompagna passo dopo passo: ti spiega, ti fa domande, ti mostra dove sbagli. Le risposte le trovi tu. E restano.</p>
            <div className="lp-hero-cta">
              <button className="lp-btn lp-btn-lime lp-btn-lg" onClick={onStart}>Prova MYND <ArrowRight size={18} /></button>
              <button className="lp-btn lp-btn-glass lp-btn-lg" onClick={onDemo}><Eye size={18} /> Guarda la demo</button>
            </div>
          </div>

          <div className="lp-stage" aria-hidden>
            {/* Little coach messages floating around the app */}
            <div className="lp-float f1"><span>📅</span> Verifica di Storia giovedì: oggi 30 min sul cap. 4</div>
            <div className="lp-float f2"><span>💡</span> Prova a spiegarmelo con parole tue</div>
            <div className="lp-float f3"><span>🔥</span> 12 giorni di fila. Continua così!</div>
            <div className="lp-device">
              <div className="lp-screen">
                <div className="lp-screen-bar"><i /><i /><i /><span style={{ marginLeft: 8 }}>myndspace.world</span></div>
                <div className="lp-dash">
                  <div className="lp-card"><div className="lp-num">7</div><small>Impegni attivi</small></div>
                  <div className="lp-card"><div className="lp-num">8,3</div><small>Media voti</small></div>
                  <div className="lp-card lp-hide-m"><div className="lp-num">15,6</div><small>Ore di studio</small></div>
                  <div className="lp-card lp-hide-m"><div className="lp-num">12🔥</div><small>Giorni di fila</small></div>
                  <div className="lp-card lp-span2" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <svg className="lp-ring" viewBox="0 0 100 100"><circle className="bg" cx="50" cy="50" r="40" /><circle className="fg" cx="50" cy="50" r="40" /></svg>
                    <div><div style={{ fontWeight: 600 }}>Obiettivo settimanale</div><small>11,2 h su 15 h · ci sei quasi</small></div>
                  </div>
                  <div className="lp-card lp-span2">
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Prossimi impegni</div>
                    {[['Verifica di Matematica', '#ABA1DD', 'Domani'], ['Esercizi di Fisica p. 112', '#83AFDF', 'Mer'], ['Allenamento', '#6BBDAB', '18:00']].map(([t, c, w], i) => (
                      <div key={t} className="lp-task" style={{ ['--c' as string]: c, animationDelay: `${1.3 + i * 0.15}s` } as React.CSSProperties}>{t}<em>{w}</em></div>
                    ))}
                  </div>
                  <div className="lp-card lp-span2 lp-hide-m">
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Tempo per materia</div>
                    <div className="lp-bars">{[62, 88, 45, 70, 96, 52, 30].map((h, i) => <span key={i} style={{ height: `${h}%`, animationDelay: `${1.2 + i * 0.08}s` }} />)}</div>
                  </div>
                  <div className="lp-card lp-span2 lp-hide-m">
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Cosa studiare adesso</div>
                    <div className="lp-task" style={{ ['--c' as string]: '#C8F25A', animationDelay: '1.6s' } as React.CSSProperties}>Ripassa le equazioni di 2° grado<em>45 min</em></div>
                    <div className="lp-task" style={{ ['--c' as string]: '#D595B0', animationDelay: '1.75s' } as React.CSSProperties}>Storia: la Restaurazione<em>30 min</em></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---- Statement ---- */}
        <section className="lp-section">
          <div className="lp-wrap">
            <p className="lp-statement">
              {STATEMENT.map((w, i) => (
                <React.Fragment key={i}><span ref={el => { if (el) words.current[i] = el; }} className={LIME_WORDS.has(w) ? 'lime' : ''}>{w}</span>{' '}</React.Fragment>
              ))}
            </p>
          </div>
        </section>

        {/* ---- How it works: the story told while scrolling ---- */}
        <section id="come-funziona" className="lp-section" style={{ paddingTop: 20, paddingBottom: 0 }}>
          <div className="lp-wrap lp-center" data-reveal>
            <p className="lp-kicker">Come funziona</p>
            <h2 className="lp-h2">Cinque passi.<br /><span className="dim">Ogni giorno.</span></h2>
          </div>
          {/* Computer: the screen stays, the steps change while scrolling */}
          <div className="lp-story" ref={story} style={{ height: `${STEPS.length * 38 + 100}vh` }}>
            <div className="lp-story-sticky lp-wrap">
              <div className="lp-story-text">
                {STEPS.map((s, i) => (
                  <div key={s.kicker} className={`lp-story-step ${i === step ? 'on' : i < step ? 'past' : ''}`}>
                    <span className="lp-step-chip">{s.icon} {i + 1} · {s.kicker}</span>
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                  </div>
                ))}
                <div className="lp-story-dots">{STEPS.map((s, i) => <i key={s.kicker} className={i === step ? 'on' : ''} />)}</div>
              </div>
              <div className="lp-story-screen">
                <div className="lp-phone">
                  {STEPS.map((s, i) => <div key={s.screen} className={`lp-phone-page ${i === step ? 'on' : ''}`}><StoryScreen screen={s.screen} active={i === step} /></div>)}
                </div>
              </div>
            </div>
          </div>
          {/* Phone: the steps one under the other */}
          <div className="lp-story-list lp-wrap">
            {STEPS.map((s, i) => (
              <div key={s.kicker} className="lp-story-item" data-reveal>
                <span className="lp-step-chip">{s.icon} {i + 1} · {s.kicker}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <div className="lp-phone small"><div className="lp-phone-page on"><StoryScreen screen={s.screen} active /></div></div>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Coach, not shortcut ---- */}
        <section className="lp-section" id="coach">
          <div className="lp-wrap">
            <div className="lp-center" data-reveal>
              <p className="lp-kicker">Coach AI</p>
              <h2 className="lp-h2">Non una scorciatoia.<br /><span className="dim">Un allenatore.</span></h2>
              <p className="lp-lead">Le altre AI ti danno il risultato. Il coach di MYND ti porta a trovarlo: ti fa le domande giuste, al momento giusto, sul tuo materiale.</p>
            </div>
            <div className="lp-split" style={{ marginTop: 64 }}>
              <div className="lp-panel" data-reveal>
                <div className="lp-panel-head"><span className="lp-avatar"><Sparkles size={15} /></span> Coach MYND <em>Guidami passo passo</em></div>
                <TypedChat messages={COACH_CHAT} />
              </div>
              <div data-reveal style={delay(0.15)}>
                <ul className="lp-points big">
                  <li><span><Sparkles size={14} /></span><span><b>Ti fa ragionare.</b> Domande e piccoli indizi, uno alla volta, finché ci arrivi tu.</span></li>
                  <li><span><BookOpen size={14} /></span><span><b>Parte dal tuo libro.</b> Usa i tuoi PDF, foto e appunti e ti dice da quale pagina arriva ogni spiegazione.</span></li>
                  <li><span><Target size={14} /></span><span><b>Ti conosce.</b> Sa quando hai la prossima verifica e dove vai meglio o peggio, e si concentra su ciò che conta.</span></li>
                  <li><span><Check size={14} /></span><span><b>Ti corregge davvero.</b> Gentile ma onesto: cosa è giusto, cosa manca, cosa ripassare.</span></li>
                  <li><span><Mic size={14} /></span><span><b>Parli e ascolti.</b> Detti la domanda e senti la risposta, a mani libere.</span></li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ---- Numbers ---- */}
        <section className="lp-section" style={{ paddingTop: 40, paddingBottom: 40 }}>
          <div className="lp-wrap lp-stats" data-reveal>
            <Stat value={5} label="AI tra cui scegliere, anche gratis" />
            <Stat value={6} label="percorsi di studio, dalle medie all'università" />
            <Stat value={1} label="spazio solo per te: studio, sport, vita" />
            <Stat value={0} label="pubblicità. I tuoi dati restano tuoi" />
          </div>
        </section>

        {/* ---- Features ---- */}
        <section className="lp-section" id="funzioni">
          <div className="lp-wrap">
            <div data-reveal>
              <p className="lp-kicker">Tutte le funzioni</p>
              <h2 className="lp-h2">Un solo spazio.<br /><span className="dim">Nessun caos.</span></h2>
            </div>
            <div className="lp-bento">
              <article className="lp-tile lp-w3" data-reveal onPointerMove={spot}>
                <h3>Impegni e calendario.</h3>
                <p>Verifiche, compiti, allenamenti, anche ripetuti come sull'iPhone: «ogni martedì alle 18, fino a giugno». Promemoria e priorità automatiche.</p>
                <div className="lp-tile-art">
                  <div className="lp-cal">
                    {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((d, i) => <b key={i}>{d}</b>)}
                    {Array.from({ length: 28 }, (_, i) => {
                      const rep = i % 7 === 1 || i % 7 === 3;
                      return <span key={i} className={rep ? 'rep' : ''} style={delay(0.3 + i * 0.03)}>{i + 1}</span>;
                    })}
                  </div>
                </div>
              </article>

              <article className="lp-tile lp-w3" data-reveal style={delay(0.1)} onPointerMove={spot}>
                <h3>Timer Studio.</h3>
                <p>Avvii, studi, salvi. Il tempo vero per ogni materia, anche diviso dopo tra più materie, con statistiche settimanali chiare.</p>
                <div className="lp-tile-art">
                  <div className="lp-timer"><span className="lp-dot" /><span className="lp-clock"><Clock /></span></div>
                  <div className="lp-bars on-reveal" style={{ height: 60 }}>{[40, 75, 55, 90, 65].map((h, i) => <span key={i} style={{ height: `${h}%`, animationDelay: `${0.2 + i * 0.1}s` }} />)}</div>
                </div>
              </article>

              <article className="lp-tile lp-w2" data-reveal onPointerMove={spot}>
                <h3>Voti e medie.</h3>
                <p>Media per materia e generale, sempre aggiornata. All'università: libretto, CFU, media ponderata e base di laurea.</p>
                <div className="lp-tile-art">
                  <svg className="lp-chart" viewBox="0 0 300 120" width="100%" height="120">
                    <defs><linearGradient id="lpArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="rgba(200,242,90,.35)" /><stop offset="1" stopColor="rgba(200,242,90,0)" /></linearGradient></defs>
                    <path className="area" d="M0,95 C40,90 60,70 100,74 C140,78 160,50 200,46 C240,42 260,24 300,18 L300,120 L0,120 Z" />
                    <path className="line" d="M0,95 C40,90 60,70 100,74 C140,78 160,50 200,46 C240,42 260,24 300,18" />
                  </svg>
                </div>
              </article>

              <article className="lp-tile lp-w2" data-reveal style={delay(0.1)} onPointerMove={spot}>
                <h3>Archivio.</h3>
                <p>PDF, foto del libro e appunti, anche da Google Drive. MYND li legge per il coach e ti mostra il punto esatto nel file.</p>
                <div className="lp-tile-art">
                  <div className="lp-files">
                    {[['PDF', '#E8685B', '-90px', '-12deg', '.1s'], ['FOTO', '#83AFDF', '0px', '0deg', '0s'], ['DOC', '#C8F25A', '90px', '12deg', '.2s']].map(([t, c, x, r, d]) => (
                      <div key={t} className="lp-file" style={{ ['--c' as string]: c, ['--x' as string]: x, ['--r' as string]: r, ['--d' as string]: d } as React.CSSProperties}><b>{t}</b><i /><i className="hl" /><i style={{ width: '60%' }} /></div>
                    ))}
                  </div>
                </div>
              </article>

              <article className="lp-tile lp-w2" data-reveal style={delay(0.2)} onPointerMove={spot}>
                <h3>Cosa studiare.</h3>
                <p>Ogni giorno ti dice da dove partire e perché, in base a scadenze, voti e tempo già dedicato.</p>
                <div className="lp-tile-art">
                  {([['Matematica', 92], ['Storia', 64], ['Inglese', 38]] as [string, number][]).map(([sub, v], i) => (
                    <div key={sub} style={{ marginTop: i ? 12 : 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#A3A8AE' }}><span>{sub}</span><span>{v}%</span></div>
                      <div className="lp-meter"><i style={{ ['--v' as string]: `${v}%`, ['--d' as string]: `${0.3 + i * 0.15}s` } as React.CSSProperties} /></div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="lp-tile lp-w2" data-reveal onPointerMove={spot}>
                <h3>Parla e ascolta.</h3>
                <p>Detta le domande al coach e fatti leggere le risposte ad alta voce. Studiare a mani libere, anche in movimento.</p>
                <div className="lp-tile-art lp-voice-art">
                  <span className="lp-mic"><Mic size={22} /></span>
                  <span className="lp-wave big">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ['--i' as string]: i } as React.CSSProperties} />)}</span>
                  <span className="lp-mic"><Volume2 size={22} /></span>
                </div>
              </article>

              <article className="lp-tile lp-w2" data-reveal style={delay(0.1)} onPointerMove={spot}>
                <h3>Le tue MYND.</h3>
                <p>Una versione per la scuola, una per gli esami, una per l'estate. Passi dall'una all'altra con un tocco; i tuoi dati sono gli stessi.</p>
                <div className="lp-tile-art">
                  <div className="lp-versions">
                    {[['⚡️', 'MYND', 'Predefinita'], ['🎓', 'Sessione di gennaio', 'Università'], ['☀️', 'Estate', 'Ripasso leggero']].map(([e, t, d], i) => (
                      <div key={t} className="lp-version" style={delay(0.2 + i * 0.15)}><span>{e}</span><div><b>{t}</b><small>{d}</small></div>{i === 1 && <Check size={14} color="#C8F25A" />}</div>
                    ))}
                  </div>
                </div>
              </article>

              <article className="lp-tile lp-w2" data-reveal style={delay(0.2)} onPointerMove={spot}>
                <h3>Allenamento.</h3>
                <p>Interrogazioni, flashcard, schemi, quiz a crocette e simulazioni d'esame, sempre sul tuo materiale.</p>
                <div className="lp-tile-art"><div className="lp-flip"><div className="lp-flip-in"><div className="front">Cos'è la Restaurazione?</div><div className="back">Il ritorno dei vecchi sovrani dopo Napoleone (1815).</div></div></div></div>
              </article>
            </div>
          </div>
        </section>

        {/* ---- For every student ---- */}
        <section className="lp-section lp-center">
          <div className="lp-wrap" data-reveal>
            <p className="lp-kicker">Per ogni studente</p>
            <h2 className="lp-h2">MYND si adatta<br /><span className="dim">a te.</span></h2>
            <p className="lp-lead">Superiori, università, scuola online, test d'ingresso. Cambiano le sezioni, i voti, perfino i nomi: le tue <span className={`lp-swap ${swapOut ? 'out' : ''}`}>{NAMES[name]}</span>, non le nostre. E il coach parla la tua lingua.</p>
          </div>
          <div className="lp-marquee" aria-hidden>
            <div>{[...KINDS, ...KINDS, ...KINDS, ...KINDS].map((k, i) => <span key={i} className="lp-chip">{k}</span>)}</div>
          </div>
        </section>

        {/* ---- On measure ---- */}
        <section className="lp-section" id="su-misura">
          <div className="lp-wrap lp-split">
            <div className="lp-panel" data-reveal>
              <div className="lp-panel-head"><span className="lp-avatar"><Sparkles size={15} /></span> Assistente MYND</div>
              <div className="lp-chat">
                <div className="lp-bub me" style={delay(0.3)}>Nel Timer vorrei il metodo Pomodoro</div>
                <div className="lp-bub ai" style={delay(1)}>Ecco la proposta: cicli di studio e pausa dentro il tuo Timer, con il tempo che va nelle statistiche. Confermi?</div>
              </div>
              <div className="lp-proposal" style={delay(1.7)}>
                <b>⏱ Timer Pomodoro</b>
                <span style={{ color: '#8C9197' }}>In cima al Timer Studio · usa 1 personalizzazione</span>
                <div className="lp-sent"><Check size={15} /> Richiesta inviata: la trovi presto nella tua MYND</div>
              </div>
            </div>
            <div data-reveal style={delay(0.15)}>
              <p className="lp-kicker">Assistente MYND</p>
              <h2 className="lp-h2">Su misura.<br /><span className="dim">Davvero.</span></h2>
              <p className="lp-lead">Dì all'assistente cosa ti serve. Sistema Home, menu e nomi all'istante, e per le idee più grandi crea funzioni nuove, solo per te.</p>
              <ul className="lp-points">
                <li><span>1</span><span><b>Lo descrivi</b> con parole tue, anche a voce.</span></li>
                <li><span>2</span><span><b>Lo progettate insieme</b>: l'assistente ti propone come farlo.</span></li>
                <li><span>3</span><span><b>Lo trovi nella tua MYND</b>, controllato e pronto. La MYND di base resta sempre lì.</span></li>
              </ul>
            </div>
          </div>
        </section>

        {/* ---- Everywhere ---- */}
        <section className="lp-section lp-center" id="ovunque">
          <div className="lp-wrap">
            <div data-reveal>
              <p className="lp-kicker">Ovunque tu sia</p>
              <h2 className="lp-h2">Telefono, tablet, computer.<br /><span className="dim">Sempre la tua MYND.</span></h2>
              <p className="lp-lead">Quello che fai su un dispositivo è già sugli altri: impegni, voti, file, chiavi e preferenze. Aggiungila alla schermata Home e si apre come un'app.</p>
            </div>
            <div className="lp-devices" data-reveal style={delay(0.1)} aria-hidden>
              <div className="lp-sync" />
              <div className="lp-dev phone"><div className="in"><i className="l" /><i /><i style={{ width: '70%' }} /><i /><i style={{ width: '50%' }} /></div></div>
              <div className="lp-dev lap"><div className="in"><i className="l" style={{ width: '25%' }} /><i /><i style={{ width: '80%' }} /><i /><i style={{ width: '60%' }} /><i /></div></div>
              <div className="lp-dev tab"><div className="in"><i className="l" style={{ width: '35%' }} /><i /><i style={{ width: '75%' }} /><i /><i style={{ width: '55%' }} /></div></div>
            </div>
            <div className="lp-trust">
              {[
                [<ShieldCheck key="s" size={22} color="#C8F25A" />, 'I tuoi dati restano tuoi.', 'Li vedi solo tu. Li scarichi o li cancelli quando vuoi, con un tocco.'],
                [<Lock key="l" size={22} color="#C8F25A" />, 'Accesso sicuro.', 'Email con codice di verifica o il tuo account Google.'],
                [<Smartphone key="p" size={22} color="#C8F25A" />, 'Come un\'app.', 'Su iPhone e Android dalla schermata Home, senza store.'],
              ].map(([icon, t, d], i) => (
                <div key={i} data-reveal style={{ ['--d' as string]: `${i * 0.08}s`, textAlign: 'left' } as React.CSSProperties}>{icon}<h4>{t}</h4><p>{d}</p></div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- FAQ ---- */}
        <section className="lp-section" id="domande">
          <div className="lp-wrap lp-faq-wrap">
            <div data-reveal>
              <p className="lp-kicker">Domande</p>
              <h2 className="lp-h2">Giusto<br /><span className="dim">chiederlo.</span></h2>
            </div>
            <div className="lp-faq" data-reveal style={delay(0.1)}>
              {FAQ.map(([q, a], i) => (
                <div key={q} className={`lp-faq-item ${faq === i ? 'open' : ''}`}>
                  <button onClick={() => setFaq(faq === i ? null : i)} aria-expanded={faq === i}>{q}<Plus size={18} /></button>
                  <div className="lp-faq-a"><p>{a}</p></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- Final ---- */}
        <section className="lp-final">
          <div className="lp-wrap" data-reveal style={{ position: 'relative' }}>
            <h2 className="lp-h2" style={{ fontSize: 'clamp(46px, 8vw, 104px)' }}>La prossima decisione<br /><span style={{ color: '#C8F25A' }}>è qui.</span></h2>
            <p className="lp-lead" style={{ margin: '24px auto 0' }}>Inizia gratis. Il tuo coach ti aspetta.</p>
            <div className="lp-hero-cta" style={{ animation: 'none' }}>
              <button className="lp-btn lp-btn-lime lp-btn-lg" onClick={onStart}>Prova MYND <ArrowRight size={18} /></button>
              <button className="lp-btn lp-btn-glass lp-btn-lg" onClick={onLogin}>Accedi</button>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <Logo size={15} />
          <nav aria-label="Informazioni">
            <a href="/info.html">Cos'è MYND</a>
            <a href="/privacy.html">Privacy</a>
            <a href="/termini.html">Termini</a>
            <a href="/cookie.html">Cookie</a>
            <a href="/note-legali.html">Note legali</a>
            <a href="/recesso.html">Recesso</a>
          </nav>
          <p style={{ marginTop: 14 }}>© {new Date().getFullYear()} MYND · Make Your Next Decision.</p>
        </div>
      </footer>
    </div>
  );
}

// A clock that runs, for the Timer card.
function Clock() {
  const [s, setS] = useState(47 * 60 + 12);
  useEffect(() => { const id = window.setInterval(() => setS(x => x + 1), 1000); return () => window.clearInterval(id); }, []);
  const two = (n: number) => String(n).padStart(2, '0');
  return <>{two(Math.floor(s / 3600))}:{two(Math.floor(s / 60) % 60)}:{two(s % 60)}</>;
}

// A number that counts up when it comes into view.
function Stat({ value, label }: { value: number; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const node = el.current;
    if (!node || value === 0) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (t: number) => { const p = Math.min(1, (t - start) / 1200); setN(Math.round(value * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    io.observe(node);
    return () => io.disconnect();
  }, [value]);
  return <div ref={el} className="lp-stat"><b>{n}</b><span>{label}</span></div>;
}

// The coach conversation, typed live once it is in view.
function TypedChat({ messages }: { messages: { me?: boolean; text: string }[] }) {
  const el = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setStarted(true); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(node);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!started || shown >= messages.length) return;
    const next = messages[shown];
    if (next.me) { const id = window.setTimeout(() => setShown(s => s + 1), shown ? 900 : 300); return () => window.clearTimeout(id); }
    setTyping(true);
    const id = window.setTimeout(() => { setTyping(false); setShown(s => s + 1); }, 1300);
    return () => window.clearTimeout(id);
  }, [started, shown, messages]);
  return (
    <div className="lp-chat" ref={el} style={{ minHeight: 330 }}>
      {messages.slice(0, shown).map((m, i) => <div key={i} className={`lp-bub show ${m.me ? 'me' : 'ai'}`}>{m.text}</div>)}
      {typing && <div className="lp-bub ai show lp-typing"><i /><i /><i /></div>}
    </div>
  );
}

// The screen of the phone in the story, one per step.
function StoryScreen({ screen, active }: { screen: Screen; active: boolean }) {
  const a = active ? 'go' : '';
  switch (screen) {
    case 'tasks':
      return (
        <div className={`lp-ps ${a}`}>
          <p className="lp-ps-title">Impegni</p>
          {[['Verifica di Storia', 'Gio 9:00', '#D595B0', 'Importante'], ['Allenamento', 'Mar 18:00', '#6BBDAB', 'Ogni mar · fino a giu'], ['Esercizi di Fisica', 'Mer', '#83AFDF', 'p. 112'], ['Lezione di chitarra', 'Ven 17:30', '#C9A46C', 'Ogni ven']].map(([t, w, c, tag], i) => (
            <div key={t} className="lp-ps-row" style={{ ['--c' as string]: c, ['--i' as string]: i } as React.CSSProperties}>
              <div><b>{t}</b><small>{w}</small></div><em>{tag.startsWith('Ogni') ? <><Repeat size={10} /> {tag}</> : tag}</em>
            </div>
          ))}
        </div>
      );
    case 'plan':
      return (
        <div className={`lp-ps ${a}`}>
          <p className="lp-ps-title">Cosa studiare adesso</p>
          {[['Storia · cap. 4', 'Verifica tra 2 giorni', 96], ['Matematica · equazioni', 'Media 5,8: si recupera', 78], ['Inglese · lessico', 'Ripasso leggero', 40]].map(([t, why, v], i) => (
            <div key={t as string} className="lp-ps-plan" style={{ ['--i' as string]: i } as React.CSSProperties}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{t}</b><span>{i === 0 ? '30 min' : i === 1 ? '45 min' : '15 min'}</span></div>
              <small>{why}</small>
              <div className="lp-meter"><i style={{ ['--v' as string]: `${v}%`, ['--d' as string]: `${0.2 + (i as number) * 0.15}s` } as React.CSSProperties} /></div>
            </div>
          ))}
        </div>
      );
    case 'coach':
      return (
        <div className={`lp-ps ${a}`}>
          <p className="lp-ps-title">Coach · Storia, cap. 4</p>
          <div className="lp-ps-bub me" style={{ ['--i' as string]: 0 } as React.CSSProperties}>Non capisco il Congresso di Vienna</div>
          <div className="lp-ps-bub" style={{ ['--i' as string]: 1 } as React.CSSProperties}>Immagina una partita finita: cosa vorrebbero i vincitori? 🤔</div>
          <div className="lp-ps-bub me" style={{ ['--i' as string]: 2 } as React.CSSProperties}>Rimettere le cose come prima?</div>
          <div className="lp-ps-bub" style={{ ['--i' as string]: 3 } as React.CSSProperties}>Esatto: è la Restaurazione! 📖 dal file "Storia", pag. 84</div>
        </div>
      );
    case 'train':
      return (
        <div className={`lp-ps ${a}`}>
          <p className="lp-ps-title">Interrogazione</p>
          <div className="lp-flip" style={{ marginTop: 6 }}><div className="lp-flip-in"><div className="front">Chi guidava il Congresso di Vienna?</div><div className="back">Il principe di Metternich, per l'Austria.</div></div></div>
          <div className="lp-ps-score"><span>Risposte giuste</span><b>4/5</b></div>
          <div className="lp-meter"><i style={{ ['--v' as string]: '80%', ['--d' as string]: '.3s' } as React.CSSProperties} /></div>
          <small className="lp-ps-note">Da ripassare: la Santa Alleanza</small>
        </div>
      );
    case 'progress':
      return (
        <div className={`lp-ps ${a}`}>
          <p className="lp-ps-title">Questa settimana</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <svg className="lp-ring sm" viewBox="0 0 100 100"><circle className="bg" cx="50" cy="50" r="40" /><circle className="fg" cx="50" cy="50" r="40" /></svg>
            <div><b style={{ fontSize: 22 }}>11,2 h</b><small style={{ display: 'block', color: '#8C9197' }}>su 15 h di obiettivo</small></div>
          </div>
          <div className="lp-bars" style={{ height: 70 }}>{[50, 72, 40, 88, 64, 30, 76].map((h, i) => <span key={i} style={{ height: `${h}%`, animationDelay: `${0.15 + i * 0.07}s` }} />)}</div>
          <div className="lp-ps-score"><span>Media di Matematica</span><b className="up">5,8 → 6,6</b></div>
        </div>
      );
  }
}
