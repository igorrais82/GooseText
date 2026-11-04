import type { IssueType, SpellIssue } from '../types';

export interface SpellResult {
  issues: SpellIssue[];
  source: 'languagetool' | 'local';
  note?: string;
  checkedAt: number;
}

const LT_URL = 'https://api.languagetool.org/v2/check';

const LT_LANG: Record<string, string> = {
  ru: 'ru-RU',
  en: 'en-US',
};

function mapIssueType(raw: string): IssueType {
  switch (raw) {
    case 'misspelling':
      return 'spelling';
    case 'typographical':
    case 'duplication':
      return 'typography';
    case 'style':
    case 'register':
    case 'locale-violation':
      return 'style';
    default:
      return 'grammar';
  }
}

interface LtMatch {
  message: string;
  shortMessage: string;
  offset: number;
  length: number;
  replacements: { value: string }[];
  rule: { id: string; issueType: string; category?: { id: string; name: string } };
  context: { text: string; offset: number; length: number };
}

export async function checkText(text: string, lang: 'ru' | 'en'): Promise<SpellResult> {
  const trimmed = text.trim();
  if (!trimmed) return { issues: [], source: 'local', checkedAt: Date.now() };

  try {
    const body = new URLSearchParams({
      text: text.slice(0, 18000),
      language: LT_LANG[lang] ?? 'ru-RU',
      enabledOnly: 'false',
      level: 'picky',
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(LT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`LanguageTool ${res.status}`);
    const data = (await res.json()) as { matches: LtMatch[] };
    const issues: SpellIssue[] = data.matches.map((m, i) => ({
      id: `${m.rule.id}_${m.offset}_${i}`,
      offset: m.offset,
      length: m.length,
      message: m.message,
      shortMessage: m.shortMessage || m.rule?.category?.name || 'Замечание',
      replacements: (m.replacements ?? []).map((r) => r.value).slice(0, 5),
      type: mapIssueType(m.rule?.issueType ?? ''),
      ruleId: m.rule?.id ?? '',
      context: m.context ?? { text, offset: m.offset, length: m.length },
    }));
    return { issues, source: 'languagetool', checkedAt: Date.now() };
  } catch (err) {
    const issues = localCheck(text, lang);
    return {
      issues,
      source: 'local',
      note:
        err instanceof DOMException && err.name === 'AbortError'
          ? 'Сервер проверки не ответил — показаны локальные проверки.'
          : 'Нет связи с сервером проверки — показаны локальные проверки.',
      checkedAt: Date.now(),
    };
  }
}

/* --------------------- офлайн-проверки (без сети) --------------------- */

interface LocalRule {
  re: RegExp;
  type: IssueType;
  message: string;
  fix?: (match: string, ...groups: string[]) => string[] | null;
}

const LOCAL_RULES_RU: LocalRule[] = [
  {
    re: /(\S) {2,}/g,
    type: 'typography',
    message: 'Двойной пробел',
    fix: () => [' '],
  },
  {
    re: / {2,}/g,
    type: 'typography',
    message: 'Лишние пробелы',
    fix: () => [' '],
  },
  {
    re: /\s+([,.;:!?])/g,
    type: 'typography',
    message: 'Пробел перед знаком препинания',
    fix: () => [','],
  },
  {
    re: /([,;:])(?=[\p{L}])/gu,
    type: 'typography',
    message: 'Нет пробела после знака препинания',
    fix: (m) => [`${m} `],
  },
  {
    re: /(\p{L}{3,}) \1/giu,
    type: 'grammar',
    message: 'Слово повторяется дважды',
    fix: (m) => [m.split(' ')[0]],
  },
  {
    re: /([.!?…])\s*(\p{Ll})/gu,
    type: 'grammar',
    message: 'Предложение начинается со строчной буквы',
  },
  {
    re: /\b(?:текстт|гусъ|приветсвие|програма|пророж)\b/giu,
    type: 'spelling',
    message: 'Возможная опечатка',
    fix: () => null,
  },
];

const LOCAL_RULES_EN: LocalRule[] = [
  {
    re: / {2,}/g,
    type: 'typography',
    message: 'Лишние пробелы',
    fix: () => [' '],
  },
  {
    re: /\s+([,.;:!?])/g,
    type: 'typography',
    message: 'Пробел перед знаком препинания',
    fix: () => [','],
  },
  {
    re: /([,;:])(?=[A-Za-z])/g,
    type: 'typography',
    message: 'Нет пробела после знака препинания',
    fix: (m) => [`${m} `],
  },
  {
    re: /\b(\w{3,}) \1\b/giu,
    type: 'grammar',
    message: 'Слово повторяется дважды',
  },
  {
    re: /\b(?:teh|recieve|seperate|wich|thier|alot)\b/gi,
    type: 'spelling',
    message: 'Возможная опечатка',
    fix: (m) => {
      const map: Record<string, string> = {
        teh: 'the',
        recieve: 'receive',
        seperate: 'separate',
        wich: 'which',
        thier: 'their',
        alot: 'a lot',
      };
      return [map[m.toLowerCase()] ?? m];
    },
  },
];

export function localCheck(text: string, lang: 'ru' | 'en'): SpellIssue[] {
  const rules = lang === 'en' ? LOCAL_RULES_EN : LOCAL_RULES_RU;
  const issues: SpellIssue[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    const re = new RegExp(rule.re.source, rule.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      const key = `${m.index}:${m[0].length}:${rule.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const reps = rule.fix ? rule.fix(m[0], ...m.slice(1)) : null;
      issues.push({
        id: `local_${rule.message}_${m.index}_${m[0].length}`,
        offset: m.index,
        length: m[0].length,
        message: rule.message,
        shortMessage: rule.type === 'typography' ? 'Оформление' : 'Правило',
        replacements: reps ?? [],
        type: rule.type,
        ruleId: 'LOCAL',
        context: {
          text: text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30),
          offset: 30,
          length: m[0].length,
        },
      });
    }
  }
  return issues.sort((a, b) => a.offset - b.offset);
}

export const LANGUAGE_LABEL: Record<string, string> = {
  ru: 'Русский',
  en: 'English',
};

export function detectLanguage(text: string): 'ru' | 'en' {
  const cyr = (text.match(/[а-яё]/gi) ?? []).length;
  const lat = (text.match(/[a-z]/gi) ?? []).length;
  return cyr >= lat ? 'ru' : 'en';
}
