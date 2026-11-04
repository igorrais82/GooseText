/** Обёртка над Web Speech API — распознавание речи в текст. */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type Ctor = new () => SpeechRecognitionLike;

function getCtor(): Ctor | null {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return getCtor() !== null;
}

export interface DictationHandlers {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onState: (listening: boolean) => void;
  onError: (message: string) => void;
}

const ERROR_TEXT: Record<string, string> = {
  'not-allowed': 'Нет доступа к микрофону. Разрешите его в настройках браузера.',
  'service-not-allowed': 'Браузер запретил распознавание речи. Откройте GooseText в Chrome или Edge.',
  'audio-capture': 'Микрофон не найден. Проверьте, что он подключён.',
  network: 'Нет связи с сервисом распознавания. Проверьте интернет.',
  'no-speech': 'Я ничего не услышал — попробуйте ещё раз, ближе к микрофону.',
  aborted: '',
};

export class Dictation {
  private recognition: SpeechRecognitionLike | null = null;
  private active = false;
  private lang: string;
  private handlers: DictationHandlers;

  constructor(lang: 'ru-RU' | 'en-US', handlers: DictationHandlers) {
    this.lang = lang;
    this.handlers = handlers;
  }

  setLanguage(lang: 'ru-RU' | 'en-US') {
    this.lang = lang;
    if (this.recognition) this.recognition.lang = lang;
  }

  private build(): SpeechRecognitionLike | null {
    const Ctor = getCtor();
    if (!Ctor) return null;
    const recognition = new Ctor();
    recognition.lang = this.lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      this.active = true;
      this.handlers.onState(true);
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = String(result[0]?.transcript ?? '');
        if (result.isFinal) {
          this.handlers.onFinal(transcript.trim());
        } else {
          interim += transcript;
        }
      }
      this.handlers.onInterim(interim.trim());
    };

    recognition.onerror = (event: any) => {
      const message = ERROR_TEXT[event.error] ?? `Ошибка распознавания: ${event.error}`;
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      if (message) this.handlers.onError(message);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.active = false;
        this.handlers.onState(false);
      }
    };

    recognition.onend = () => {
      if (this.active) {
        // Chrome обрывает поток каждые ~60 секунд — перезапускаемся.
        try {
          recognition.start();
          return;
        } catch {
          /* ignore */
        }
      }
      this.handlers.onState(false);
    };

    return recognition;
  }

  start(): boolean {
    if (!this.recognition) this.recognition = this.build();
    if (!this.recognition) {
      this.handlers.onError('В этом браузере распознавание речи недоступно. Откройте GooseText в Chrome или Edge.');
      return false;
    }
    try {
      this.active = true;
      this.recognition.start();
      return true;
    } catch (err) {
      this.handlers.onError('Не удалось запустить микрофон. Попробуйте ещё раз.');
      console.warn(err);
      this.active = false;
      return false;
    }
  }

  stop(): void {
    this.active = false;
    try {
      this.recognition?.stop();
    } catch {
      /* ignore */
    }
    this.handlers.onState(false);
  }

  get isActive(): boolean {
    return this.active;
  }
}

/** Расставляет заглавные буквы и точки в распознанной речи. */
export function tidyDictation(prev: string, chunk: string): string {
  const needsSpace = prev.length > 0 && !/[\s\n(«"]$/.test(prev);
  let text = chunk.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const atSentenceStart = prev.length === 0 || /[.!?…]\s*$/.test(prev) || /\n\s*$/.test(prev);
  if (atSentenceStart) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }
  return (needsSpace ? ' ' : '') + text;
}

/* ------------------------------ озвучивание ------------------------------ */

export interface NarratorHandlers {
  onState: (speaking: boolean) => void;
  onProgress: (index: number, total: number, text: string) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}

export interface NarratorOptions {
  lang: 'ru-RU' | 'en-US';
  rate?: number;
  voiceURI?: string;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return [];
  try {
    return window.speechSynthesis.getVoices();
  } catch {
    return [];
  }
}

/** Режет текст на куски: Chrome обрывает слишком длинные высказывания. */
function chunkForSpeech(text: string, limit = 220): string[] {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…\n]+[.!?…]+|[^.!?…\n]+/g) ?? [clean];
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
      const words = piece.split(/\s+/);
      let part = '';
      for (const word of words) {
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
  return chunks;
}

export class Narrator {
  private chunks: string[];
  private index = 0;
  private stopped = false;
  private handlers: NarratorHandlers;
  private options: NarratorOptions;

  constructor(text: string, options: NarratorOptions, handlers: NarratorHandlers) {
    this.chunks = chunkForSpeech(text);
    this.options = options;
    this.handlers = handlers;
  }

  get total(): number {
    return this.chunks.length;
  }

  start(): boolean {
    if (!isSpeechSynthesisSupported()) {
      this.handlers.onError('Это окно не умеет озвучивать текст');
      return false;
    }
    if (this.chunks.length === 0) {
      this.handlers.onError('Нет текста для озвучивания');
      return false;
    }
    this.stopped = false;
    this.index = 0;
    try {
      window.speechSynthesis.cancel();
      this.speakNext();
      return true;
    } catch (err) {
      console.warn(err);
      this.handlers.onError('Не удалось включить озвучивание');
      return false;
    }
  }

  private pickVoice(): SpeechSynthesisVoice | null {
    const voices = listVoices();
    if (this.options.voiceURI) {
      const exact = voices.find((voice) => voice.voiceURI === this.options.voiceURI);
      if (exact) return exact;
    }
    const lang = this.options.lang.toLowerCase();
    const short = lang.slice(0, 2);
    const matches = voices.filter(
      (voice) => voice.lang.toLowerCase().startsWith(lang) || voice.lang.toLowerCase().startsWith(short),
    );
    return matches.find((voice) => voice.localService) ?? matches[0] ?? null;
  }

  private speakNext(): void {
    if (this.stopped) return;
    if (this.index >= this.chunks.length) {
      this.handlers.onState(false);
      this.handlers.onEnd();
      return;
    }
    const text = this.chunks[this.index];
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.options.lang;
    utterance.rate = this.options.rate ?? 1;
    const voice = this.pickVoice();
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      if (this.stopped) return;
      this.handlers.onProgress(this.index, this.chunks.length, text);
      this.index++;
      this.speakNext();
    };
    utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      if (this.stopped || event.error === 'interrupted' || event.error === 'canceled') return;
      this.handlers.onError('Озвучивание прервалось — попробуйте ещё раз');
      this.handlers.onState(false);
    };
    this.handlers.onState(true);
    this.handlers.onProgress(this.index, this.chunks.length, text);
    window.speechSynthesis.speak(utterance);
  }

  pause(): void {
    if (!isSpeechSynthesisSupported()) return;
    window.speechSynthesis.pause();
    this.handlers.onState(false);
  }

  resume(): void {
    if (!isSpeechSynthesisSupported()) return;
    window.speechSynthesis.resume();
    this.handlers.onState(true);
  }

  stop(): void {
    this.stopped = true;
    if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
    this.handlers.onState(false);
  }
}

