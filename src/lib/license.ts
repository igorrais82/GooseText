import type { License } from '../types';
import { FREE_LIMITS } from '../types';

/**
 * Лицензия GooseText.
 *
 * Важно: это офлайн-прототип магазина. Реальной оплаты здесь нет — ключ
 * проверяется на устройстве по контрольной сумме. Для продаж нужно подключить
 * платёжный провайдер (ЮKassa, CloudPayments, Robokassa) и выдавать ключи
 * с сервера. Подробности — в README, раздел «Лицензия».
 */

export const PRICE_YEAR = 149;
export const PRICE_FOREVER = 349;
export const TRIAL_DAYS = 14;

export interface Plan {
  id: 'year' | 'forever';
  label: string;
  price: number;
  period: string;
  hint: string;
  best?: boolean;
  perks: string[];
}

export const PLANS: Plan[] = [
  {
    id: 'year',
    label: 'На год',
    price: PRICE_YEAR,
    period: '₽ / год',
    hint: 'Дешевле чашки кофе в месяц',
    perks: ['Без ограничений на документы', 'Неограниченные папки', 'Подробный пересказ'],
  },
  {
    id: 'forever',
    label: 'Навсегда',
    price: PRICE_FOREVER,
    period: '₽ один раз',
    hint: 'Платите один раз — обновления навсегда',
    best: true,
    perks: ['Всё из годовой', 'Экспорт рисунков в PNG', 'Ранний доступ к новым типам'],
  },
];

export const PRO_FEATURES = [
  'Документы без лимита (бесплатно — до ' + FREE_LIMITS.docs + ')',
  'Папки без лимита (бесплатно — до ' + FREE_LIMITS.folders + ')',
  'Подробный пересказ в два режима',
  'Экспорт рисунков в PNG',
  'Все будущие обновления',
];

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const KEY_RE = /^GTXT-[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/;

export function defaultLicense(): License {
  return {
    plan: 'trial',
    key: null,
    activatedAt: null,
    trialStartedAt: Date.now(),
    email: null,
  };
}

/** Нормализует ввод пользователя: пробелы, регистр, дефисы. */
export function normalizeKey(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
  const body = cleaned.startsWith('GTXT') ? cleaned.slice(4) : cleaned;
  if (body.length !== 15) return raw.trim().toUpperCase();
  return `GTXT-${body.slice(0, 5)}-${body.slice(5, 10)}-${body.slice(10, 15)}`;
}

function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function encodeBase32(value: number, length: number): string {
  let out = '';
  let v = value >>> 0;
  for (let i = 0; i < length; i++) {
    out += ALPHABET[v & 31];
    v >>>= 5;
  }
  return out;
}

/** Контрольная группа для первых двух групп ключа. */
export function checksumFor(prefix: string): string {
  return encodeBase32(hash32(`goosetext:${prefix}`), 5);
}

/** Создаёт корректный ключ — используется при выдаче лицензии и в тестах. */
export function makeKey(seed: string): string {
  const normalizedSeed = seed.toUpperCase().replace(/[^0-9A-Z]/g, '').padStart(10, '7');
  let body = '';
  let h = hash32(normalizedSeed);
  for (let i = 0; i < 10; i++) {
    body += ALPHABET[h & 31];
    h = hash32(`${normalizedSeed}:${i}:${h}`);
  }
  const prefix = `${body.slice(0, 5)}-${body.slice(5, 10)}`;
  return `GTXT-${prefix}-${checksumFor(prefix)}`;
}

export function isValidKey(raw: string): boolean {
  const key = normalizeKey(raw);
  if (!KEY_RE.test(key)) return false;
  const [, first, second, third] = key.split('-');
  return checksumFor(`${first}-${second}`) === third;
}

export function activateLicense(key: string, email: string | null): License {
  const normalized = normalizeKey(key);
  return {
    plan: 'pro',
    key: normalized,
    activatedAt: Date.now(),
    trialStartedAt: Date.now(),
    email: email?.trim() ? email.trim() : null,
  };
}

export function trialDaysLeft(license: License): number {
  const total = TRIAL_DAYS * 86400000;
  const left = license.trialStartedAt + total - Date.now();
  return Math.max(0, Math.ceil(left / 86400000));
}

export interface Entitlements {
  /** Полный доступ: купленная лицензия или активный пробный период. */
  pro: boolean;
  /** Куплена ли лицензия (а не пробник). */
  paid: boolean;
  trial: boolean;
  trialExpired: boolean;
  daysLeft: number;
  docsLimit: number | null;
  foldersLimit: number | null;
  /** Бесплатных документов осталось; null — без лимита. */
  docsLeft: number | null;
}

export function entitlements(license: License, docCount: number): Entitlements {
  const paid = license.plan === 'pro';
  const daysLeft = trialDaysLeft(license);
  const trial = !paid && daysLeft > 0;
  const pro = paid || trial;
  return {
    pro,
    paid,
    trial,
    trialExpired: !paid && daysLeft === 0,
    daysLeft,
    docsLimit: pro ? null : FREE_LIMITS.docs,
    foldersLimit: pro ? null : FREE_LIMITS.folders,
    docsLeft: pro ? null : Math.max(0, FREE_LIMITS.docs - docCount),
  };
}

/** Человеческое описание статуса для настроек и шапки магазина. */
export function licenseStatusText(license: License): string {
  if (license.plan === 'pro') {
    return license.key ? `Лицензия активирована · ${license.key}` : 'Лицензия активирована';
  }
  const days = trialDaysLeft(license);
  return days > 0
    ? `Пробный период · осталось ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`
    : 'Пробный период закончился';
}

/** Ссылка на страницу оплаты. В прототипе ведёт на сайт проекта. */
export const CHECKOUT_URL = 'https://goosetext.example/pay';
