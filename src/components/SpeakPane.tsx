import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import {
  Narrator,
  isSpeechSynthesisSupported,
  listVoices,
} from '../lib/speech';
import { AI_LANGUAGES, AiNarrator, downloadSpeech } from '../lib/tts';

interface SpeakPaneProps {
  text: string;
  selectedText: string;
  lang: 'ru' | 'en';
  title: string;
  onToast: (kind: 'info' | 'success' | 'error', text: string) => void;
}

type Mode = 'ai' | 'system';

function slug(title: string): string {
  return (
    title
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50)
      .toLowerCase() || 'goosetext'
  );
}

export function SpeakPane({ text, selectedText, lang, title, onToast }: SpeakPaneProps) {
  const [mode, setMode] = useState<Mode>('ai');
  const [aiLang, setAiLang] = useState(lang === 'ru' ? 'ru' : 'en');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState('');
  const [rate, setRate] = useState(1);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState<{ index: number; total: number; text: string } | null>(null);
  const [useSelection, setUseSelection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);

  const aiRef = useRef<AiNarrator | null>(null);
  const systemRef = useRef<Narrator | null>(null);

  const source = useSelection && selectedText ? selectedText : text;
  const words = useMemo(() => source.trim().split(/\s+/).filter(Boolean).length, [source]);
  const supportedSystem = isSpeechSynthesisSupported();
  const systemLang = lang === 'ru' ? 'ru-RU' : 'en-US';

  useEffect(() => {
    if (!supportedSystem) return;
    const refresh = () => setVoices(listVoices());
    refresh();
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', refresh);
  }, [supportedSystem]);

  useEffect(() => {
    return () => {
      aiRef.current?.stop();
      systemRef.current?.stop();
      aiRef.current = null;
      systemRef.current = null;
    };
  }, []);

  useEffect(() => {
    // Текст или движок сменились — старое чтение уже неактуально.
    aiRef.current?.stop();
    aiRef.current = null;
    systemRef.current?.stop();
    systemRef.current = null;
    setSpeaking(false);
    setPaused(false);
    setProgress(null);
    setError(null);
  }, [text, mode, aiLang]);

  const matchingVoices = voices.filter((voice) => {
    const code = voice.lang.toLowerCase();
    return code.startsWith(systemLang.toLowerCase()) || code.startsWith(lang);
  });
  const effectiveVoice = voiceURI || matchingVoices[0]?.voiceURI || '';

  const stop = () => {
    aiRef.current?.stop();
    aiRef.current = null;
    systemRef.current?.stop();
    systemRef.current = null;
    setSpeaking(false);
    setPaused(false);
    setProgress(null);
  };

  const startAi = async () => {
    if (!source.trim()) {
      onToast('info', 'Сначала добавьте текст');
      return;
    }
    setError(null);
    setProgress(null);
    const narrator = new AiNarrator(source, aiLang, rate, {
      onState: setSpeaking,
      onProgress: (index, total, phrase) => setProgress({ index, total, text: phrase }),
      onEnd: () => {
        setSpeaking(false);
        setPaused(false);
        onToast('success', 'Готово — текст озвучен');
      },
      onError: (message) => {
        setSpeaking(false);
        setError(message);
      },
    });
    aiRef.current = narrator;
    setPaused(false);
    await narrator.start();
  };

  const startSystem = () => {
    if (!supportedSystem) {
      setError('В этом окне нет системного синтеза речи');
      return;
    }
    if (!source.trim()) {
      onToast('info', 'Сначала добавьте текст');
      return;
    }
    systemRef.current?.stop();
    const narrator = new Narrator(
      source,
      { lang: systemLang, rate, voiceURI: effectiveVoice || undefined },
      {
        onState: setSpeaking,
        onProgress: (index, total, phrase) => setProgress({ index, total, text: phrase }),
        onEnd: () => {
          setSpeaking(false);
          setPaused(false);
          onToast('success', 'Готово — текст прочитан');
        },
        onError: (message) => {
          setSpeaking(false);
          setError(message);
        },
      },
    );
    systemRef.current = narrator;
    setPaused(false);
    narrator.start();
  };

  const start = () => {
    if (mode === 'ai') void startAi();
    else startSystem();
  };

  const togglePause = () => {
    if (mode === 'ai') {
      const narrator = aiRef.current;
      if (!narrator) return;
      if (paused) {
        narrator.resume();
        setPaused(false);
      } else {
        narrator.pause();
        setPaused(true);
      }
      return;
    }
    const narrator = systemRef.current;
    if (!narrator) return;
    if (paused) {
      narrator.resume();
      setPaused(false);
    } else {
      narrator.pause();
      setPaused(true);
    }
  };

  const download = async () => {
    if (!source.trim()) return;
    setDownloading(true);
    setDownloadProgress('Готовлю MP3…');
    try {
      await downloadSpeech(source, aiLang, slug(title), (done, total) => {
        setDownloadProgress(`Собираю MP3: ${Math.round((done / Math.max(1, total)) * 100)}%`);
      });
      onToast('success', 'MP3 сохранён');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Не удалось скачать озвучку');
    } finally {
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  return (
    <div className="assistant__pane speak">
      <div className="speak__card">
        <div className={`speak__orb ${speaking ? 'is-on' : ''}`}>
          <Icon name="volume" size={26} />
        </div>
        <div className="speak__info">
          <div className="speak__title">Гусь читает вслух</div>
          <div className="speak__hint">
            {source.trim()
              ? `${words} слов · ${mode === 'ai' ? 'нейроголос' : 'системный голос'}`
              : 'Откройте текстовый документ'}
          </div>
        </div>
      </div>

      <div className="seg seg--wide" role="group" aria-label="Движок озвучки">
        <button
          type="button"
          className={`seg__btn ${mode === 'ai' ? 'seg__btn--active' : ''}`}
          onClick={() => setMode('ai')}
        >
          <Icon name="sparkles" size={13} /> AI-голос
        </button>
        <button
          type="button"
          className={`seg__btn ${mode === 'system' ? 'seg__btn--active' : ''}`}
          onClick={() => setMode('system')}
        >
          <Icon name="monitor" size={13} /> Системный
        </button>
      </div>

      <div className="speak__controls">
        <button
          type="button"
          className="btn btn--primary"
          onClick={speaking ? togglePause : start}
          disabled={!source.trim() || downloading}
        >
          <Icon name={speaking && !paused ? 'pause' : 'play'} size={15} />
          {speaking ? (paused ? 'Продолжить' : 'Пауза') : 'Озвучить'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={stop} disabled={!speaking && !paused}>
          <Icon name="stop" size={14} /> Стоп
        </button>
      </div>

      {progress && (
        <div className="speak__now">
          <div className="speak__nowhead">
            <span>
              Фраза {Math.min(progress.index + 1, progress.total)} из {progress.total}
            </span>
            <span className="speak__progress">
              <i style={{ width: `${((progress.index + 1) / Math.max(1, progress.total)) * 100}%` }} />
            </span>
          </div>
          <p>{progress.text}</p>
        </div>
      )}

      {error && (
        <div className="notice notice--warn">
          <Icon name="alert" size={14} /> {error}
          <button type="button" className="link" onClick={() => setMode('system')}>
            системный голос
          </button>
        </div>
      )}

      {mode === 'ai' ? (
        <>
          <div className="setting setting--inline">
            <div className="setting__head">
              <span className="setting__label">Язык озвучки</span>
              <span className="setting__hint">нейроголос · нужен интернет</span>
            </div>
            <select
              className="input"
              value={aiLang}
              onChange={(e) => setAiLang(e.target.value)}
              aria-label="Язык озвучки"
            >
              {AI_LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label} · {language.native}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={() => void download()}
            disabled={!source.trim() || downloading}
          >
            <Icon name="download" size={14} />
            {downloading ? downloadProgress ?? 'Собираю MP3…' : 'Скачать озвучку в MP3'}
          </button>
        </>
      ) : (
        <div className="setting setting--inline">
          <div className="setting__head">
            <span className="setting__label">Голос</span>
            <span className="setting__hint">
              {matchingVoices.length ? `${matchingVoices.length} доступно` : 'системный'}
            </span>
          </div>
          <select
            className="input"
            value={effectiveVoice}
            onChange={(e) => setVoiceURI(e.target.value)}
            disabled={matchingVoices.length === 0}
            aria-label="Голос"
          >
            {matchingVoices.length === 0 && <option value="">Системный голос</option>}
            {matchingVoices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name} {voice.localService ? '· офлайн' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="setting setting--inline">
        <div className="setting__head">
          <span className="setting__label">Скорость</span>
          <span className="setting__value">{rate.toFixed(1)}×</span>
        </div>
        <input
          className="range"
          type="range"
          min={0.7}
          max={1.5}
          step={0.1}
          value={rate}
          style={{ ['--pct' as string]: `${((rate - 0.7) / 0.8) * 100}%` }}
          onChange={(e) => {
            const value = Number(e.target.value);
            setRate(value);
            aiRef.current?.setRate(value);
          }}
          aria-label="Скорость чтения"
        />
      </div>

      {selectedText && (
        <label className="setting__row">
          <span>
            <span className="setting__rowlabel">Только выделенное</span>
            <span className="setting__hint">Озвучить фрагмент, а не весь документ</span>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={useSelection}
            onChange={(e) => setUseSelection(e.target.checked)}
          />
        </label>
      )}

      <div className="tips">
        <div className="tips__title">Зачем это</div>
        <ul>
          <li>AI-голос звучит естественнее системного и умеет читать на 15 языках.</li>
          <li>MP3 можно скачать и слушать в плеере или отправить в мессенджер.</li>
          <li>Вычитка на слух помогает заметить повторы и рваные фразы.</li>
        </ul>
      </div>
    </div>
  );
}
