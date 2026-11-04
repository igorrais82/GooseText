import { useEffect } from 'react';
import type { Settings } from '../types';
import { FONT_OPTIONS } from '../types';
import { setWindowBackground } from './platform';

const FONT_STACK: Record<string, string> = Object.fromEntries(
  FONT_OPTIONS.map((option) => [option.key, option.stack]),
);

function resolveTheme(mode: Settings['theme']): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Настраивает тему, стиль и шрифт на корне документа. */
export function applyAppearance(settings: Settings): void {
  const root = document.documentElement;
  const theme = resolveTheme(settings.theme);

  root.dataset.theme = theme;
  root.dataset.style = settings.style;
  root.dataset.font = settings.font;
  root.style.colorScheme = theme;
  root.style.setProperty('--font-editor', FONT_STACK[settings.font] ?? FONT_STACK.system);
  root.style.setProperty('--editor-font-size', `${settings.fontSize}px`);
  root.style.setProperty('--editor-line-height', String(settings.lineHeight));

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#161412' : '#ffffff');

  // Рамка нативного окна Electron берёт цвет фона из CSS-токена темы.
  const canvas = getComputedStyle(root).getPropertyValue('--bg-canvas').trim();
  if (/^#[0-9a-f]{6}$/i.test(canvas)) setWindowBackground(canvas);
}

export function useAppearance(settings: Settings): void {
  useEffect(() => {
    applyAppearance(settings);
    if (settings.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyAppearance(settings);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [settings]);
}
