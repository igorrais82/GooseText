/**
 * Локальная диктовка: Whisper (ONNX, WASM) прямо в приложении.
 *
 * Нужна там, где Web Speech API недоступен — прежде всего в Electron.
 * Модель загружается с Hugging Face один раз; в настольной версии файлы
 * кэширует main-процесс, в браузере — Cache API. Дальше распознавание идёт
 * на устройстве, без отправки звука на сторонние сервисы.
 */
import { getModelBase } from './platform';

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm';
const MODEL_ID = 'Xenova/whisper-tiny';
const SAMPLE_RATE = 16000;
const FLUSH_MS = 3800;
const MIN_SAMPLES = 6000;

type Pipeline = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<{ text?: string } | { text?: string }[]>;

interface TransformersModule {
  pipeline: (task: string, model: string, options: Record<string, unknown>) => Promise<Pipeline>;
  env: {
    allowLocalModels: boolean;
    allowRemoteModels: boolean;
    useBrowserCache: boolean;
    remoteHost: string;
    remotePathTemplate: string;
    backends: { onnx: { wasm: { numThreads: number } } };
  };
}

export interface LocalDictationHandlers {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onState: (listening: boolean) => void;
  onError: (message: string) => void;
  onStatus: (text: string) => void;
}

let modulePromise: Promise<TransformersModule> | null = null;
let pipelinePromise: Promise<Pipeline> | null = null;
let progressHandler: ((text: string) => void) | null = null;

function loadModule(): Promise<TransformersModule> {
  if (!modulePromise) {
    modulePromise = import(/* @vite-ignore */ TRANSFORMERS_URL).then(async (module) => {
      const transformers = module as unknown as TransformersModule;
      transformers.env.allowLocalModels = false;
      transformers.env.allowRemoteModels = true;
      transformers.env.backends.onnx.wasm.numThreads = 1;

      const base = await getModelBase();
      if (base) {
        transformers.env.remoteHost = base;
        transformers.env.remotePathTemplate = '{model}/resolve/main/';
      }
      return transformers;
    });
  }
  return modulePromise;
}

function loadPipeline(onProgress: (text: string) => void): Promise<Pipeline> {
  progressHandler = onProgress;
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = loadModule()
    .then((transformers) =>
      transformers.pipeline('automatic-speech-recognition', MODEL_ID, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (progress: {
          status?: string;
          file?: string;
          loaded?: number;
          total?: number;
        }) => {
          if (progress.status === 'progress' && progress.total) {
            const percent = Math.min(99, Math.round((progress.loaded ?? 0) / progress.total * 100));
            progressHandler?.(`Загружаю модель распознавания: ${percent}%`);
          } else if (progress.status === 'done') {
            progressHandler?.('Модель загружена, готовлю микрофон…');
          }
        },
      } as Record<string, unknown>),
    )
    .then((pipeline) => {
      progressHandler?.('');
      return pipeline;
    })
    .catch((error) => {
      pipelinePromise = null;
      throw error;
    });

  return pipelinePromise;
}

function downsample(input: Float32Array, from: number, to = SAMPLE_RATE): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const current = input[index] ?? 0;
    const next = input[index + 1] ?? current;
    output[i] = current + (next - current) * fraction;
  }
  return output;
}

function concat(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function cleanTranscript(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '')
    .replace(/^(продолжение следует|субтитры[^.]*|редактор субтитров[^.]*)\.?$/i, '')
    .trim();
}

export class LocalDictation {
  private handlers: LocalDictationHandlers;
  private lang: 'ru-RU' | 'en-US';
  private active = false;
  private busy = false;
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private timer: number | null = null;
  private chunks: Float32Array[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(lang: 'ru-RU' | 'en-US', handlers: LocalDictationHandlers) {
    this.lang = lang;
    this.handlers = handlers;
  }

  setLanguage(lang: 'ru-RU' | 'en-US'): void {
    this.lang = lang;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.handlers.onState(true);
    this.handlers.onStatus('Загружаю модель распознавания речи…');
    void this.boot();
  }

  private async boot(): Promise<void> {
    try {
      await loadPipeline((text) => {
        if (this.active) this.handlers.onStatus(text);
      });
      if (!this.active) return;
      this.handlers.onStatus('Включаю микрофон…');
      await this.openMicrophone();
      if (!this.active) return;
      this.handlers.onStatus('Слушаю — говорите');
      this.handlers.onInterim('');
      this.timer = window.setInterval(() => this.flush(), FLUSH_MS);
    } catch (error) {
      const message = this.describeError(error);
      this.active = false;
      this.cleanup();
      this.handlers.onState(false);
      this.handlers.onStatus('');
      this.handlers.onError(message);
      console.warn('Локальная диктовка не запустилась', error);
    }
  }

  private async openMicrophone(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('В этом окне нет доступа к микрофону');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.context = new Context();
    await this.context.resume();
    this.source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => {
      if (!this.active) return;
      const input = event.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input.length);
      copy.set(input);
      this.chunks.push(downsample(copy, this.context?.sampleRate ?? SAMPLE_RATE));
    };
    this.source.connect(this.processor);
    // Процессору нужен выход, но звук в колонки не идёт: gain = 0.
    const mute = this.context.createGain();
    mute.gain.value = 0;
    this.processor.connect(mute).connect(this.context.destination);
  }

  private flush(force = false): void {
    if (this.busy || this.chunks.length === 0) return;
    if (!this.active && !force) return;
    const samples = concat(this.chunks);
    this.chunks = [];
    if (samples.length < MIN_SAMPLES) return;

    this.busy = true;
    this.handlers.onInterim('Распознаю…');
    this.queue = this.queue
      .then(() => this.transcribe(samples))
      .catch((error) => {
        console.warn('Не удалось распознать фрагмент', error);
      })
      .finally(() => {
        this.busy = false;
        this.handlers.onInterim('');
        if (this.active) this.handlers.onStatus('Слушаю — говорите');
      });
  }

  private async transcribe(samples: Float32Array): Promise<void> {
    const pipeline = await loadPipeline((text) => this.handlers.onStatus(text));
    const result = await pipeline(samples, {
      language: this.lang.startsWith('ru') ? 'russian' : 'english',
      task: 'transcribe',
      chunk_length_s: 30,
    });
    const payload = Array.isArray(result) ? result[0] : result;
    const text = cleanTranscript(payload?.text ?? '');
    if (text) this.handlers.onFinal(text);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    if (this.timer) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    const hadAudio = this.chunks.length > 0 || this.busy;
    this.flush(true);
    this.cleanup();
    if (hadAudio) {
      this.handlers.onStatus('Дораспознаю последние фразы…');
      void this.queue.finally(() => {
        this.handlers.onStatus('');
        this.handlers.onState(false);
        this.handlers.onInterim('');
      });
    } else {
      this.handlers.onStatus('');
      this.handlers.onState(false);
      this.handlers.onInterim('');
    }
  }

  private cleanup(): void {
    try {
      this.processor?.disconnect();
      this.source?.disconnect();
      this.stream?.getTracks().forEach((track) => track.stop());
      void this.context?.close();
    } catch {
      /* уже закрыто */
    }
    this.processor = null;
    this.source = null;
    this.stream = null;
    this.context = null;
    this.chunks = [];
  }

  private describeError(error: unknown): string {
    const name = (error as { name?: string })?.name ?? '';
    const message = (error as { message?: string })?.message ?? String(error);
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Нет доступа к микрофону. Разрешите его в настройках Windows и попробуйте снова.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'Микрофон не найден. Проверьте, что он подключён.';
    }
    if (/fetch|network|Failed to fetch|502|Hugging/i.test(message)) {
      return 'Не удалось загрузить модель распознавания. Проверьте интернет — она скачается один раз.';
    }
    return `Не удалось включить диктовку: ${message}`;
  }

  get isActive(): boolean {
    return this.active;
  }
}
