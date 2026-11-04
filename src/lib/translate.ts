/**
 * Перевод текста.
 *
 * Основной путь — два открытых переводческих эндпоинта без ключа
 * (Google gtx и MyMemory): они дают нормальное качество и не требуют
 * регистрации. Если сети нет, включается офлайн-словарь для русско-английской
 * пары — он честно помечает результат как черновой.
 */

export type TranslateProvider = 'google' | 'mymemory' | 'offline';

export interface TranslateLang {
  code: string;
  label: string;
  native: string;
  code2: string;
}

export const TRANSLATE_LANGS: TranslateLang[] = [
  { code: 'en', label: 'Английский', native: 'English', code2: 'en' },
  { code: 'ru', label: 'Русский', native: 'Русский', code2: 'ru' },
  { code: 'de', label: 'Немецкий', native: 'Deutsch', code2: 'de' },
  { code: 'fr', label: 'Французский', native: 'Français', code2: 'fr' },
  { code: 'es', label: 'Испанский', native: 'Español', code2: 'es' },
  { code: 'it', label: 'Итальянский', native: 'Italiano', code2: 'it' },
  { code: 'pt', label: 'Португальский', native: 'Português', code2: 'pt' },
  { code: 'tr', label: 'Турецкий', native: 'Türkçe', code2: 'tr' },
  { code: 'uk', label: 'Украинский', native: 'Українська', code2: 'uk' },
  { code: 'pl', label: 'Польский', native: 'Polski', code2: 'pl' },
  { code: 'kk', label: 'Казахский', native: 'Қазақша', code2: 'kk' },
  { code: 'zh', label: 'Китайский', native: '中文', code2: 'zh-CN' },
  { code: 'ja', label: 'Японский', native: '日本語', code2: 'ja' },
  { code: 'ko', label: 'Корейский', native: '한국어', code2: 'ko' },
  { code: 'ar', label: 'Арабский', native: 'العربية', code2: 'ar' },
];

export function langLabel(code: string): string {
  if (code === 'auto') return 'Определить язык';
  return TRANSLATE_LANGS.find((lang) => lang.code === code)?.label ?? code;
}

export function langCode2(code: string): string {
  return TRANSLATE_LANGS.find((lang) => lang.code === code)?.code2 ?? code;
}

/** Простое определение языка: письменность + частые слова. */
export function detectLanguage(text: string): string {
  const clean = text.replace(/[^\p{L}\s]/gu, ' ').toLowerCase();
  if (/[іїєґ]/u.test(clean)) return 'uk';
  if (/[а-яё]/u.test(clean)) return 'ru';
  if (/[\u4e00-\u9fff]/u.test(clean)) return 'zh';
  if (/[\u3040-\u30ff]/u.test(clean)) return 'ja';
  if (/[\uac00-\ud7af]/u.test(clean)) return 'ko';
  if (/[\u0600-\u06ff]/u.test(clean)) return 'ar';
  const words = new Set(clean.split(/\s+/).filter(Boolean));
  const count = (list: string[]) => list.filter((word) => words.has(word)).length;
  const scores: Record<string, number> = {
    de: count(['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'ein', 'eine', 'für']),
    fr: count(['le', 'la', 'les', 'et', 'est', 'une', 'des', 'pour', 'dans', 'que']),
    es: count(['el', 'la', 'los', 'las', 'y', 'es', 'una', 'para', 'con', 'que']),
    it: count(['il', 'la', 'gli', 'e', 'una', 'per', 'con', 'che', 'non', 'sono']),
    pt: count(['o', 'a', 'os', 'as', 'e', 'uma', 'para', 'com', 'que', 'não']),
    tr: count(['ve', 'bir', 'bu', 'için', 'ile', 'de', 'da', 'çok', 'olarak']),
    en: count(['the', 'and', 'is', 'are', 'to', 'of', 'in', 'for', 'with', 'that']),
  };
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : 'en';
}

/* ------------------------------- сеть ------------------------------- */

const CACHE = new Map<string, TranslationResult>();

export interface TranslationResult {
  text: string;
  provider: TranslateProvider;
  detected: string;
  note?: string;
}

async function fetchJson(url: string, timeout = 15000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function splitForApi(text: string, limit: number): string[] {
  const blocks = text.split(/\n{2,}/);
  const chunks: string[] = [];
  for (const block of blocks) {
    if (block.length <= limit) {
      chunks.push(block);
      continue;
    }
    const sentences = block.match(/[^.!?…]+[.!?…]*\s*/g) ?? [block];
    let current = '';
    for (const sentence of sentences) {
      if ((current + sentence).length > limit && current) {
        chunks.push(current);
        current = '';
      }
      if (sentence.length > limit) {
        for (let i = 0; i < sentence.length; i += limit) chunks.push(sentence.slice(i, i + limit));
      } else {
        current += sentence;
      }
    }
    if (current) chunks.push(current);
  }
  return chunks.length > 0 ? chunks : [text];
}

async function googleTranslate(text: string, from: string, to: string): Promise<string> {
  const parts = splitForApi(text, 1600);
  const out: string[] = [];
  for (const part of parts) {
    const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t' +
      `&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&q=${encodeURIComponent(part)}`;
    const data = (await fetchJson(url)) as unknown[];
    const segments = Array.isArray(data?.[0]) ? (data[0] as unknown[]) : [];
    const translated = segments
      .map((segment) => (Array.isArray(segment) ? String(segment[0] ?? '') : ''))
      .join('');
    if (!translated) throw new Error('Пустой ответ Google');
    out.push(translated);
  }
  return out.join('\n\n');
}

async function myMemoryTranslate(text: string, from: string, to: string): Promise<string> {
  const parts = splitForApi(text, 450);
  const out: string[] = [];
  for (const part of parts) {
    const url =
      'https://api.mymemory.translated.net/get?q=' +
      encodeURIComponent(part) +
      `&langpair=${encodeURIComponent(from)}|${encodeURIComponent(to)}`;
    const data = (await fetchJson(url)) as {
      responseData?: { translatedText?: string };
      responseStatus?: number | string;
    };
    const translated = data?.responseData?.translatedText ?? '';
    if (!translated || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(translated)) {
      throw new Error('MyMemory не ответил');
    }
    out.push(
      translated
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>'),
    );
  }
  return out.join('\n\n');
}

/* ---------------------------- офлайн-словарь ---------------------------- */

const RU_EN: Record<string, string> = {
  привет: 'hello',
  здравствуйте: 'hello',
  спасибо: 'thank you',
  пожалуйста: 'please',
  да: 'yes',
  нет: 'no',
  и: 'and',
  или: 'or',
  но: 'but',
  я: 'I',
  мы: 'we',
  ты: 'you',
  вы: 'you',
  он: 'he',
  она: 'she',
  они: 'they',
  это: 'this',
  что: 'what',
  как: 'how',
  где: 'where',
  когда: 'when',
  почему: 'why',
  потому: 'because',
  очень: 'very',
  хорошо: 'good',
  плохо: 'bad',
  текст: 'text',
  слово: 'word',
  слова: 'words',
  документ: 'document',
  заметка: 'note',
  заметки: 'notes',
  конспект: 'summary',
  сценарий: 'script',
  рисунок: 'drawing',
  папка: 'folder',
  напоминание: 'reminder',
  время: 'time',
  день: 'day',
  ночь: 'night',
  утро: 'morning',
  вечер: 'evening',
  сегодня: 'today',
  завтра: 'tomorrow',
  вчера: 'yesterday',
  сейчас: 'now',
  потом: 'later',
  всегда: 'always',
  никогда: 'never',
  человек: 'person',
  люди: 'people',
  друг: 'friend',
  друзья: 'friends',
  работа: 'work',
  дом: 'home',
  город: 'city',
  страна: 'country',
  мир: 'world',
  жизнь: 'life',
  язык: 'language',
  перевод: 'translation',
  перевести: 'translate',
  пересказ: 'retelling',
  речь: 'speech',
  голос: 'voice',
  микрофон: 'microphone',
  ошибка: 'error',
  ошибки: 'errors',
  проверка: 'check',
  правило: 'rule',
  пример: 'example',
  вопрос: 'question',
  ответ: 'answer',
  идея: 'idea',
  мысль: 'thought',
  главное: 'main',
  кратко: 'briefly',
  подробно: 'in detail',
  важно: 'important',
  нужно: 'need',
  можно: 'can',
  нельзя: 'cannot',
  делать: 'do',
  сделать: 'do',
  писать: 'write',
  читать: 'read',
  говорить: 'speak',
  слушать: 'listen',
  видеть: 'see',
  знать: 'know',
  думать: 'think',
  понимать: 'understand',
  помогать: 'help',
  работать: 'work',
  учиться: 'study',
  жить: 'live',
  любить: 'love',
  хотеть: 'want',
  мочь: 'can',
  быть: 'be',
  есть: 'is',
  был: 'was',
  будет: 'will be',
  новый: 'new',
  старый: 'old',
  большой: 'big',
  маленький: 'small',
  быстрый: 'fast',
  медленный: 'slow',
  простой: 'simple',
  сложный: 'complex',
  хороший: 'good',
  плохой: 'bad',
  красивый: 'beautiful',
  интересный: 'interesting',
  важный: 'important',
  главный: 'main',
  первый: 'first',
  последний: 'last',
  один: 'one',
  два: 'two',
  три: 'three',
  четыре: 'four',
  пять: 'five',
  гусь: 'goose',
  гуси: 'geese',
  птица: 'bird',
  птицы: 'birds',
  вода: 'water',
  небо: 'sky',
  солнце: 'sun',
  книга: 'book',
  книги: 'books',
  письмо: 'letter',
  ручка: 'pen',
  стол: 'table',
  окно: 'window',
  дверь: 'door',
  дорога: 'road',
  машина: 'car',
  музыка: 'music',
  кино: 'cinema',
  фильм: 'film',
  игра: 'game',
  школа: 'school',
  университет: 'university',
  наука: 'science',
  искусство: 'art',
  история: 'history',
  природа: 'nature',
  здоровье: 'health',
  деньги: 'money',
  еда: 'food',
  чай: 'tea',
  кофе: 'coffee',
  хлеб: 'bread',
};

const EN_RU: Record<string, string> = Object.fromEntries(
  Object.entries(RU_EN).map(([ru, en]) => [en, ru]),
);

const PHRASES: [string, string][] = [
  ['добро пожаловать', 'welcome'],
  ['как дела', 'how are you'],
  ['спасибо большое', 'thank you very much'],
  ['до свидания', 'goodbye'],
  ['извините', 'sorry'],
  ['пересказ текста', 'text summary'],
  ['проверка ошибок', 'spell check'],
  ['голосовой ввод', 'voice input'],
  ['новый документ', 'new document'],
  ['сохранить документ', 'save document'],
];

function offlineTranslate(text: string, from: string, to: string): string {
  const pair = from === 'ru' && to === 'en' ? RU_EN : from === 'en' && to === 'ru' ? EN_RU : null;
  if (!pair) {
    throw new Error('Офлайн-словарь работает только между русским и английским. Проверьте интернет.');
  }

  const lower = text.toLowerCase();
  for (const [source, target] of PHRASES) {
    if (lower.includes(source) && from === 'ru') {
      text = text.replace(new RegExp(source, 'gi'), target);
    } else if (lower.includes(target) && from === 'en') {
      text = text.replace(new RegExp(target, 'gi'), source);
    }
  }

  return text.replace(/[\p{L}]+/gu, (word) => {
    const key = word.toLowerCase();
    const direct = pair[key];
    if (direct) return matchCase(word, direct);
    // простые формы: слова, документы, тексты…
    const base = key.replace(/(ами|ями|ов|ев|ах|ях|ам|ям|ой|ей|ую|юю|а|я|ы|и|у|ю|е|о|ь)$/u, '');
    const byStem = pair[base];
    if (byStem) return matchCase(word, byStem);
    return word;
  });
}

function matchCase(source: string, target: string): string {
  if (!source || !target) return target;
  if (source[0] === source[0].toUpperCase()) {
    return target[0].toUpperCase() + target.slice(1);
  }
  return target;
}

/* ------------------------------ публичное ------------------------------ */

export async function translateText(
  text: string,
  from: string,
  to: string,
): Promise<TranslationResult> {
  const source = text.trim();
  if (!source) throw new Error('Нет текста для перевода');

  const detected = from === 'auto' ? detectLanguage(source) : from;
  if (detected === to) {
    return { text: source, provider: 'offline', detected, note: 'Языки совпадают — переводить нечего' };
  }

  const cacheKey = `${detected}|${to}|${source}`;
  const cached = CACHE.get(cacheKey);
  if (cached) return cached;

  const attempts: { provider: TranslateProvider; run: () => Promise<string> }[] = [
    { provider: 'google', run: () => googleTranslate(source, detected, to) },
    { provider: 'mymemory', run: () => myMemoryTranslate(source, detected, to) },
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const translated = await attempt.run();
      const result: TranslationResult = {
        text: translated.trim(),
        provider: attempt.provider,
        detected,
      };
      CACHE.set(cacheKey, result);
      return result;
    } catch (error) {
      lastError = error;
    }
  }

  if ((detected === 'ru' && to === 'en') || (detected === 'en' && to === 'ru')) {
    const result: TranslationResult = {
      text: offlineTranslate(source, detected, to),
      provider: 'offline',
      detected,
      note: 'Интернет недоступен: это черновой перевод по офлайн-словарю.',
    };
    return result;
  }

  console.warn('Перевод не удался', lastError);
  throw new Error(
    'Не удалось связаться с переводчиком. Проверьте интернет или выберите английский/русский — для них есть офлайн-словарь.',
  );
}

export function translationProviderLabel(provider: TranslateProvider): string {
  if (provider === 'google') return 'Google Translate';
  if (provider === 'mymemory') return 'MyMemory';
  return 'Офлайн-словарь';
}
