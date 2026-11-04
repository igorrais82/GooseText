export function uid(prefix = 'd'): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rnd}`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function plainFromHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html
    .replace(/<\/(p|div|h1|h2|h3|li|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  return (div.textContent ?? '').replace(/\u00a0/g, ' ');
}

export function htmlFromPlain(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Очень простой HTML → Markdown для экспорта. */
export function htmlToMarkdown(html: string): string {
  const withBlocks = html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gis, '\n# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gis, '\n## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gis, '\n### $1\n')
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (_m, inner: string) => `\n> ${inner.trim()}\n`)
    .replace(/<li[^>]*>(.*?)<\/li>/gis, (_m, inner: string) => `- ${inner.trim()}\n`)
    .replace(/<\/?(ul|ol|p|div|section)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(b|strong)[^>]*>(.*?)<\/\1>/gis, '**$2**')
    .replace(/<(i|em)[^>]*>(.*?)<\/\1>/gis, '*$2*')
    .replace(/<u[^>]*>(.*?)<\/u>/gis, '$1')
    .replace(/<[^>]+>/g, '');
  const div = document.createElement('div');
  div.innerHTML = withBlocks;
  return (div.textContent ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function charCount(text: string): number {
  return text.length;
}

export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 180));
}

export function snippet(html: string, limit = 90): string {
  const text = plainFromHtml(html).replace(/\s+/g, ' ').trim();
  return text.length > limit ? text.slice(0, limit).trimEnd() + '…' : text;
}

/** Название документа: заголовок, иначе первая строка текста. */
export function displayTitle(title: string, html: string, limit = 70): string {
  if (title.trim()) return title.trim();
  const firstLine = plainFromHtml(html)
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return 'Без названия';
  return firstLine.length > limit ? firstLine.slice(0, limit).trimEnd() + '…' : firstLine;
}

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayDiff(ts: number): number {
  const today = startOfDay(Date.now());
  return Math.round((startOfDay(ts) - today) / 86400000);
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const diff = dayDiff(ts);
  if (diff === 0) return `сегодня, ${formatTime(ts)}`;
  if (diff === 1) return `завтра, ${formatTime(ts)}`;
  if (diff === -1) return `вчера, ${formatTime(ts)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${formatTime(ts)}`;
}

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const hours = Math.round(min / 60);
  if (hours < 24 && dayDiff(ts) === 0) return `${hours} ч назад`;
  if (dayDiff(ts) === -1) return 'вчера';
  const d = new Date(ts);
  if (Date.now() - ts < 7 * 86400000) return `${WEEKDAYS[d.getDay()]}, ${formatTime(ts)}`;
  if (d.getFullYear() === new Date().getFullYear()) return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export function toDateTimeLocal(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

export function fromDateTimeLocal(value: string): number | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Быстрый набор «через 10 минут», «завтра в 9», «в пятницу» */
export function parseQuickReminder(input: string): number | null {
  const text = input.toLowerCase().trim();
  const now = new Date();
  const inMinutes = text.match(/через\s+(\d+)\s*(мин|минут|ч|час)/);
  if (inMinutes) {
    const n = Number(inMinutes[1]);
    const mult = inMinutes[2].startsWith('ч') ? 60 : 1;
    return Date.now() + n * mult * 60000;
  }
  if (/через\s+час/.test(text)) return Date.now() + 3600000;
  const russianWeekdays = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];
  for (let i = 0; i < russianWeekdays.length; i++) {
    if (text.includes(russianWeekdays[i])) {
      const target = new Date(now);
      const delta = ((i - now.getDay() + 7) % 7) || 7;
      target.setDate(target.getDate() + delta);
      const h = text.match(/(\d{1,2})(:(\d{2}))?/);
      target.setHours(h ? Number(h[1]) : 9, h && h[3] ? Number(h[3]) : 0, 0, 0);
      return target.getTime();
    }
  }
  const tomorrow = /завтра/.test(text);
  const today = /сегодня/.test(text);
  if (tomorrow || today) {
    const target = new Date(now);
    if (tomorrow) target.setDate(target.getDate() + 1);
    const h = text.match(/(\d{1,2})(:(\d{2}))?/);
    target.setHours(h ? Number(h[1]) : 9, h && h[3] ? Number(h[3]) : 0, 0, 0);
    return target.getTime();
  }
  return null;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
