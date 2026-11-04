/**
 * Очистка HTML перед вставкой в редактор.
 *
 * HTML приходит из импортированных резервных копий и из буфера обмена.
 * Без фильтра `<img onerror=…>` из чужого JSON выполнился бы в приложении,
 * поэтому оставляем только безопасные теги и атрибуты.
 */

const ALLOWED_TAGS = new Set([
  'P',
  'DIV',
  'BR',
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'S',
  'STRIKE',
  'H1',
  'H2',
  'H3',
  'H4',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'PRE',
  'CODE',
  'SPAN',
  'A',
  'IMG',
  'HR',
  'TABLE',
  'THEAD',
  'TBODY',
  'TR',
  'TH',
  'TD',
]);

const DROP_WITH_CONTENT = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'LINK',
  'META',
  'BASE',
  'FORM',
  'INPUT',
  'BUTTON',
  'TEXTAREA',
  'SELECT',
  'SVG',
  'MATH',
  'AUDIO',
  'VIDEO',
  'CANVAS',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  A: new Set(['href', 'title']),
  IMG: new Set(['src', 'alt', 'title', 'width', 'height']),
  TD: new Set(['colspan', 'rowspan']),
  TH: new Set(['colspan', 'rowspan']),
};

function safeUrl(value: string, allowData: boolean): string | null {
  const url = value.trim();
  if (!url) return null;
  if (allowData && /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(url)) return url;
  if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
  if (url.startsWith('#') || url.startsWith('/') || url.startsWith('./')) return url;
  return null;
}

function cleanElement(el: Element): void {
  for (const child of Array.from(el.children)) {
    if (DROP_WITH_CONTENT.has(child.tagName)) {
      child.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(child.tagName)) {
      // Неизвестный тег разворачиваем: текст сохраняем, разметку — нет.
      cleanElement(child);
      child.replaceWith(...Array.from(child.childNodes));
      continue;
    }
    const allowed = ALLOWED_ATTRS[child.tagName];
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      if (!allowed?.has(name)) {
        child.removeAttribute(attr.name);
        continue;
      }
      if ((name === 'href' || name === 'src') && !safeUrl(attr.value, name === 'src')) {
        child.removeAttribute(attr.name);
      }
    }
    if (child.tagName === 'A') {
      child.setAttribute('rel', 'noreferrer noopener');
      child.setAttribute('target', '_blank');
    }
    cleanElement(child);
  }
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    cleanElement(doc.body);
    return doc.body.innerHTML;
  } catch {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
  }
}

/** Текст без разметки — безопасная альтернатива для заголовков и сниппетов. */
export function plainText(html: string): string {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    return (doc.body.textContent ?? '').replace(/\u00a0/g, ' ').trim();
  } catch {
    return html.replace(/<[^>]+>/g, '').trim();
  }
}
