import { useId } from 'react';

export type GooseMood = 'idle' | 'happy' | 'thinking' | 'listening' | 'sleepy' | 'worried';

interface GooseProps {
  size?: number;
  mood?: GooseMood;
  className?: string;
  /** Показывать «пузырь» речи рядом с гусем */
  floating?: boolean;
}

const BODY = '#ffffff';
const BEAK = '#f97316';

/**
 * Нарисованный гусь Гоша — маскот GooseText.
 * Плоская векторная графика: белое тело и оранжевый клюв, без градиентов.
 */
export function Goose({ size = 180, mood = 'idle', className = '', floating = false }: GooseProps) {
  const eyeOpen = mood !== 'sleepy' && mood !== 'happy';
  const pupil = mood === 'thinking' ? { dx: 2.2, dy: -1.4 } : mood === 'listening' ? { dx: 0, dy: -2 } : { dx: 0, dy: 0 };

  return (
    <svg
      className={`goose goose--${mood} ${floating ? 'goose--floating' : ''} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label="Гусь Гоша — маскот GooseText"
    >
      {/* тень */}
      <ellipse cx="100" cy="181" rx="48" ry="6" fill="#f97316" opacity="0.12" />

      <g className="goose__body">
        {/* хвост */}
        <path d="M56 130 L30 118 Q36 132 40 140 Z" fill={BODY} />

        {/* шея — рисуется до тела, чтобы силуэт переходил плавно */}
        <path d="M114 136 C 124 108 128 88 126 70 L 150 70 C 150 92 148 118 142 140 Z" fill={BODY} />

        {/* тело */}
        <ellipse cx="97" cy="137" rx="53" ry="39" fill={BODY} />

        {/* шарф */}
        <path d="M113 100 Q 132 112 152 104 L 155 116 Q 132 124 110 112 Z" fill={BEAK} />
        <path d="M146 110 Q 154 118 152 132 L 142 130 Q 145 118 139 112 Z" fill={BEAK} />

        {/* крыло */}
        <ellipse cx="88" cy="144" rx="26" ry="19" fill="#fff7ef" />
        <path
          d="M68 140 Q 86 132 106 142 M70 148 Q 88 142 106 150"
          stroke="#f7dcc6"
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
        />

        {/* голова */}
        <circle cx="137" cy="62" r="21" fill={BODY} />

        {/* клюв */}
        <path d="M152 50 C 171 51 185 56 191 63 C 185 71 168 75 152 72 Z" fill={BEAK} />
        <path d="M154 62 C 168 62 180 62 190 63" stroke="#c2410c" strokeWidth="1.6" opacity="0.45" strokeLinecap="round" />

        {/* румянец */}
        {(mood === 'happy' || mood === 'listening') && (
          <ellipse cx="150" cy="74" rx="7" ry="4" fill="#f9a8a8" opacity="0.5" />
        )}

        {/* глаз */}
        {eyeOpen ? (
          <g>
            <circle cx={142 + pupil.dx} cy={54 + pupil.dy} r="4" fill="#2b1d15" />
            <circle cx={143.4 + pupil.dx} cy={52.6 + pupil.dy} r="1.4" fill="#fff" />
            <rect
              className="goose__lid"
              x="136"
              y="48"
              width="12"
              height="13"
              rx="6"
              fill={BODY}
              opacity="0"
            />
            {mood === 'worried' && (
              <path d="M136 46 Q 142 43 148 46" stroke="#2b1d15" strokeWidth="2" fill="none" strokeLinecap="round" />
            )}
          </g>
        ) : mood === 'happy' ? (
          <path d="M137 56 Q 141 51 146 55" stroke="#2b1d15" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M137 55 Q 142 59 147 55" stroke="#2b1d15" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        )}

        {/* лапы */}
        <path d="M84 172 L78 181 L96 181 Z" fill={BEAK} />
        <path d="M112 172 L106 181 L124 181 Z" fill={BEAK} />
      </g>

      {/* «мысли» для состояния thinking */}
      {mood === 'thinking' && (
        <g className="goose__thoughts" fill={BEAK}>
          <circle cx="170" cy="42" r="3" opacity="0.5" />
          <circle cx="178" cy="32" r="4" opacity="0.35" />
          <circle cx="188" cy="20" r="5" opacity="0.2" />
        </g>
      )}

      {/* звуковые волны для диктовки */}
      {mood === 'listening' && (
        <g className="goose__waves" stroke={BEAK} strokeWidth="3" fill="none" strokeLinecap="round">
          <path d="M170 48 Q176 56 170 66" opacity="0.8" />
          <path d="M180 40 Q190 56 180 74" opacity="0.45" />
        </g>
      )}
    </svg>
  );
}

/** Логотип GooseText: буква G, которая заканчивается головой гуся. */
export function GooseMark({ size = 34 }: { size?: number }) {
  const id = useId().replace(/[:]/g, '');
  const gradientId = `goose-mark-${id}`;
  const shineId = `goose-shine-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true" className="goose-mark">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFC48A" />
          <stop offset="0.45" stopColor="#F97316" />
          <stop offset="1" stopColor="#B23A0C" />
        </linearGradient>
        <radialGradient id={shineId} cx="0.28" cy="0.18" r="0.85">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.34" />
          <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="200" height="200" rx="47" fill={`url(#${gradientId})`} />
      <rect width="200" height="200" rx="47" fill={`url(#${shineId})`} />
      <rect x="1.5" y="1.5" width="197" height="197" rx="45.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="2" />

      {/* буква G: дуга и перекладина */}
      <path
        d="M136 69 A56 56 0 1 0 148 104"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="25"
        strokeLinecap="round"
      />
      <rect x="92" y="95" width="61" height="20" rx="10" fill="#FFFFFF" />

      {/* голова гуся на верхнем конце дуги */}
      <path d="M140 69 L176 77 L140 85 Z" fill="#7C2D12" />
      <circle cx="126" cy="77" r="19" fill="#FFFFFF" />
      <path d="M148 77 H170" stroke="#FFEDD5" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
      <circle cx="119" cy="67" r="3.6" fill="#7C2D12" />
      <circle cx="120.5" cy="65.7" r="1.2" fill="#FFFFFF" />
    </svg>
  );
}
