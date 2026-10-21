import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Eye, Mic, Volume2, ShieldCheck, Smartphone, Lock, Check } from 'lucide-react';
import Logo from './Logo';
import './landing.css';

// The site before the login (myndspace.world): what MYND is, in the quiet style of the app.
// "Prova MYND" opens the sign-up, "Accedi" the login, "Guarda la demo" the app with example data.

interface Props {
  onStart: () => void;
  onLogin: () => void;
  onDemo: () => void;
}

const STATEMENT = 'Non un\'altra app di appunti. Un sistema che pensa con te: cosa studiare, quando, e per quanto. Ogni giorno, la prossima decisione giusta.'.split(' ');
const LIME_WORDS = new Set(['pensa', 'con', 'te:', 'prossima', 'decisione', 'giusta.']);
const KINDS = ['🎒 Scuola superiore', '🎓 Università', '💻 Scuola online', '📝 Test d\'ingresso', '📚 Scuola media', '✨ A modo tuo'];
const NAMES = ['Verifiche', 'Esami', 'Prove', 'Scadenze', 'Test'];

export default function Landing({ onStart, onLogin, onDemo }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const words = useRef<HTMLSpanElement[]>([]);
  const [scrolled, setScrolled] = useState(false);
  const [name, setName] = useState(0);
  const [swapOut, setSwapOut] = useState(false);

  // Reveal on scroll.
  useEffect(() => {
    const els = root.current?.querySelectorAll('[data-reveal]') || [];
    const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Scroll: nav glass, hero parallax, the statement that lights up word by word.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY, vh = window.innerHeight;
      setScrolled(y > 12);
      hero.current?.style.setProperty('--p', String(Math.min(1, Math.max(0, y / (vh * 0.9)))));
      for (const w of words.current) if (w) w.classList.toggle('on', w.getBoundingClientRect().top < vh * 0.62);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame); };
  }, []);

  // The app tilts a little with the pointer.
  const tilt = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    hero.current?.style.setProperty('--rx', String(((e.clientX - r.left) / r.width - 0.5) * 8));
    hero.current?.style.setProperty('--ry', String(-((e.clientY - r.top) / r.height - 0.5) * 6));
  };

  // "Verifiche" → "Esami" → …: the names change with the kind of student.
  useEffect(() => {
    const id = window.setInterval(() => {
      setSwapOut(true);
      window.setTimeout(() => { setName(n => (n + 1) % NAMES.length); setSwapOut(false); }, 380);
    }, 2200);
    return () => window.clearInterval(id);
  }, []);

  const scrollTo = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return (
    <div className="lp" ref={root}>
      <header className={`lp-nav ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="lp-wrap lp-nav-in">
          <a href="/" aria-label="MYND" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Logo size={19} /></a>
          <nav className="lp-nav-links" aria-label="Sezioni">
            <a href="#funzioni" onClick={scrollTo('funzioni')}>Funzioni</a>
            <a href="#ai" onClick={scrollTo('ai')}>Guida AI</a>
            <a href="#su-misura" onClick={scrollTo('su-misura')}>Su misura</a>
            <a href="#ovunque" onClick={scrollTo('ovunque')}>Ovunque</a>
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
              <span className="lp-line"><span>Il tuo studio.</span></span>
              <span className="lp-line"><span>Finalmente in <span className="lp-y">ordine</span>.</span></span>
            </h1>
            <p className="lp-sub">Impegni, voti, tempo di studio e un tutor AI che conosce il tuo materiale. Un unico spazio che ti dice sempre cosa fare adesso.</p>
            <div className="lp-hero-cta">
              <button className="lp-btn lp-btn-lime lp-btn-lg" onClick={onStart}>Prova MYND <ArrowRight size={18} /></button>
              <button className="lp-btn lp-btn-glass lp-btn-lg" onClick={onDemo}><Eye size={18} /> Guarda la demo</button>
            </div>
          </div>

          <div className="lp-stage" aria-hidden>
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

        {/* ---- Features ---- */}
        <section className="lp-section" id="funzioni" style={{ paddingTop: 40 }}>
          <div className="lp-wrap">
            <div data-reveal>
              <p className="lp-kicker">Tutto quello che ti serve</p>
              <h2 className="lp-h2">Un solo spazio.<br /><span className="dim">Nessun caos.</span></h2>
            </div>
            <div className="lp-bento">
              <article className="lp-tile lp-w3" data-reveal>
                <h3>Impegni e calendario.</h3>
                <p>Verifiche, compiti, allenamenti. Anche ripetuti: «ogni martedì alle 18, fino a giugno».</p>
                <div className="lp-tile-art">
                  <div className="lp-cal">
                    {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((d, i) => <b key={i}>{d}</b>)}
                    {Array.from({ length: 28 }, (_, i) => {
                      const rep = i % 7 === 1 || i % 7 === 3;
                      return <span key={i} className={rep ? 'rep' : ''} style={{ ['--d' as string]: `${0.3 + i * 0.03}s` } as React.CSSProperties}>{i + 1}</span>;
                    })}
                  </div>
                </div>
              </article>

              <article className="lp-tile lp-w3" data-reveal style={{ ['--d' as string]: '.1s' } as React.CSSProperties}>
                <h3>Timer Studio.</h3>
                <p>Il tempo che conta, materia per materia. Con statistiche che ti dicono come stai andando davvero.</p>
                <div className="lp-tile-art">
                  <div className="lp-timer"><span className="lp-dot" /><span className="lp-clock">00:47:12</span></div>
                  <div className="lp-bars on-reveal" style={{ height: 60 }}>{[40, 75, 55, 90, 65].map((h, i) => <span key={i} style={{ height: `${h}%`, animationDelay: `${0.2 + i * 0.1}s` }} />)}</div>
                </div>
              </article>

              <article className="lp-tile lp-w2" data-reveal>
                <h3>Voti e medie.</h3>
                <p>Scuola o università: medie, CFU e base di laurea, sempre aggiornate.</p>
                <div className="lp-tile-art">
                  <svg className="lp-chart" viewBox="0 0 300 120" width="100%" height="120">
                    <defs><linearGradient id="lpArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="rgba(200,242,90,.35)" /><stop offset="1" stopColor="rgba(200,242,90,0)" /></linearGradient></defs>
                    <path className="area" d="M0,95 C40,90 60,70 100,74 C140,78 160,50 200,46 C240,42 260,24 300,18 L300,120 L0,120 Z" />
                    <path className="line" d="M0,95 C40,90 60,70 100,74 C140,78 160,50 200,46 C240,42 260,24 300,18" />
                  </svg>
                </div>
              </article>

              <article className="lp-tile lp-w2" data-reveal style={{ ['--d' as string]: '.1s' } as React.CSSProperties}>
                <h3>Archivio.</h3>
                <p>PDF, foto del libro, appunti. Anche da Google Drive. Tutto pronto per studiare.</p>
                <div className="lp-tile-art">
                  <div className="lp-files">
                    {[['PDF', '#E8685B', '-90px', '-12deg', '.1s'], ['FOTO', '#83AFDF', '0px', '0deg', '0s'], ['DOC', '#C8F25A', '90px', '12deg', '.2s']].map(([t, c, x, r, d]) => (
                      <div key={t} className="lp-file" style={{ ['--c' as string]: c, ['--x' as string]: x, ['--r' as string]: r, ['--d' as string]: d } as React.CSSProperties}><b>{t}</b><i /><i /><i style={{ width: '60%' }} /></div>
                    ))}
                  </div>
                </div>
              </article>

              <article className="lp-tile lp-w2" data-reveal style={{ ['--d' as string]: '.2s' } as React.CSSProperties}>
                <h3>Cosa studiare.</h3>
                <p>Ogni giorno MYND ti dice da dove partire, in base a scadenze e voti.</p>
                <div className="lp-tile-art">
                  {([['Matematica', 92], ['Storia', 64], ['Inglese', 38]] as [string, number][]).map(([sub, v], i) => (
                    <div key={sub} style={{ marginTop: i ? 12 : 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#A3A8AE' }}><span>{sub}</span><span>{v}%</span></div>
                      <div className="lp-meter"><i style={{ ['--v' as string]: `${v}%`, ['--d' as string]: `${0.3 + i * 0.15}s` } as React.CSSProperties} /></div>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ---- AI ---- */}
        <section className="lp-section" id="ai">
          <div className="lp-wrap lp-split">
            <div data-reveal>
              <p className="lp-kicker">Guida Studio AI</p>
              <h2 className="lp-h2">Studia sul<br />tuo materiale.</h2>
              <p className="lp-lead">Carichi PDF e foto del libro, chiedi. Riassunti, schemi, flashcard, interrogazioni: risponde in base a ciò che studi tu, e ti mostra dove l'ha trovato.</p>
              <ul className="lp-points">
                <li><span><Mic size={14} /></span><span><b>Parli.</b> Detti la domanda invece di scriverla.</span></li>
                <li><span><Volume2 size={14} /></span><span><b>Ascolti.</b> Le risposte lette ad alta voce, a mani libere.</span></li>
              </ul>
            </div>
            <div className="lp-panel" data-reveal style={{ ['--d' as string]: '.15s' } as React.CSSProperties}>
              <div className="lp-chat">
                <div className="lp-bub me" style={{ ['--d' as string]: '.3s' } as React.CSSProperties}>Interrogami sul capitolo 4 di storia</div>
                <div className="lp-bub ai" style={{ ['--d' as string]: '1s' } as React.CSSProperties}>Partiamo: quali furono le decisioni principali del Congresso di Vienna? 📜</div>
                <div className="lp-bub me" style={{ ['--d' as string]: '1.8s' } as React.CSSProperties}>Restaurazione, equilibrio tra le potenze…</div>
                <div className="lp-bub ai" style={{ ['--d' as string]: '2.6s' } as React.CSSProperties}>Ottimo! Aggiungi la Santa Alleanza e sei da 9. Prossima domanda?</div>
              </div>
              <div className="lp-voice"><span className="lp-wave">{[0, 1, 2, 3, 4].map(i => <i key={i} style={{ ['--i' as string]: i } as React.CSSProperties} />)}</span> Sto leggendo la risposta…</div>
            </div>
          </div>
        </section>

        {/* ---- For every student ---- */}
        <section className="lp-section lp-center">
          <div className="lp-wrap" data-reveal>
            <p className="lp-kicker">Per ogni studente</p>
            <h2 className="lp-h2">MYND si adatta<br /><span className="dim">a te.</span></h2>
            <p className="lp-lead">Superiori, università, scuola online, test d'ingresso. Cambiano le sezioni, i voti, perfino i nomi: le tue <span className={`lp-swap ${swapOut ? 'out' : ''}`}>{NAMES[name]}</span>, non le nostre.</p>
          </div>
          <div className="lp-marquee" aria-hidden>
            <div>{[...KINDS, ...KINDS, ...KINDS, ...KINDS].map((k, i) => <span key={i} className="lp-chip">{k}</span>)}</div>
          </div>
        </section>

        {/* ---- On measure ---- */}
        <section className="lp-section" id="su-misura">
          <div className="lp-wrap lp-split">
            <div className="lp-panel" data-reveal>
              <div className="lp-chat">
                <div className="lp-bub me" style={{ ['--d' as string]: '.3s' } as React.CSSProperties}>Nel Timer vorrei il metodo Pomodoro</div>
                <div className="lp-bub ai" style={{ ['--d' as string]: '1s' } as React.CSSProperties}>Ecco la proposta: cicli di studio e pausa dentro il tuo Timer, con il tempo che va nelle statistiche. Confermi?</div>
              </div>
              <div className="lp-proposal" style={{ ['--d' as string]: '1.7s' } as React.CSSProperties}>
                <b>⏱ Timer Pomodoro</b>
                <span style={{ color: '#8C9197' }}>In cima al Timer Studio · usa 1 personalizzazione</span>
                <div className="lp-sent"><Check size={15} /> Richiesta inviata: la trovi presto nella tua MYND</div>
              </div>
            </div>
            <div data-reveal style={{ ['--d' as string]: '.15s' } as React.CSSProperties}>
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
            <div className="lp-devices" data-reveal style={{ ['--d' as string]: '.1s' } as React.CSSProperties} aria-hidden>
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

        {/* ---- Final ---- */}
        <section className="lp-final">
          <div className="lp-wrap" data-reveal style={{ position: 'relative' }}>
            <h2 className="lp-h2" style={{ fontSize: 'clamp(46px, 8vw, 104px)' }}>La prossima decisione<br /><span style={{ color: '#C8F25A' }}>è qui.</span></h2>
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
