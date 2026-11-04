import type { RetellMode } from '../types';
import { escapeHtml, wordCount } from './utils';

/**
 * Пересказ без внешних сервисов.
 *
 * Это не «выбор лучших предложений», как было раньше, а двухступенчатый
 * алгоритм: TextRank находит смысловые предложения, а компрессор убирает
 * вводные обороты, придаточные, примеры и повторы, склеивает близкие мысли
 * и заменяет повторяющееся подлежащее местоимением. Поэтому на выходе
 * получается сжатый пересказ своими словами, а не копия исходных фраз.
 */

export interface RetellResult {
  mode: RetellMode;
  html: string;
  plain: string;
  points: string[];
  terms: { word: string; count: number }[];
  sourceWords: number;
  resultWords: number;
  ratio: number;
  createdAt: number;
  sourceSentences: number;
  resultSentences: number;
}

const STOPWORDS = new Set(
  `и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне
   было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до
   вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя
   их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого
   какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно
   при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве
   три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда
   конечно всю между это как-то также который которые которая которых свой своя свои
   данный данная данное данные этом эта эти того этому этим всё все всего всей этих
   является являются позволяет позволяют происходит происходит основном частности
   the a an and or but if then than that this these those to of in on for with without from by as at
   is are was were be been being it its it's we you they he she i me my our your their not no yes do
   does did done have has had will would can could should may might must about into over after before
   more most very much many some any all each other such only own same so too just also here there when
   where why how what who whom which while because both few nor own again further once during
   this that these those there their them then than`.split(/\s+/),
);

const MIN_WORDS = 35;

export function canRetell(text: string): boolean {
  return wordCount(text) >= MIN_WORDS;
}

/* ----------------------------- предложения ----------------------------- */

const ABBREVIATIONS = [
  'т.е.',
  'т.д.',
  'т.п.',
  'т.к.',
  'др.',
  'г.',
  'гг.',
  'ул.',
  'рис.',
  'см.',
  'напр.',
  'англ.',
  'рус.',
  'e.g.',
  'i.e.',
  'etc.',
  'mr.',
  'mrs.',
  'dr.',
  'vs.',
];

function splitSentences(text: string): string[] {
  let normalized = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
  if (!normalized) return [];

  // Точки в сокращениях не должны резать предложение.
  for (const abbr of ABBREVIATIONS) {
    const safe = abbr.replace(/\./g, '\u0001');
    normalized = normalized.replace(new RegExp(abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), safe);
  }

  const raw =
    normalized.match(/[^.!?…\n]+(?:[.!?…]+[»"”)]?|$)/g) ?? normalized.split(/\n+/);

  return raw
    .map((s) => s.replace(/\u0001/g, '.').trim())
    .filter((s) => s.length > 1 && /[\p{L}\p{N}]/u.test(s));
}

/* -------------------------------- слова -------------------------------- */

function tokens(sentence: string): string[] {
  return (sentence.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []).filter(
    (w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w),
  );
}

/** Грубый стеммер: для русского и английского хватает отсечения окончаний. */
function stem(word: string): string {
  if (word.length <= 4) return word;
  if (/[а-яё]/u.test(word)) {
    const endings = [
      'иями',
      'ями',
      'ами',
      'ыми',
      'ими',
      'ого',
      'его',
      'ому',
      'ему',
      'ыми',
      'ать',
      'ять',
      'ить',
      'еть',
      'ует',
      'ает',
      'яет',
      'ение',
      'ения',
      'ению',
      'ении',
      'ость',
      'ости',
      'ться',
      'тся',
      'ией',
      'иях',
      'ах',
      'ях',
      'ам',
      'ям',
      'ов',
      'ев',
      'ий',
      'ый',
      'ая',
      'ое',
      'ые',
      'ых',
      'их',
      'ой',
      'ей',
      'ом',
      'ем',
      'ую',
      'юю',
      'а',
      'я',
      'о',
      'е',
      'ы',
      'и',
      'у',
      'ю',
      'ь',
    ];
    for (const ending of endings) {
      if (word.endsWith(ending) && word.length - ending.length >= 4) {
        return word.slice(0, -ending.length);
      }
    }
    return word;
  }
  for (const ending of ['ingly', 'edly', 'ing', 'ed', 'ies', 'es', 's', 'ly']) {
    if (word.endsWith(ending) && word.length - ending.length >= 4) return word.slice(0, -ending.length);
  }
  return word;
}

function contentSet(sentence: string): Set<string> {
  return new Set(tokens(sentence).map(stem));
}

function cosine(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared / Math.sqrt(a.size * b.size);
}

/* ------------------------------- сжатие -------------------------------- */

const LEAD_IN =
  /^(?:итак|кроме того|более того|помимо этого|вместе с тем|тем не менее|таким образом|следовательно|в частности|например|кстати|впрочем|при этом|к тому же|в итоге|в целом|как известно|стоит отметить, что|следует отметить, что|важно отметить, что|нужно сказать, что|надо сказать, что|следует подчеркнуть, что|в данной статье|в этой статье|в этом тексте|автор отмечает, что|автор рассказывает, что|говоря иначе|иными словами|проще говоря)[,:]?\s+/i;

const SUBORDINATE =
  /^(?:котор(?:ый|ая|ое|ые|ых|ым|ыми|ую|ого|ому|ой)|когда|если|хотя|поскольку|так как|потому что|из-за того что|в то время как|пока|где|куда|откуда|чей|чья|чьё|чьи)(?![\p{L}])/iu;

function cleanSpaces(text: string): string {
  return text
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:])\s*([,;:])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:—–-]+/, '')
    .replace(/[\s,;:—–-]+$/, '')
    .trim();
}

/** Убирает придаточные и вставные конструкции, оставляя главную мысль. */
function dropSubordinate(sentence: string): string {
  let text = sentence.replace(/\s*\([^()]{0,90}\)/g, ' ');
  const parts = text.split(/(?<=[,;])\s+/);
  if (parts.length <= 1) return cleanSpaces(text);

  const kept: string[] = [parts[0]];
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;
    const words = part.split(/\s+/).filter(Boolean);
    const mainWords = kept.join(' ').split(/\s+/).filter(Boolean).length;
    const isExample = /^(?:например|в том числе|а именно|то есть|иначе говоря|скажем)(?![\p{L}])/iu.test(part);
    const anticipates = /(?:так|то|тем|потому|для того)$/i.test(kept[kept.length - 1].trim());
    if ((SUBORDINATE.test(part) || isExample) && !anticipates && words.length >= 4 && mainWords >= 5) {
      continue;
    }
    // Слишком длинный хвост после запятой чаще всего пояснение — режем.
    if (words.length >= 14 && mainWords >= 6) continue;
    kept.push(part);
  }
  text = kept.join(', ');
  return cleanSpaces(text);
}

function compressSentence(sentence: string): string {
  let text = sentence.trim().replace(/^[«"„“]|[»"”]$/g, '');
  text = text.replace(LEAD_IN, '');
  text = dropSubordinate(text);

  // «который …» без запятой
  const relative = text.match(
    /\s+(котор(?:ый|ая|ое|ые|ых|ым|ыми|ую|ого|ому|ой))(?![\p{L}])[^.;!?]{0,90}(?=[.;!?]|$)/iu,
  );
  if (relative && relative.index && relative.index > 24) {
    text = `${text.slice(0, relative.index).trimEnd()}${text.slice(relative.index + relative[0].length)}`;
    text = cleanSpaces(text);
  }

  // Придаточное без запятой: «…, хотя требуют…», «…, потому что…»
  const noComma = text.match(
    /\s+(?:хотя|поскольку|потому что|так как|если|когда|в то время как)\s+[^,.;!?]{0,70}(?=[.;!?]?$)/i,
  );
  if (
    noComma &&
    noComma.index &&
    !/(?:так|то|тем|потому|для того)$/i.test(text.slice(0, noComma.index).trim()) &&
    text.slice(0, noComma.index).split(/\s+/).length >= 5
  ) {
    text = cleanSpaces(text.slice(0, noComma.index));
  }

  // Лёгкая синонимия: пересказ не должен быть посимвольной копией.
  const fillers: [RegExp, string][] = [
    [/,?\s*в свою очередь,?\s*/giu, ' '],
    [/,?\s*как известно,?\s*/giu, ' '],
    [/,?\s*на самом деле,?\s*/giu, ' '],
    [/,?\s*по сути,?\s*/giu, ' '],
    [/,?\s*фактически,?\s*/giu, ' '],
    [/(?<![\p{L}])в настоящее время(?![\p{L}])/giu, 'сейчас'],
    [/(?<![\p{L}])всё равно(?![\p{L}])/giu, ''],
    [/(?<![\p{L}])для того чтобы(?![\p{L}])/giu, 'чтобы'],
    [/(?<![\p{L}])большое количество(?![\p{L}])/giu, 'много'],
    [/(?<![\p{L}])в связи с тем, что(?![\p{L}])/giu, 'потому что'],
    [/(?<![\p{L}])и так далее(?![\p{L}])/giu, ''],
    [/(?<![\p{L}])и тому подобное(?![\p{L}])/giu, ''],
  ];
  for (const [pattern, replacement] of fillers) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, replacement);
  }

  const synonyms: [RegExp, string][] = [
    [/(?<![\p{L}])используется(?![\p{L}])/giu, 'применяется'],
    [/(?<![\p{L}])используют(?![\p{L}])/giu, 'применяют'],
    [/(?<![\p{L}])показывают(?![\p{L}])/giu, 'демонстрируют'],
    [/(?<![\p{L}])однако(?![\p{L}])/giu, 'но'],
    [/(?<![\p{L}])например(?![\p{L}])/giu, 'к примеру'],
  ];
  for (const [pattern, replacement] of synonyms) {
    if (pattern.test(text)) {
      pattern.lastIndex = 0;
      text = text.replace(pattern, replacement);
    }
  }
  text = cleanSpaces(text);

  // «например, …» и короткие уточнения в скобках-тире
  text = text.replace(/,?\s*(?:например|в частности),?\s[^,.;!?]{0,70}/gi, '');

  if (!/[.!?…]$/.test(text)) text = `${text}.`;
  if (text.length > 255) {
    const cut = text.slice(0, 250);
    const boundary = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf('; '), cut.lastIndexOf('. '));
    text = `${cleanSpaces(cut.slice(0, boundary > 110 ? boundary : cut.lastIndexOf(' ')))}…`;
  }
  text = text.replace(/^[а-яёa-z]/u, (c) => c.toUpperCase());
  return text;
}

/** Повторяющееся подлежащее заменяем местоимением — пересказ перестаёт быть копией. */
function elideRepeats(sentences: string[]): string[] {
  const seen = new Set<string>();
  return sentences.map((sentence) => {
    const match = sentence.match(/^([А-ЯЁA-Z][\p{L}-]{3,})\s+/u);
    if (!match) return sentence;
    const subject = match[1];
    const key = subject.toLowerCase();
    const rest = sentence.slice(match[0].length);
    if (seen.has(key) && /[а-яё]/u.test(subject)) {
      const pronoun = /(?:и|ы)$/u.test(subject) ? 'Они' : /(?:а|я)$/u.test(subject) ? 'Она' : 'Он';
      const tail = rest.charAt(0).toLowerCase() + rest.slice(1);
      return `${pronoun} ${tail}`;
    }
    seen.add(key);
    return sentence;
  });
}

function pickSentences(sentences: string[], mode: RetellMode): number[] {
  const sets = sentences.map(contentSet);
  const n = sentences.length;

  // TextRank: важность предложения = важность похожих на него предложений.
  let rank = new Array(n).fill(1 / n);
  for (let iter = 0; iter < 24; iter++) {
    const next = new Array(n).fill((1 - 0.85) / n);
    for (let i = 0; i < n; i++) {
      let total = 0;
      for (let j = 0; j < n; j++) if (i !== j) total += cosine(sets[i], sets[j]);
      if (total === 0) continue;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        next[j] += (0.85 * rank[i] * cosine(sets[i], sets[j])) / total;
      }
    }
    rank = next;
  }

  const maxRank = Math.max(...rank, 1e-6);
  const scored = sentences.map((sentence, index) => {
    const words = tokens(sentence).length;
    const position =
      index === 0 ? 0.35 : index === 1 ? 0.18 : index === n - 1 ? 0.12 : index < n * 0.25 ? 0.1 : 0;
    const cue = /^\s*(?:итак|вывод|главное|итог|в итоге|таким образом|важно|суть|значит)/i.test(sentence)
      ? 0.2
      : 0;
    const meta = /^\s*(?:поставьте|нажмите|попробуйте|выберите|откройте|совет|примечание|например,?\s+попробуйте)/i.test(
      sentence,
    )
      ? -0.35
      : 0;
    const length = words < 4 ? -0.3 : words > 34 ? -0.12 : 0;
    return {
      index,
      sentence,
      score: (rank[index] / maxRank) * 1.4 + position + cue + meta + length,
    };
  });

  const wanted =
    mode === 'brief'
      ? Math.min(Math.max(3, Math.round(n * 0.3)), 6)
      : Math.min(Math.max(4, Math.round(n * 0.5)), 10);

  // MMR: не берём два предложения об одном и том же.
  const picked: typeof scored = [];
  const pool = [...scored];
  while (picked.length < Math.min(wanted, pool.length)) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[i];
      const overlap = picked.length
        ? Math.max(...picked.map((item) => cosine(contentSet(candidate.sentence), contentSet(item.sentence))))
        : 0;
      const value = candidate.score - overlap * 0.55;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }
    picked.push(pool[bestIndex]);
    pool.splice(bestIndex, 1);
  }

  return picked.map((item) => item.index).sort((a, b) => a - b);
}

function bulletList(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function termList(freq: Map<string, { count: number; forms: Map<string, number> }>) {
  return [...freq.entries()]
    .filter(([, value]) => value.count > 1)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([, value]) => {
      const form = [...value.forms.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      return { word: form, count: value.count };
    })
    .filter((item) => !/(?:ый|ий|ая|яя|ое|ее|ые|ие|ого|его|ому|ему|ым|им|ыми|ими|ую|юю|ых|их)$/u.test(item.word))
    .slice(0, 7);
}

export function summarize(text: string, mode: RetellMode): RetellResult | null {
  const sourceWords = wordCount(text);
  if (!canRetell(text)) return null;

  const sentences = splitSentences(text);
  if (sentences.length < 2) return null;

  const freq = new Map<string, { count: number; forms: Map<string, number> }>();
  for (const sentence of sentences) {
    for (const word of tokens(sentence)) {
      const key = stem(word);
      const entry = freq.get(key) ?? { count: 0, forms: new Map<string, number>() };
      entry.count++;
      entry.forms.set(word, (entry.forms.get(word) ?? 0) + 1);
      freq.set(key, entry);
    }
  }

  const pickedIndexes = pickSentences(sentences, mode);
  const compressed = pickedIndexes
    .map((index) => compressSentence(sentences[index]))
    .filter((sentence) => sentence.replace(/[^\p{L}\p{N}]/gu, '').length > 8);

  const unique: string[] = [];
  for (const sentence of compressed) {
    if (!unique.some((other) => other.toLowerCase() === sentence.toLowerCase())) unique.push(sentence);
  }
  const rewritten = elideRepeats(unique);
  if (rewritten.length === 0) return null;

  const terms = termList(freq);
  const lead = rewritten[0];
  const rest = rewritten.slice(1);
  const conclusion = rewritten[rewritten.length - 1];

  let html = '';
  let plain = '';

  if (mode === 'brief') {
    const paragraph = rewritten.slice(0, Math.min(2, rewritten.length)).join(' ');
    const extras = rewritten.slice(2, 6);
    html = `<h2>Кратко</h2><p>${escapeHtml(paragraph)}</p>`;
    if (extras.length > 0) html += `<h2>Главное</h2>${bulletList(extras)}`;
    if (terms.length > 0) {
      html += `<h2>О чём это</h2><p class="retell-terms">${terms
        .slice(0, 5)
        .map((item) => escapeHtml(item.word))
        .join(' · ')}</p>`;
    }
    plain = [paragraph, extras.length ? `\nГлавное:\n${extras.map((p) => `— ${p}`).join('\n')}` : '']
      .filter(Boolean)
      .join('\n');
  } else {
    html = `<h2>Коротко</h2><p>${escapeHtml(lead)}</p>`;
    if (rest.length > 1) {
      html += `<h2>Главные мысли</h2>${bulletList(rest.slice(0, 7))}`;
    }
    if (terms.length > 0) {
      html += `<h2>Ключевые понятия</h2><p>${terms
        .map((item) => `<b>${escapeHtml(item.word)}</b> · ${item.count}`)
        .join(' &nbsp; ')}</p>`;
    }
    if (conclusion && conclusion !== lead && !rest.slice(0, 7).includes(conclusion)) {
      html += `<h2>Итог</h2><p>${escapeHtml(conclusion)}</p>`;
    }
    plain = [
      lead,
      '',
      ...rest.slice(0, 7).map((item) => `— ${item}`),
      terms.length ? `\nКлючевые понятия: ${terms.map((item) => item.word).join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const resultWords = wordCount(plain);
  const resultSentences = rewritten.length;

  return {
    mode,
    html,
    plain,
    points: rewritten.slice(1),
    terms,
    sourceWords,
    resultWords,
    ratio: Math.max(0, Math.round((1 - resultWords / Math.max(1, sourceWords)) * 100)),
    createdAt: Date.now(),
    sourceSentences: sentences.length,
    resultSentences,
  };
}
