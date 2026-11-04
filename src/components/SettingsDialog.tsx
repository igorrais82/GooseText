import { useRef, useState } from 'react';
import type { License, Settings, StylePreset } from '../types';
import { FONT_OPTIONS, FREE_LIMITS, STYLE_OPTIONS, THEME_OPTIONS } from '../types';
import { defaultSettings } from '../lib/storage';
import { licenseStatusText, trialDaysLeft } from '../lib/license';
import { plural } from '../lib/utils';
import { isAndroidApp, isDesktop } from '../lib/platform';
import { Icon } from './Icon';
import { Modal } from './Dialogs';

type Section = 'appearance' | 'behavior' | 'license' | 'data' | 'about';

/** Версия приложения без хвостовых нулей: 4.0.0 → 4.0. */
const APP_VERSION = __APP_VERSION__.replace(/\.0+$/, '');

const SECTIONS: { key: Section; label: string; icon: 'palette' | 'sliders' | 'key' | 'download' | 'info' }[] = [
  { key: 'appearance', label: 'Оформление', icon: 'palette' },
  { key: 'behavior', label: 'Поведение', icon: 'sliders' },
  { key: 'license', label: 'Лицензия', icon: 'key' },
  { key: 'data', label: 'Данные', icon: 'download' },
  { key: 'about', label: 'О программе', icon: 'info' },
];

interface SettingsDialogProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onResetSeed: () => void;
  onClearAll: () => void;
  notifications: NotificationPermission | 'unsupported';
  onAskNotifications: () => void;
  canInstall: boolean;
  onInstall: () => void;
  docCount: number;
  wordTotal: number;
  license: License;
  onOpenLicense: () => void;
  isFullscreen: boolean;
  fullscreenSupported: boolean;
  onToggleFullscreen: () => void;
}

const STYLE_PREVIEW_CLASS: Record<StylePreset, string> = {
  standard: 'preview preview--standard',
  minimal: 'preview preview--minimal',
  realistic: 'preview preview--realistic',
  detailed: 'preview preview--detailed',
  contrast: 'preview preview--contrast',
  soft: 'preview preview--soft',
};

export function SettingsDialog({
  settings,
  onChange,
  onClose,
  onExportJson,
  onImportJson,
  onResetSeed,
  onClearAll,
  notifications,
  onAskNotifications,
  canInstall,
  onInstall,
  docCount,
  wordTotal,
  license,
  onOpenLicense,
  isFullscreen,
  fullscreenSupported,
  onToggleFullscreen,
}: SettingsDialogProps) {
  const [section, setSection] = useState<Section>('appearance');
  const fileRef = useRef<HTMLInputElement>(null);
  const pro = license.plan === 'pro' || trialDaysLeft(license) > 0;

  const sizePct = ((settings.fontSize - 13) / 11) * 100;
  const linePct = ((settings.lineHeight - 1.4) / 0.8) * 100;

  return (
    <Modal title="Настройки" subtitle="Всё хранится на этом устройстве" onClose={onClose} wide>
      <div className="settings">
        <nav className="settings__nav" aria-label="Разделы настроек">
          {SECTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`settings__navbtn ${section === item.key ? 'settings__navbtn--active' : ''}`}
              onClick={() => setSection(item.key)}
            >
              <Icon name={item.icon} size={15} />
              {item.label}
            </button>
          ))}
          <div className="settings__navfoot">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() =>
                onChange({
                  theme: defaultSettings.theme,
                  style: defaultSettings.style,
                  font: defaultSettings.font,
                  fontSize: defaultSettings.fontSize,
                  lineHeight: defaultSettings.lineHeight,
                })
              }
            >
              <Icon name="refresh" size={14} /> Сбросить вид
            </button>
          </div>
        </nav>

        <div className="settings__body">
          {section === 'appearance' && (
            <>
              <section className="setting">
                <div className="setting__head">
                  <span className="setting__label">Тема</span>
                  <span className="setting__hint">Светлая, тёмная или как в системе</span>
                </div>
                <div className="seg seg--wide" role="group" aria-label="Тема">
                  {THEME_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={`seg__btn ${settings.theme === option.key ? 'seg__btn--active' : ''}`}
                      onClick={() => onChange({ theme: option.key })}
                    >
                      <Icon name={option.icon} size={14} />
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="setting">
                <div className="setting__head">
                  <span className="setting__label">Стиль интерфейса</span>
                </div>
                <div className="style-grid">
                  {STYLE_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={`style-card ${settings.style === option.key ? 'style-card--active' : ''}`}
                      onClick={() => onChange({ style: option.key })}
                    >
                      <span className={STYLE_PREVIEW_CLASS[option.key]} aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className="style-card__name">
                        {option.label}
                        {settings.style === option.key && <Icon name="check" size={13} />}
                      </span>
                      <span className="style-card__hint">{option.hint}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="setting">
                <div className="setting__head">
                  <span className="setting__label">Шрифт</span>
                </div>
                <div className="font-list">
                  {FONT_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={`font-option ${settings.font === option.key ? 'font-option--active' : ''}`}
                      onClick={() => onChange({ font: option.key })}
                    >
                      <span className="font-option__sample" style={{ fontFamily: option.stack }}>
                        {option.sample}
                      </span>
                      <span className="font-option__label">{option.label}</span>
                      <span className="font-option__radio" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </section>

              <section className="setting setting--row">
                <div className="setting__col">
                  <div className="setting__head">
                    <span className="setting__label">Размер текста</span>
                    <span className="setting__value">{settings.fontSize}px</span>
                  </div>
                  <input
                    className="range"
                    type="range"
                    min={13}
                    max={24}
                    step={1}
                    value={settings.fontSize}
                    style={{ ['--pct' as string]: `${sizePct}%` }}
                    onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
                    aria-label="Размер текста"
                  />
                </div>
                <div className="setting__col">
                  <div className="setting__head">
                    <span className="setting__label">Межстрочный интервал</span>
                    <span className="setting__value">{settings.lineHeight.toFixed(1)}</span>
                  </div>
                  <input
                    className="range"
                    type="range"
                    min={1.4}
                    max={2.2}
                    step={0.1}
                    value={settings.lineHeight}
                    style={{ ['--pct' as string]: `${Math.min(100, linePct)}%` }}
                    onChange={(e) => onChange({ lineHeight: Number(e.target.value) })}
                    aria-label="Межстрочный интервал"
                  />
                </div>
              </section>

              <div className="setting__demo" style={{ fontFamily: FONT_OPTIONS.find((f) => f.key === settings.font)?.stack }}>
                <span style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight }}>
                  Гусь пишет: «Тихий вечер, оранжевый свет и ни одной лишней запятой».
                </span>
              </div>
            </>
          )}

          {section === 'behavior' && (
            <>
              <section className="setting">
                <div className="setting__head">
                  <span className="setting__label">Панели</span>
                </div>
                <label className="setting__row">
                  <span>
                    <span className="setting__rowlabel">Документы слева</span>
                    <span className="setting__hint">Список и поиск документов</span>
                  </span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={settings.docsOpen}
                    onChange={(e) => onChange({ docsOpen: e.target.checked })}
                  />
                </label>
                <label className="setting__row">
                  <span>
                    <span className="setting__rowlabel">Помощник справа</span>
                    <span className="setting__hint">Орфография, диктовка, напоминания</span>
                  </span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={settings.assistantOpen}
                    onChange={(e) => onChange({ assistantOpen: e.target.checked })}
                  />
                </label>
              </section>

              <section className="setting">
                <div className="setting__head">
                  <span className="setting__label">Редактор</span>
                </div>
                <label className="setting__row">
                  <span>
                    <span className="setting__rowlabel">Автосохранение</span>
                    <span className="setting__hint">Сохранять при каждом изменении (Ctrl+S — вручную)</span>
                  </span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={settings.autoSave}
                    onChange={(e) => onChange({ autoSave: e.target.checked })}
                  />
                </label>
                <label className="setting__row">
                  <span>
                    <span className="setting__rowlabel">Звук гуся</span>
                    <span className="setting__hint">Короткий сигнал при напоминании</span>
                  </span>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={settings.sound}
                    onChange={(e) => onChange({ sound: e.target.checked })}
                  />
                </label>
              </section>

              <section className="setting">
                <div className="setting__head">
                  <span className="setting__label">Уведомления</span>
                </div>
                <div className="setting__row setting__row--plain">
                  <span className="setting__hint">
                    {notifications === 'granted'
                      ? 'Разрешены — гусь постучится в срок.'
                      : notifications === 'unsupported'
                        ? 'Система не поддерживает уведомления из этого окна.'
                        : 'Пока не разрешены.'}
                  </span>
                  {notifications === 'default' && (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={onAskNotifications}>
                      Разрешить
                    </button>
                  )}
                </div>
              </section>

              <section className="setting">
                <div className="setting__head">
                  <span className="setting__label">Диктовка</span>
                  <span className="setting__hint">Как превращать речь в текст</span>
                </div>
                <div className="setting__row setting__row--plain">
                  <span className="setting__hint">
                    Авто: в браузере — быстрое распознавание Chrome/Edge, в приложении — локальная модель
                    Whisper. Локальная модель скачивается один раз (~60 МБ) и дальше работает без интернета.
                  </span>
                </div>
                <select
                  className="input"
                  value={settings.dictationEngine}
                  onChange={(e) => onChange({ dictationEngine: e.target.value as Settings['dictationEngine'] })}
                  aria-label="Движок диктовки"
                >
                  <option value="auto">Автоматически</option>
                  <option value="browser">Браузерное распознавание</option>
                  <option value="local">Локальная модель Whisper</option>
                </select>
              </section>

              <section className="setting">
                <div className="setting__head">
                  <span className="setting__label">Полный экран</span>
                </div>
                <div className="setting__row setting__row--plain">
                  <span className="setting__hint">
                    {fullscreenSupported
                      ? 'F11 или кнопка в строке заголовка. Работают и в приложении, и в браузере.'
                      : 'Это окно не поддерживает полноэкранный режим.'}
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={onToggleFullscreen}
                    disabled={!fullscreenSupported}
                  >
                    <Icon name={isFullscreen ? 'fullscreenExit' : 'fullscreen'} size={14} />
                    {isFullscreen ? 'Выйти' : 'Включить'}
                  </button>
                </div>
              </section>
            </>
          )}

          {section === 'license' && (
            <>
              <section className="setting setting--license">
                <div className="license-mini">
                  <div className="license-mini__head">
                    <span className={`license-mini__badge ${pro ? 'is-pro' : ''}`}>{pro ? 'PRO' : 'TRIAL'}</span>
                    <div>
                      <div className="license-mini__title">
                        {pro ? 'Все возможности открыты' : 'Ограниченная версия'}
                      </div>
                      <div className="license-mini__hint">{licenseStatusText(license)}</div>
                    </div>
                  </div>
                  <div className="license-mini__rows">
                    <div>
                      <span>Документы</span>
                      <b>{pro ? 'без лимита' : `${docCount} из ${FREE_LIMITS.docs}`}</b>
                    </div>
                    <div>
                      <span>Папки</span>
                      <b>{pro ? 'без лимита' : `до ${FREE_LIMITS.folders}`}</b>
                    </div>
                    <div>
                      <span>Пересказ</span>
                      <b>{pro ? 'краткий и подробный' : 'только краткий'}</b>
                    </div>
                    <div>
                      <span>Экспорт PNG</span>
                      <b>{pro ? 'есть' : 'с лицензией'}</b>
                    </div>
                  </div>
                  <button type="button" className="btn btn--primary btn--block" onClick={onOpenLicense}>
                    <Icon name="key" size={15} /> {pro ? 'Управление лицензией' : 'Купить лицензию · от 149 ₽'}
                  </button>
                </div>
              </section>

              <section className="setting">
                <div className="setting__head">
                  <span className="setting__label">Как это работает</span>
                  <span className="setting__value">
                    {pro ? 'куплено' : `осталось ${trialDaysLeft(license)} дн.`}
                  </span>
                </div>
                <p className="about__text">
                  Пробный период — 14 дней со всеми возможностями. После него остаются 30 документов, 5 папок,
                  краткий пересказ и рисование. Лицензия открывает документы и папки без лимита, подробный пересказ и
                  экспорт рисунков в PNG.
                </p>
                <p className="about__text about__text--muted">
                  Ключ проверяется на устройстве, интернет для работы лицензии не нужен. Данные при окончании
                  пробного периода не удаляются.
                </p>
              </section>
            </>
          )}

          {section === 'data' && (
            <>
              <section className="setting">
                <div className="setting__head">
                  <span className="setting__label">Библиотека</span>
                  <span className="setting__value">
                    {docCount} {plural(docCount, 'документ', 'документа', 'документов')} ·{' '}
                    {wordTotal.toLocaleString('ru-RU')} {plural(wordTotal, 'слово', 'слова', 'слов')}
                  </span>
                </div>
                <div className="setting__buttons">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={onExportJson}>
                    <Icon name="download" size={14} /> Экспорт в JSON
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()}>
                    <Icon name="upload" size={14} /> Импорт
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onImportJson(file);
                      e.target.value = '';
                    }}
                  />
                </div>
              </section>

              <section className="setting">
                <div className="setting__head">
                  <span className="setting__label">Восстановление</span>
                </div>
                <div className="setting__buttons">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={onResetSeed}>
                    <Icon name="refresh" size={14} /> Вернуть примеры
                  </button>
                  <button type="button" className="btn btn--danger-ghost btn--sm" onClick={onClearAll}>
                    <Icon name="trash" size={14} /> Удалить все документы
                  </button>
                </div>
              </section>
            </>
          )}

          {section === 'about' && (
            <section className="setting setting--about">
              <div className="about">
                <div>
                  <div className="about__title">
                    {`GooseText ${APP_VERSION} · ${
                      isDesktop ? 'приложение для Windows' : isAndroidApp ? 'приложение для Android' : 'веб-версия'
                    }`}
                  </div>
                  <p className="about__text">
                    Заметки, конспекты, сценарии, рисунки и напоминания. Проверка ошибок, пересказ своими
                    словами, перевод на 15 языков, озвучивание, план текста и диктовка — в браузере и в
                    приложении.
                  </p>
                  <p className="about__text about__text--muted">
                    {isDesktop
                      ? 'Документы лежат в профиле приложения на этом компьютере. Резервная копия — в разделе «Данные».'
                      : isAndroidApp
                        ? 'Документы хранятся на этом устройстве. Резервная копия — в разделе «Данные», файл можно сохранить в «Загрузки».'
                        : 'Документы хранятся в браузере. На Android GooseText ставится на главный экран как приложение.'}
                  </p>
                  {canInstall && (
                    <button type="button" className="btn btn--primary btn--sm" onClick={onInstall}>
                      <Icon name="download" size={14} /> Установить приложение
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </Modal>
  );
}
