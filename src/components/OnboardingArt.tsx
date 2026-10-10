import React from 'react';

// Illustrations of the "Crea la tua MYND" guide: small drawings of each section, in SVG, colored
// with the theme tokens (so they follow light and dark mode) and the subject palette.

const C = {
  surf: 'var(--surface)', well: 'var(--glass-well)', text: 'var(--text)', muted: 'var(--text-muted)', sub: 'var(--text-subtle)',
  border: 'var(--border)', brand: 'var(--brand-fill)', ring: 'var(--brand-ring)', onBrand: 'var(--on-brand)',
};
const P = ['#83AFDF', '#ABA1DD', '#6BBDAB', '#C9A46C', '#8CB987', '#D595B0', '#6AB7D1', '#D89B7C', '#98A8E1', '#DC9693'];

type Box = { x: number; y: number; w: number; h: number; r?: number; fill?: string; stroke?: string; o?: number };
const Rect = ({ x, y, w, h, r = 14, fill = C.surf, stroke, o }: Box) => (
  <rect x={x} y={y} width={w} height={h} rx={r} style={{ fill, stroke, strokeWidth: stroke ? 1 : 0, opacity: o }} />
);
const Card = (b: Box) => <Rect r={18} stroke={C.border} {...b} />;
// A placeholder line of text.
const Line = ({ x, y, w, o = 0.45, fill = C.sub, h = 7 }: { x: number; y: number; w: number; o?: number; fill?: string; h?: number }) => (
  <rect x={x} y={y} width={w} height={h} rx={h / 2} style={{ fill, opacity: o }} />
);
const Dot = ({ x, y, r = 5, fill }: { x: number; y: number; r?: number; fill: string }) => <circle cx={x} cy={y} r={r} style={{ fill }} />;
const T = ({ x, y, size = 14, fill = C.text, weight = 600, anchor = 'start', children }: { x: number; y: number; size?: number; fill?: string; weight?: number; anchor?: 'start' | 'middle' | 'end'; children: React.ReactNode }) => (
  <text x={x} y={y} textAnchor={anchor} style={{ fill, fontSize: size, fontWeight: weight, fontFamily: 'inherit', letterSpacing: '-0.02em' }}>{children}</text>
);
const Check = ({ x, y, r = 9 }: { x: number; y: number; r?: number }) => (
  <g>
    <circle cx={x} cy={y} r={r} style={{ fill: C.brand }} />
    <path d={`M${x - r * 0.42} ${y} l${r * 0.3} ${r * 0.32} l${r * 0.55} -${r * 0.62}`} style={{ fill: 'none', stroke: C.onBrand, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
  </g>
);
const Glow = ({ x, y, r, fill = C.brand, o = 0.18 }: { x: number; y: number; r: number; fill?: string; o?: number }) => (
  <circle cx={x} cy={y} r={r} style={{ fill, opacity: o, filter: 'blur(28px)' }} />
);

function Intro() {
  return (
    <g>
      <Glow x={200} y={150} r={90} />
      <Card x={18} y={40} w={118} h={62} />
      <Check x={40} y={62} /><Line x={56} y={58} w={64} /><Line x={32} y={82} w={88} o={0.25} />
      <Card x={276} y={34} w={104} h={74} />
      <T x={294} y={70} size={30} weight={800}>8</T><T x={318} y={70} size={12} fill={C.sub}>media</T><Line x={294} y={84} w={68} fill={P[2]} o={0.9} />
      <Card x={26} y={196} w={110} h={76} />
      <circle cx={60} cy={234} r={20} style={{ fill: 'none', stroke: C.border, strokeWidth: 6 }} />
      <circle cx={60} cy={234} r={20} style={{ fill: 'none', stroke: C.brand, strokeWidth: 6, strokeDasharray: '88 126', strokeLinecap: 'round', transform: 'rotate(-90deg)', transformOrigin: '60px 234px' }} />
      <Line x={90} y={226} w={34} /><Line x={90} y={240} w={24} o={0.25} />
      <Card x={268} y={190} w={112} h={84} />
      {[0, 1, 2].map(i => <g key={i}><Dot x={286} y={212 + i * 22} fill={P[i * 3]} /><Line x={298} y={208 + i * 22} w={66 - i * 10} /></g>)}
      <Card x={120} y={70} w={160} h={160} r={36} />
      <T x={200} y={140} size={40} weight={800} anchor="middle">M<tspan style={{ fill: C.ring }}>Y</tspan></T>
      <T x={200} y={182} size={40} weight={800} anchor="middle">ND</T>
    </g>
  );
}

function AI() {
  return (
    <g>
      <Glow x={290} y={110} r={80} fill={P[1]} o={0.2} />
      <Card x={40} y={44} w={150} h={196} r={24} />
      <Rect x={56} y={62} w={118} h={90} r={10} fill={C.well} />
      {[0, 1, 2, 3].map(i => <Line key={i} x={66} y={74 + i * 18} w={[90, 70, 96, 60][i]} o={0.35} />)}
      <circle cx={115} cy={196} r={22} style={{ fill: C.brand }} />
      <circle cx={115} cy={196} r={9} style={{ fill: 'none', stroke: C.onBrand, strokeWidth: 3 }} />
      <path d="M200 140 h40" style={{ stroke: C.ring, strokeWidth: 3, strokeDasharray: '4 6', strokeLinecap: 'round' }} />
      <path d="M236 132 l10 8 l-10 8" style={{ fill: 'none', stroke: C.ring, strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
      <Card x={252} y={60} w={128} h={170} r={22} />
      <path d="M316 82 l5 11 l11 5 l-11 5 l-5 11 l-5 -11 l-11 -5 l11 -5 z" style={{ fill: C.ring }} />
      {['Matematica', 'Inglese', 'Storia'].map((n, i) => (
        <g key={n}><Rect x={266} y={128 + i * 30} w={100} h={22} r={11} fill={C.well} /><Dot x={280} y={139 + i * 30} r={5} fill={P[i * 2]} /><T x={290} y={144 + i * 30} size={11} weight={500}>{n}</T></g>
      ))}
    </g>
  );
}

function Subjects() {
  const names = ['Matematica', 'Italiano', 'Storia', 'Inglese', 'Fisica', 'Scienze', 'Arte', 'Latino'];
  const pos = [[30, 60], [178, 46], [300, 84], [60, 126], [206, 118], [36, 194], [160, 186], [270, 168]];
  return (
    <g>
      <Glow x={200} y={150} r={100} fill={P[0]} o={0.16} />
      {names.map((n, i) => {
        const w = n.length * 8.4 + 46;
        const [x, y] = pos[i];
        return (
          <g key={n}>
            <Rect x={x} y={y} w={Math.min(w, 400 - x - 10)} h={40} r={20} fill={C.surf} stroke={C.border} />
            <Dot x={x + 20} y={y + 20} r={9} fill={P[i]} />
            <T x={x + 36} y={y + 25} size={14} weight={500}>{n}</T>
          </g>
        );
      })}
      <Card x={250} y={226} w={124} h={50} />
      <Rect x={262} y={238} w={26} h={26} r={8} fill={C.brand} />
      <T x={275} y={256} size={16} weight={800} anchor="middle" fill={C.onBrand}>+</T>
      <Line x={298} y={244} w={60} /><Line x={298} y={258} w={40} o={0.25} />
    </g>
  );
}

function Tasks() {
  const rows = [['Verifica di Matematica', P[0], 'oggi', true], ['Interrogazione di Storia', P[2], 'gio', false], ['Compito di Inglese', P[3], 'ven', false], ['Allenamento', P[5], 'sab', false]] as const;
  return (
    <g>
      <Glow x={120} y={70} r={80} />
      <Card x={30} y={34} w={340} h={232} r={26} />
      <T x={54} y={70} size={18} weight={700}>Prossimi impegni</T>
      {rows.map(([t, c, d, hot], i) => (
        <g key={t}>
          <Rect x={46} y={88 + i * 42} w={308} h={34} r={12} fill={C.well} />
          <circle cx={66} cy={105 + i * 42} r={8} style={{ fill: 'none', stroke: i === 3 ? C.brand : C.sub, strokeWidth: 1.6 }} />
          {i === 3 && <Check x={66} y={105 + i * 42} r={8} />}
          <Dot x={86} y={105 + i * 42} r={4} fill={c} />
          <T x={96} y={110 + i * 42} size={12.5} weight={500}>{t}</T>
          <Rect x={306} y={95 + i * 42} w={38} h={20} r={10} fill={hot ? C.brand : C.surf} />
          <T x={325} y={109 + i * 42} size={10.5} weight={700} anchor="middle" fill={hot ? C.onBrand : C.muted}>{d}</T>
        </g>
      ))}
    </g>
  );
}

function TasksQ() {
  return (
    <g>
      <Glow x={280} y={200} r={90} fill={P[2]} o={0.16} />
      <Card x={36} y={50} w={150} h={180} r={26} />
      <Rect x={36} y={50} w={150} h={50} r={26} fill={C.brand} />
      <Rect x={36} y={76} w={150} h={24} r={0} fill={C.brand} />
      <T x={111} y={84} size={16} weight={800} anchor="middle" fill={C.onBrand}>DICEMBRE</T>
      <T x={111} y={176} size={64} weight={800} anchor="middle">15</T>
      <T x={111} y={206} size={13} weight={500} anchor="middle" fill={C.sub}>martedì</T>
      <Card x={206} y={70} w={170} h={64} />
      <Dot x={226} y={92} r={6} fill={P[0]} /><T x={240} y={97} size={13}>Verifica</T><Line x={226} y={112} w={110} o={0.3} />
      <Card x={206} y={148} w={170} h={64} />
      <Dot x={226} y={170} r={6} fill={P[2]} /><T x={240} y={175} size={13}>Interrogazione</T><Line x={226} y={190} w={90} o={0.3} />
    </g>
  );
}

function Grades() {
  const bars = [7.8, 6.2, 8.5, 5.4, 7.1];
  return (
    <g>
      <Glow x={100} y={100} r={80} />
      <Card x={30} y={40} w={340} h={220} r={26} />
      <circle cx={100} cy={128} r={46} style={{ fill: 'none', stroke: C.border, strokeWidth: 10 }} />
      <circle cx={100} cy={128} r={46} style={{ fill: 'none', stroke: C.brand, strokeWidth: 10, strokeDasharray: '210 289', strokeLinecap: 'round', transform: 'rotate(-90deg)', transformOrigin: '100px 128px' }} />
      <T x={100} y={136} size={26} weight={800} anchor="middle">7,3</T>
      <T x={100} y={204} size={12} anchor="middle" fill={C.sub} weight={500}>media generale</T>
      {bars.map((v, i) => {
        const h = v * 15;
        return (
          <g key={i}>
            <Rect x={184 + i * 34} y={226 - h} w={22} h={h} r={8} fill={P[i * 2]} o={v < 6 ? 0.55 : 1} />
            <T x={195 + i * 34} y={244} size={10} anchor="middle" fill={C.sub}>{['MAT', 'ITA', 'STO', 'FIS', 'ING'][i]}</T>
          </g>
        );
      })}
      <path d="M180 136 H360" style={{ stroke: C.sub, strokeWidth: 1, strokeDasharray: '3 5', opacity: 0.6 }} />
    </g>
  );
}

function GradesQ() {
  const rows: [string, string][] = [['Matematica', '7½'], ['Italiano', '6+'], ['Storia', '8'], ['Inglese', '7']];
  return (
    <g>
      <Glow x={300} y={90} r={80} fill={P[3]} o={0.18} />
      <Card x={46} y={30} w={210} h={240} r={20} />
      <T x={66} y={64} size={15} weight={700}>Pagella</T><Line x={66} y={76} w={80} o={0.25} />
      {rows.map(([n, v], i) => (
        <g key={n}>
          <path d={`M66 ${104 + i * 40} H236`} style={{ stroke: C.border, strokeWidth: 1 }} />
          <T x={66} y={126 + i * 40} size={13} weight={500}>{n}</T>
          <T x={234} y={126 + i * 40} size={16} weight={800} anchor="end" fill={C.ring}>{v}</T>
        </g>
      ))}
      <Card x={238} y={176} w={136} h={74} r={18} />
      <Check x={262} y={200} /><T x={278} y={205} size={12} weight={600}>4 voti letti</T>
      <Line x={254} y={222} w={100} o={0.3} />
    </g>
  );
}

function Timer() {
  return (
    <g>
      <Glow x={200} y={140} r={100} />
      <circle cx={200} cy={138} r={92} style={{ fill: C.surf, stroke: C.border, strokeWidth: 1 }} />
      <circle cx={200} cy={138} r={78} style={{ fill: 'none', stroke: C.border, strokeWidth: 12 }} />
      <circle cx={200} cy={138} r={78} style={{ fill: 'none', stroke: C.brand, strokeWidth: 12, strokeDasharray: '330 490', strokeLinecap: 'round', transform: 'rotate(-90deg)', transformOrigin: '200px 138px' }} />
      <T x={200} y={146} size={30} weight={800} anchor="middle">1:24:30</T>
      <Rect x={150} y={160} w={100} h={24} r={12} fill={C.well} />
      <Dot x={166} y={172} r={5} fill={P[0]} /><T x={208} y={177} size={11} anchor="middle" weight={500}>Matematica</T>
      <Rect x={150} y={250} w={100} h={36} r={18} fill={C.brand} />
      <rect x={190} y={260} width={6} height={16} rx={2} style={{ fill: C.onBrand }} /><rect x={204} y={260} width={6} height={16} rx={2} style={{ fill: C.onBrand }} />
    </g>
  );
}

function Goal() {
  const days = [2, 1.5, 3, 0.5, 2.5, 3.5, 1];
  return (
    <g>
      <Glow x={200} y={200} r={110} />
      <Card x={30} y={40} w={340} h={220} r={26} />
      <T x={54} y={76} size={16} weight={700}>Questa settimana</T>
      <T x={346} y={76} size={14} weight={700} anchor="end" fill={C.ring}>14 / 15 h</T>
      <path d="M54 118 H346" style={{ stroke: C.ring, strokeWidth: 1.5, strokeDasharray: '5 5' }} />
      {days.map((v, i) => {
        const h = v * 30;
        return (
          <g key={i}>
            <Rect x={62 + i * 40} y={224 - h} w={24} h={h} r={8} fill={i === 5 ? C.brand : P[0]} o={i === 5 ? 1 : 0.8} />
            <T x={74 + i * 40} y={244} size={11} anchor="middle" fill={C.sub}>{'LMMGVSD'[i]}</T>
          </g>
        );
      })}
    </g>
  );
}

function Focus() {
  const rows = [['Matematica', 'Verifica tra 2 giorni', P[0]], ['Fisica', 'Media bassa (5,4)', P[4]], ['Storia', 'Non la studi da 6 giorni', P[2]]] as const;
  return (
    <g>
      <Glow x={120} y={100} r={90} />
      {rows.map(([n, why, c], i) => (
        <g key={n}>
          <Card x={30 + i * 10} y={36 + i * 78} w={340 - i * 20} h={66} r={20} fill={i === 0 ? C.brand : C.surf} stroke={i === 0 ? undefined : C.border} />
          <T x={56 + i * 10} y={76 + i * 78} size={22} weight={800} fill={i === 0 ? C.onBrand : C.sub}>{i + 1}</T>
          <Dot x={92 + i * 10} y={64 + i * 78} r={6} fill={c} />
          <T x={104 + i * 10} y={69 + i * 78} size={15} weight={700} fill={i === 0 ? C.onBrand : C.text}>{n}</T>
          <T x={92 + i * 10} y={88 + i * 78} size={11.5} weight={500} fill={i === 0 ? C.onBrand : C.sub}>{why}</T>
        </g>
      ))}
    </g>
  );
}

function ArchiveArt() {
  return (
    <g>
      <Glow x={200} y={160} r={110} fill={P[6]} o={0.16} />
      <path d="M60 96 q0 -14 14 -14 h70 l16 18 h166 q14 0 14 14 v130 q0 14 -14 14 h-252 q-14 0 -14 -14 z" style={{ fill: C.surf, stroke: C.border }} />
      {[['PDF', P[9]], ['JPG', P[0]], ['TXT', P[4]]].map(([k, c], i) => (
        <g key={k}>
          <Rect x={88 + i * 82} y={124} w={64} h={84} r={10} fill={C.well} stroke={C.border} />
          <Rect x={98 + i * 82} y={136} w={30} h={16} r={5} fill={c} />
          <T x={113 + i * 82} y={148} size={9} weight={800} anchor="middle" fill="#0A0B0C">{k}</T>
          {[0, 1, 2].map(j => <Line key={j} x={98 + i * 82} y={164 + j * 12} w={[42, 34, 40][j]} h={5} o={0.35} />)}
        </g>
      ))}
      <path d="M78 228 H330" style={{ stroke: C.brand, strokeWidth: 3, strokeLinecap: 'round', opacity: 0.9 }} />
      <path d="M318 44 l5 11 l11 5 l-11 5 l-5 11 l-5 -11 l-11 -5 l11 -5 z" style={{ fill: C.ring }} />
    </g>
  );
}

function CalendarArt() {
  const dots: Record<number, string> = { 3: P[0], 8: P[2], 11: P[3], 15: P[0], 17: P[5], 22: P[1], 26: P[4] };
  return (
    <g>
      <Glow x={280} y={90} r={90} />
      <Card x={40} y={30} w={320} h={240} r={26} />
      <T x={64} y={66} size={17} weight={700}>Dicembre</T>
      {Array.from({ length: 28 }, (_, i) => {
        const x = 64 + (i % 7) * 40, y = 84 + Math.floor(i / 7) * 42;
        const today = i === 9;
        return (
          <g key={i}>
            {today && <circle cx={x + 12} cy={y + 14} r={14} style={{ fill: C.brand }} />}
            <T x={x + 12} y={y + 19} size={12} anchor="middle" weight={today ? 800 : 500} fill={today ? C.onBrand : C.muted}>{i + 1}</T>
            {dots[i] && <Dot x={x + 12} y={y + 34} r={3.5} fill={dots[i]} />}
          </g>
        );
      })}
    </g>
  );
}

function Tutor() {
  return (
    <g>
      <Glow x={120} y={200} r={100} fill={P[1]} o={0.18} />
      <Rect x={150} y={36} w={220} h={52} r={20} fill={C.brand} />
      <T x={170} y={60} size={12.5} weight={600} fill={C.onBrand}>Mi interroghi sulla</T>
      <T x={170} y={77} size={12.5} weight={600} fill={C.onBrand}>Rivoluzione francese?</T>
      <Card x={30} y={104} w={270} h={110} r={20} />
      <path d="M50 122 l4 9 l9 4 l-9 4 l-4 9 l-4 -9 l-9 -4 l9 -4 z" style={{ fill: C.ring }} />
      <Line x={70} y={126} w={190} /><Line x={50} y={150} w={226} o={0.35} /><Line x={50} y={166} w={180} o={0.35} />
      <Rect x={50} y={184} w={120} h={18} r={9} fill={C.well} /><T x={62} y={197} size={10} fill={C.sub}>Appunti di Storia.pdf</T>
      <Card x={210} y={228} w={160} h={44} r={22} />
      <Line x={230} y={246} w={90} o={0.3} />
      <circle cx={350} cy={250} r={14} style={{ fill: C.brand }} />
    </g>
  );
}

function Menu() {
  const items = ['Impegni', 'Voti', 'Timer Studio', 'Archivio', 'Calendario'];
  return (
    <g>
      <Glow x={120} y={150} r={90} />
      <Card x={70} y={26} w={260} h={248} r={26} />
      {items.map((n, i) => {
        const on = i !== 3;
        return (
          <g key={n}>
            <T x={96} y={70 + i * 46} size={14} weight={500} fill={on ? C.text : C.sub}>{n}</T>
            <Rect x={268} y={55 + i * 46} w={40} h={22} r={11} fill={on ? C.brand : C.border} />
            <circle cx={on ? 297 : 279} cy={66 + i * 46} r={8} style={{ fill: '#fff' }} />
          </g>
        );
      })}
    </g>
  );
}

function Done() {
  return (
    <g>
      <Glow x={200} y={150} r={110} o={0.25} />
      {[[70, 70, P[0]], [330, 60, P[5]], [52, 220, P[2]], [348, 214, P[3]], [110, 40, P[1]], [300, 250, P[4]]].map(([x, y, c], i) => (
        <rect key={i} x={x as number} y={y as number} width={14} height={14} rx={4} style={{ fill: c as string, transform: `rotate(${i * 33}deg)`, transformOrigin: `${(x as number) + 7}px ${(y as number) + 7}px` }} />
      ))}
      <circle cx={200} cy={150} r={70} style={{ fill: C.brand }} />
      <path d="M168 150 l22 22 l44 -46" style={{ fill: 'none', stroke: C.onBrand, strokeWidth: 12, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
    </g>
  );
}

const ART: Record<string, () => React.ReactElement> = {
  intro: Intro, ai: AI, materie: Subjects, impegni: Tasks, 'impegni-q': TasksQ, voti: Grades, 'voti-q': GradesQ,
  timer: Timer, 'timer-q': Goal, cosa: Focus, archivio: ArchiveArt, calendario: CalendarArt, guida: Tutor, sezioni: Menu, fine: Done,
};

export default function OnboardingArt({ id, className }: { id: string; className?: string }) {
  const Art = ART[id];
  if (!Art) return null;
  return (
    <svg viewBox="0 0 400 300" className={className} role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <Art />
    </svg>
  );
}
