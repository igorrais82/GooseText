import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { htmlFromPlain, wordCount } from '../lib/utils';
import {
  TRANSLATE_LANGS,
  langCode2,
  langLabel,
  translateText,
  translationProviderLabel,
  type TranslationResult,
} from '../lib/translate';

interface TranslatePaneProps {
  text: string;
  selectedText: string;
  source: string;
  target: string;
  onSource: (code: string) => void;
  onTarget: (code: string) => void;
  onInsertText: (text: string) => void;
  onSaveDoc: (title: string, html: string) => void;
  onToast: (kind: 'info' | 'success' | 'error', text: string) => void;
}

export function TranslatePane({
  text,
  selectedText,
  source,
  target,
  onSource,
  onTarget,
  onInsertText,
  onSaveDoc,
  onToast,
}: TranslatePaneProps) {
  const [draft, setDraft] = useState(text);
  const [useSelection, setUseSelection] = useState(false);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!useSelection) setDraft(text);
  }, [text, useSelection]);

  useEffect(() => {
    if (useSelection && selectedText) setDraft(selectedText);
  }, [selectedText, useSelection]);

  const characters = draft.length;
  const targetLang = useMemo(() => TRANSLATE_LANGS.find((lang) => lang.code === target), [target]);

  const run = async () => {
    if (!draft.trim()) {
      setError('Сначала добавьте текст — из документа или выделение.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const translated = await translateText(draft, source, target);
      setResult(translated);
      if (translated.provider === 'offline') {
        onToast('info', 'Сеть недоступна — показан черновой офлайн-перевод');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Перевод не удался');
    } finally {
      setBusy(false);
    }
  };

  const swap = () => {
    if (source === 'auto') return;
    onSource(target);
    onTarget(source);
    if (result) setDraft(result.text);
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      onToast('success', 'Перевод скопирован');
    } catch {
      onToast('error', 'Не удалось скопировать');
    }
  };

  return (
    <div className="assistant__pane translate">
      <div className="translate__bar">
        <select
          className="lang-select"
          value={source}
          onChange={(e) => onSource(e.target.value)}
          aria-label="Язык исходного текста"
        >
          <option value="auto">Определить язык</option>
          {TRANSLATE_LANGS.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          onClick={swap}
          disabled={source === 'auto'}
          title="Поменять языки"
          aria-label="Поменять языки"
        >
          <Icon name="refresh" size={14} />
        </button>
        <span className="translate__arrow">
          <Icon name="arrowRight" size={14} />
        </span>
        <select
          className="lang-select lang-select--target"
          value={target}
          onChange={(e) => onTarget(e.target.value)}
          aria-label="Язык перевода"
        >
          {TRANSLATE_LANGS.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.native}
            </option>
          ))}
        </select>
      </div>

      <div className="translate__sourcebar">
        <span className="translate__label">
          Исходный текст · {wordCount(draft)} слов · {characters} симв.
        </span>
        <div className="translate__sourceactions">
          {selectedText && (
            <button
              type="button"
              className={`link ${useSelection ? 'is-on' : ''}`}
              onClick={() => {
                setUseSelection((value) => !value);
                setDraft(useSelection ? text : selectedText);
              }}
            >
              {useSelection ? 'весь документ' : 'выделение'}
            </button>
          )}
          {draft !== text && (
            <button type="button" className="link" onClick={() => setDraft(text)}>
              из документа
            </button>
          )}
        </div>
      </div>

      <textarea
        className="translate__input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Вставьте или напишите текст, который нужно перевести…"
        rows={6}
        spellCheck={false}
        aria-label="Текст для перевода"
      />

      <button type="button" className={`btn btn--primary btn--block ${busy ? 'is-busy' : ''}`} onClick={run} disabled={busy}>
        {busy ? (
          'Перевожу…'
        ) : (
          <>
            <Icon name="languages" size={15} /> Перевести на {targetLang?.label.toLowerCase() ?? target}
          </>
        )}
      </button>

      {error && (
        <div className="notice notice--warn">
          <Icon name="alert" size={14} /> {error}
        </div>
      )}

      {result && (
        <div className="translate__result">
          <div className="translate__meta">
            <span className="translate__provider">{translationProviderLabel(result.provider)}</span>
            <span>
              {langLabel(result.detected)} → {targetLang?.label ?? target}
            </span>
          </div>
          {result.note && (
            <div className="notice notice--warn">
              <Icon name="info" size={13} /> {result.note}
            </div>
          )}
          <div className="translate__output" lang={langCode2(target)}>
            {result.text}
          </div>
          <div className="translate__actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={copy}>
              <Icon name="copy" size={14} /> Скопировать
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                onInsertText(result.text);
                onToast('success', 'Перевод вставлен в документ');
              }}
            >
              <Icon name="plus" size={14} /> В текст
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => {
                onSaveDoc(`Перевод: ${targetLang?.label ?? target}`, htmlFromPlain(result.text));
                onToast('success', 'Перевод сохранён отдельным документом');
              }}
            >
              <Icon name="note" size={14} /> В документ
            </button>
          </div>
        </div>
      )}

      {!result && !busy && (
        <div className="tips">
          <div className="tips__title">Как это работает</div>
          <ul>
            <li>Перевод идёт через открытые сервисы Google и MyMemory — без ключей и регистрации.</li>
            <li>Длинный текст режется на абзацы автоматически, форматирование документа не меняется.</li>
            <li>Без интернета остаётся офлайн-словарь для пары русский ↔ английский.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
