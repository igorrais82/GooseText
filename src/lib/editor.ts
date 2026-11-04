/** Работа с contentEditable: смещения, вставка текста, разметка сценария. */

export interface TextNodeSegment {
  node: Text;
  start: number;
  end: number;
}

export interface TextMap {
  text: string;
  segments: TextNodeSegment[];
}

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'LI',
  'UL',
  'OL',
  'BLOCKQUOTE',
  'PRE',
  'SECTION',
  'ARTICLE',
  'FIGCAPTION',
  'TR',
]);

function isBlock(el: Element): boolean {
  return BLOCK_TAGS.has(el.tagName);
}

/**
 * Собирает текст документа вместе с картой «символ → текстовый узел».
 * Блочные элементы разделяются переводом строки — так же, как их видит пользователь.
 */
export function extractTextWithMap(root: HTMLElement): TextMap {
  const segments: TextNodeSegment[] = [];
  let text = '';

  const pushNewline = () => {
    if (text.length > 0 && !text.endsWith('\n')) text += '\n';
  };

  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child as Text;
        const data = t.data.replace(/\u00a0/g, ' ');
        if (!data) return;
        segments.push({ node: t, start: text.length, end: text.length + data.length });
        text += data;
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      if (el.tagName === 'BR') {
        text += '\n';
        return;
      }
      if (isBlock(el)) {
        pushNewline();
        walk(el);
        pushNewline();
      } else {
        walk(el);
      }
    });
  };

  walk(root);
  return { text: text.replace(/\n+$/, ''), segments };
}

export function caretOffset(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  const map = extractTextWithMap(root);
  const start = locate(map, range.startContainer, range.startOffset);
  return start;
}

function locate(map: TextMap, container: Node, offset: number): number {
  if (container.nodeType === Node.TEXT_NODE) {
    const seg = map.segments.find((s) => s.node === container);
    if (seg) return seg.start + Math.min(offset, seg.node.data.length);
    return 0;
  }
  // Узел-элемент: считаем по первому дочернему тексту после offset
  const child = container.childNodes[offset];
  if (child) {
    const seg = map.segments.find((s) => child.contains(s.node));
    if (seg) return seg.start;
  }
  return map.text.length;
}

export function rangeFromOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const map = extractTextWithMap(root);
  const a = pointAt(map, start);
  const b = pointAt(map, end);
  if (!a || !b) return null;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

function pointAt(map: TextMap, offset: number): { node: Text; offset: number } | null {
  for (const seg of map.segments) {
    if (offset >= seg.start && offset <= seg.end) {
      return { node: seg.node, offset: Math.min(offset - seg.start, seg.node.data.length) };
    }
  }
  const last = map.segments[map.segments.length - 1];
  if (last) return { node: last.node, offset: last.node.data.length };
  return null;
}

export function selectOffsets(root: HTMLElement, start: number, end: number): void {
  const range = rangeFromOffsets(root, start, end);
  if (!range) return;
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
  root.focus();
}

/** Заменяет текст по смещениям, сохраняя нативную историю отмены. */
export function replaceOffsets(root: HTMLElement, start: number, end: number, replacement: string): boolean {
  const range = rangeFromOffsets(root, start, end);
  if (!range) return false;
  const sel = window.getSelection();
  if (!sel) return false;
  root.focus();
  sel.removeAllRanges();
  sel.addRange(range);
  if (replacement === '') {
    const deleted = document.execCommand('delete', false);
    if (!deleted) sel.deleteFromDocument();
    root.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return true;
  }
  return document.execCommand('insertText', false, replacement);
}

export function insertAtCaret(root: HTMLElement, text: string): boolean {
  const selection = window.getSelection();
  const selectionInside =
    selection &&
    selection.rangeCount > 0 &&
    root.contains(selection.anchorNode) &&
    root.contains(selection.focusNode);

  // Кнопки панели забирают фокус, и каретка теряется. В этом случае
  // надёжнее явно дописать абзац в конец, чем доверять execCommand.
  if (!selectionInside) {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    root.appendChild(paragraph);
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    root.focus();
    return true;
  }

  root.focus();
  return document.execCommand('insertText', false, text);
}

export function placeCaretAtEnd(root: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Дописывает текст отдельным абзацем в конец — надёжно для диктовки. */
export function appendParagraph(root: HTMLElement, text: string): void {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  root.appendChild(paragraph);
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  range.collapse(false);
  const selection = window.getSelection();
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
  root.focus();
}

/* --------------------------- разметка сценария --------------------------- */

export type ScreenplayLine =
  | 'scene'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition';

const TRANSITION_RE = /^(CUT TO|FADE (IN|OUT|TO BLACK)|SMASH CUT|DISSOLVE TO|ЗАТЕМНЕНИЕ|ПЕРЕХОД)[:. ]/i;
const SCENE_RE = /^(INT|EXT|INT\/EXT|I\/E|ИНТ|ЭКСТ|ИНТ\/ЭКСТ|НАТ|ИНТ\/НАТ)[\s.\-/]/i;

export function classifyScreenplayLines(lines: { text: string; el: HTMLElement }[]): ScreenplayLine[] {
  const result: ScreenplayLine[] = [];
  lines.forEach((line, index) => {
    const raw = line.text.trim();
    const prev = result[index - 1];
    if (!raw) {
      result.push('action');
      return;
    }
    if (SCENE_RE.test(raw)) {
      result.push('scene');
      return;
    }
    if (TRANSITION_RE.test(raw)) {
      result.push('transition');
      return;
    }
    if (raw.startsWith('(') || raw.startsWith('(')) {
      result.push(prev === 'character' || prev === 'dialogue' ? 'parenthetical' : 'action');
      return;
    }
    const letters = raw.replace(/[^\p{L}]/gu, '');
    const isUpper = letters.length > 1 && letters === letters.toUpperCase() && !/[.!?]$/.test(raw);
    if (isUpper && raw.length <= 42 && prev !== 'character') {
      result.push('character');
      return;
    }
    if (prev === 'character' || prev === 'dialogue' || prev === 'parenthetical') {
      result.push(raw.endsWith(':') && isUpper ? 'character' : 'dialogue');
      return;
    }
    result.push('action');
  });
  return result;
}

export function applyScreenplayClasses(root: HTMLElement): void {
  const blocks = Array.from(root.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && isBlock(el),
  );
  if (!blocks.length) return;
  const kinds = classifyScreenplayLines(blocks.map((el) => ({ text: el.innerText ?? '', el })));
  blocks.forEach((el, i) => {
    const kind = kinds[i];
    el.classList.remove('sp-scene', 'sp-action', 'sp-character', 'sp-parenthetical', 'sp-dialogue', 'sp-transition');
    el.classList.add(`sp-${kind}`);
    if (kind === 'scene' || kind === 'character' || kind === 'transition') {
      const upper = el.innerText.toUpperCase();
      if (upper !== el.innerText) {
        // uppercasing через DOM испортил бы каретку, поэтому только визуально:
        el.setAttribute('data-upper', 'true');
      } else {
        el.removeAttribute('data-upper');
      }
    } else {
      el.removeAttribute('data-upper');
    }
  });
}
