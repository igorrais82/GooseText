/**
 * AI-озвучка текста.
 *
 * Нейроголос отдаёт маленький локальный прокси (в приложении — main-процесс,
 * в веб-версии — server/serve.mjs): он ходит в открытый TTS-сервис Google,
 * склеивает MP3 и отдаёт его странице. Если прокси недоступен, интерфейс
 * предлагает системный голос Windows.
 */
import { getModelBase } from './platform';
import { saveFile } from './saveFile';

export interface AiLanguage {
  code: string;
  label: string;
  native: string;
}

export const AI_LANGUAGES: AiLanguage[] = [
  { code: 'ru', label: 'Русский', native: 'Русский' },
  { code: 'en', label: 'Английский', native: 'English' },
  { code: 'de', label: 'Немецкий', native: 'Deutsch' },
  { code: 'fr', label: 'Французский', native: 'Français' },
  { code: 'es', label: 'Испанский', native: 'Español' },
  { code: 'it', label: 'Итальянский', native: 'Italiano' },
  { code: 'pt', label: 'Португальский', native: 'Português' },
  { code: 'tr', label: 'Турецкий', native: 'Türkçe' },
  { code: 'uk', label: 'Украинский', native: 'Українська' },
  { code: 'pl', label: 'Польский', native: 'Polski' },
  { code: 'kk', label: 'Казахский', native: 'Қазақша' },
  { code: 'zh-CN', label: 'Китайский', native: '中文' },
  { code: 'ja', label: 'Японский', native: '日本語' },
  { code: 'ko', label: 'Корейский', native: '한국어' },
  { code: 'ar', label: 'Арабский', native: 'العربية' },
];

export function splitForSpeech(text: string, limit = 170): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…]+[.!?…]*/g) ?? [clean];
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;
    if ((current + ' ' + piece).length > limit && current) {
      chunks.push(current.trim());
      current = '';
    }
    if (piece.length > limit) {
      let part = '';
      for (const word of piece.split(/\s+/)) {
        if ((part + ' ' + word).length > limit && part) {
          chunks.push(part.trim());
          part = '';
        }
        part += (part ? ' ' : '') + word;
      }
      if (part) current = part;
    } else {
      current += (current ? ' ' : '') + piece;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.slice(0, 120);
}

export async function getTtsEndpoint(): Promise<string> {
  const base = await getModelBase();
  if (base) {
    try {
      return new URL('/tts', base).toString();
    } catch {
      /* fallback */
    }
  }
  return '/api/tts';
}

export async function fetchSpeechChunk(endpoint: string, text: string, lang: string): Promise<Blob> {
  const url = `${endpoint}?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(text)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Озвучка недоступна (${response.status})`);
  }
  const blob = await response.blob();
  if (blob.size < 512) throw new Error('Сервис озвучки вернул пустой звук');
  return blob;
}

export interface AiNarratorHandlers {
  onState: (speaking: boolean) => void;
  onProgress: (index: number, total: number, text: string) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}

export class AiNarrator {
  private chunks: string[];
  private index = 0;
  private stopped = false;
  private paused = false;
  private rate: number;
  private lang: string;
  private endpoint: string | null = null;
  private audio: HTMLAudioElement | null = null;
  private urls = new Set<string>();
  private prefetch = new Map<number, Promise<Blob>>();
  private handlers: AiNarratorHandlers;
  private started = false;

  constructor(text: string, lang: string, rate: number, handlers: AiNarratorHandlers) {
    this.chunks = splitForSpeech(text);
    this.lang = lang;
    this.rate = rate;
    this.handlers = handlers;
  }

  get total(): number {
    return this.chunks.length;
  }

  async start(): Promise<boolean> {
    if (this.chunks.length === 0) {
      this.handlers.onError('Нет текста для озвучки');
      return false;
    }
    this.stopped = false;
    this.started = true;
    this.handlers.onState(true);
    try {
      this.endpoint = await getTtsEndpoint();
      await this.playFrom(0);
      return true;
    } catch (error) {
      this.stop();
      this.handlers.onError(
        error instanceof Error
          ? `AI-озвучка недоступна: ${error.message}. Включите системный голос.`
          : 'AI-озвучка недоступна',
      );
      return false;
    }
  }

  private preload(index: number): Promise<Blob> {
    if (index >= this.chunks.length || !this.endpoint) return Promise.reject(new Error('Нет фрагмента'));
    const existing = this.prefetch.get(index);
    if (existing) return existing;
    const promise = fetchSpeechChunk(this.endpoint, this.chunks[index], this.lang);
    this.prefetch.set(index, promise);
    return promise;
  }

  private async playFrom(index: number): Promise<void> {
    if (this.stopped || index >= this.chunks.length) {
      this.handlers.onState(false);
      this.handlers.onEnd();
      return;
    }
    this.index = index;
    const text = this.chunks[index];
    this.handlers.onProgress(index, this.chunks.length, text);

    const blob = await this.preload(index);
    if (this.stopped) return;

    void this.preload(index + 1).catch(() => {});
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    const audio = new Audio(url);
    this.audio = audio;
    audio.playbackRate = this.rate;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      this.urls.delete(url);
      this.audio = null;
      if (!this.stopped) {
        void this.playFrom(index + 1).catch(() => {
          this.handlers.onError('AI-озвучка прервалась. Проверьте интернет.');
          this.stop();
        });
      }
    };
    audio.onerror = () => {
      if (!this.stopped) {
        this.handlers.onError('Не удалось воспроизвести озвучку');
        this.stop();
      }
    };
    try {
      await audio.play();
    } catch {
      this.stop();
      this.handlers.onError('Браузер не дал включить звук — нажмите «Озвучить» ещё раз');
    }
  }

  pause(): void {
    this.audio?.pause();
    this.paused = true;
    this.handlers.onState(false);
  }

  resume(): void {
    if (!this.audio) {
      void this.playFrom(this.index).catch(() => {
        this.handlers.onError('AI-озвучка прервалась. Проверьте интернет.');
        this.stop();
      });
      return;
    }
    void this.audio.play();
    this.paused = false;
    this.handlers.onState(true);
  }

  setRate(rate: number): void {
    this.rate = rate;
    if (this.audio) this.audio.playbackRate = rate;
  }

  stop(): void {
    this.stopped = true;
    this.started = false;
    this.audio?.pause();
    this.audio = null;
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
    this.handlers.onState(false);
  }

  get isActive(): boolean {
    return this.started && !this.stopped;
  }

  get isPaused(): boolean {
    return this.paused;
  }
}

/** Скачивает озвучку одним MP3-файлом. */
export async function downloadSpeech(
  text: string,
  lang: string,
  filename: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const endpoint = await getTtsEndpoint();
  const chunks = splitForSpeech(text);
  if (chunks.length === 0) throw new Error('Нет текста для озвучки');
  const parts: Blob[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(i, chunks.length);
    parts.push(await fetchSpeechChunk(endpoint, chunks[i], lang));
  }
  onProgress?.(chunks.length, chunks.length);
  const blob = new Blob(parts, { type: 'audio/mpeg' });
  await saveFile(blob, filename.endsWith('.mp3') ? filename : `${filename}.mp3`);
}
