import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppState,
  AssistantTab,
  Doc,
  DocKind,
  Drawing,
  Folder,
  Settings,
  SpellIssue,
  SpellState,
  Toast,
} from './types';
import { FREE_LIMITS, KIND_META } from './types';
import { DocumentsPanel, type Filter, type FolderSel } from './components/DocumentsPanel';
import { EditorPane } from './components/EditorPane';
import { DrawingPane } from './components/DrawingPane';
import { AssistantPanel } from './components/AssistantPanel';
import { ConfirmDialog, MoveDialog, NewDocDialog } from './components/Dialogs';
import { LicenseDialog } from './components/LicenseDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { Toasts } from './components/Toasts';
import { Rail, RailButton } from './components/Rail';
import { Goose, GooseMark } from './components/Goose';
import { Icon } from './components/Icon';
import { exportState, importState, loadState, saveState, seedState } from './lib/storage';
import { checkText, detectLanguage } from './lib/spellcheck';
import { saveFile } from './lib/saveFile';
import { Dictation, isSpeechSupported, tidyDictation } from './lib/speech';
import { LocalDictation } from './lib/localSpeech';
import { useAppearance } from './lib/appearance';
import {
  appendParagraph,
  caretOffset,
  extractTextWithMap,
  insertAtCaret,
  replaceOffsets,
  selectOffsets,
} from './lib/editor';
import { displayTitle, escapeHtml, htmlToMarkdown, plainFromHtml, uid, wordCount } from './lib/utils';
import {
  fullscreenSupported,
  onFullscreenChange,
  toggleFullscreen,
  isDesktop,
  localSpeechAvailable,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  onMaximizedChange,
} from './lib/platform';
import { createDrawing } from './lib/draw';
import { canMoveFolder, descendantIds, uniqueFolderName } from './lib/folders';
import { activateLicense, entitlements, trialDaysLeft } from './lib/license';
import { canRetell, summarize, type RetellResult } from './lib/retell';

const TEMPLATES: Record<DocKind, string> = {
  note: '',
  summary: '<h2>Тема</h2><p><br></p><h2>Главное</h2><ul><li><br></li></ul><h2>Вывод</h2><p><br></p>',
  script: '<p>INT. КОМНАТА — ДЕНЬ</p><p><br></p><p>ГЕРОЙ</p><p><br></p>',
  reminder: '<p><br></p>',
  drawing: '',
};

function slug(title: string): string {
  const base = title.trim() || 'goosetext';
  return base
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .toLowerCase();
}

function playQuack() {  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(560, t);
    osc.frequency.exponentialRampToValueAtTime(210, t + 0.16);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* звук не критичен */
  }
}

export default function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [activeId, setActiveId] = useState<string | null>(() => state.docs[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [folderSel, setFolderSel] = useState<FolderSel>('all');
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Doc | null>(null);
  const [confirmFolder, setConfirmFolder] = useState<Folder | null>(null);
  const [moveDocTarget, setMoveDocTarget] = useState<Doc | null>(null);
  const [moveFolderTarget, setMoveFolderTarget] = useState<Folder | null>(null);
  const [tab, setTab] = useState<AssistantTab>('spell');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [saving, setSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const [spell, setSpell] = useState<SpellState | null>(null);
  const [checking, setChecking] = useState(false);
  const [spellDirty, setSpellDirty] = useState(false);
  const [checkLang, setCheckLang] = useState<'ru' | 'en'>('ru');

  const [retell, setRetell] = useState<RetellResult | null>(null);
  const [retellBusy, setRetellBusy] = useState(false);

  const [dictating, setDictating] = useState(false);
  const [interim, setInterim] = useState('');
  const [dictationLang, setDictationLang] = useState<'ru-RU' | 'en-US'>('ru-RU');
  const [dictationHistory, setDictationHistory] = useState<{ id: string; text: string; at: number }[]>([]);
  const [dictationStatus, setDictationStatus] = useState('');
  const [selectionText, setSelectionText] = useState('');

  const [notifications, setNotifications] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const [canInstall, setCanInstall] = useState(false);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const dictationRef = useRef<Dictation | null>(null);
  const localDictationRef = useRef<LocalDictation | null>(null);
  const insertFinalRef = useRef<(text: string) => void>(() => {});
  const applyingRef = useRef(false);
  const notifiedRef = useRef<Set<string>>(new Set());
  const deferredPromptRef = useRef<{ prompt: () => Promise<void>; userChoice: Promise<unknown> } | null>(null);
  const spellRef = useRef<SpellState | null>(null);
  const activeDocRef = useRef<Doc | null>(null);
  const quotaWarnedRef = useRef(false);
  const retellTimerRef = useRef<number | null>(null);

  const docs = state.docs;
  const folders = state.folders;
  const settings = state.settings;
  const license = state.license;
  const ent = entitlements(license, docs.length);
  const docsOpen = settings.docsOpen;
  const assistantOpen = settings.assistantOpen;

  useAppearance(settings);

  const pushToast = useCallback((kind: Toast['kind'], text: string, action?: Toast['action']) => {
    const id = uid('t');
    setToasts((prev) => [...prev.slice(-3), { id, kind, text, action }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5600);
  }, []);

  const sorted = useMemo(
    () => [...docs].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt),
    [docs],
  );

  const counts = useMemo(() => {
    const base: Record<string, number> = {
      all: docs.length,
      pinned: docs.filter((d) => d.pinned).length,
      note: 0,
      summary: 0,
      script: 0,
      reminder: 0,
      drawing: 0,
    };
    for (const d of docs) base[d.kind] = (base[d.kind] ?? 0) + 1;
    return base;
  }, [docs]);

  const folderCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of docs) {
      if (d.folderId) map[d.folderId] = (map[d.folderId] ?? 0) + 1;
    }
    return map;
  }, [docs]);

  const unfiledCount = useMemo(() => docs.filter((d) => !d.folderId).length, [docs]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((d) => {
      const byKind = filter === 'all' ? true : filter === 'pinned' ? d.pinned : d.kind === filter;
      if (!byKind) return false;
      if (folderSel !== 'all') {
        const inFolder = folderSel === 'unfiled' ? !d.folderId : d.folderId === folderSel;
        if (!inFolder) return false;
      }
      if (!q) return true;
      return (d.title || '').toLowerCase().includes(q) || plainFromHtml(d.html).toLowerCase().includes(q);
    });
  }, [sorted, filter, query, folderSel]);

  const activeDoc = useMemo(() => docs.find((d) => d.id === activeId) ?? null, [docs, activeId]);
  const totalWords = useMemo(() => docs.reduce((sum, d) => sum + wordCount(plainFromHtml(d.html)), 0), [docs]);
  const activeText = useMemo(() => (activeDoc ? plainFromHtml(activeDoc.html) : ''), [activeDoc]);
  const retellReady = Boolean(activeDoc && activeDoc.kind !== 'drawing' && canRetell(activeText));

  useEffect(() => {
    activeDocRef.current = activeDoc;
  }, [activeDoc]);

  useEffect(() => {
    spellRef.current = spell;
  }, [spell]);

  useEffect(() => {
    if (!activeDoc && docs.length > 0) setActiveId(sorted[0].id);
  }, [activeDoc, docs, sorted]);

  useEffect(() => {
    if (!activeDoc) {
      document.title = 'GooseText';
      return;
    }
    document.title = `${displayTitle(activeDoc.title, activeDoc.html, 48)} — GooseText`;
  }, [activeDoc]);

  /* ---------------------------- сохранение ---------------------------- */
  useEffect(() => {
    if (!settings.autoSave) return;
    setSaving(true);
    const t = window.setTimeout(() => {
      const ok = saveState(state);
      setSaving(false);
      if (!ok && !quotaWarnedRef.current) {
        quotaWarnedRef.current = true;
        pushToast(
          'error',
          'Хранилище переполнено: изменения не сохраняются. Экспортируйте резервную копию и удалите лишние рисунки.',
        );
      }
    }, 420);
    return () => window.clearTimeout(t);
  }, [state, settings.autoSave, pushToast]);

  const saveNow = useCallback(() => {
    const ok = saveState(state);
    setSaving(false);
    pushToast(
      ok ? 'success' : 'error',
      ok ? 'Сохранено — файл в безопасности' : 'Не удалось сохранить: в хранилище нет места',
    );
  }, [state, pushToast]);

  /* ---------------------------- настройки ---------------------------- */
  const saveSettings = useCallback((patch: Partial<Settings>) => {
    setState((s) => {
      const next = { ...s, settings: { ...s.settings, ...patch } };
      saveState(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (window.innerWidth < 900 && (settings.docsOpen || settings.assistantOpen)) {
      saveSettings({ docsOpen: false, assistantOpen: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleDocs = useCallback(() => {
    saveSettings({ docsOpen: !settings.docsOpen });
  }, [saveSettings, settings.docsOpen]);

  const toggleAssistant = useCallback(() => {
    saveSettings({ assistantOpen: !settings.assistantOpen });
  }, [saveSettings, settings.assistantOpen]);

  const openTab = useCallback(
    (next: AssistantTab) => {
      setTab(next);
      if (!settings.assistantOpen) saveSettings({ assistantOpen: true });
    },
    [saveSettings, settings.assistantOpen],
  );

  const focusSearch = useCallback(() => {
    if (!settings.docsOpen) saveSettings({ docsOpen: true });
    window.setTimeout(() => document.querySelector<HTMLInputElement>('.search__input')?.focus(), 80);
  }, [saveSettings, settings.docsOpen]);

  const resolvedTheme =
    settings.theme === 'system'
      ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : settings.theme;

  const toggleTheme = useCallback(() => {
    saveSettings({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' });
  }, [resolvedTheme, saveSettings]);

  /* ---------------------------- полный экран ---------------------------- */
  useEffect(() => onFullscreenChange(setIsFullscreen), []);

  // Состояние окна: своя строка заголовка должна знать, развёрнуто ли окно.
  useEffect(() => {
    if (!isDesktop) return;
    void window.goosetext?.isWindowMaximized?.().then((value) => setIsMaximized(Boolean(value)));
    return onMaximizedChange(setIsMaximized);
  }, []);

  // Выделенный фрагмент нужен переводчику и озвучиванию.
  useEffect(() => {
    const updateSelection = () => {
      const selection = window.getSelection();
      const editor = editorRef.current;
      if (!selection || selection.rangeCount === 0 || !editor) {
        setSelectionText('');
        return;
      }
      const inside =
        editor.contains(selection.anchorNode) || editor.contains(selection.focusNode);
      const value = selection.toString().trim();
      setSelectionText(inside ? value : '');
    };
    document.addEventListener('selectionchange', updateSelection);
    return () => document.removeEventListener('selectionchange', updateSelection);
  }, []);

  const handleFullscreen = useCallback(async () => {
    if (!fullscreenSupported) {
      pushToast('info', 'Это окно не поддерживает полный экран');
      return;
    }
    const next = await toggleFullscreen();
    setIsFullscreen(next);
  }, [pushToast]);

  // На узком экране панели закрываются, чтобы текст оставался на виду.
  useEffect(() => {
    let timer: number | null = null;
    const onResize = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (window.innerWidth < 900) {
          setState((s) =>
            s.settings.docsOpen || s.settings.assistantOpen
              ? { ...s, settings: { ...s.settings, docsOpen: false, assistantOpen: false } }
              : s,
          );
        }
      }, 180);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  /* ---------------------------- лицензия ---------------------------- */
  const openLicense = useCallback(() => setLicenseOpen(true), []);

  const needPro = useCallback(
    (feature: string) => {
      pushToast('info', `${feature} открывается с лицензией — вот окно покупки`);
      setLicenseOpen(true);
    },
    [pushToast],
  );

  const activate = useCallback(
    (key: string, email: string | null) => {
      const nextLicense = activateLicense(key, email);
      setState((s) => ({ ...s, license: nextLicense }));
      saveState({ ...state, license: nextLicense });
      pushToast('success', 'Лицензия активирована. Спасибо, что поддерживаете гуся!');
      return true;
    },
    [pushToast, state],
  );

  /* ---------------------------- документы ---------------------------- */
  const updateDoc = useCallback((id: string, patch: Partial<Doc>) => {
    setState((s) => ({ ...s, docs: s.docs.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
  }, []);

  const closePanelsOnMobile = useCallback(() => {
    if (window.innerWidth < 900) saveSettings({ docsOpen: false, assistantOpen: false });
  }, [saveSettings]);

  const createDoc = useCallback(
    (kind: DocKind) => {
      if (!ent.pro && docs.length >= FREE_LIMITS.docs) {
        pushToast('info', `Бесплатно — до ${FREE_LIMITS.docs} документов. Лицензия снимает лимит.`);
        setLicenseOpen(true);
        return;
      }
      const now = Date.now();
      const doc: Doc = {
        id: uid(),
        kind,
        title: '',
        html: TEMPLATES[kind],
        createdAt: now,
        updatedAt: now,
        pinned: false,
        reminderAt: kind === 'reminder' ? now + 3600000 : null,
        reminderDone: false,
        language: 'ru',
        tags: [],
        folderId: folderSel !== 'all' && folderSel !== 'unfiled' ? folderSel : null,
        drawing: kind === 'drawing' ? createDrawing() : null,
      };
      setState((s) => ({ ...s, docs: [doc, ...s.docs] }));
      setActiveId(doc.id);
      setNewDocOpen(false);
      setSpell(null);
      setSpellDirty(false);
      setRetell(null);
      closePanelsOnMobile();
      pushToast('goose', `Новый документ: ${KIND_META[kind].label.toLowerCase()}`);
      window.setTimeout(() => editorRef.current?.focus(), 120);
    },
    [closePanelsOnMobile, docs.length, ent.pro, folderSel, pushToast],
  );

  const deleteDoc = useCallback(
    (id: string) => {
      const removed = docs.find((d) => d.id === id);
      if (!removed) return;
      setState((s) => ({ ...s, docs: s.docs.filter((d) => d.id !== id) }));
      if (id === activeId) {
        const next = docs.find((d) => d.id !== id);
        setActiveId(next?.id ?? null);
      }
      setConfirmDelete(null);
      pushToast('success', 'Документ удалён', {
        label: 'Вернуть',
        run: () => {
          setState((s) => ({ ...s, docs: [removed, ...s.docs] }));
          setActiveId(removed.id);
        },
      });
    },
    [activeId, docs, pushToast],
  );

  const duplicateDoc = useCallback(() => {
    if (!activeDoc) return;
    if (!ent.pro && docs.length >= FREE_LIMITS.docs) {
      pushToast('info', `Бесплатно — до ${FREE_LIMITS.docs} документов. Лицензия снимает лимит.`);
      setLicenseOpen(true);
      return;
    }
    const now = Date.now();
    const copy: Doc = {
      ...activeDoc,
      id: uid(),
      title: `${activeDoc.title || 'Без названия'} — копия`,
      createdAt: now,
      updatedAt: now,
      pinned: false,
      drawing: activeDoc.drawing
        ? { ...activeDoc.drawing, strokes: activeDoc.drawing.strokes.map((s) => ({ ...s })) }
        : null,
    };
    setState((s) => ({ ...s, docs: [copy, ...s.docs] }));
    setActiveId(copy.id);
    pushToast('success', 'Копия готова');
  }, [activeDoc, docs.length, ent.pro, pushToast]);

  const handleHtmlChange = useCallback(
    (html: string) => {
      const doc = activeDocRef.current;
      if (!doc) return;
      updateDoc(doc.id, { html, updatedAt: Date.now() });
      if (applyingRef.current) applyingRef.current = false;
      else if (spellRef.current) setSpellDirty(true);
    },
    [updateDoc],
  );

  const handleDrawingChange = useCallback(
    (drawing: Drawing) => {
      const doc = activeDocRef.current;
      if (!doc) return;
      updateDoc(doc.id, { drawing, updatedAt: Date.now() });
    },
    [updateDoc],
  );

  const handleExport = useCallback(
    async (fmt: 'txt' | 'md') => {
      const doc = activeDocRef.current;
      if (!doc) return;
      if (doc.kind === 'drawing') {
        pushToast('info', 'Рисунок сохраняется кнопкой PNG в панели рисования');
        return;
      }
      const title = displayTitle(doc.title, doc.html);
      const content =
        fmt === 'md' ? `# ${title}\n\n${htmlToMarkdown(doc.html)}` : `${title}\n\n${plainFromHtml(doc.html)}`;
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const saved = await saveFile(blob, `${slug(title)}.${fmt}`);
      pushToast(
        'success',
        saved === 'shared' ? `Файл .${fmt} готов — выберите, куда сохранить` : `Документ сохранён как .${fmt}`,
      );
    },
    [pushToast],
  );

  const handleCopy = useCallback(async () => {
    const doc = activeDocRef.current;
    if (!doc) return;
    try {
      await navigator.clipboard.writeText(plainFromHtml(doc.html));
      pushToast('success', 'Текст скопирован');
    } catch {
      pushToast('error', 'Не удалось скопировать текст');
    }
  }, [pushToast]);

  /** Вставка готового текста (перевод, план) туда, где стоит курсор. */
  const insertTextAtCaret = useCallback(
    (text: string) => {
      const editor = editorRef.current;
      const doc = activeDocRef.current;
      if (!editor || !doc || !editor.isConnected || doc.kind === 'drawing') {
        pushToast('info', 'Откройте текстовый документ — вставлю туда');
        return;
      }
      editor.focus();
      insertAtCaret(editor, text);
      updateDoc(doc.id, { html: editor.innerHTML, updatedAt: Date.now() });
    },
    [pushToast, updateDoc],
  );

  /** Сохранение результата помощника отдельным документом. */
  const saveAsDoc = useCallback(
    (title: string, html: string, kind: DocKind = 'note') => {
      if (!ent.pro && docs.length >= FREE_LIMITS.docs) {
        needPro('Документы без лимита');
        return;
      }
      const now = Date.now();
      const doc: Doc = {
        id: uid(),
        kind,
        title,
        html,
        createdAt: now,
        updatedAt: now,
        pinned: false,
        reminderAt: null,
        reminderDone: false,
        language: activeDoc?.language ?? 'ru',
        tags: ['помощник'],
        folderId: activeDoc?.folderId ?? null,
        drawing: null,
      };
      setState((s) => ({ ...s, docs: [doc, ...s.docs] }));
      setActiveId(doc.id);
      setTab('spell');
      pushToast('success', `Документ «${title}» создан`);
    },
    [activeDoc?.folderId, activeDoc?.language, docs.length, ent.pro, needPro, pushToast],
  );

  /* ---------------------------- папки ---------------------------- */
  const createFolder = useCallback(
    (parentId: string | null) => {
      if (!ent.pro && folders.length >= FREE_LIMITS.folders) {
        pushToast('info', `Бесплатно — до ${FREE_LIMITS.folders} папок. Лицензия снимает лимит.`);
        setLicenseOpen(true);
        return;
      }
      const name = uniqueFolderName(folders, 'Новая папка', parentId);
      const folder: Folder = { id: uid('f'), name, parentId, createdAt: Date.now() };
      setState((s) => ({ ...s, folders: [...s.folders, folder] }));
      pushToast('success', `Папка «${name}» создана. Двойной щелчок по имени — переименовать.`);
    },
    [ent.pro, folders, pushToast],
  );

  const renameFolder = useCallback((id: string, name: string) => {
    const clean = name.trim().slice(0, 80);
    if (!clean) return;
    setState((s) => ({
      ...s,
      folders: s.folders.map((f) => (f.id === id ? { ...f, name: clean } : f)),
    }));
  }, []);

  const deleteFolder = useCallback(
    (id: string) => {
      const folder = folders.find((f) => f.id === id);
      if (!folder) return;
      const parentId = folder.parentId;
      setState((s) => ({
        ...s,
        folders: s.folders
          .filter((f) => f.id !== id)
          .map((f) => (f.parentId === id ? { ...f, parentId } : f)),
        docs: s.docs.map((d) => (d.folderId === id ? { ...d, folderId: parentId } : d)),
      }));
      if (folderSel === id) setFolderSel('all');
      setConfirmFolder(null);
      pushToast('success', 'Папка удалена, документы остались');
    },
    [folderSel, folders, pushToast],
  );

  const toggleFolder = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      folders: s.folders.map((f) => (f.id === id ? { ...f, collapsed: !f.collapsed } : f)),
    }));
  }, []);

  const moveFolder = useCallback(
    (id: string, parentId: string | null) => {
      if (!canMoveFolder(folders, id, parentId)) {
        pushToast('error', 'Нельзя переместить папку внутрь самой себя');
        return;
      }
      setState((s) => ({
        ...s,
        folders: s.folders.map((f) => (f.id === id ? { ...f, parentId } : f)),
      }));
      pushToast('success', 'Папка перемещена');
    },
    [folders, pushToast],
  );

  const moveDoc = useCallback(
    (docId: string, folderId: string | null) => {
      setState((s) => ({
        ...s,
        docs: s.docs.map((d) => (d.id === docId ? { ...d, folderId } : d)),
      }));
      const name = folderId ? folders.find((f) => f.id === folderId)?.name : null;
      pushToast('success', name ? `Документ в папке «${name}»` : 'Документ перемещён в корень');
    },
    [folders, pushToast],
  );

  /* ---------------------------- напоминания ---------------------------- */
  const requestNotifications = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      setNotifications('unsupported');
      pushToast('info', 'Это окно не умеет уведомления — напомню внутри приложения');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotifications(permission);
      pushToast(
        permission === 'granted' ? 'success' : 'info',
        permission === 'granted' ? 'Уведомления разрешены' : 'Уведомления не разрешены',
      );
    } catch {
      pushToast('error', 'Не удалось запросить разрешение');
    }
  }, [pushToast]);

  const createReminder = useCallback(
    (title: string, at: number) => {
      if (!ent.pro && docs.length >= FREE_LIMITS.docs) {
        pushToast('info', `Бесплатно — до ${FREE_LIMITS.docs} документов. Лицензия снимает лимит.`);
        setLicenseOpen(true);
        return;
      }
      const now = Date.now();
      const doc: Doc = {
        id: uid(),
        kind: 'reminder',
        title,
        html: '',
        createdAt: now,
        updatedAt: now,
        pinned: false,
        reminderAt: at,
        reminderDone: false,
        language: 'ru',
        tags: [],
        folderId: null,
        drawing: null,
      };
      setState((s) => ({ ...s, docs: [doc, ...s.docs] }));
      pushToast('success', 'Напоминание поставлено');
    },
    [docs.length, ent.pro, pushToast],
  );

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const doc of docs) {
        if (!doc.reminderAt || doc.reminderDone) continue;
        if (doc.reminderAt > now) continue;
        if (now - doc.reminderAt > 24 * 3600 * 1000) continue;
        const key = `${doc.id}:${doc.reminderAt}`;
        if (notifiedRef.current.has(key)) continue;
        notifiedRef.current.add(key);
        pushToast('goose', `Пора: ${displayTitle(doc.title, doc.html, 40)}`, {
          label: 'Открыть',
          run: () => setActiveId(doc.id),
        });
        if (settings.sound) playQuack();
        if (notifications === 'granted') {
          try {
            new Notification('GooseText — напоминание', {
              body: displayTitle(doc.title, doc.html, 60),
              tag: doc.id,
            });
          } catch {
            /* noop */
          }
        }
      }
    };
    tick();
    const timer = window.setInterval(tick, 20000);
    return () => window.clearInterval(timer);
  }, [docs, notifications, settings.sound, pushToast]);

  /* ---------------------------- проверка текста ---------------------------- */
  useEffect(() => {
    if (!activeDoc) return;
    setSpell(null);
    setSpellDirty(false);
    setRetell(null);
    setCheckLang(detectLanguage(plainFromHtml(activeDoc.html)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const runCheck = useCallback(async () => {
    const el = editorRef.current;
    const doc = activeDocRef.current;
    if (!el || !doc) return;
    if (doc.kind === 'drawing') {
      pushToast('info', 'Рисунок проверить нельзя — это не текст');
      return;
    }
    const map = extractTextWithMap(el);
    if (!map.text.trim()) {
      pushToast('info', 'Пока нечего проверять — добавьте пару слов');
      return;
    }
    openTab('spell');
    setChecking(true);
    try {
      const result = await checkText(map.text, checkLang);
      setSpell({ ...result, text: map.text });
      setSpellDirty(false);
      pushToast(
        result.issues.length === 0 ? 'success' : 'info',
        result.issues.length === 0 ? 'Ошибок не нашёл — текст чистый' : `Нашёл замечаний: ${result.issues.length}`,
      );
    } catch {
      pushToast('error', 'Не удалось проверить текст');
    } finally {
      setChecking(false);
    }
  }, [checkLang, openTab, pushToast]);

  const applyFix = useCallback(
    (issue: SpellIssue, replacement: string) => {
      const el = editorRef.current;
      const doc = activeDocRef.current;
      if (!el || !doc) return;
      applyingRef.current = true;
      const ok = replaceOffsets(el, issue.offset, issue.offset + issue.length, replacement);
      if (!ok) {
        applyingRef.current = false;
        pushToast('error', 'Не получилось заменить — попробуйте вручную');
        return;
      }
      updateDoc(doc.id, { html: el.innerHTML, updatedAt: Date.now() });
      const delta = replacement.length - issue.length;
      const freshText = extractTextWithMap(el).text;
      setSpell((prev) =>
        prev
          ? {
              ...prev,
              text: freshText,
              issues: prev.issues
                .filter((i) => i.id !== issue.id)
                .map((i) => (i.offset > issue.offset ? { ...i, offset: i.offset + delta } : i)),
            }
          : prev,
      );
    },
    [pushToast, updateDoc],
  );

  const applyAll = useCallback(() => {
    const el = editorRef.current;
    const doc = activeDocRef.current;
    const current = spellRef.current;
    if (!el || !doc || !current) return;
    const fixable = [...current.issues].filter((i) => i.replacements.length > 0).sort((a, b) => b.offset - a.offset);
    let fixed = 0;
    for (const issue of fixable) {
      applyingRef.current = true;
      if (replaceOffsets(el, issue.offset, issue.offset + issue.length, issue.replacements[0])) fixed++;
    }
    applyingRef.current = false;
    updateDoc(doc.id, { html: el.innerHTML, updatedAt: Date.now() });
    const freshText = extractTextWithMap(el).text;
    setSpell((prev) =>
      prev ? { ...prev, text: freshText, issues: prev.issues.filter((i) => i.replacements.length === 0) } : prev,
    );
    pushToast('goose', `Гусь исправил ${fixed} ${fixed === 1 ? 'место' : 'мест'}`);
  }, [pushToast, updateDoc]);

  const gotoIssue = useCallback((issue: SpellIssue) => {
    const el = editorRef.current;
    if (!el) return;
    selectOffsets(el, issue.offset, issue.offset + issue.length);
    const range = window.getSelection()?.getRangeAt(0);
    const rect = range?.getBoundingClientRect();
    if (rect) el.closest('.canvas')?.scrollBy({ top: rect.top - window.innerHeight / 2, behavior: 'smooth' });
  }, []);

  /* ---------------------------- пересказ ---------------------------- */
  const runRetell = useCallback(() => {
    const doc = activeDocRef.current;
    if (!doc) return;
    if (doc.kind === 'drawing') {
      pushToast('info', 'Рисунок не пересказать: пересказ работает с текстом');
      return;
    }
    const text = plainFromHtml(doc.html);
    if (!canRetell(text)) {
      pushToast('info', 'Нужно хотя бы 35 слов текста, чтобы получился пересказ');
      return;
    }
    if (settings.retellMode === 'detailed' && !ent.pro) {
      needPro('Подробный пересказ');
      return;
    }
    setRetellBusy(true);
    setRetell(null);
    if (retellTimerRef.current) window.clearTimeout(retellTimerRef.current);
    retellTimerRef.current = window.setTimeout(() => {
      const result = summarize(text, settings.retellMode);
      setRetell(result);
      setRetellBusy(false);
      if (result) {
        pushToast('goose', `Пересказ готов: ${result.sourceWords} слов → ${result.resultWords}`);
      } else {
        pushToast('info', 'Не получилось сжать текст — попробуйте более длинный фрагмент');
      }
    }, 320);
  }, [ent.pro, needPro, pushToast, settings.retellMode]);

  useEffect(() => {
    return () => {
      if (retellTimerRef.current) window.clearTimeout(retellTimerRef.current);
    };
  }, []);

  const openRetell = useCallback(() => {
    openTab('retell');
    window.setTimeout(runRetell, 60);
  }, [openTab, runRetell]);

  const changeRetellMode = useCallback(
    (mode: Settings['retellMode']) => {
      saveSettings({ retellMode: mode });
      if (retell && retell.mode !== mode) setRetell(null);
    },
    [retell, saveSettings],
  );

  const copyRetell = useCallback(async () => {
    if (!retell) return;
    try {
      await navigator.clipboard.writeText(retell.plain);
      pushToast('success', 'Пересказ скопирован');
    } catch {
      pushToast('error', 'Не удалось скопировать');
    }
  }, [pushToast, retell]);

  const insertRetell = useCallback(() => {
    if (!retell || !activeDoc) return;
    if (!ent.pro && docs.length >= FREE_LIMITS.docs) {
      needPro('Документы без лимита');
      return;
    }
    const source = displayTitle(activeDoc.title, activeDoc.html, 60);
    const now = Date.now();
    const doc: Doc = {
      id: uid(),
      kind: 'summary',
      title: `Пересказ: ${source}`,
      html: `<h1>${escapeHtml(source)}</h1>${retell.html}`,
      createdAt: now,
      updatedAt: now,
      pinned: false,
      reminderAt: null,
      reminderDone: false,
      language: activeDoc.language,
      tags: ['пересказ'],
      folderId: activeDoc.folderId,
      drawing: null,
    };
    setState((s) => ({ ...s, docs: [doc, ...s.docs] }));
    setActiveId(doc.id);
    setTab('spell');
    pushToast('success', 'Пересказ сохранён отдельным документом');
  }, [activeDoc, docs.length, ent.pro, needPro, pushToast, retell]);

  /* ---------------------------- диктовка ---------------------------- */
  const insertDictated = useCallback(
    (chunk: string) => {
      const el = editorRef.current;
      const doc = activeDocRef.current;
      if (!el || !doc || !el.isConnected) return;
      if (doc.kind === 'drawing') return;
      const map = extractTextWithMap(el);
      const caret = caretOffset(el) ?? map.text.length;
      const before = map.text.slice(0, caret);
      const text = tidyDictation(before, chunk);
      if (!text) return;
      appendParagraph(el, text.trim());
      updateDoc(doc.id, { html: el.innerHTML, updatedAt: Date.now() });
      setDictationHistory((h) => [{ id: uid('h'), text: text.trim(), at: Date.now() }, ...h].slice(0, 20));
    },
    [updateDoc],
  );

  useEffect(() => {
    insertFinalRef.current = insertDictated;
  }, [insertDictated]);

  const stopLocalDictation = useCallback(() => {
    const instance = localDictationRef.current;
    if (!instance) return;
    instance.stop();
    localDictationRef.current = null;
    setDictationStatus('');
  }, []);

  const startLocalDictation = useCallback(() => {
    if (!localSpeechAvailable) {
      pushToast('error', 'В этом окне нет доступа к микрофону или WebAssembly');
      return;
    }
    const instance = new LocalDictation(dictationLang, {
      onInterim: (text) => setInterim(text),
      onFinal: (text) => insertFinalRef.current(text),
      onState: (listening) => {
        setDictating(listening);
        if (!listening) {
          setInterim('');
          setDictationStatus('');
        }
      },
      onError: (message) => {
        setDictating(false);
        setDictationStatus('');
        pushToast('error', message);
      },
      onStatus: (text) => setDictationStatus(text),
    });
    localDictationRef.current = instance;
    instance.start();
    editorRef.current?.focus();
    pushToast('goose', 'Готовлю распознавание речи…');
  }, [dictationLang, pushToast]);

  const toggleDictation = useCallback(() => {
    if (localDictationRef.current) {
      stopLocalDictation();
      return;
    }
    if (dictationRef.current) {
      dictationRef.current.stop();
      dictationRef.current = null;
      setDictating(false);
      setInterim('');
      return;
    }
    if (activeDocRef.current?.kind === 'drawing') {
      pushToast('info', 'Диктовка вставляет текст — откройте текстовый документ');
      return;
    }
    openTab('dictation');

    const engine = settings.dictationEngine;
    const browserPossible = isSpeechSupported();
    // В Electron Web Speech обычно недоступен — там работает локальный Whisper.
    const preferLocal =
      engine === 'local' || (engine === 'auto' && (!browserPossible || isDesktop));

    if (preferLocal) {
      startLocalDictation();
      return;
    }

    if (browserPossible) {
      const instance = new Dictation(dictationLang, {
        onInterim: (text) => setInterim(text),
        onFinal: (text) => insertFinalRef.current(text),
        onState: (listening) => {
          setDictating(listening);
          if (!listening) setInterim('');
        },
        onError: (message) => pushToast('error', message),
      });
      dictationRef.current = instance;
      instance.start();
      editorRef.current?.focus();
      pushToast('goose', 'Слушаю микрофон');
      return;
    }

    if (engine === 'browser') {
      pushToast('info', 'Браузерное распознавание здесь недоступно — включаю локальную модель');
    }
    startLocalDictation();
  }, [
    dictationLang,
    openTab,
    pushToast,
    settings.dictationEngine,
    startLocalDictation,
    stopLocalDictation,
  ]);

  useEffect(() => {
    return () => {
      dictationRef.current?.stop();
      dictationRef.current = null;
      localDictationRef.current?.stop();
      localDictationRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (dictationRef.current) {
      dictationRef.current.stop();
      dictationRef.current = null;
    }
    if (localDictationRef.current) {
      localDictationRef.current.stop();
      localDictationRef.current = null;
    }
    setDictating(false);
    setInterim('');
    setDictationStatus('');
  }, [activeId]);

  /* ---------------------------- данные ---------------------------- */
  const exportJson = useCallback(async () => {
    const blob = new Blob([exportState(state)], { type: 'application/json' });
    const saved = await saveFile(blob, `goosetext-backup-${new Date().toISOString().slice(0, 10)}.json`);
    pushToast(
      'success',
      saved === 'shared' ? 'Резервная копия готова — выберите, куда сохранить' : 'Резервная копия сохранена',
    );
  }, [state, pushToast]);

  const importJson = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const imported = importState(text);
        setState(imported);
        saveState(imported);
        setActiveId(imported.docs[0]?.id ?? null);
        setSettingsOpen(false);
        pushToast('success', `Загружено документов: ${imported.docs.length}`);
      } catch {
        pushToast('error', 'Не удалось прочитать файл — это не копия GooseText');
      }
    },
    [pushToast],
  );

  const resetSeeds = useCallback(() => {
    const seeded = seedState();
    setState((s) => ({ ...s, docs: [...seeded.docs, ...s.docs], folders: [...seeded.folders, ...s.folders] }));
    setSettingsOpen(false);
    pushToast('success', 'Примеры добавлены');
  }, [pushToast]);

  const clearAll = useCallback(() => {
    setState((s) => ({ ...s, docs: [], folders: [] }));
    setActiveId(null);
    setSettingsOpen(false);
    setSpell(null);
    setRetell(null);
    pushToast('info', 'Все документы удалены');
  }, [pushToast]);

  const installApp = useCallback(async () => {
    const prompt = deferredPromptRef.current;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    deferredPromptRef.current = null;
    setCanInstall(false);
  }, []);

  /* ---------------------------- горячие клавиши ---------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        void handleFullscreen();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        saveNow();
      } else if (key === 'n') {
        e.preventDefault();
        setNewDocOpen(true);
      } else if (key === 'k') {
        e.preventDefault();
        focusSearch();
      } else if (key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (key === '1') {
        e.preventDefault();
        toggleDocs();
      } else if (key === '2') {
        e.preventDefault();
        toggleAssistant();
      } else if (key === '3') {
        e.preventDefault();
        openTab('retell');
      } else if (key === '4') {
        e.preventDefault();
        openTab('translate');
      } else if (key === '5') {
        e.preventDefault();
        openTab('speak');
      } else if (key === '6') {
        e.preventDefault();
        openTab('outline');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        void runCheck();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow, runCheck, focusSearch, toggleDocs, toggleAssistant, handleFullscreen, openTab]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as unknown as { prompt: () => Promise<void>; userChoice: Promise<unknown> };
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const title = activeDoc ? displayTitle(activeDoc.title, activeDoc.html, 60) : 'Нет документа';

  const licenseLabel = ent.paid ? 'Pro' : ent.trial ? `${trialDaysLeft(license)} дн.` : 'Купить';

  return (
    <div className={`shell ${isFullscreen ? 'shell--fullscreen' : ''}`}>
      <header className="titlebar">
        <div className="titlebar__left">
          <GooseMark size={20} />
          <span className="titlebar__brand">GooseText</span>
        </div>

        <div className="titlebar__center">
          <button
            type="button"
            className={`titlebar__toggle ${docsOpen ? 'is-on' : ''}`}
            onClick={toggleDocs}
            title="Документы (Ctrl+1)"
            aria-pressed={docsOpen}
          >
            <Icon name="panelLeft" size={15} />
          </button>
          <span className="titlebar__doc" title={title}>
            {title}
          </span>
          <button
            type="button"
            className={`titlebar__toggle ${assistantOpen ? 'is-on' : ''}`}
            onClick={toggleAssistant}
            title="Помощник (Ctrl+2)"
            aria-pressed={assistantOpen}
          >
            <Icon name="panelRight" size={15} />
          </button>
        </div>

        <div className="titlebar__right">
          <button
            type="button"
            className={`license-pill ${ent.paid ? 'license-pill--pro' : ''}`}
            onClick={openLicense}
            title={ent.paid ? 'Лицензия активна' : 'Купить лицензию'}
          >
            <Icon name={ent.paid ? 'check' : 'key'} size={12} />
            {licenseLabel}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => void handleFullscreen()}
            title="Полный экран (F11)"
            aria-label="Полный экран"
            aria-pressed={isFullscreen}
          >
            <Icon name={isFullscreen ? 'fullscreenExit' : 'fullscreen'} size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            title={resolvedTheme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            aria-label="Переключить тему"
          >
            <Icon name={resolvedTheme === 'dark' ? 'sun' : 'moon'} size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setSettingsOpen(true)}
            title="Настройки (Ctrl+,)"
            aria-label="Настройки"
          >
            <Icon name="settings" size={16} />
          </button>

          {isDesktop && (
            <div className="wincontrols" aria-label="Кнопки окна">
              <button
                type="button"
                className="wincontrol"
                onClick={minimizeWindow}
                title="Свернуть"
                aria-label="Свернуть окно"
              >
                <Icon name="minimize" size={14} />
              </button>
              <button
                type="button"
                className="wincontrol"
                onClick={() => void toggleMaximizeWindow()}
                title={isMaximized ? 'Восстановить' : 'Развернуть'}
                aria-label={isMaximized ? 'Восстановить окно' : 'Развернуть окно'}
              >
                <Icon name={isMaximized ? 'restore' : 'maximize'} size={12} />
              </button>
              <button
                type="button"
                className="wincontrol wincontrol--close"
                onClick={closeWindow}
                title="Закрыть"
                aria-label="Закрыть окно"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          )}
        </div>
      </header>

      <div className={`workspace ${docsOpen ? 'has-docs' : ''} ${assistantOpen ? 'has-assistant' : ''}`}>
        <Rail side="left">
          <RailButton
            icon="panelLeft"
            label="Документы (Ctrl+1)"
            active={docsOpen}
            onClick={toggleDocs}
          />
          <RailButton icon="plus" label="Новый документ (Ctrl+N)" onClick={() => setNewDocOpen(true)} />
          <RailButton icon="search" label="Поиск (Ctrl+K)" onClick={focusSearch} />
          <span className="rail__spacer" />
          <RailButton icon="settings" label="Настройки (Ctrl+,)" onClick={() => setSettingsOpen(true)} />
        </Rail>

        {docsOpen && (
          <DocumentsPanel
            docs={visible}
            activeId={activeId}
            query={query}
            filter={filter}
            counts={counts}
            totalWords={totalWords}
            totalCount={docs.length}
            folders={folders}
            folderSel={folderSel}
            folderCounts={folderCounts}
            unfiledCount={unfiledCount}
            onQueryChange={setQuery}
            onFilterChange={setFilter}
            onSelect={(id) => {
              setActiveId(id);
              closePanelsOnMobile();
            }}
            onNew={() => setNewDocOpen(true)}
            onClose={toggleDocs}
            onSelectFolder={setFolderSel}
            onNewFolder={createFolder}
            onRenameFolder={renameFolder}
            onDeleteFolder={(id) => {
              const folder = folders.find((f) => f.id === id);
              if (folder) setConfirmFolder(folder);
            }}
            onToggleFolder={toggleFolder}
            onMoveDoc={moveDoc}
            onMoveFolder={moveFolder}
            onMoveDocRequest={setMoveDocTarget}
            onMoveFolderRequest={setMoveFolderTarget}
          />
        )}

        {activeDoc ? (
          activeDoc.kind === 'drawing' ? (
            <DrawingPane
              key={activeDoc.id}
              doc={activeDoc}
              saving={saving}
              pro={ent.pro}
              onChange={handleDrawingChange}
              onTitleChange={(v) => updateDoc(activeDoc.id, { title: v, updatedAt: Date.now() })}
              onKindChange={(kind) =>
                updateDoc(activeDoc.id, {
                  kind,
                  drawing: kind === 'drawing' ? activeDoc.drawing ?? createDrawing() : activeDoc.drawing,
                })
              }
              onPin={() => updateDoc(activeDoc.id, { pinned: !activeDoc.pinned })}
              onDelete={() => setConfirmDelete(activeDoc)}
              onDuplicate={duplicateDoc}
              onOpenAssistant={() => saveSettings({ assistantOpen: true })}
              onNotify={pushToast}
              onNeedPro={needPro}
            />
          ) : (
            <EditorPane
              key={activeDoc.id}
              doc={activeDoc}
              editorRef={editorRef}
              saving={saving}
              dictating={dictating}
              interim={interim}
              onHtmlChange={handleHtmlChange}
              onTitleChange={(v) => updateDoc(activeDoc.id, { title: v, updatedAt: Date.now() })}
              onKindChange={(kind) =>
                updateDoc(activeDoc.id, {
                  kind,
                  drawing: kind === 'drawing' ? activeDoc.drawing ?? createDrawing() : activeDoc.drawing,
                })
              }
              onPin={() => updateDoc(activeDoc.id, { pinned: !activeDoc.pinned })}
              onDelete={() => setConfirmDelete(activeDoc)}
              onDuplicate={duplicateDoc}
              onExport={handleExport}
              onReminderChange={(ts) => updateDoc(activeDoc.id, { reminderAt: ts, reminderDone: false })}
              onRemind={() => {
                updateDoc(activeDoc.id, { reminderAt: Date.now() + 3600000, reminderDone: false });
                openTab('reminders');
                pushToast('goose', 'Напомню через час — время можно поменять в панели над текстом');
              }}
              onCopy={() => void handleCopy()}
              onToggleDictation={toggleDictation}
              onOpenAssistant={() => saveSettings({ assistantOpen: true })}
              onOpenRetell={openRetell}
              onMove={() => setMoveDocTarget(activeDoc)}
            />
          )
        ) : (
          <main className="canvas canvas--empty">
            <div className="empty">
              <div className="goose-circle">
                <Goose size={150} mood="happy" />
              </div>
              <h1>Гусь ждёт первый текст</h1>
              <p>Заметки, конспекты, сценарии, рисунки и напоминания — в одном месте.</p>
              <div className="empty__actions">
                <button type="button" className="btn btn--primary" onClick={() => setNewDocOpen(true)}>
                  <Icon name="plus" size={16} /> Создать документ
                </button>
                <button type="button" className="btn btn--ghost" onClick={openLicense}>
                  <Icon name="key" size={15} /> Лицензия
                </button>
              </div>
            </div>
          </main>
        )}

        {assistantOpen && activeDoc && (
          <AssistantPanel
            tab={tab}
            onTab={setTab}
            onClose={toggleAssistant}
            spell={spell}
            checking={checking}
            spellDirty={spellDirty}
            lang={checkLang}
            onLangChange={setCheckLang}
            onCheck={() => void runCheck()}
            onApply={applyFix}
            onApplyAll={applyAll}
            onGoto={gotoIssue}
            retell={retell}
            retellMode={settings.retellMode}
            retellReady={retellReady}
            retellBusy={retellBusy}
            pro={ent.pro}
            onRetellMode={changeRetellMode}
            onRetell={runRetell}
            onCopyRetell={() => void copyRetell()}
            onInsertRetell={insertRetell}
            onNeedLicense={needPro}
            speechSupported={isSpeechSupported()}
            localSpeechSupported={localSpeechAvailable}
            dictationStatus={dictationStatus}
            dictationEngine={settings.dictationEngine}
            onDictationEngine={(engine) => saveSettings({ dictationEngine: engine })}
            dictating={dictating}
            interim={interim}
            dictationLang={dictationLang}
            onDictationLang={setDictationLang}
            onToggleDictation={toggleDictation}
            history={dictationHistory}
            onClearHistory={() => setDictationHistory([])}
            activeText={activeText}
            selectedText={selectionText}
            onInsertText={insertTextAtCaret}
            onSaveDoc={saveAsDoc}
            translateSource={settings.translateSource}
            translateTarget={settings.translateTarget}
            onTranslateSource={(code) => saveSettings({ translateSource: code })}
            onTranslateTarget={(code) => saveSettings({ translateTarget: code })}
            onToast={(kind, text) => pushToast(kind, text)}
            reminders={docs.filter((d) => d.kind === 'reminder' || d.reminderAt)}
            activeDoc={activeDoc}
            onSelectDoc={(id) => {
              setActiveId(id);
              closePanelsOnMobile();
            }}
            onToggleDone={(id) => {
              const doc = docs.find((d) => d.id === id);
              if (doc) updateDoc(id, { reminderDone: !doc.reminderDone });
            }}
            onSnooze={(id, minutes) => {
              updateDoc(id, { reminderAt: Date.now() + minutes * 60000, reminderDone: false });
              pushToast('info', `Отложено на ${minutes} минут`);
            }}
            onCreateReminder={createReminder}
            onDelete={(id) => {
              const doc = docs.find((d) => d.id === id);
              if (doc) setConfirmDelete(doc);
            }}
            docs={docs}
            notifications={notifications}
            onAskNotifications={requestNotifications}
          />
        )}

        <Rail side="right">
          <RailButton
            icon="panelRight"
            label="Помощник (Ctrl+2)"
            active={assistantOpen}
            onClick={toggleAssistant}
          />
          <span className="rail__divider" />
          <RailButton icon="sparkles" label="Проверить текст" onClick={() => void runCheck()} />
          <RailButton icon="retell" label="Пересказ (Ctrl+3)" onClick={openRetell} />
          <RailButton icon="languages" label="Перевод" onClick={() => openTab('translate')} />
          <RailButton icon="mic" label="Диктовка" active={dictating} onClick={toggleDictation} />
          <RailButton icon="volume" label="AI-озвучка текста" onClick={() => openTab('speak')} />
          <RailButton icon="outline" label="План и метрики" onClick={() => openTab('outline')} />
          <RailButton icon="bell" label="Напоминания" onClick={() => openTab('reminders')} />
          <RailButton icon="chart" label="Статистика" onClick={() => openTab('stats')} />
        </Rail>
      </div>

      <div className="mobile-bar">
        <button type="button" className={`mobile-bar__btn ${docsOpen ? 'is-on' : ''}`} onClick={toggleDocs}>
          <Icon name="panelLeft" size={18} />
          <span>Документы</span>
        </button>
        <button type="button" className="mobile-bar__btn" onClick={() => setNewDocOpen(true)}>
          <Icon name="plus" size={18} />
          <span>Новый</span>
        </button>
        <button type="button" className="mobile-bar__btn" onClick={openRetell}>
          <Icon name="retell" size={18} />
          <span>Пересказ</span>
        </button>
        <button type="button" className="mobile-bar__btn" onClick={() => void runCheck()}>
          <Icon name="sparkles" size={18} />
          <span>Проверить</span>
        </button>
        <button
          type="button"
          className={`mobile-bar__btn ${assistantOpen ? 'is-on' : ''}`}
          onClick={toggleAssistant}
        >
          <Icon name="panelRight" size={18} />
          <span>Помощник</span>
        </button>
      </div>

      {newDocOpen && <NewDocDialog onPick={createDoc} onClose={() => setNewDocOpen(false)} />}

      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onChange={saveSettings}
          onClose={() => setSettingsOpen(false)}
          onExportJson={exportJson}
          onImportJson={(file) => void importJson(file)}
          onResetSeed={resetSeeds}
          onClearAll={clearAll}
          notifications={notifications}
          onAskNotifications={requestNotifications}
          canInstall={canInstall}
          onInstall={() => void installApp()}
          docCount={docs.length}
          wordTotal={totalWords}
          license={license}
          onOpenLicense={openLicense}
          isFullscreen={isFullscreen}
          fullscreenSupported={fullscreenSupported}
          onToggleFullscreen={() => void handleFullscreen()}
        />
      )}

      {licenseOpen && (
        <LicenseDialog license={license} onActivate={activate} onClose={() => setLicenseOpen(false)} />
      )}

      {moveDocTarget && (
        <MoveDialog
          title="Переместить документ"
          subtitle={displayTitle(moveDocTarget.title, moveDocTarget.html, 48)}
          folders={folders}
          currentFolderId={moveDocTarget.folderId}
          onMove={(folderId) => {
            moveDoc(moveDocTarget.id, folderId);
            setMoveDocTarget(null);
          }}
          onClose={() => setMoveDocTarget(null)}
        />
      )}

      {moveFolderTarget && (
        <MoveDialog
          title="Переместить папку"
          subtitle={moveFolderTarget.name}
          folders={folders.filter(
            (f) =>
              f.id !== moveFolderTarget.id && !descendantIds(folders, moveFolderTarget.id).has(f.id),
          )}
          currentFolderId={moveFolderTarget.parentId}
          onMove={(parentId) => {
            moveFolder(moveFolderTarget.id, parentId);
            setMoveFolderTarget(null);
          }}
          onClose={() => setMoveFolderTarget(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Удалить документ?"
          text={`«${displayTitle(confirmDelete.title, confirmDelete.html)}» исчезнет. Это можно отменить кнопкой «Вернуть» в уведомлении.`}
          onConfirm={() => deleteDoc(confirmDelete.id)}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {confirmFolder && (
        <ConfirmDialog
          title={`Удалить папку «${confirmFolder.name}»?`}
          text="Документы и вложенные папки не удалятся: они переместятся на уровень выше."
          confirmLabel="Удалить папку"
          onConfirm={() => deleteFolder(confirmFolder.id)}
          onClose={() => setConfirmFolder(null)}
        />
      )}

      <Toasts toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
