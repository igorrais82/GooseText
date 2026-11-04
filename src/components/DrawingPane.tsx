import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Doc, DocKind, DrawStroke, Drawing } from '../types';
import { KIND_META } from '../types';
import {
  DRAW_HEIGHT,
  DRAW_WIDTH,
  PEN_COLORS,
  PEN_WIDTHS,
  createDrawing,
  drawingToPng,
  ensureDrawing,
  newStroke,
  renderDrawing,
} from '../lib/draw';
import { displayTitle, plural } from '../lib/utils';
import { saveFile } from '../lib/saveFile';
import { Icon, type IconName } from './Icon';
import { ConfirmDialog } from './Dialogs';

interface DrawingPaneProps {
  doc: Doc;
  saving: boolean;
  pro: boolean;
  onChange: (drawing: Drawing) => void;
  onTitleChange: (title: string) => void;
  onKindChange: (kind: DocKind) => void;
  onPin: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onOpenAssistant: () => void;
  onNotify: (kind: 'success' | 'error' | 'info', text: string) => void;
  onNeedPro: (feature: string) => void;
}

const KIND_ICON: Record<DocKind, IconName> = {
  note: 'note',
  summary: 'book',
  script: 'film',
  reminder: 'bell',
  drawing: 'brush',
};

const TOOLS: { key: 'pen' | 'marker' | 'eraser'; label: string; icon: IconName }[] = [
  { key: 'pen', label: 'Перо', icon: 'brush' },
  { key: 'marker', label: 'Маркер', icon: 'marker' },
  { key: 'eraser', label: 'Ластик', icon: 'eraser' },
];

export function DrawingPane({
  doc,
  saving,
  pro,
  onChange,
  onTitleChange,
  onKindChange,
  onPin,
  onDelete,
  onDuplicate,
  onOpenAssistant,
  onNotify,
  onNeedPro,
}: DrawingPaneProps) {
  const drawing = useMemo(() => ensureDrawing(doc.drawing), [doc.drawing]);
  const drawingRef = useRef(drawing);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<DrawStroke | null>(null);
  const rafRef = useRef<number | null>(null);

  const [tool, setTool] = useState<'pen' | 'marker' | 'eraser'>('pen');
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [thickness, setThickness] = useState(PEN_WIDTHS[1]);
  const [showGrid, setShowGrid] = useState(false);
  const [redo, setRedo] = useState<DrawStroke[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderDrawing(canvas, drawingRef.current, liveRef.current);
  }, []);

  useEffect(() => {
    drawingRef.current = drawing;
    render();
  }, [drawing, render]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => render());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [render]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const scheduleRender = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      render();
    });
  }, [render]);

  const pointFrom = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * drawing.width;
    const y = ((event.clientY - rect.top) / rect.height) * drawing.height;
    const pressure = event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 0.55;
    return {
      x: Math.round(Math.max(0, Math.min(drawing.width, x)) * 10) / 10,
      y: Math.round(Math.max(0, Math.min(drawing.height, y)) * 10) / 10,
      p: pressure,
    };
  };

  const handleDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFrom(event);
    liveRef.current = newStroke(tool, color, thickness, point.x, point.y, point.p);
    scheduleRender();
  };

  const handleMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const live = liveRef.current;
    if (!live) return;
    const point = pointFrom(event);
    const last = live.points[live.points.length - 1];
    if (last && Math.hypot(last.x - point.x, last.y - point.y) < 1.2) return;
    live.points.push(point);
    scheduleRender();
  };

  const finishStroke = () => {
    const live = liveRef.current;
    liveRef.current = null;
    if (!live || live.points.length === 0) {
      scheduleRender();
      return;
    }
    setRedo([]);
    onChange({ ...drawingRef.current, strokes: [...drawingRef.current.strokes, live] });
  };

  const undo = () => {
    const current = drawingRef.current;
    if (current.strokes.length === 0) return;
    const last = current.strokes[current.strokes.length - 1];
    setRedo((stack) => [...stack, last]);
    onChange({ ...current, strokes: current.strokes.slice(0, -1) });
  };

  const redoLast = () => {
    if (redo.length === 0) return;
    const next = redo[redo.length - 1];
    setRedo((stack) => stack.slice(0, -1));
    onChange({ ...drawingRef.current, strokes: [...drawingRef.current.strokes, next] });
  };

  const exportPng = async () => {
    if (!pro) {
      onNeedPro('Экспорт рисунка в PNG');
      return;
    }
    if (drawing.strokes.length === 0) {
      onNotify('info', 'Холст пуст — сначала нарисуйте что-нибудь');
      return;
    }
    const dataUrl = drawingToPng(drawingRef.current);
    if (!dataUrl) {
      onNotify('error', 'Не удалось собрать картинку');
      return;
    }
    const name = `${(displayTitle(doc.title, '') || 'рисунок').replace(/[\\/:*?"<>|]+/g, '')}.png`;
    const saved = await saveFile(dataUrl, name);
    onNotify('success', saved === 'shared' ? 'PNG готов — выберите, куда сохранить' : 'Рисунок сохранён в PNG');
  };

  const title = doc.title.trim() || 'Без названия';

  return (
    <main className="canvas canvas--drawing">
      <div className="doc doc--drawing">
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
              onClick={onOpenAssistant}
              title="Помощник"
              aria-label="Открыть помощника"
            >
              <Icon name="wand" size={16} />
            </button>
            <div className="menu-wrap" ref={menuRef}>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setMenuOpen((value) => !value)}
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
                      exportPng();
                      setMenuOpen(false);
                    }}
                  >
                    <Icon name="download" size={15} /> Скачать PNG
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
                      setShowGrid((value) => !value);
                      setMenuOpen(false);
                    }}
                  >
                    <Icon name="grid" size={15} /> Сетка: {showGrid ? 'вкл' : 'выкл'}
                  </button>
                  <div className="menu__sep" />
                  <button
                    role="menuitem"
                    className="menu__item"
                    onClick={() => {
                      setConfirmClear(true);
                      setMenuOpen(false);
                    }}
                  >
                    <Icon name="refresh" size={15} /> Очистить холст
                  </button>
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
          placeholder="Название рисунка"
          onChange={(event) => onTitleChange(event.target.value)}
          aria-label="Название рисунка"
        />

        <div className="draw-toolbar" role="toolbar" aria-label="Инструменты рисования">
          <div className="draw-tools" role="group" aria-label="Инструмент">
            {TOOLS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`draw-tool ${tool === item.key ? 'draw-tool--active' : ''}`}
                onClick={() => setTool(item.key)}
                title={item.label}
                aria-pressed={tool === item.key}
              >
                <Icon name={item.icon} size={16} />
              </button>
            ))}
          </div>

          <span className="toolbar__divider" />

          <div className="draw-colors" role="group" aria-label="Цвет">
            {PEN_COLORS.map((value) => (
              <button
                key={value}
                type="button"
                className={`draw-color ${color === value && tool !== 'eraser' ? 'draw-color--active' : ''}`}
                style={{ ['--swatch' as string]: value }}
                onClick={() => {
                  setColor(value);
                  if (tool === 'eraser') setTool('pen');
                }}
                title={`Цвет ${value}`}
                aria-label={`Цвет ${value}`}
              />
            ))}
          </div>

          <span className="toolbar__divider" />

          <div className="draw-widths" role="group" aria-label="Толщина">
            {PEN_WIDTHS.map((value) => (
              <button
                key={value}
                type="button"
                className={`draw-width ${thickness === value ? 'draw-width--active' : ''}`}
                onClick={() => setThickness(value)}
                title={`Толщина ${value}`}
                aria-label={`Толщина ${value}`}
              >
                <i style={{ width: Math.min(18, 4 + value), height: Math.min(18, 4 + value) }} />
              </button>
            ))}
          </div>

          <span className="toolbar__divider" />

          <div className="draw-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={undo}
              disabled={drawing.strokes.length === 0}
              title="Отменить (Ctrl+Z)"
              aria-label="Отменить штрих"
            >
              <Icon name="undo" size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={redoLast}
              disabled={redo.length === 0}
              title="Повторить (Ctrl+Y)"
              aria-label="Повторить штрих"
            >
              <Icon name="redo" size={16} />
            </button>
            <button
              type="button"
              className={`icon-btn ${showGrid ? 'is-active' : ''}`}
              onClick={() => setShowGrid((value) => !value)}
              title="Сетка"
              aria-label="Показать сетку"
              aria-pressed={showGrid}
            >
              <Icon name="grid" size={16} />
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={exportPng}>
              <Icon name={pro ? 'download' : 'lock'} size={14} /> PNG
            </button>
          </div>
        </div>

        <div
          className={`draw-surface ${showGrid ? 'draw-surface--grid' : ''}`}
          ref={wrapRef}
          style={{ ['--draw-bg' as string]: drawing.background }}
        >
          <canvas
            ref={canvasRef}
            className="draw-canvas"
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            onPointerLeave={(event) => {
              if (event.buttons === 0) finishStroke();
            }}
            aria-label="Холст для рисования"
          />
          {drawing.strokes.length === 0 && (
            <div className="draw-hint" aria-hidden="true">
              <Icon name="brush" size={26} />
              <p>Рисуйте мышью, пальцем или стилусом</p>
              <span>{DRAW_WIDTH} × {DRAW_HEIGHT} · маркер полупрозрачный, ластик стирает</span>
            </div>
          )}
        </div>

        <div className="statusbar">
          <span className="statusbar__item">
            {drawing.strokes.length} {plural(drawing.strokes.length, 'штрих', 'штриха', 'штрихов')}
          </span>
          <span className="statusbar__item statusbar__item--detail">
            {drawing.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0)} точек
          </span>
          <span className="statusbar__item statusbar__item--detail">
            {drawing.width} × {drawing.height}
          </span>
          <span className="statusbar__hint">
            <Icon name="info" size={12} /> «{title}» — рисунок, Ctrl+Z отменяет штрих
          </span>
        </div>
      </div>

      {confirmClear && (
        <ConfirmDialog
          title="Очистить холст?"
          text="Все штрихи исчезнут. Отменить это будет нельзя."
          confirmLabel="Очистить"
          onConfirm={() => {
            onChange({ ...createDrawing(), background: drawing.background });
            setRedo([]);
            setConfirmClear(false);
            onNotify('info', 'Холст очищен');
          }}
          onClose={() => setConfirmClear(false)}
        />
      )}
    </main>
  );
}
