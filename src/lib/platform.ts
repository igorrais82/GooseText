/** Определение среды: настольное приложение (Electron) или браузер / PWA. */

interface GooseDesktopBridge {
  isDesktop: boolean;
  platform: string;
  version: string;
  openExternal: (url: string) => Promise<void>;
  toggleFullscreen?: () => Promise<boolean>;
  getFullscreen?: () => Promise<boolean>;
  onFullscreenChange?: (callback: (value: boolean) => void) => () => void;
  minimizeWindow?: () => void;
  toggleMaximizeWindow?: () => Promise<boolean>;
  isWindowMaximized?: () => Promise<boolean>;
  closeWindow?: () => void;
  onMaximizedChange?: (callback: (value: boolean) => void) => () => void;
  getModelBase?: () => Promise<string | null>;
  setBackgroundColor?: (color: string) => void;
}

declare global {
  interface Window {
    goosetext?: GooseDesktopBridge;
  }
}

export const desktop = typeof window !== 'undefined' ? window.goosetext : undefined;

/** Запущено ли внутри настольного приложения. */
export const isDesktop = Boolean(desktop?.isDesktop);

/** Запущено ли внутри нативной оболочки (Capacitor на Android). */
export const isNativeApp = Boolean(
  (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.(),
);

/** Android-приложение (APK), а не браузер и не Windows. */
export const isAndroidApp =
  isNativeApp && typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

/** Платформа: win32, darwin, linux, android (в браузере — 'web'). */
export const platform = isAndroidApp ? 'android' : (desktop?.platform ?? 'web');

/**
 * Диктовка доступна везде: в Chrome/Edge — Web Speech, в остальных случаях
 * (включая настольное приложение) — локальная модель Whisper.
 */
export const webSpeechAvailable =
  typeof window !== 'undefined' &&
  Boolean(
    (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
      .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition,
  );

export const localSpeechAvailable =
  typeof window !== 'undefined' &&
  Boolean(navigator.mediaDevices?.getUserMedia) &&
  typeof WebAssembly === 'object';

export const dictationAvailable = webSpeechAvailable || localSpeechAvailable;

/** Как и раньше: речь в текст в этой сборке возможна. */
export const speechAvailable = dictationAvailable;

/** Базовый URL кэша моделей в настольной версии (null — браузерная). */
export async function getModelBase(): Promise<string | null> {
  if (!desktop?.getModelBase) return null;
  try {
    return await desktop.getModelBase();
  } catch {
    return null;
  }
}

/* --------------------------- кнопки окна --------------------------- */

export function minimizeWindow(): void {
  desktop?.minimizeWindow?.();
}

export async function toggleMaximizeWindow(): Promise<boolean> {
  if (!desktop?.toggleMaximizeWindow) return false;
  try {
    return await desktop.toggleMaximizeWindow();
  } catch {
    return false;
  }
}

export function closeWindow(): void {
  desktop?.closeWindow?.();
}

export function onMaximizedChange(callback: (value: boolean) => void): () => void {
  if (desktop?.onMaximizedChange) return desktop.onMaximizedChange(callback);
  return () => {};
}

/** Красит фон окна Electron под тему — без белых полос при изменении размера. */
export function setWindowBackground(color: string): void {
  desktop?.setBackgroundColor?.(color);
}

export function openExternal(url: string): void {
  if (desktop?.openExternal) {
    void desktop.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener');
}

/** Полноэкранный режим поддерживается везде, где есть Electron или Fullscreen API. */
export const fullscreenSupported = isDesktop
  ? Boolean(desktop?.toggleFullscreen)
  : typeof document !== 'undefined' && document.fullscreenEnabled !== false;

/** Переключает полный экран и возвращает новое состояние. */
export async function toggleFullscreen(): Promise<boolean> {
  if (isDesktop && desktop?.toggleFullscreen) {
    try {
      return await desktop.toggleFullscreen();
    } catch {
      return false;
    }
  }
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return false;
    }
    await document.documentElement.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

/** Подписка на изменение полноэкранного режима (Electron и браузер). */
export function onFullscreenChange(callback: (value: boolean) => void): () => void {
  if (isDesktop && desktop?.onFullscreenChange) {
    return desktop.onFullscreenChange(callback);
  }
  const handler = () => callback(Boolean(document.fullscreenElement));
  document.addEventListener('fullscreenchange', handler);
  return () => document.removeEventListener('fullscreenchange', handler);
}
