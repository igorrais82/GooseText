export type DocKind = 'note' | 'summary' | 'script' | 'reminder' | 'drawing';

export type DrawTool = 'pen' | 'marker' | 'eraser';

export interface DrawPoint {
  /** Координата по логической оси X (0…1000) */
  x: number;
  /** Координата по логической оси Y (0…1000) */
  y: number;
  /** Сила нажатия 0.2…1, для пера */
  p: number;
}

export interface DrawStroke {
  id: string;
  tool: DrawTool;
  color: string;
  width: number;
  points: DrawPoint[];
}

export interface Drawing {
  /** Логическая ширина холста */
  width: number;
  /** Логическая высота холста */
  height: number;
  background: string;
  strokes: DrawStroke[];
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  collapsed?: boolean;
}

export type LicensePlan = 'trial' | 'pro';

export interface License {
  plan: LicensePlan;
  key: string | null;
  activatedAt: number | null;
  trialStartedAt: number;
  email: string | null;
}

export interface Doc {
  id: string;
  kind: DocKind;
  title: string;
  html: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  /** Unix ms, только для напоминаний и для «напомнить о документе» */
  reminderAt: number | null;
  reminderDone: boolean;
  language: 'ru' | 'en';
  tags: string[];
  /** Папка, в которой лежит документ; null — корень */
  folderId: string | null;
  /** Векторный рисунок: хранится для типа «Рисунок» */
  drawing: Drawing | null;
}

export type Lang = 'ru' | 'en' | 'auto';

export type ThemeMode = 'light' | 'dark' | 'system';
export type StylePreset = 'standard' | 'minimal' | 'realistic' | 'detailed' | 'contrast' | 'soft';
export type FontChoice = 'system' | 'segoe' | 'georgia' | 'consolas';
export type RetellMode = 'brief' | 'detailed';
export type DictationEngine = 'auto' | 'browser' | 'local';

export interface Settings {
  theme: ThemeMode;
  style: StylePreset;
  font: FontChoice;
  language: Lang;
  fontSize: number;
  lineHeight: number;
  docsOpen: boolean;
  assistantOpen: boolean;
  autoSave: boolean;
  sound: boolean;
  retellMode: RetellMode;
  translateSource: string;
  translateTarget: string;
  narratorRate: number;
  dictationEngine: DictationEngine;
}

export const THEME_OPTIONS: { key: ThemeMode; label: string; icon: 'sun' | 'moon' | 'monitor' }[] = [
  { key: 'light', label: 'Светлая', icon: 'sun' },
  { key: 'dark', label: 'Тёмная', icon: 'moon' },
  { key: 'system', label: 'Системная', icon: 'monitor' },
];

export const STYLE_OPTIONS: { key: StylePreset; label: string; hint: string }[] = [
  {
    key: 'standard',
    label: 'Стандартный',
    hint: 'Ровный и собранный: тонкие линии, оранжевый акцент, умеренные отступы.',
  },
  {
    key: 'minimal',
    label: 'Минималистичный',
    hint: 'Почти без рамок и теней, больше воздуха, акцент только на активном.',
  },
  {
    key: 'realistic',
    label: 'Реалистичный',
    hint: 'Тёплая бумага, мягкие тени, книжный шрифт с засечками.',
  },
  {
    key: 'detailed',
    label: 'Детальный',
    hint: 'Плотнее и информативнее: метрики, разделители, подписи у всего.',
  },
  {
    key: 'contrast',
    label: 'Контрастный',
    hint: 'Графичный: толстые рамки, капс, крупные акценты и чёткая сетка.',
  },
  {
    key: 'soft',
    label: 'Мягкий',
    hint: 'Пастель, большие скругления, воздух и плавающие карточки.',
  },
];

export const FONT_OPTIONS: { key: FontChoice; label: string; stack: string; sample: string }[] = [
  {
    key: 'system',
    label: 'Системный',
    stack: "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",
    sample: 'Гусь пишет текст',
  },
  {
    key: 'segoe',
    label: 'Segoe UI',
    stack: "'Segoe UI', Tahoma, sans-serif",
    sample: 'Гусь пишет текст',
  },
  {
    key: 'georgia',
    label: 'Georgia · с засечками',
    stack: "Georgia, 'Times New Roman', serif",
    sample: 'Гусь пишет текст',
  },
  {
    key: 'consolas',
    label: 'Consolas · моно',
    stack: "Consolas, 'Courier New', monospace",
    sample: 'Гусь пишет текст',
  },
];

export interface AppState {
  docs: Doc[];
  folders: Folder[];
  settings: Settings;
  license: License;
  version: number;
}

export type IssueType = 'spelling' | 'grammar' | 'style' | 'typography';

export interface SpellIssue {
  id: string;
  offset: number;
  length: number;
  message: string;
  shortMessage: string;
  replacements: string[];
  type: IssueType;
  ruleId: string;
  context: { text: string; offset: number; length: number };
}

export interface SpellState {
  issues: SpellIssue[];
  source: 'languagetool' | 'local';
  note?: string;
  checkedAt: number;
  text: string;
}

export type AssistantTab =
  | 'spell'
  | 'retell'
  | 'translate'
  | 'dictation'
  | 'speak'
  | 'outline'
  | 'reminders'
  | 'stats';

export type ToastKind = 'info' | 'success' | 'error' | 'goose';

export interface Toast {
  id: string;
  kind: ToastKind;
  text: string;
  action?: { label: string; run: () => void };
}

export const KIND_META: Record<
  DocKind,
  { label: string; plural: string; icon: string; hint: string; accent: string }
> = {
  note: {
    label: 'Заметка',
    plural: 'Заметки',
    icon: 'note',
    hint: 'Быстрая мысль, список, черновик',
    accent: '#F97316',
  },
  summary: {
    label: 'Конспект',
    plural: 'Конспекты',
    icon: 'summary',
    hint: 'Учебный конспект с планом и выводами',
    accent: '#EA580C',
  },
  script: {
    label: 'Сценарий',
    plural: 'Сценарии',
    icon: 'script',
    hint: 'Сцены, реплики, ремарки',
    accent: '#C2410C',
  },
  reminder: {
    label: 'Напоминание',
    plural: 'Напоминания',
    icon: 'reminder',
    hint: 'Короткая запись со временем',
    accent: '#FB923C',
  },
  drawing: {
    label: 'Рисунок',
    plural: 'Рисунки',
    icon: 'brush',
    hint: 'Набросок, схема или рисунок от руки',
    accent: '#0E7C86',
  },
};

/** Бесплатные лимиты без лицензии. */
export const FREE_LIMITS = {
  docs: 30,
  folders: 5,
};
