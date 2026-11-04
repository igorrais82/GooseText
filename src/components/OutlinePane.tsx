import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import {
  analyzeText,
  buildOutline,
  extractKeywords,
  outlineToHtml,
  outlineToText,
} from '../lib/outline';

interface OutlinePaneProps {
  text: string;
  html: string;
  onInsertText: (text: string) => void;
  onSaveDoc: (title: string, html: string) => void;
  onToast: (kind: 'info' | 'success' | 'error', text: string) => void;
}

export function OutlinePane({ text, html, onInsertText, onSaveDoc, onToast }: OutlinePaneProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const metrics = useMemo(() => analyzeText(text), [text]);
  const keywords = useMemo(() => extractKeywords(text, 12), [text]);
  const outline = useMemo(() => buildOutline(html, text), [html, text]);

  const suggestions = useMemo(() => {
    const list: string[] = [];
    if (metrics.avgSentence > 24) list.push('Слишком длинные предложения — разбейте их на два-три.');
    if (metrics.longSentences > 2) list.push(`Длинных предложений: ${metrics.longSentences}. Читателю будет тяжело.`);
    if (metrics.waterShare > 45) list.push('Много служебных слов — уберите «который», «является», «в том числе».');
    if (metrics.readability < 45) list.push('Текст сложный: добавьте подзаголовки и короткие абзацы.');
    if (list.length === 0) list.push('Хороший ритм: короткие абзацы, понятные формулировки.');
    return list;
  }, [metrics]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      onToast('success', `${label} скопированы`);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      onToast('error', 'Не удалось скопировать');
    }
  };

  if (!text.trim()) {
    return (
      <div className="assistant__pane">
        <div className="panel__empty">
          <div className="goose-circle goose-circle--sm">
            <Icon name="outline" size={40} />
          </div>
          <p className="panel__empty-title">Плана пока нет</p>
          <p className="panel__empty-text">
            Добавьте текст — соберу структуру, ключевые слова и покажу, насколько легко его читать.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="assistant__pane outline">
      <div className="readability">
        <div className="readability__score">
          <span className="readability__value">{metrics.readability}</span>
          <span className="readability__label">{metrics.readabilityLabel}</span>
        </div>
        <div className="readability__bar">
          <i style={{ width: `${metrics.readability}%` }} />
        </div>
        <div className="readability__facts">
          <span>
            <b>{metrics.avgSentence}</b> слов в предложении
          </span>
          <span>
            <b>{metrics.longSentences}</b> длинных
          </span>
          <span>
            <b>{metrics.waterShare}%</b> служебных
          </span>
        </div>
      </div>

      <div className="outline__section">
        <div className="outline__head">
          <span className="outline__title">
            <Icon name="outline" size={14} /> План текста
          </span>
          <span className="outline__count">{outline.length}</span>
        </div>
        <ol className={`outline__list ${outline.length === 0 ? 'is-empty' : ''}`}>
          {outline.length === 0 && <li className="outline__hint">Добавьте заголовки или абзацы</li>}
          {outline.map((item, index) => (
            <li key={`${item.text}-${index}`} className={`outline__item outline__item--l${item.level}`}>
              <span className="outline__bullet">{item.level === 0 ? '§' : '•'}</span>
              <span>{item.text}</span>
            </li>
          ))}
        </ol>
        {outline.length > 0 && (
          <div className="panel__row">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                onInsertText(`\n${outlineToText(outline)}\n`);
                onToast('success', 'План вставлен в текст');
              }}
            >
              <Icon name="plus" size={14} /> В текст
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => {
                onSaveDoc('План текста', outlineToHtml(outline));
                onToast('success', 'План сохранён документом');
              }}
            >
              <Icon name="note" size={14} /> В документ
            </button>
          </div>
        )}
      </div>

      <div className="outline__section">
        <div className="outline__head">
          <span className="outline__title">
            <Icon name="key" size={14} /> Ключевые слова
          </span>
          <button
            type="button"
            className="link"
            onClick={() => copy(keywords.map((word) => word.word).join(', '), 'Ключевые слова')}
          >
            {copied === 'Ключевые слова' ? 'скопировано' : 'копировать'}
          </button>
        </div>
        <div className="keywords">
          {keywords.length === 0 && <span className="outline__hint">Слишком мало текста</span>}
          {keywords.map((word) => (
            <button
              key={word.word}
              type="button"
              className="keyword"
              onClick={() => copy(word.word, `Слово «${word.word}»`)}
              title={`${word.count} раз(а) — нажмите, чтобы скопировать`}
            >
              {word.word}
              <span>{word.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="outline__section">
        <div className="outline__head">
          <span className="outline__title">
            <Icon name="sparkles" size={14} /> Что улучшить
          </span>
        </div>
        <ul className="readability__tips">
          {suggestions.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>

      <div className="tips">
        <div className="tips__title">Метрики</div>
        <ul>
          <li>Слов: {metrics.words} · предложений: {metrics.sentences} · абзацев: {metrics.paragraphs}.</li>
          <li>Индекс читаемости — адаптированный Flesch: 100 — очень легко, ниже 40 — тяжело.</li>
          <li>Ключевые слова считаются по частоте без служебных слов, основа слова учитывается.</li>
        </ul>
      </div>
    </div>
  );
}
