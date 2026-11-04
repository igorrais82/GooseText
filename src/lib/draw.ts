import type { Drawing, DrawStroke } from '../types';
import { uid } from './utils';

/** Логическая система координат рисунка: ширина всегда 1000. */
export const DRAW_WIDTH = 1000;
export const DRAW_HEIGHT = 750;

export const PEN_COLORS = ['#1f1b18', '#f97316', '#dc2626', '#16a34a', '#2563eb', '#7c3aed', '#f59e0b'];
export const PEN_WIDTHS = [2, 4, 8, 16];

export function createDrawing(): Drawing {
  return {
    width: DRAW_WIDTH,
    height: DRAW_HEIGHT,
    background: '#ffffff',
    strokes: [],
  };
}

export function ensureDrawing(drawing: Drawing | null): Drawing {
  if (!drawing) return createDrawing();
  return {
    width: Math.max(1, drawing.width || DRAW_WIDTH),
    height: Math.max(1, drawing.height || DRAW_HEIGHT),
    background: drawing.background || '#ffffff',
    strokes: Array.isArray(drawing.strokes) ? drawing.strokes : [],
  };
}

function strokeScale(width: number, drawing: Drawing): number {
  return width / drawing.width;
}

/** Отрисовка одного штриха. Ластик вырезает прозрачность — фон остаётся под холстом. */
export function paintStroke(
  ctx: CanvasRenderingContext2D,
  stroke: DrawStroke,
  width: number,
  height: number,
  drawing: Drawing,
): void {
  const scale = strokeScale(width, drawing);
  const points = stroke.points;
  if (points.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.globalAlpha = stroke.tool === 'marker' ? 0.32 : 1;
  ctx.strokeStyle = stroke.tool === 'eraser' ? '#000' : stroke.color;

  const toX = (x: number) => (x / drawing.width) * width;
  const toY = (y: number) => (y / drawing.height) * height;

  if (points.length === 1) {
    const p = points[0];
    ctx.beginPath();
    ctx.arc(toX(p.x), toY(p.y), (stroke.width * scale * (0.5 + p.p)) / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.restore();
    return;
  }

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const point = points[i];
    const pressure = 0.55 + point.p * 0.9;
    ctx.lineWidth = Math.max(0.5, stroke.width * scale * pressure);
    ctx.beginPath();
    ctx.moveTo(toX(prev.x), toY(prev.y));
    const midX = (prev.x + point.x) / 2;
    const midY = (prev.y + point.y) / 2;
    ctx.quadraticCurveTo(toX(prev.x), toY(prev.y), toX(midX), toY(midY));
    ctx.lineTo(toX(point.x), toY(point.y));
    ctx.stroke();
  }
  ctx.restore();
}

/** Полная перерисовка холста под текущий размер элемента. */
export function renderDrawing(
  canvas: HTMLCanvasElement,
  drawing: Drawing,
  liveStroke?: DrawStroke | null,
  dpr = window.devicePixelRatio || 1,
): void {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return;
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  for (const stroke of drawing.strokes) paintStroke(ctx, stroke, width, height, drawing);
  if (liveStroke) paintStroke(ctx, liveStroke, width, height, drawing);
}

/** Готовит PNG с фоном — для скачивания и вставки в документ. */
export function drawingToPng(drawing: Drawing, targetWidth = 1600): string {
  const width = targetWidth;
  const height = Math.round((targetWidth * drawing.height) / drawing.width);

  // Штрихи рисуем на прозрачном слое: ластик вырезает прозрачность,
  // а фон подкладывается отдельно — иначе в PNG остались бы дырки.
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  const layerCtx = layer.getContext('2d');
  if (!layerCtx) return '';
  for (const stroke of drawing.strokes) paintStroke(layerCtx, stroke, width, height, drawing);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = drawing.background || '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(layer, 0, 0);
  return canvas.toDataURL('image/png');
}

export function newStroke(tool: DrawStroke['tool'], color: string, width: number, x: number, y: number, p = 0.5): DrawStroke {
  return {
    id: uid('s'),
    tool,
    color,
    width,
    points: [{ x, y, p }],
  };
}
