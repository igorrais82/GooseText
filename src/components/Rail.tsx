import type { IconName } from './Icon';
import { Icon } from './Icon';

export interface RailButtonProps {
  icon: IconName;
  label: string;
  active?: boolean;
  accent?: boolean;
  onClick: () => void;
}

export function RailButton({ icon, label, active, accent, onClick }: RailButtonProps) {
  return (
    <button
      type="button"
      className={`rail__btn ${active ? 'rail__btn--active' : ''} ${accent ? 'rail__btn--accent' : ''}`}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      <Icon name={icon} size={17} />
    </button>
  );
}

export function Rail({
  side,
  children,
}: {
  side: 'left' | 'right';
  children: React.ReactNode;
}) {
  return (
    <nav className={`rail rail--${side}`} aria-label={side === 'left' ? 'Документы и настройки' : 'Помощник'}>
      {children}
    </nav>
  );
}
