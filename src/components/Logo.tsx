// The MYND logo: the word in the system font, with only the Y in lime (var(--logo-y), solid, never a gradient).
// mono: one colour only, the Y takes the same colour as the other letters.
interface LogoProps {
  variant?: 'horizontal' | 'stacked';
  size?: number;        // font size in px
  slogan?: boolean;     // "Make Your Next Decision" next to / under the logo
  mono?: boolean;
  className?: string;
}

export default function Logo({ variant = 'horizontal', size = 17, slogan = false, mono = false, className = '' }: LogoProps) {
  const small = size < 40;
  const Y = <span style={{ color: mono ? 'inherit' : 'var(--logo-y)' }}>Y</span>;
  const word = variant === 'stacked'
    ? (
      <span className="inline-flex flex-col" style={{ lineHeight: 0.84 }}>
        <span>M{Y}</span>
        <span>ND</span>
      </span>
    )
    : <span>M{Y}ND</span>;
  return (
    <span className={`inline-flex items-center gap-4 ${variant === 'stacked' && slogan ? 'flex-col' : ''} ${className}`} aria-label="MYND" role="img">
      <span style={{ fontSize: size, fontWeight: small ? 600 : 500, letterSpacing: small ? '-0.03em' : '-0.04em', lineHeight: 1, color: 'var(--text)' }} aria-hidden>
        {word}
      </span>
      {slogan && (
        <>
          {variant === 'horizontal' && <span className="w-px h-8" style={{ background: 'var(--border)' }} aria-hidden />}
          <span className="uppercase" style={{ fontSize: 12, letterSpacing: '0.26em', lineHeight: 1.6, color: 'var(--text-muted)' }} aria-hidden>
            {variant === 'horizontal' ? <>Make Your<br />Next Decision</> : 'Make Your Next Decision'}
          </span>
        </>
      )}
    </span>
  );
}
