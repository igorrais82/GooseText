import type { Toast } from '../types';
import { Icon } from './Icon';
import { GooseMark } from './Goose';

const ICONS = {
  info: 'info',
  success: 'check',
  error: 'alert',
  goose: 'bell',
} as const;

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.kind}`}>
          <span className="toast__icon">
            {toast.kind === 'goose' ? <GooseMark size={20} /> : <Icon name={ICONS[toast.kind]} size={16} />}
          </span>
          <span className="toast__text">{toast.text}</span>
          {toast.action && (
            <button
              className="toast__action"
              onClick={() => {
                toast.action?.run();
                onDismiss(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button className="toast__close" onClick={() => onDismiss(toast.id)} aria-label="Скрыть">
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
