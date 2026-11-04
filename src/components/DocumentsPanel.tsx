import { useEffect, useRef, useState } from 'react';
import type { Doc, DocKind, Folder } from '../types';
import { KIND_META } from '../types';
import { displayTitle, formatRelative, plural, snippet } from '../lib/utils';
import { canMoveFolder, childrenOf } from '../lib/folders';
import { Icon, type IconName } from './Icon';

export type Filter = 'all' | 'pinned' | DocKind;
/** 'all' — все документы, 'unfiled' — корень без папки, иначе id папки. */
export type FolderSel = 'all' | 'unfiled' | (string & {});

const KIND_ICON: Record<DocKind, IconName> = {
  note: 'note',
  summary: 'book',
  script: 'film',
  reminder: 'bell',
  drawing: 'brush',
};

interface DocumentsPanelProps {
  docs: Doc[];
  activeId: string | null;
  query: string;
  filter: Filter;
  counts: Record<string, number>;
  totalWords: number;
  totalCount: number;

  folders: Folder[];
  folderSel: FolderSel;
  folderCounts: Record<string, number>;
  unfiledCount: number;

  onQueryChange: (q: string) => void;
  onFilterChange: (f: Filter) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: () => void;

  onSelectFolder: (sel: FolderSel) => void;
  onNewFolder: (parentId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onMoveDoc: (docId: string, folderId: string | null) => void;
  onMoveFolder: (id: string, parentId: string | null) => void;
  onMoveDocRequest: (doc: Doc) => void;
  onMoveFolderRequest: (folder: Folder) => void;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'pinned', label: 'Важное' },
  { key: 'note', label: 'Заметки' },
  { key: 'summary', label: 'Конспекты' },
  { key: 'script', label: 'Сценарии' },
  { key: 'reminder', label: 'Напоминания' },
  { key: 'drawing', label: 'Рисунки' },
];

export function DocumentsPanel({
  docs,
  activeId,
  query,
  filter,
  counts,
  totalWords,
  totalCount,
  folders,
  folderSel,
  folderCounts,
  unfiledCount,
  onQueryChange,
  onFilterChange,
  onSelect,
  onNew,
  onClose,
  onSelectFolder,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onToggleFolder,
  onMoveDoc,
  onMoveFolder,
  onMoveDocRequest,
  onMoveFolderRequest,
}: DocumentsPanelProps) {
  const hasDocs = totalCount > 0;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuId]);

  const startRename = (folder: Folder) => {
    setEditingId(folder.id);
    setDraft(folder.name);
    setMenuId(null);
  };

  const commitRename = () => {
    if (!editingId) return;
    const name = draft.trim();
    if (name) onRenameFolder(editingId, name);
    setEditingId(null);
    setDraft('');
  };

  const dragPayload = (event: React.DragEvent) => ({
    docId: event.dataTransfer.getData('text/goosetext-doc'),
    folderId: event.dataTransfer.getData('text/goosetext-folder'),
  });

  const handleDocDragStart = (event: React.DragEvent, doc: Doc) => {
    event.dataTransfer.setData('text/goosetext-doc', doc.id);
    event.dataTransfer.setData('text/plain', displayTitle(doc.title, doc.html));
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleFolderDragStart = (event: React.DragEvent, folder: Folder) => {
    event.dataTransfer.setData('text/goosetext-folder', folder.id);
    event.dataTransfer.setData('text/plain', folder.name);
    event.dataTransfer.effectAllowed = 'move';
  };

  const canDrop = (event: React.DragEvent, targetId: string | null) => {
    const types = event.dataTransfer.types;
    const hasDoc = types.includes('text/goosetext-doc');
    const hasFolder = types.includes('text/goosetext-folder');
    return hasDoc || hasFolder || Boolean(targetId);
  };

  const handleDrop = (event: React.DragEvent, targetFolderId: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    const { docId, folderId } = dragPayload(event);
    if (docId) {
      onMoveDoc(docId, targetFolderId);
      return;
    }
    if (folderId && canMoveFolder(folders, folderId, targetFolderId)) {
      onMoveFolder(folderId, targetFolderId);
    }
  };

  const dropProps = (targetFolderId: string | null) => ({
    onDragOver: (event: React.DragEvent) => {
      if (!canDrop(event, targetFolderId)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTarget(targetFolderId ?? 'root');
    },
    onDragLeave: () => setDropTarget((current) => (current === (targetFolderId ?? 'root') ? null : current)),
    onDrop: (event: React.DragEvent) => handleDrop(event, targetFolderId),
  });

  const renderFolder = (folder: Folder, depth: number) => {
    const kids = childrenOf(folders, folder.id);
    const selected = folderSel === folder.id;
    const isEditing = editingId === folder.id;
    const count = folderCounts[folder.id] ?? 0;

    return (
      <div className="folder-branch" key={folder.id}>
        <div
          className={`folder-row ${selected ? 'folder-row--active' : ''} ${
            dropTarget === folder.id ? 'folder-row--drop' : ''
          }`}
          style={{ paddingLeft: 6 + depth * 13 }}
          draggable={!isEditing}
          onClick={() => onSelectFolder(folder.id)}
          onDragStart={(event) => handleFolderDragStart(event, folder)}
          onDragOver={dropProps(folder.id).onDragOver}
          onDragLeave={dropProps(folder.id).onDragLeave}
          onDrop={dropProps(folder.id).onDrop}
        >
          {kids.length > 0 ? (
            <button
              type="button"
              className={`folder-row__chevron ${folder.collapsed ? 'is-collapsed' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleFolder(folder.id);
              }}
              aria-label={folder.collapsed ? 'Развернуть папку' : 'Свернуть папку'}
            >
              <Icon name="chevronDown" size={13} />
            </button>
          ) : (
            <span className="folder-row__chevron folder-row__chevron--empty" />
          )}

          <button type="button" className="folder-row__main" onClick={() => onSelectFolder(folder.id)}>
            <Icon name={selected ? 'folderOpen' : 'folder'} size={14} />
            {isEditing ? (
              <input
                ref={inputRef}
                className="folder-row__input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitRename();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    setEditingId(null);
                  }
                }}
                onClick={(event) => event.stopPropagation()}
                aria-label="Название папки"
              />
            ) : (
              <span
                className="folder-row__name"
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  startRename(folder);
                }}
                title="Двойной щелчок — переименовать"
              >
                {folder.name}
              </span>
            )}
          </button>

          <span className="folder-row__count">{count}</span>

          <div className="folder-row__menu" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="icon-btn icon-btn--sm folder-row__more"
              onClick={() => setMenuId(menuId === folder.id ? null : folder.id)}
              aria-label="Действия с папкой"
            >
              <Icon name="more" size={14} />
            </button>
            {menuId === folder.id && (
              <div className="menu menu--folder" role="menu">
                <button role="menuitem" className="menu__item" onClick={() => startRename(folder)}>
                  <Icon name="edit" size={14} /> Переименовать
                </button>
                <button
                  role="menuitem"
                  className="menu__item"
                  onClick={() => {
                    setMenuId(null);
                    onNewFolder(folder.id);
                  }}
                >
                  <Icon name="folderPlus" size={14} /> Вложенная папка
                </button>
                <button
                  role="menuitem"
                  className="menu__item"
                  onClick={() => {
                    setMenuId(null);
                    onMoveFolderRequest(folder);
                  }}
                >
                  <Icon name="move" size={14} /> Переместить…
                </button>
                <button
                  role="menuitem"
                  className="menu__item"
                  onClick={() => {
                    setMenuId(null);
                    onMoveFolder(folder.id, null);
                  }}
                >
                  <Icon name="folderOpen" size={14} /> В корень
                </button>
                <div className="menu__sep" />
                <button
                  role="menuitem"
                  className="menu__item menu__item--danger"
                  onClick={() => {
                    setMenuId(null);
                    onDeleteFolder(folder.id);
                  }}
                >
                  <Icon name="trash" size={14} /> Удалить папку
                </button>
              </div>
            )}
          </div>
        </div>

        {!folder.collapsed &&
          kids.map((child) => renderFolder(child, depth + 1))}
      </div>
    );
  };

  return (
    <aside className="panel panel--docs" aria-label="Документы">
      <header className="panel__head">
        <div className="panel__heading">
          <span className="panel__title">Документы</span>
          <span className="panel__count">{totalCount}</span>
        </div>
        <div className="panel__actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => onNewFolder(folderSel === 'all' || folderSel === 'unfiled' ? null : folderSel)}
            title="Новая папка"
            aria-label="Новая папка"
          >
            <Icon name="folderPlus" size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={onNew} title="Новый документ (Ctrl+N)">
            <Icon name="plus" size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={onClose} title="Скрыть панель (Ctrl+1)">
            <Icon name="panelLeft" size={16} />
          </button>
        </div>
      </header>

      <div className="panel__body">
        <div className="search">
          <Icon name="search" size={14} className="search__icon" />
          <input
            className="search__input"
            type="search"
            value={query}
            placeholder="Поиск по текстам"
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label="Поиск по документам"
          />
          {query && (
            <button type="button" className="search__clear" onClick={() => onQueryChange('')} aria-label="Очистить">
              <Icon name="x" size={12} />
            </button>
          )}
        </div>

        <div className="filters" role="tablist" aria-label="Типы документов">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              className={`filter ${filter === f.key ? 'filter--active' : ''}`}
              onClick={() => onFilterChange(f.key)}
            >
              {f.label}
              <span className="filter__count">{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="folders">
          <div className="folders__head">
            <span>Папки</span>
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              onClick={() => onNewFolder(null)}
              title="Новая папка"
              aria-label="Новая папка"
            >
              <Icon name="plus" size={14} />
            </button>
          </div>

          <div
            className={`folder-row folder-row--root ${folderSel === 'all' ? 'folder-row--active' : ''}`}
            onClick={() => onSelectFolder('all')}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelectFolder('all');
            }}
          >
            <span className="folder-row__chevron folder-row__chevron--empty" />
            <span className="folder-row__main">
              <Icon name="board" size={14} />
              <span className="folder-row__name">Все документы</span>
            </span>
            <span className="folder-row__count">{totalCount}</span>
          </div>

          <div
            className={`folder-row folder-row--root ${folderSel === 'unfiled' ? 'folder-row--active' : ''} ${
              dropTarget === 'root' ? 'folder-row--drop' : ''
            }`}
            onClick={() => onSelectFolder('unfiled')}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelectFolder('unfiled');
            }}
            {...dropProps(null)}
          >
            <span className="folder-row__chevron folder-row__chevron--empty" />
            <span className="folder-row__main">
              <Icon name="folder" size={14} />
              <span className="folder-row__name">Без папки</span>
            </span>
            <span className="folder-row__count">{unfiledCount}</span>
          </div>

          {folders.length === 0 && (
            <p className="folders__empty">Создайте папку и перетащите в неё документы.</p>
          )}

          {childrenOf(folders, null).map((folder) => renderFolder(folder, 0))}
        </div>

        <div className="docs" role="list" aria-label="Список документов">
          {docs.length === 0 && (
            <div className="docs__empty">
              {hasDocs ? (
                <>
                  <Icon name="search" size={18} />
                  <p>Ничего не нашлось</p>
                  <span>Попробуйте другой запрос, тип или папку.</span>
                </>
              ) : (
                <>
                  <Icon name="note" size={18} />
                  <p>Пока пусто</p>
                  <span>Создайте первый документ — начнём с заметки.</span>
                </>
              )}
            </div>
          )}
          {docs.map((doc) => (
            <div
              key={doc.id}
              className={`doc-item ${doc.id === activeId ? 'doc-item--active' : ''}`}
              draggable
              onDragStart={(event) => handleDocDragStart(event, doc)}
              onClick={() => onSelect(doc.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(doc.id);
                }
              }}
              tabIndex={0}
              aria-current={doc.id === activeId ? 'true' : undefined}
              role="listitem"
            >
              <span className={`doc-item__kind kind--${doc.kind}`} aria-hidden="true">
                <Icon name={KIND_ICON[doc.kind]} size={13} />
              </span>
              <span className="doc-item__body">
                <span className="doc-item__title">
                  <span className="doc-item__title-text">{displayTitle(doc.title, doc.html)}</span>
                  {doc.pinned && <Icon name="pin" size={11} className="doc-item__pin" />}
                </span>
                <span className="doc-item__snippet">
                  {doc.kind === 'drawing'
                    ? `${doc.drawing?.strokes.length ?? 0} ${plural(doc.drawing?.strokes.length ?? 0, 'штрих', 'штриха', 'штрихов')}`
                    : snippet(doc.html, 58) || 'Пустой документ'}
                </span>
                <span className="doc-item__meta">
                  <span className="kind-label">{KIND_META[doc.kind].label}</span>
                  <span className="doc-item__dot">·</span>
                  {formatRelative(doc.updatedAt)}
                  {doc.reminderAt && !doc.reminderDone && (
                    <>
                      <span className="doc-item__dot">·</span>
                      <span className={`doc-item__reminder ${doc.reminderAt < Date.now() ? 'is-late' : ''}`}>
                        <Icon name="bell" size={10} />
                        {new Date(doc.reminderAt).toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </>
                  )}
                </span>
              </span>
              <button
                type="button"
                className="icon-btn icon-btn--sm doc-item__move"
                onClick={(event) => {
                  event.stopPropagation();
                  onMoveDocRequest(doc);
                }}
                title="Переместить в папку"
                aria-label="Переместить в папку"
              >
                <Icon name="move" size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <footer className="panel__foot">
        <button type="button" className="btn btn--primary btn--block" onClick={onNew}>
          <Icon name="plus" size={15} />
          Новый документ
        </button>
        <div className="panel__stats">
          <span>
            {totalCount} {plural(totalCount, 'документ', 'документа', 'документов')}
          </span>
          <span>·</span>
          <span>
            {totalWords.toLocaleString('ru-RU')} {plural(totalWords, 'слово', 'слова', 'слов')}
          </span>
        </div>
      </footer>
    </aside>
  );
}
