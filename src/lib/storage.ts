import type { AppState, Doc, DocKind, Drawing, Folder, License, Settings } from '../types';
import { KIND_META } from '../types';
import { uid } from './utils';
import { defaultLicense } from './license';
import { sanitizeHtml } from './sanitize';

const KEY = 'goosetext.state.v2';
export const STATE_VERSION = 3;

export const defaultSettings: Settings = {
  theme: 'light',
  style: 'standard',
  font: 'system',
  language: 'auto',
  fontSize: 17,
  lineHeight: 1.7,
  docsOpen: true,
  assistantOpen: true,
  autoSave: true,
  sound: true,
  retellMode: 'brief',
  translateSource: 'auto',
  translateTarget: 'en',
  narratorRate: 1,
  dictationEngine: 'auto',
};

function doc(partial: Partial<Doc> & Pick<Doc, 'kind' | 'title' | 'html'>): Doc {
  const now = Date.now();
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    pinned: false,
    reminderAt: null,
    reminderDone: false,
    language: 'ru',
    tags: [],
    folderId: null,
    drawing: null,
    ...partial,
  };
}

function tomorrowAt(hour: number, minute = 0): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

export function seedState(): AppState {
  const study: Folder = { id: uid('f'), name: 'Учёба', parentId: null, createdAt: Date.now() };
  const creative: Folder = { id: uid('f'), name: 'Творчество', parentId: null, createdAt: Date.now() };

  const docs: Doc[] = [
    doc({
      kind: 'note',
      title: 'Добро пожаловать в GooseText',
      html: `<p>Привет! Я <b>гусь Гоша</b> — маскот GooseText. Я помогаю писать заметки, конспекты, сценарии, рисовать схемы и не забывать про важное.</p>
<h2>Что здесь есть</h2>
<ul><li><b>Пять типов текстов</b> — заметки, конспекты, сценарии, напоминания и рисунки. Выберите тип при создании: подсказки и оформление подстроятся.</li><li><b>Папки</b> — раскладывайте документы по папкам, переименовывайте и перетаскивайте их в списке слева.</li><li><b>Пересказ</b> — кнопка «Пересказ» в помощнике делает краткую выжимку или подробный разбор текста.</li><li><b>Проверка ошибок</b> — панель «Проверка» находит опечатки, грамматику и лишние пробелы.</li><li><b>Речь в текст</b> — нажмите «Диктовка», говорите, и текст появится в документе.</li><li><b>Напоминания</b> — поставьте время, и я клювом постучу в нужный момент.</li></ul>
<h2>Попробуйте прямо сейчас</h2>
<p>Поставьте курсор в этот абзац и нажмите «Проверить текст» справа: я найду вот этот двойной  пробел и слово «тестт».</p>
<blockquote>Совет: документы сохраняются сами и живут в памяти браузера на этом устройстве.</blockquote>`,
      pinned: true,
    }),
    doc({
      kind: 'summary',
      title: 'Конспект: как гуси покорили мир',
      folderId: study.id,
      html: `<h2>1. Кто такие гуси</h2>
<p>Гуси — крупные водоплавающие птицы семейства утиных. Отличаются крепкой шеей, плотным оперением и громким голосом. Живут стаями, умеют запоминать маршруты и узнавать людей в лицо.</p>
<h2>2. Почему они важны</h2>
<ul><li>Домашние гуси дают пух, перо и мясо.</li><li>Дикие гуси — индикатор состояния экосистемы водоёмов.</li><li>В культуре гусь — символ верности и бдительности.</li></ul>
<h2>3. Короткий вывод</h2>
<p>Гусь — птица, которая умеет быть и полезной, и красивой, и очень громкой. Примерно как хороший редактор.</p>`,
    }),
    doc({
      kind: 'script',
      title: 'Сценарий: Гусь идёт в кино',
      folderId: creative.id,
      html: `<p>INT. КИНОТЕАТР — ВЕЧЕР</p>
<p>Полутьма. Гусь в шарфе стоит у кассы и внимательно смотрит на афишу.</p>
<p>ГУСЬ</p>
<p>Один билет. И, пожалуйста, место подальше от попкорна.</p>
<p>КАССИР</p>
<p>У нас только первый ряд.</p>
<p>Гусь торжественно кивает и достаёт из-за пазухи пригоршню кукурузы.</p>
<p>EXT. УЛИЦА У КИНОТЕАТРА — НОЧЬ</p>
<p>Гусь выходит на улицу, поправляет шарф и уходит в темноту, гордо поднимая голову.</p>`,
    }),
    doc({
      kind: 'reminder',
      title: 'Покормить гуся',
      html: '<p>Зёрна, немного зелени и чистая вода в миске.</p>',
      reminderAt: tomorrowAt(9, 0),
    }),
  ];

  return {
    docs,
    folders: [study, creative],
    settings: defaultSettings,
    license: defaultLicense(),
    version: STATE_VERSION,
  };
}

/* --------------------------- нормализация данных --------------------------- */

const KINDS = new Set(Object.keys(KIND_META) as DocKind[]);

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeDrawing(raw: unknown): Drawing | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<Drawing>;
  if (!Array.isArray(value.strokes)) return null;
  const strokes = value.strokes
    .filter((stroke) => stroke && Array.isArray(stroke.points) && stroke.points.length > 0)
    .map((stroke) => ({
      id: typeof stroke.id === 'string' ? stroke.id : uid('s'),
      tool: stroke.tool === 'marker' || stroke.tool === 'eraser' ? stroke.tool : ('pen' as const),
      color: typeof stroke.color === 'string' ? stroke.color : '#1f1b18',
      width: Math.min(80, Math.max(1, num(stroke.width, 4))),
      points: stroke.points.map((p) => ({
        x: num(p?.x),
        y: num(p?.y),
        p: Math.min(1, Math.max(0.1, num(p?.p, 0.5))),
      })),
    }));
  return {
    width: Math.max(1, num(value.width, 1000)),
    height: Math.max(1, num(value.height, 750)),
    background: typeof value.background === 'string' ? value.background : '#ffffff',
    strokes,
  };
}

function normalizeFolder(raw: unknown): Folder | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<Folder>;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  return {
    id: value.id,
    name: value.name.slice(0, 80) || 'Папка',
    parentId: typeof value.parentId === 'string' ? value.parentId : null,
    createdAt: num(value.createdAt, Date.now()),
    collapsed: Boolean(value.collapsed),
  };
}

function normalizeDoc(raw: unknown): Doc | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<Doc>;
  if (typeof value.id !== 'string') return null;
  const kind: DocKind = KINDS.has(value.kind as DocKind) ? (value.kind as DocKind) : 'note';
  return {
    id: value.id,
    kind,
    title: typeof value.title === 'string' ? value.title.slice(0, 400) : '',
    html: sanitizeHtml(typeof value.html === 'string' ? value.html : ''),
    createdAt: num(value.createdAt, Date.now()),
    updatedAt: num(value.updatedAt, Date.now()),
    pinned: Boolean(value.pinned),
    reminderAt: typeof value.reminderAt === 'number' ? value.reminderAt : null,
    reminderDone: Boolean(value.reminderDone),
    language: value.language === 'en' ? 'en' : 'ru',
    tags: Array.isArray(value.tags) ? value.tags.filter((t): t is string => typeof t === 'string') : [],
    folderId: typeof value.folderId === 'string' ? value.folderId : null,
    drawing: normalizeDrawing(value.drawing),
  };
}

function normalizeLicense(raw: unknown): License {
  const fallback = defaultLicense();
  if (!raw || typeof raw !== 'object') return fallback;
  const value = raw as Partial<License>;
  return {
    plan: value.plan === 'pro' ? 'pro' : 'trial',
    key: typeof value.key === 'string' ? value.key : null,
    activatedAt: typeof value.activatedAt === 'number' ? value.activatedAt : null,
    trialStartedAt: typeof value.trialStartedAt === 'number' ? value.trialStartedAt : fallback.trialStartedAt,
    email: typeof value.email === 'string' ? value.email : null,
  };
}

/** Приводит любое состояние (из хранилища или файла) к актуальной версии. */
export function normalizeState(raw: unknown): AppState {
  const value = (raw ?? {}) as Partial<AppState>;
  const docs = Array.isArray(value.docs) ? value.docs.map(normalizeDoc).filter((d): d is Doc => Boolean(d)) : [];
  const folders = Array.isArray(value.folders)
    ? value.folders.map(normalizeFolder).filter((f): f is Folder => Boolean(f))
    : [];
  const folderIds = new Set(folders.map((f) => f.id));
  const cleanedFolders = folders.map((f) => ({
    ...f,
    parentId: f.parentId && folderIds.has(f.parentId) ? f.parentId : null,
  }));
  return {
    docs: docs.map((d) => ({
      ...d,
      folderId: d.folderId && folderIds.has(d.folderId) ? d.folderId : null,
    })),
    folders: cleanedFolders,
    settings: { ...defaultSettings, ...(value.settings ?? {}) },
    license: normalizeLicense(value.license),
    version: STATE_VERSION,
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (!parsed || !Array.isArray(parsed.docs)) return seedState();
    return normalizeState(parsed);
  } catch (err) {
    console.warn('Не удалось прочитать состояние', err);
    return seedState();
  }
}

/** Сохраняет состояние. Возвращает false, если места в хранилище не хватило. */
export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn('Не удалось сохранить состояние', err);
    return false;
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

export function exportState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function importState(json: string): AppState {
  const parsed = JSON.parse(json) as Partial<AppState>;
  if (!parsed || !Array.isArray(parsed.docs)) throw new Error('Это не резервная копия GooseText');
  const normalized = normalizeState(parsed);
  if (normalized.docs.length === 0 && (!parsed.docs || parsed.docs.length > 0)) {
    throw new Error('В файле не нашлось ни одного документа');
  }
  return normalized;
}
