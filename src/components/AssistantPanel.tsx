import { useMemo, useState } from 'react';
import type { AssistantTab, DictationEngine, Doc, RetellMode, SpellIssue, SpellState } from '../types';
import { KIND_META } from '../types';
import type { RetellResult } from '../lib/retell';
import {
  displayTitle,
  formatDateTime,
  formatRelative,
  formatTime,
  plural,
  readingMinutes,
  snippet,
  wordCount,
  plainFromHtml,
} from '../lib/utils';
import { Goose, GooseMark } from './Goose';
import { Icon } from './Icon';
import { TranslatePane } from './TranslatePane';
import { SpeakPane } from './SpeakPane';
import { OutlinePane } from './OutlinePane';
import type { IconName } from './Icon';

const ISSUE_LABEL: Record<string, string> = {
  spelling: 'Орфография',
  grammar: 'Грамматика',
  style: 'Стиль',
  typography: 'Оформление',
};

const TABS: { key: AssistantTab; label: string; short: string; icon: IconName }[] = [
  { key: 'spell', label: 'Проверка', short: 'Проверка', icon: 'sparkles' },
  { key: 'retell', label: 'Пересказ', short: 'Пересказ', icon: 'retell' },
  { key: 'translate', label: 'Перевод', short: 'Перевод', icon: 'languages' },
  { key: 'dictation', label: 'Диктовка', short: 'Диктовка', icon: 'mic' },
  { key: 'speak', label: 'AI-озвучка', short: 'Озвучка', icon: 'volume' },
  { key: 'outline', label: 'План и метрики', short: 'План', icon: 'outline' },
  { key: 'reminders', label: 'Напоминания', short: 'Напомин.', icon: 'bell' },
  { key: 'stats', label: 'Статистика', short: 'Статистика', icon: 'chart' },
];

interface AssistantPanelProps {
  tab: AssistantTab;
  onTab: (t: AssistantTab) => void;
  onClose: () => void;

  spell: SpellState | null;
  checking: boolean;
  spellDirty: boolean;
  lang: 'ru' | 'en';
  onLangChange: (lang: 'ru' | 'en') => void;
  onCheck: () => void;
  onApply: (issue: SpellIssue, replacement: string) => void;
  onApplyAll: () => void;
  onGoto: (issue: SpellIssue) => void;

  retell: RetellResult | null;
  retellMode: RetellMode;
  retellReady: boolean;
  retellBusy: boolean;
  pro: boolean;
  onRetellMode: (mode: RetellMode) => void;
  onRetell: () => void;
  onCopyRetell: () => void;
  onInsertRetell: () => void;
  onNeedLicense: (feature: string) => void;

  speechSupported: boolean;
  dictating: boolean;
  interim: string;
  dictationLang: 'ru-RU' | 'en-US';
  onDictationLang: (lang: 'ru-RU' | 'en-US') => void;
  onToggleDictation: () => void;
  history: { id: string; text: string; at: number }[];
  onClearHistory: () => void;

  reminders: Doc[];
  activeDoc: Doc;
  onSelectDoc: (id: string) => void;
  onToggleDone: (id: string) => void;
  onSnooze: (id: string, minutes: number) => void;
  onCreateReminder: (title: string, at: number) => void;
  onDelete: (id: string) => void;

  docs: Doc[];
  notifications: NotificationPermission | 'unsupported';
  onAskNotifications: () => void;

  activeText: string;
  selectedText: string;
  onInsertText: (text: string) => void;
  onSaveDoc: (title: string, html: string) => void;
  translateSource: string;
  translateTarget: string;
  onTranslateSource: (code: string) => void;
  onTranslateTarget: (code: string) => void;
  localSpeechSupported: boolean;
  dictationStatus: string;
  dictationEngine: DictationEngine;
  onDictationEngine: (engine: DictationEngine) => void;
  onToast: (kind: 'info' | 'success' | 'error', text: string) => void;
}

function IssueContext({ text, offset, length }: { text: string; offset: number; length: number }) {
  const from = Math.max(0, offset - 42);
  const to = Math.min(text.length, offset + length + 42);
  const before = (from > 0 ? '…' : '') + text.slice(from, offset).replace(/\n/g, ' ');
  const rawHit = text.slice(offset, offset + length);
  const hit = /^\s+$/.test(rawHit) ? '·'.repeat(Math.max(2, rawHit.length)) : rawHit.replace(/\n/g, ' ');
  const after = text.slice(offset + length, to).replace(/\n/g, ' ') + (to < text.length ? '…' : '');
  return (
    <p className="issue__ctx">
      {before}
      <mark>{hit}</mark>
      {after}
    </p>
  );
}

function fixLabel(replacement: string): string {
  if (replacement === '') return 'удалить';
  if (/^\s+$/.test(replacement)) return 'пробел';
  return replacement;
}

export function AssistantPanel(props: AssistantPanelProps) {
  const {
    tab,
    onTab,
    onClose,
    spell,
    checking,
    spellDirty,
    lang,
    onLangChange,
    onCheck,
    onApply,
    onApplyAll,
    onGoto,
    retell,
    retellMode,
    retellReady,
    retellBusy,
    pro,
    onRetellMode,
    onRetell,
    onCopyRetell,
    onInsertRetell,
    onNeedLicense,
    speechSupported,
    dictating,
    interim,
    dictationLang,
    onDictationLang,
    onToggleDictation,
    history,
    onClearHistory,
    reminders,
    activeDoc,
    onSelectDoc,
    onToggleDone,
    onSnooze,
    onCreateReminder,
    onDelete,
    docs,
    notifications,
    onAskNotifications,
    activeText,
    selectedText,
    onInsertText,
    onSaveDoc,
    translateSource,
    translateTarget,
    onTranslateSource,
    onTranslateTarget,
    localSpeechSupported,
    dictationStatus,
    dictationEngine,
    onDictationEngine,
    onToast,
  } = props;

  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderAt, setReminderAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 60, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });

  const stats = useMemo(() => {
    const counts: Record<string, number> = { note: 0, summary: 0, script: 0, reminder: 0 };
    let words = 0;
    for (const d of docs) {
      counts[d.kind] = (counts[d.kind] ?? 0) + 1;
      words += wordCount(plainFromHtml(d.html));
    }
    return { counts, words };
  }, [docs]);

  const activeWords = wordCount(plainFromHtml(activeDoc.html));
  const upcoming = [...reminders].sort((a, b) => (a.reminderAt ?? 0) - (b.reminderAt ?? 0));

  const submitReminder = () => {
    const title = reminderTitle.trim();
    if (!title) return;
    const at = new Date(reminderAt).getTime();
    onCreateReminder(title, Number.isNaN(at) ? Date.now() + 3600000 : at);
    setReminderTitle('');
  };

  return (
    <aside className="assistant" aria-label="Помощник">
      <div className="assistant__head">
        <div className="assistant__headline">
          <GooseMark size={32} />
          <div>
            <div className="assistant__title">Гоша-помощник</div>
            <div className="assistant__subtitle">пересказ, перевод, речь и напоминания</div>
          </div>
        </div>
        <button className="icon-btn assistant__close" onClick={onClose} aria-label="Закрыть помощника">
          <Icon name="x" size={18} />
        </button>
      </div>

      <div className="assistant__tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`assistant__tab ${tab === t.key ? 'assistant__tab--active' : ''}`}
            onClick={() => onTab(t.key)}
            title={t.label}
            aria-label={t.label}
          >
            <Icon name={t.icon} size={13} />
            <span>{t.short}</span>
            {t.key === 'spell' && spell && spell.issues.length > 0 && (
              <span className="assistant__tabbadge">{spell.issues.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="assistant__body">
        {tab === 'spell' && (
          <div className="assistant__pane">
            {activeDoc.kind === 'drawing' && (
              <div className="notice">
                <Icon name="info" size={14} /> Рисунок — не текст: проверка работает в заметках, конспектах и
                сценариях.
              </div>
            )}
            <div className="panel__row">
              <div className="seg" role="group" aria-label="Язык проверки">
                <button
                  className={`seg__btn ${lang === 'ru' ? 'seg__btn--active' : ''}`}
                  onClick={() => onLangChange('ru')}
                >
                  RU
                </button>
                <button
                  className={`seg__btn ${lang === 'en' ? 'seg__btn--active' : ''}`}
                  onClick={() => onLangChange('en')}
                >
                  EN
                </button>
              </div>
              <button className={`btn btn--primary btn--sm ${checking ? 'is-busy' : ''}`} onClick={onCheck} disabled={checking}>
                {checking ? 'Проверяю…' : 'Проверить текст'}
              </button>
            </div>

            {!spell && !checking && (
              <div className="panel__empty">
                <div className="goose-circle goose-circle--sm">
                  <Goose size={118} mood="thinking" />
                </div>
                <p className="panel__empty-title">Отдайте текст гусю</p>
                <p className="panel__empty-text">
                  Найду опечатки, грамматику, лишние пробелы и подскажу замену. Работаю и на русском, и на английском.
                </p>
                <button className="btn btn--primary" onClick={onCheck}>
                  <Icon name="sparkles" size={17} /> Проверить текст
                </button>
              </div>
            )}

            {checking && (
              <div className="panel__empty">
                <div className="goose-circle goose-circle--sm">
                  <Goose size={118} mood="thinking" />
                </div>
                <p className="panel__empty-text">Гусь читает и подчёркивает…</p>
              </div>
            )}

            {spell && !checking && (
              <>
                <div className="spell-summary">
                  {spell.issues.length === 0 ? (
                    <span className="spell-summary__ok">
                      <Icon name="check" size={15} /> Замечаний нет — гусь доволен
                    </span>
                  ) : (
                    <span>
                      {spell.issues.length} {plural(spell.issues.length, 'замечание', 'замечания', 'замечаний')}
                    </span>
                  )}
                  <span className="spell-summary__source">
                    {spell.source === 'languagetool' ? 'LanguageTool' : 'Локальные правила'}
                  </span>
                </div>
                {spell.note && (
                  <div className="notice">
                    <Icon name="info" size={14} /> {spell.note}
                  </div>
                )}
                {spellDirty && (
                  <div className="notice notice--warn">
                    <Icon name="alert" size={14} /> Текст изменился после проверки.
                    <button className="link" onClick={onCheck}>
                      Проверить снова
                    </button>
                  </div>
                )}
                {spell.issues.length > 0 && (
                  <div className="panel__row panel__row--end">
                    <button className="btn btn--ghost btn--sm" onClick={onApplyAll} disabled={spellDirty}>
                      <Icon name="wand" size={15} /> Применить все
                    </button>
                  </div>
                )}
                <div className="issues">
                  {spell.issues.map((issue) => (
                    <article className="issue" key={issue.id}>
                      <header className="issue__head">
                        <span className={`issue__type issue__type--${issue.type}`}>
                          {ISSUE_LABEL[issue.type] ?? 'Замечание'}
                        </span>
                        <span className="issue__rule">{issue.shortMessage}</span>
                      </header>
                      <p className="issue__msg">{issue.message}</p>
                      <IssueContext text={spell.text} offset={issue.offset} length={issue.length} />
                      <div className="issue__fixes">
                        {issue.replacements.length > 0 ? (
                          issue.replacements.map((r) => (
                            <button
                              key={r || 'delete'}
                              className="fix"
                              onClick={() => onApply(issue, r)}
                              disabled={spellDirty}
                            >
                              {fixLabel(r)}
                            </button>
                          ))
                        ) : (
                          <span className="issue__manual">исправьте вручную</span>
                        )}
                        <button className="issue__goto" onClick={() => onGoto(issue)}>
                          показать в тексте
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'retell' && (
          <div className="assistant__pane">
            <div className="panel__row">
              <div className="seg" role="group" aria-label="Режим пересказа">
                <button
                  type="button"
                  className={`seg__btn ${retellMode === 'brief' ? 'seg__btn--active' : ''}`}
                  onClick={() => onRetellMode('brief')}
                >
                  Кратко
                </button>
                <button
                  type="button"
                  className={`seg__btn ${retellMode === 'detailed' ? 'seg__btn--active' : ''}`}
                  onClick={() => (pro ? onRetellMode('detailed') : onNeedLicense('Подробный пересказ'))}
                  title={pro ? 'Главные мысли, понятия и итог' : 'Доступно с лицензией'}
                >
                  {!pro && <Icon name="lock" size={11} />}
                  Подробно
                </button>
              </div>
              <button
                type="button"
                className={`btn btn--primary btn--sm ${retellBusy ? 'is-busy' : ''}`}
                onClick={onRetell}
                disabled={retellBusy || !retellReady}
              >
                {retellBusy ? 'Пересказываю…' : 'Пересказать'}
              </button>
            </div>

            {!retell && !retellBusy && (
              <div className="panel__empty">
                <div className="goose-circle goose-circle--sm">
                  <Goose size={118} mood="thinking" />
                </div>
                <p className="panel__empty-title">Сожму текст без потери смысла</p>
                <p className="panel__empty-text">
                  {activeDoc.kind === 'drawing'
                    ? 'Рисунок не пересказать: откройте текстовый документ или конспект.'
                    : retellReady
                      ? '«Кратко» — выжимка в пару абзацев. «Подробно» — главные мысли, ключевые понятия и итог.'
                      : 'Нужно хотя бы 35 слов текста. Добавьте пару предложений — и гусь возьмётся за работу.'}
                </p>
                <button type="button" className="btn btn--primary" onClick={onRetell} disabled={!retellReady}>
                  <Icon name="retell" size={16} /> Пересказать
                </button>
              </div>
            )}

            {retellBusy && (
              <div className="panel__empty">
                <div className="goose-circle goose-circle--sm">
                  <Goose size={118} mood="thinking" />
                </div>
                <p className="panel__empty-text">Гусь вычёркивает лишнее…</p>
              </div>
            )}

            {retell && !retellBusy && (
              <>
                <div className="retell-meta">
                  <span className="retell-meta__mode">{retell.mode === 'brief' ? 'Кратко' : 'Подробно'}</span>
                  <span>
                    {retell.sourceWords} → {retell.resultWords} слов · {retell.sourceSentences} →{' '}
                    {retell.resultSentences} предл. · −{retell.ratio}%
                  </span>
                </div>
                <article className="retell-result" dangerouslySetInnerHTML={{ __html: retell.html }} />
                <div className="panel__row">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={onCopyRetell}>
                    <Icon name="copy" size={14} /> Скопировать
                  </button>
                  <button type="button" className="btn btn--primary btn--sm" onClick={onInsertRetell}>
                    <Icon name="plus" size={14} /> В новый документ
                  </button>
                </div>
                {retell.mode === 'brief' && !pro && (
                  <button
                    type="button"
                    className="retell-upsell"
                    onClick={() => onNeedLicense('Подробный пересказ')}
                  >
                    <Icon name="lock" size={14} />
                    <span>
                      <b>Подробный пересказ</b> — главные мысли, ключевые понятия и итог. Открывается с лицензией.
                    </span>
                    <Icon name="chevronRight" size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'translate' && (
          <TranslatePane
            text={activeDoc.kind === 'drawing' ? '' : activeText}
            selectedText={selectedText}
            source={translateSource}
            target={translateTarget}
            onSource={onTranslateSource}
            onTarget={onTranslateTarget}
            onInsertText={onInsertText}
            onSaveDoc={onSaveDoc}
            onToast={onToast}
          />
        )}

        {tab === 'speak' && (
          <SpeakPane
            text={activeDoc.kind === 'drawing' ? '' : activeText}
            selectedText={selectedText}
            lang={activeDoc.language}
            title={displayTitle(activeDoc.title, activeDoc.html, 60)}
            onToast={onToast}
          />
        )}

        {tab === 'outline' && (
          <OutlinePane
            text={activeDoc.kind === 'drawing' ? '' : activeText}
            html={activeDoc.html}
            onInsertText={onInsertText}
            onSaveDoc={onSaveDoc}
            onToast={onToast}
          />
        )}

        {tab === 'dictation' && (
          <div className="assistant__pane">
            <div className="mic-block">
              <button
                className={`mic ${dictating ? 'mic--live' : ''}`}
                onClick={onToggleDictation}
                aria-pressed={dictating}
                aria-label={dictating ? 'Остановить диктовку' : 'Начать диктовку'}
              >
                <span className="mic__ring" />
                <Icon name={dictating ? 'stop' : 'mic'} size={30} />
              </button>
              <p className="mic-block__status">
                {dictating
                  ? dictationStatus || 'Записываю — говорите спокойно'
                  : 'Нажмите и говорите: текст появится в документе'}
              </p>
              <div className="seg seg--wide">
                <button
                  className={`seg__btn ${dictationLang === 'ru-RU' ? 'seg__btn--active' : ''}`}
                  onClick={() => onDictationLang('ru-RU')}
                >
                  Русский
                </button>
                <button
                  className={`seg__btn ${dictationLang === 'en-US' ? 'seg__btn--active' : ''}`}
                  onClick={() => onDictationLang('en-US')}
                >
                  English
                </button>
              </div>
            </div>

            <div className={`live-text ${interim || dictationStatus ? 'live-text--active' : ''}`}>
              {dictationStatus ||
                interim ||
                (dictating ? '…' : 'Здесь появится то, что я услышал')}
            </div>

            <div className="engine-list">
              <div className={`engine ${speechSupported ? 'engine--on' : ''}`}>
                <span className="engine__dot" />
                <span className="engine__name">Распознавание браузера</span>
                <span className="engine__state">{speechSupported ? 'доступно' : 'нет в этом окне'}</span>
              </div>
              <div className={`engine ${localSpeechSupported ? 'engine--on' : ''}`}>
                <span className="engine__dot" />
                <span className="engine__name">Локальная модель Whisper</span>
                <span className="engine__state">
                  {localSpeechSupported ? 'доступна · офлайн после загрузки' : 'недоступна'}
                </span>
              </div>
            </div>

            <div className="setting setting--inline">
              <div className="setting__head">
                <span className="setting__label">Движок диктовки</span>
                <span className="setting__hint">
                  {dictationEngine === 'auto'
                    ? 'выбирается автоматически'
                    : dictationEngine === 'browser'
                      ? 'быстрее, нужен интернет'
                      : 'точнее в приложении, работает офлайн'}
                </span>
              </div>
              <select
                className="input"
                value={dictationEngine}
                onChange={(e) => onDictationEngine(e.target.value as DictationEngine)}
                aria-label="Движок диктовки"
              >
                <option value="auto">Автоматически</option>
                <option value="browser" disabled={!speechSupported}>
                  Браузерное распознавание
                </option>
                <option value="local" disabled={!localSpeechSupported}>
                  Локальная модель Whisper
                </option>
              </select>
            </div>

            {!speechSupported && !localSpeechSupported && (
              <div className="notice notice--warn">
                <Icon name="alert" size={14} /> В этом окне нет доступа к микрофону. Проверьте разрешения
                системы.
              </div>
            )}

            <div className="tips">
              <div className="tips__title">Как диктовать, чтобы получалось</div>
              <ul>
                <li>Говорите спокойно, фразами — так точнее распознавание.</li>
                <li>Текст вставляется туда, где стоит курсор в документе.</li>
                <li>
                  В приложении работает локальная модель Whisper: первый запуск скачает около 60 МБ, дальше
                  распознавание идёт на устройстве.
                </li>
                <li>Браузерное распознавание быстрее, но отправляет звук на сервер браузера.</li>
              </ul>
            </div>

            {history.length > 0 && (
              <div className="history">
                <div className="history__head">
                  <span>Что уже распознано</span>
                  <button className="link" onClick={onClearHistory}>
                    очистить
                  </button>
                </div>
                {history.slice(0, 6).map((h) => (
                  <div className="history__item" key={h.id}>
                    <span className="history__time">{formatTime(h.at)}</span>
                    <span className="history__text">{h.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'reminders' && (
          <div className="assistant__pane">
            {notifications !== 'granted' && (
              <div className="notice">
                <Icon name="bell" size={14} />
                {notifications === 'unsupported'
                  ? 'Уведомления в этом браузере недоступны — напомню внутри приложения.'
                  : 'Разрешите уведомления, чтобы не пропустить напоминание.'}
                {notifications !== 'unsupported' && (
                  <button className="link" onClick={onAskNotifications}>
                    Разрешить
                  </button>
                )}
              </div>
            )}

            <div className="reminders">
              {upcoming.length === 0 && (
                <div className="panel__empty panel__empty--small">
                  <div className="goose-circle goose-circle--sm">
                    <Goose size={112} mood="sleepy" />
                  </div>
                  <p className="panel__empty-text">Пока тихо. Добавим что-нибудь важное?</p>
                </div>
              )}
              {upcoming.map((doc) => {
                const late = !!doc.reminderAt && doc.reminderAt < Date.now() && !doc.reminderDone;
                return (
                  <div
                    key={doc.id}
                    className={`reminder ${late ? 'reminder--late' : ''} ${doc.reminderDone ? 'reminder--done' : ''}`}
                  >
                    <button
                      className={`check ${doc.reminderDone ? 'check--on' : ''}`}
                      onClick={() => onToggleDone(doc.id)}
                      aria-label={doc.reminderDone ? 'Снять отметку' : 'Отметить выполненным'}
                    >
                      {doc.reminderDone && <Icon name="check" size={13} />}
                    </button>
                    <button className="reminder__main" onClick={() => onSelectDoc(doc.id)}>
                      <span className="reminder__title">{displayTitle(doc.title, doc.html, 50)}</span>
                      <span className="reminder__meta">
                        <Icon name="clock" size={12} />
                        {doc.reminderAt ? formatDateTime(doc.reminderAt) : 'без времени'}
                        {late && <em>просрочено</em>}
                      </span>
                      <span className="reminder__snip">{snippet(doc.html, 48)}</span>
                    </button>
                    <div className="reminder__actions">
                      <button className="icon-btn icon-btn--sm" onClick={() => onSnooze(doc.id, 10)} title="Отложить на 10 минут">
                        +10м
                      </button>
                      <button className="icon-btn icon-btn--sm" onClick={() => onDelete(doc.id)} title="Удалить">
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="reminder-form">
              <div className="reminder-form__title">Новое напоминание</div>
              <input
                className="input"
                value={reminderTitle}
                placeholder="Например: позвонить маме"
                onChange={(e) => setReminderTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitReminder();
                }}
              />
              <div className="reminder-form__row">
                <input
                  className="input input--time"
                  type="datetime-local"
                  value={reminderAt}
                  onChange={(e) => setReminderAt(e.target.value)}
                  aria-label="Время напоминания"
                />
                <button className="btn btn--primary btn--sm" onClick={submitReminder}>
                  <Icon name="plus" size={16} /> Добавить
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'stats' && (
          <div className="assistant__pane">
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-card__value">{docs.length}</span>
                <span className="stat-card__label">документов</span>
              </div>
              <div className="stat-card">
                <span className="stat-card__value">{stats.words.toLocaleString('ru-RU')}</span>
                <span className="stat-card__label">слов всего</span>
              </div>
              <div className="stat-card">
                <span className="stat-card__value">{activeWords}</span>
                <span className="stat-card__label">слов в этом тексте</span>
              </div>
              <div className="stat-card">
                <span className="stat-card__value">{readingMinutes(activeWords)} мин</span>
                <span className="stat-card__label">чтения</span>
              </div>
            </div>

            <div className="kind-bars">
              <div className="kind-bars__title">Что вы пишете</div>
              {(Object.keys(KIND_META) as (keyof typeof KIND_META)[]).map((kind) => {
                const n = stats.counts[kind] ?? 0;
                const max = Math.max(1, ...Object.values(stats.counts));
                return (
                  <div className="kind-bar" key={kind}>
                    <span className="kind-bar__label">{KIND_META[kind].plural}</span>
                    <span className="kind-bar__track">
                      <span
                        className={`kind-bar__fill kind--${kind}`}
                        style={{ width: `${Math.max(4, (n / max) * 100)}%` }}
                      />
                    </span>
                    <span className="kind-bar__value">{n}</span>
                  </div>
                );
              })}
            </div>

            <div className="doc-facts">
              <div>
                <span>Создан</span>
                <b>{formatRelative(activeDoc.createdAt)}</b>
              </div>
              <div>
                <span>Изменён</span>
                <b>{formatRelative(activeDoc.updatedAt)}</b>
              </div>
              <div>
                <span>Тип</span>
                <b>{KIND_META[activeDoc.kind].label}</b>
              </div>
            </div>

            <blockquote className="goose-quote">
              <p>
                {activeWords === 0
                  ? 'Пустой лист — это тоже начало. Начните с одной фразы, дальше я подхвачу.'
                  : activeWords > 400
                    ? 'Внушительный текст! Сделайте паузу, прочитайте вслух — и проверьте ошибки.'
                    : 'Хороший ритм. Не забывайте про проверку — я люблю чистые тексты.'}
              </p>
            </blockquote>
          </div>
        )}
      </div>
    </aside>
  );
}
