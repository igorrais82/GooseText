import { useEffect } from 'react';
import type { DocKind, Folder } from '../types';
import { KIND_META } from '../types';
import { flatFolders } from '../lib/folders';
import { Goose } from './Goose';
import { Icon, type IconName } from './Icon';

/* ------------------------------- каркас ------------------------------- */

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}

export function Modal({ title, subtitle, onClose, children, footer, wide }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal__backdrop" onClick={onClose} />
      <div className={`modal__card ${wide ? 'modal__card--wide' : ''}`}>
        <header className="modal__head">
          <div>
            <h2 className="modal__title">{title}</h2>
            {subtitle && <p className="modal__subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}

/* --------------------------- новый документ --------------------------- */

const KIND_ICON: Record<DocKind, IconName> = {
  note: 'note',
  summary: 'book',
  script: 'film',
  reminder: 'bell',
  drawing: 'brush',
};

export function NewDocDialog({
  onPick,
  onClose,
}: {
  onPick: (kind: DocKind) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Новый документ" subtitle="С чего начнём?" onClose={onClose}>
      <div className="doc-types">
        {(Object.keys(KIND_META) as DocKind[]).map((kind) => (
          <button key={kind} type="button" className={`doc-type kind--${kind}`} onClick={() => onPick(kind)}>
            <span className="doc-type__icon">
              <Icon name={KIND_ICON[kind]} size={18} />
            </span>
            <span className="doc-type__name">{KIND_META[kind].label}</span>
            <span className="doc-type__hint">{KIND_META[kind].hint}</span>
          </button>
        ))}
      </div>
      <div className="doc-types__hint">
        <Goose size={54} mood="happy" />
        <p>Тип можно поменять позже: заметка легко станет конспектом, а конспект — сценарием.</p>
      </div>
    </Modal>
  );
}

/* ------------------------------ подтверждение ------------------------------ */
export function ConfirmDialog({
  title,
  text,
  confirmLabel = 'Удалить',
  onConfirm,
  onClose,
}: {
  title: string;
  text: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn btn--danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="modal__text">{text}</p>
    </Modal>
  );
}

/* ------------------------------ перемещение в папку ------------------------------ */

export function MoveDialog({
  title = 'Переместить в папку',
  subtitle,
  folders,
  currentFolderId,
  onMove,
  onClose,
}: {
  title?: string;
  subtitle?: string;
  folders: Folder[];
  currentFolderId: string | null;
  onMove: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const items = flatFolders(folders);
  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose}>
      <div className="move-list">
        <button
          type="button"
          className={`move-item ${currentFolderId === null ? 'move-item--active' : ''}`}
          onClick={() => onMove(null)}
        >
          <Icon name="folder" size={15} />
          <span className="move-item__name">Без папки (корень)</span>
          {currentFolderId === null && <Icon name="check" size={14} className="move-item__check" />}
        </button>
        {items.map(({ folder, depth }) => (
          <button
            key={folder.id}
            type="button"
            className={`move-item ${currentFolderId === folder.id ? 'move-item--active' : ''}`}
            style={{ paddingLeft: 10 + depth * 16 }}
            onClick={() => onMove(folder.id)}
          >
            <Icon name={depth > 0 ? 'chevronRight' : 'folder'} size={depth > 0 ? 12 : 15} />
            <span className="move-item__name">{folder.name}</span>
            {currentFolderId === folder.id && <Icon name="check" size={14} className="move-item__check" />}
          </button>
        ))}
        {items.length === 0 && (
          <p className="move-empty">Папок пока нет. Создайте её кнопкой с плюсом в списке документов.</p>
        )}
      </div>
    </Modal>
  );
}
