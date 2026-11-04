import { useEffect, useRef, useState } from 'react';
import type { Doc, DocKind } from '../types';
import { KIND_META } from '../types';
import { applyScreenplayClasses } from '../lib/editor';
import { sanitizeHtml } from '../lib/sanitize';
import {
  charCount,
  displayTitle,
  escapeHtml,
  formatDateTime,
  fromDateTimeLocal,
  plainFromHtml,
  plural,
  readingMinutes,
  toDateTimeLocal,
  wordCount,
} from '../lib/utils';
import { Icon, type IconName } from './Icon';

interface EditorPaneProps {
  doc: Doc;
  editorRef: React.RefObject<HTMLDivElement | null>;
  saving: boolean;
  dictating: boolean;
  interim: string;
  onHtmlChange: (html: string) => void;
  onTitleChange: (title: string) => void;
  onKindChange: (kind: DocKind) => void;
  onPin: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onExport: (fmt: 'txt' | 'md') => void;
  onReminderChange: (ts: number | null) => void;
  onRemind: () => void;
  onCopy: () => void;
  onToggleDictation: () => void;
  onOpenAssistant: () => void;
  onOpenRetell: () => void;
  onMove: () => void;
}

const KIND_ICON: Record<DocKind, IconName> = {
  note: 'note',
  summary: 'book',
  script: 'film',
  reminder: 'bell',
  drawing: 'brush',
};

const FORMATS: { name: string; label: string; title: string }[] = [
  { name: 'bold', label: 'Ж', title: 'Жирный (Ctrl+B)' },
  { name: 'italic', label: 'К', title: 'Курсив (Ctrl+I)' },
  { name: 'underline', label: 'Ч', title: 'Подчёркнутый (Ctrl+U)' },
];

export function EditorPane({
  doc,
  editorRef,
  saving,
  dictating,
  interim,
  onHtmlChange,
  onTitleChange,
  onKindChange,
  onPin,
  onDelete,
  onDuplicate,
  onExport,
  onReminderChange,
  onRemind,
  onCopy,
  onToggleDictation,
  onOpenAssistant,
  onOpenRetell,
  onMove,
}: EditorPaneProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFormats, setActiveFormats] = useState<string[]>([]);
  const [isEmpty, setIsEmpty] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  const text = plainFromHtml(doc.html);
  const words = wordCount(text);
  const chars = charCount(text);
  const sentences = (text.match(/[^.!?…]+[.!?…]+/g) ?? []).length || (text.trim() ? 1 : 0);
  const paragraphs = text.split(/\n+/).filter((line) => line.trim()).length;

  // Редактор неконтролируемый: содержимое заливается один раз при открытии документа.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = doc.html || '';
    if (doc.kind === 'script') applyScreenplayClasses(el);
    setIsEmpty(!plainFromHtml(el.innerHTML).trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onSelection = () => {
      if (!editorRef.current?.contains(document.activeElement)) return;
      const formats: string[] = [];
      for (const f of ['bold', 'italic', 'underline']) {
        try {
          if (document.queryCommandState(f)) formats.push(f);
        } catch {
          /* noop */
        }
      }
      setActiveFormats(formats);
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, [editorRef]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const commit = () => {
    const el = editorRef.current;
    if (!el) return;
    onHtmlChange(el.innerHTML);
    setIsEmpty(!plainFromHtml(el.innerHTML).trim());
  };

  const handleInput = () => {
    const el = editorRef.current;
    if (!el) return;
    if (doc.kind === 'script') applyScreenplayClasses(el);
    commit();
  };

  const exec = (command: string, value?: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false, value);
    handleInput();
  };

  const insertLine = (tag: string) => exec('formatBlock', tag);

  /** Вставка из буфера очищается: в чужом HTML бывают обработчики и script-ссылки. */
  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const data = event.clipboardData;
    if (!data) return;
    const html = data.getData('text/html');
    if (!html) return;
    event.preventDefault();
    const clean = sanitizeHtml(html);
    const fallback = escapeHtml(data.getData('text/plain')).replace(/\n/g, '<br>');
    document.execCommand('insertHTML', false, clean || fallback);
    handleInput();
  };

  const reminderValue = toDateTimeLocal(doc.reminderAt);
  const showReminderBar = doc.kind === 'reminder' || doc.reminderAt !== null;

  const quickTimes: { label: string; get: () => number }[] = [
    { label: 'через час', get: () => Date.now() + 3600000 },
    {
      label: 'сегодня 19:00',
      get: () => {
        const d = new Date();
        d.setHours(19, 0, 0, 0);
        return d.getTime();
      },
    },
    {
      label: 'завтра 9:00',
      get: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d.getTime();
      },
    },
  ];

  return (
    <main className="canvas">
      <div className="doc">
        <div className="doc-bar">
          <div className="kinds" role="group" aria-label="Тип документа">
            {(Object.keys(KIND_META) as DocKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                className={`kind-chip kind--${kind} ${doc.kind === kind ? 'kind-chip--active' : ''}`}
                onClick={() => onKindChange(kind)}
                title={KIND_META[kind].hint}
              >
                <Icon name={KIND_ICON[kind]} size={13} />
                {KIND_META[kind].label}
              </button>
            ))}
          </div>

          <div className="doc-bar__actions">
            <span className={`save-state ${saving ? 'save-state--busy' : ''}`}>
              <span className="save-state__dot" />
              {saving ? 'Сохраняю…' : 'Сохранено'}
            </span>
            <button
              type="button"
              className={`icon-btn ${doc.pinned ? 'is-active' : ''}`}
              onClick={onPin}
              title={doc.pinned ? 'Открепить' : 'Закрепить'}
              aria-label="Закрепить документ"
            >
              <Icon name="pin" size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onOpenRetell}
              title="Пересказ текста"
              aria-label="Пересказ текста"
            >
              <Icon name="retell" size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => onOpenAssistant()}
              title="Помощник"
              aria-label="Открыть помощника"
            >
              <Icon name="wand" size={16} />
            </button>
            <div className="menu-wrap" ref={menuRef}>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Ещё"
              >
                <Icon name="more" size={18} />
              </button>
              {menuOpen && (
                <div className="menu" role="menu">
                  <button
                    role="menuitem"
                    className="menu__item"
                    onClick={() => {
                      onCopy();
                      setMenuOpen(false);
                    }}
                  >
                    <Icon name="copy" size={15} /> Скопировать текст
                  </button>
                  <button
                    role="menuitem"
                    className="menu__item"
                    onClick={() => {
                      onDuplicate();
                      setMenuOpen(false);
                    }}
                  >
                    <Icon name="board" size={15} /> Дублировать
                  </button>
                  <button
                    role="menuitem"
                    className="menu__item"
                    onClick={() => {
                      onRemind();
                      setMenuOpen(false);
                    }}
                  >
                    <Icon name="bell" size={15} /> Напомнить через час
                  </button>
                  <button
                    role="menuitem"
                    className="menu__item"
                    onClick={() => {
                      onMove();
                      setMenuOpen(false);
                    }}
                  >
                    <Icon name="move" size={15} /> Переместить в папку
                  </button>
                  <button
                    role="menuitem"
                    className="menu__item"
                    onClick={() => {
                      onOpenRetell();
                      setMenuOpen(false);
                    }}
                  >
                    <Icon name="retell" size={15} /> Пересказать текст
                  </button>
                  <div className="menu__sep" />
                  <button
                    role="menuitem"
                    className="menu__item"
                    onClick={() => {
                      onExport('txt');
                      setMenuOpen(false);
                    }}
                  >
                    <Icon name="download" size={15} /> Скачать .txt
                  </button>
                  <button
                    role="menuitem"
                    className="menu__item"
                    onClick={() => {
                      onExport('md');
                      setMenuOpen(false);
                    }}
                  >
                    <Icon name="download" size={15} /> Скачать .md
                  </button>
                  <div className="menu__sep" />
                  <button
                    role="menuitem"
                    className="menu__item menu__item--danger"
                    onClick={() => {
                      onDelete();
                      setMenuOpen(false);
                    }}
                  >
                    <Icon name="trash" size={15} /> Удалить документ
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <input
          className="title-input"
          value={doc.title}
          placeholder={displayTitle(doc.title, doc.html) === 'Без названия' ? 'Без названия' : 'Заголовок'}
          onChange={(e) => onTitleChange(e.target.value)}
          aria-label="Название документа"
        />

        {showReminderBar && (
          <div
            className={`reminder-bar ${
              doc.reminderAt && doc.reminderAt < Date.now() && !doc.reminderDone ? 'reminder-bar--late' : ''
            }`}
          >
            <Icon name="bell" size={14} />
            <span className="reminder-bar__label">
              {doc.reminderAt ? formatDateTime(doc.reminderAt) : 'Напоминание не задано'}
            </span>
            <input
              className="reminder-bar__input"
              type="datetime-local"
              value={reminderValue}
              onChange={(e) => onReminderChange(fromDateTimeLocal(e.target.value))}
              aria-label="Время напоминания"
            />
            <div className="quick-chips">
              {quickTimes.map((q) => (
                <button key={q.label} type="button" className="quick-chip" onClick={() => onReminderChange(q.get())}>
                  {q.label}
                </button>
              ))}
              {doc.reminderAt && (
                <button type="button" className="quick-chip quick-chip--ghost" onClick={() => onReminderChange(null)}>
                  убрать
                </button>
              )}
            </div>
          </div>
        )}

        <div className="toolbar" role="toolbar" aria-label="Форматирование">
          {FORMATS.map((f) => (
            <button
              key={f.name}
              type="button"
              className={`tool-btn ${activeFormats.includes(f.name) ? 'tool-btn--active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec(f.name)}
              title={f.title}
              aria-label={f.title}
            >
              <span className={`glyph glyph--${f.name}`}>{f.label}</span>
            </button>
          ))}
          <span className="toolbar__divider" />
          <button
            type="button"
            className="tool-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertLine('h2')}
            title="Заголовок"
            aria-label="Заголовок"
          >
            H
          </button>
          <button
            type="button"
            className="tool-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertLine('blockquote')}
            title="Цитата"
            aria-label="Цитата"
          >
            <Icon name="quote" size={16} />
          </button>
          <button
            type="button"
            className="tool-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('insertUnorderedList')}
            title="Список"
            aria-label="Маркированный список"
          >
            <Icon name="list" size={16} />
          </button>
          <button
            type="button"
            className="tool-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('insertOrderedList')}
            title="Нумерованный список"
            aria-label="Нумерованный список"
          >
            <Icon name="listOrdered" size={16} />
          </button>
          <span className="toolbar__divider" />
          <button
            type="button"
            className="tool-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('undo')}
            title="Отменить (Ctrl+Z)"
            aria-label="Отменить"
          >
            <Icon name="undo" size={16} />
          </button>
          <button
            type="button"
            className="tool-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('redo')}
            title="Повторить (Ctrl+Y)"
            aria-label="Повторить"
          >
            <Icon name="redo" size={16} />
          </button>
          <span className="toolbar__divider" />
          <button
            type="button"
            className="tool-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertLine('p')}
            title="Обычный текст"
            aria-label="Обычный текст"
          >
            <Icon name="pen" size={16} />
          </button>
        </div>

        <div
          className={`editor__content ${isEmpty ? 'is-empty' : ''} ${
            doc.kind === 'script' ? 'editor__content--screenplay' : ''
          }`}
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          data-placeholder={
            doc.kind === 'script'
              ? 'INT. КАФЕ — УТРО …'
              : doc.kind === 'summary'
                ? 'Начните конспект…'
                : 'Начните писать…'
          }
          onInput={handleInput}
          onBlur={commit}
          onPaste={handlePaste}
          aria-label="Текст документа"
          role="textbox"
          aria-multiline="true"
        />

        <div className="statusbar">
          <span className="statusbar__item">
            {words} {plural(words, 'слово', 'слова', 'слов')}
          </span>
          <span className="statusbar__item">
            {chars} {plural(chars, 'символ', 'символа', 'символов')}
          </span>
          <span className="statusbar__item statusbar__item--detail">
            {sentences} {plural(sentences, 'предложение', 'предложения', 'предложений')}
          </span>
          <span className="statusbar__item statusbar__item--detail">
            {paragraphs} {plural(paragraphs, 'абзац', 'абзаца', 'абзацев')}
          </span>
          <span className="statusbar__item">≈ {readingMinutes(words)} мин чтения</span>
          {doc.kind === 'script' && (
            <span className="statusbar__hint">
              <Icon name="info" size={12} /> капс и «INT./EXT.» оформляются как сценарий
            </span>
          )}
        </div>
      </div>

      {dictating && (
        <div className="dictation-chip" role="status" aria-live="polite">
          <span className="dictation-chip__wave">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="dictation-chip__text">{interim || 'Слушаю… говорите'}</span>
          <button type="button" className="dictation-chip__stop" onClick={onToggleDictation}>
            <Icon name="stop" size={13} /> Стоп
          </button>
        </div>
      )}
    </main>
  );
}
