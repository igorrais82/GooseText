/** Разбор текста: структура, ключевые слова и читаемость — всё локально. */

export interface TextMetrics {
  words: number;
  sentences: number;
  paragraphs: number;
  avgSentence: number;
  longSentences: number;
  waterShare: number;
  readability: number;
  readabilityLabel: string;
}

export interface Keyword {
  word: string;
  count: number;
}

export interface OutlineItem {
  level: 0 | 1 | 2;
  text: string;
}

const STOPWORDS = new Set(
  `и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне
   было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до
   вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя
   их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого
   какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно
   при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве
   три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда
   конечно всю между это также который которые которая которых свой своя свои данный этом эта эти
   всё все всего всей является являются позволяет позволяют происходит основном частности
   the a an and or but if then than that this these those to of in on for with without from by as at
   is are was were be been being it its we you they he she i me my our your their not no yes do does
   did done have has had will would can could should may might must about into over after before
   more most very much many some any all each other such only own same so too just also here there when
   where why how what who whom which while because both few nor again further once during`.split(/\s+/),
);

function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];
}

function stem(word: string): string {
  const lower = word.toLowerCase();
  if (lower.length <= 4) return lower;
  if (/[а-яё]/u.test(lower)) {
    const endings = [
      'иями', 'ями', 'ами', 'ыми', 'ими', 'ого', 'его', 'ому', 'ему', 'ать', 'ять', 'ить', 'еть',
      'ение', 'ения', 'ению', 'ении', 'ость', 'ости', 'ться', 'тся', 'ией', 'иях', 'ах', 'ях',
      'ам', 'ям', 'ов', 'ев', 'ий', 'ый', 'ая', 'ое', 'ые', 'ых', 'их', 'ой', 'ей', 'ом', 'ем',
      'ую', 'юю', 'а', 'я', 'о', 'е', 'ы', 'и', 'у', 'ю', 'ь',
    ];
    for (const ending of endings) {
      if (lower.endsWith(ending) && lower.length - ending.length >= 4) {
        return lower.slice(0, -ending.length);
      }
    }
    return lower;
  }
  for (const ending of ['ingly', 'edly', 'ing', 'ed', 'ies', 'es', 's', 'ly']) {
    if (lower.endsWith(ending) && lower.length - ending.length >= 4) return lower.slice(0, -ending.length);
  }
  return lower;
}

export function extractKeywords(text: string, limit = 12): Keyword[] {
  const map = new Map<string, { count: number; forms: Map<string, number> }>();
  for (const word of words(text)) {
    if (word.length <= 2 || /^\d+$/.test(word)) continue;
    if (STOPWORDS.has(word.toLowerCase())) continue;
    const key = stem(word);
    if (key.length < 3) continue;
    const entry = map.get(key) ?? { count: 0, forms: new Map<string, number>() };
    entry.count++;
    entry.forms.set(word.toLowerCase(), (entry.forms.get(word.toLowerCase()) ?? 0) + 1);
    map.set(key, entry);
  }

  return [...map.values()]
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((entry) => {
      const form = [...entry.forms.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      return { word: form, count: entry.count };
    })
    .filter(
      (item) =>
        !/(?:ый|ий|ая|яя|ое|ее|ые|ие|ого|его|ому|ему|ым|им|ыми|ими|ую|юю|ых|их)$/u.test(item.word) ||
        item.count > 2,
    )
    .slice(0, limit);
}

/** Слоги по гласным — приблизительно, но для оценки читаемости достаточно. */
function syllables(word: string): number {
  const vowels = word.toLowerCase().match(/[аеёиоуыэюяaeiouy]/g);
  return Math.max(1, vowels?.length ?? 1);
}

export function analyzeText(text: string): TextMetrics {
  const wordList = words(text);
  const wordTotal = wordList.length;
  const sentenceList = text
    .replace(/\s+/g, ' ')
    .match(/[^.!?…]+[.!?…]+/g)
    ?.map((s) => s.trim())
    .filter((s) => s.length > 2) ?? [];
  const sentences = Math.max(1, sentenceList.length);
  const paragraphs = text.split(/\n+/).filter((line) => line.trim()).length || 1;
  const avgSentence = wordTotal / sentences;
  const longSentences = sentenceList.filter((s) => words(s).length > 24).length;
  const water = wordList.filter((w) => STOPWORDS.has(w.toLowerCase())).length;
  const waterShare = wordTotal ? Math.round((water / wordTotal) * 100) : 0;
  const syllableTotal = wordList.reduce((sum, word) => sum + syllables(word), 0);
  const raw =
    206.835 - 1.3 * avgSentence - 60.1 * (wordTotal ? syllableTotal / wordTotal : 1.5);
  const readability = Math.round(Math.min(100, Math.max(0, raw)));
  const readabilityLabel =
    readability >= 60
      ? 'Легко читать'
      : readability >= 45
        ? 'Средняя сложность'
        : readability >= 30
          ? 'Сложновато'
          : 'Тяжело читать';

  return {
    words: wordTotal,
    sentences,
    paragraphs,
    avgSentence: Math.round(avgSentence * 10) / 10,
    longSentences,
    waterShare,
    readability,
    readabilityLabel,
  };
}

function firstSentence(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= 96) return clean;
  const cut = clean.match(/^[^.!?…]{0,96}(?:[.!?…]|$)/)?.[0] ?? clean.slice(0, 96);
  return cut.trim();
}

/**
 * План текста: заголовки, если они есть, иначе первые фразы абзацев.
 * HTML приходит из редактора, поэтому структура сохраняется.
 */
export function buildOutline(html: string, text: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const headings = [...doc.querySelectorAll('h1, h2, h3')];
    if (headings.length >= 2) {
      for (const heading of headings) {
        const content = heading.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        if (!content) continue;
        const tag = heading.tagName.toLowerCase();
        items.push({ level: tag === 'h1' ? 0 : tag === 'h2' ? 1 : 2, text: content.slice(0, 120) });
      }
      if (items.length > 0) return items.slice(0, 16);
    }

    const blocks = [...doc.querySelectorAll('p, li, blockquote')]
      .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter((content) => content.length > 25);

    for (const block of blocks) {
      const sentence = firstSentence(block);
      if (!sentence) continue;
      const exists = items.some((item) => item.text.toLowerCase() === sentence.toLowerCase());
      if (exists) continue;
      items.push({ level: items.length === 0 ? 0 : 1, text: sentence });
      if (items.length >= 12) break;
    }
  } catch {
    /* DOMParser недоступен — ниже запасной вариант */
  }

  if (items.length === 0 && text.trim()) {
    const sentences = text
      .replace(/\s+/g, ' ')
      .match(/[^.!?…]+[.!?…]+/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? [];
    const step = Math.max(1, Math.floor(sentences.length / 8));
    for (let i = 0; i < sentences.length && items.length < 10; i += step) {
      items.push({ level: items.length === 0 ? 0 : 1, text: firstSentence(sentences[i]) });
    }
  }

  return items;
}

export function outlineToText(items: OutlineItem[]): string {
  return items.map((item) => `${'  '.repeat(item.level)}• ${item.text}`).join('\n');
}

export function outlineToHtml(items: OutlineItem[], title = 'План текста'): string {
  const list = items
    .map((item) => {
      const text = item.text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
      return `<li>${text}</li>`;
    })
    .join('');
  return `<h1>${title}</h1><ul>${list}</ul>`;
}
