/**
 * Проверка сборки GooseText через Chrome DevTools Protocol.
 * Запуск: node tools/smoke.mjs
 *
 * Скрипт проходит по новым возможностям: рисунок, папки, пересказ,
 * лицензия, полный экран — и складывает скриншоты в shots/.
 */
import { spawn } from 'node:child_process';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const shots = join(root, 'shots');
const profile = join(root, '.chrome-profile-smoke');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_APP = process.env.APP_URL ?? 'http://127.0.0.1:5180/';
const PORT = 9335;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'OK ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function waitForDevtools() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return res.json();
    } catch {
      /* ещё не поднялся */
    }
    await sleep(250);
  }
  throw new Error('Chrome DevTools не ответил');
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: res, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
        return;
      }
      if (msg.method) this.events.push(msg);
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((res, reject) => {
      this.pending.set(id, { resolve: res, reject });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Таймаут: ${method}`));
        }
      }, 30000);
    });
  }
}

async function main() {
  await mkdir(shots, { recursive: true });
  await rm(profile, { recursive: true, force: true });

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--autoplay-policy=no-user-gesture-required',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const version = await waitForDevtools();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  const cdp = new Cdp(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => cdp.send(method, params, sessionId);

  await call('Page.enable');
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Console.enable');

  const evaluate = async (expression) => {
    const res = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    }
    return res.result?.value;
  };

  const shot = async (name) => {
    const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(join(shots, name), Buffer.from(data, 'base64'));
  };

  const setViewport = async (width, height, mobile = false) => {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
    });
  };

  const clickText = (selector, text) =>
    evaluate(`(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find((n) => n.textContent.replace(/\\s+/g, ' ').includes(${JSON.stringify(text)}));
      if (!el) return false;
      el.click();
      return true;
    })()`);

  const click = (selector) =>
    evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.click();
      return true;
    })()`);

  const press = async (key, code = key) => {
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: key === 'Enter' ? 13 : 0 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
  };

  const waitFor = async (expression, timeout = 6000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try {
        if (await evaluate(expression)) return true;
      } catch {
        /* страница ещё грузится */
      }
      await sleep(120);
    }
    return false;
  };

  const stored = () =>
    evaluate(`(() => {
      const raw = localStorage.getItem('goosetext.state.v2');
      return raw ? JSON.parse(raw) : null;
    })()`);

  await setViewport(1440, 900, false);
  await call('Page.navigate', { url: URL_APP });
  await waitFor(`document.querySelectorAll('.doc-item').length > 0`, 12000);
  await sleep(1200);
  await shot('01-home.png');

  check('панель папок отрисована', await evaluate(`Boolean(document.querySelector('.folders'))`));
  check('кнопка лицензии в шапке', await evaluate(`Boolean(document.querySelector('.license-pill'))`));
  check('логотип — новый знак', await evaluate(`document.querySelector('.titlebar .goose-mark')?.querySelector('linearGradient') !== null`));

  /* ---------------------------- вставка из буфера ---------------------------- */
  await clickText('.doc-item', 'Добро пожаловать');
  await sleep(500);
  const pasteClean = await evaluate(`(() => {
    const editor = document.querySelector('.editor__content');
    if (!editor) return 'нет редактора';
    editor.focus();
    const dt = new DataTransfer();
    dt.setData('text/html', '<p>ok<img src=x onerror="window.__pwned=1"><script>window.__pwned=2<\\/script></p>');
    dt.setData('text/plain', 'ok');
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: dt });
    editor.dispatchEvent(event);
    return editor.innerHTML;
  })()`);
  check(
    'вставленный HTML очищается',
    typeof pasteClean === 'string' &&
      pasteClean.includes('ok') &&
      !/onerror/i.test(pasteClean) &&
      !/script/i.test(pasteClean) &&
      (await evaluate('window.__pwned === undefined')),
    String(pasteClean).slice(0, 80),
  );

  /* ---------------------------- рисунок ---------------------------- */
  check('тип «Рисунок» в диалоге создания', await evaluate(`(() => {
    const btns = [...document.querySelectorAll('.rail__btn')];
    const plus = btns.find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Новый документ'));
    plus?.click();
    return Boolean(plus);
  })()`));
  await sleep(400);
  check('карточка рисунка есть', await evaluate(`[...document.querySelectorAll('.doc-type')].some((b) => b.textContent.includes('Рисунок'))`));
  await clickText('.doc-type', 'Рисунок');
  await sleep(700);
  check('холст рисования открылся', await evaluate(`Boolean(document.querySelector('.draw-canvas'))`));
  await shot('02-drawing-empty.png');

  const rect = await evaluate(`(() => {
    const r = document.querySelector('.draw-canvas').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);

  const drawCurve = async (offsetX, offsetY, letter) => {
    const startX = rect.x + rect.w * (offsetX + 0.08);
    const startY = rect.y + rect.h * (offsetY + 0.18);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: startX, y: startY, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 0; i <= 22; i++) {
      const t = i / 22;
      const x = startX + Math.sin(t * Math.PI * 2 + letter) * rect.w * 0.12 + t * rect.w * 0.22;
      const y = startY + Math.cos(t * Math.PI * 1.5) * rect.h * 0.12 + t * rect.h * 0.16;
      await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    }
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: startX, y: startY, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(220);
  };

  await drawCurve(0.1, 0.1, 0.4);
  await drawCurve(0.45, 0.25, 2.1);
  await sleep(600);
  const drawingState = await stored();
  const drawingDoc = drawingState?.docs?.find((d) => d.kind === 'drawing');
  check('штрихи сохраняются', (drawingDoc?.drawing?.strokes?.length ?? 0) >= 2, `штрихов: ${drawingDoc?.drawing?.strokes?.length ?? 0}`);
  await shot('03-drawing.png');

  const beforeUndo = drawingDoc?.drawing?.strokes?.length ?? 0;
  await click('[aria-label="Отменить штрих"]');
  await sleep(500);
  const afterUndo = (await stored())?.docs?.find((d) => d.kind === 'drawing')?.drawing?.strokes?.length ?? 0;
  check('отмена штриха работает', afterUndo === beforeUndo - 1, `${beforeUndo} → ${afterUndo}`);

  /* ---------------------------- папки ---------------------------- */
  const foldersBefore = await evaluate(`document.querySelectorAll('.folder-row').length`);
  await click('.panel__head button[aria-label="Новая папка"]');
  await sleep(500);
  const foldersAfter = await evaluate(`document.querySelectorAll('.folder-row').length`);
  check('папка создаётся', foldersAfter === foldersBefore + 1, `${foldersBefore} → ${foldersAfter}`);

  const newFolderId = await evaluate(`(() => {
    const raw = JSON.parse(localStorage.getItem('goosetext.state.v2'));
    const names = new Set(['Учёба', 'Творчество']);
    return raw.folders.find((f) => !names.has(f.name))?.id ?? null;
  })()`);

  check('папка попала в хранилище', Boolean(newFolderId), newFolderId ?? 'нет');

  // переименование двойным щелчком
  const renamed = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.folder-row')];
    const row = rows.find((r) => r.textContent.includes('Новая папка'));
    if (!row) return false;
    const name = row.querySelector('.folder-row__name');
    name.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    return true;
  })()`);
  await sleep(300);
  const inputExists = await evaluate(`Boolean(document.querySelector('.folder-row__input'))`);
  if (inputExists) {
    await evaluate(`(() => {
      const input = document.querySelector('.folder-row__input');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Проекты');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return input.value;
    })()`);
    await evaluate(`document.querySelector('.folder-row__input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
  }
  await sleep(500);
  const renamedInStore = await evaluate(`JSON.parse(localStorage.getItem('goosetext.state.v2')).folders.some((f) => f.name === 'Проекты')`);
  check('папка переименовывается', renamed && renamedInStore, `dblclick=${renamed}, store=${renamedInStore}`);

  // перемещение документа через кнопку
  await click('.doc-item__move');
  await sleep(400);
  check('диалог перемещения открылся', await evaluate(`Boolean(document.querySelector('.move-list'))`));
  const moved = await evaluate(`(() => {
    const item = [...document.querySelectorAll('.move-item')].find((b) => b.textContent.includes('Проекты'));
    if (!item) return false;
    item.click();
    return true;
  })()`);
  await sleep(500);
  const docInFolder = await evaluate(`(() => {
    const state = JSON.parse(localStorage.getItem('goosetext.state.v2'));
    const folder = state.folders.find((f) => f.name === 'Проекты');
    return state.docs.some((d) => d.folderId === folder?.id);
  })()`);
  check('документ перемещается в папку', moved && docInFolder);
  await shot('04-folders.png');

  // переключение на папку
  await clickText('.folder-row', 'Проекты');
  await sleep(400);
  check('фильтр по папке сужает список', await evaluate(`document.querySelectorAll('.doc-item').length === 1`));

  // перетаскивание документа в другую папку
  await clickText('.folder-row', 'Все документы');
  await sleep(300);
  const dnd = await evaluate(`(() => {
    const doc = [...document.querySelectorAll('.doc-item')].find((d) => d.textContent.includes('Без названия'));
    const folder = [...document.querySelectorAll('.folder-row')].find((f) => f.textContent.includes('Творчество'));
    if (!doc || !folder) return false;
    const dt = new DataTransfer();
    doc.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    folder.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    folder.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return true;
  })()`);
  await sleep(500);
  const dndStored = await evaluate(`(() => {
    const state = JSON.parse(localStorage.getItem('goosetext.state.v2'));
    const folder = state.folders.find((f) => f.name === 'Творчество');
    const drawing = state.docs.find((d) => d.kind === 'drawing');
    return drawing?.folderId === folder?.id;
  })()`);
  check('перетаскивание документа в папку работает', dnd && dndStored);

  // вложенность папки через перетаскивание
  const folderDnd = await evaluate(`(() => {
    const folder = [...document.querySelectorAll('.folder-row')].find((f) => f.textContent.includes('Проекты'));
    const target = [...document.querySelectorAll('.folder-row')].find((f) => f.textContent.includes('Творчество'));
    if (!folder || !target) return false;
    const dt = new DataTransfer();
    folder.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return true;
  })()`);
  await sleep(500);
  const folderDndStored = await evaluate(`(() => {
    const state = JSON.parse(localStorage.getItem('goosetext.state.v2'));
    const child = state.folders.find((f) => f.name === 'Проекты');
    const parent = state.folders.find((f) => f.name === 'Творчество');
    return child?.parentId === parent?.id;
  })()`);
  check('папка вкладывается перетаскиванием', folderDnd && folderDndStored);
  await shot('04-folders.png');

  /* ---------------------------- пересказ ---------------------------- */
  await clickText('.folder-row', 'Все документы');
  await sleep(300);
  await clickText('.doc-item', 'Добро пожаловать');
  await sleep(500);
  await clickText('.assistant__tab', 'Пересказ');
  await sleep(400);
  await clickText('.assistant__pane .btn--primary', 'Пересказать');
  await waitFor(`Boolean(document.querySelector('.retell-result'))`, 6000);
  const briefText = await evaluate(`document.querySelector('.retell-result')?.innerText ?? ''`);
  check('краткий пересказ построен', briefText.length > 40, `${briefText.length} символов`);
  await shot('05-retell-brief.png');

  const proMode = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.seg__btn')].find((b) => b.textContent.includes('Подробно'));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  await sleep(300);
  await clickText('.assistant__pane .btn--primary', 'Пересказать');
  await waitFor(`document.querySelector('.retell-result')?.innerText.includes('ГЛАВНЫЕ МЫСЛИ')`, 6000);
  const detailedText = await evaluate(`document.querySelector('.retell-result')?.innerText ?? ''`);
  check('подробный пересказ построен', proMode && /ГЛАВНЫЕ МЫСЛИ|КЛЮЧЕВЫЕ ПОНЯТИЯ/i.test(detailedText), `${detailedText.length} символов`);
  await shot('06-retell-detailed.png');

  /* ------------------------- новые вкладки ------------------------- */
  check('в помощнике восемь вкладок', await evaluate(`document.querySelectorAll('.assistant__tab').length === 8`));

  await clickText('.assistant__tab', 'Перевод');
  await sleep(400);
  check(
    'перевод открывается',
    await evaluate(`Boolean(document.querySelector('.translate__input')) && document.querySelectorAll('.lang-select').length >= 2`),
  );
  await shot('06b-translate.png');

  await clickText('.assistant__tab', 'Озвучка');
  await sleep(400);
  check(
    'AI-озвучка и MP3 на месте',
    await evaluate(
      `Boolean(document.querySelector('.speak')) && document.body.innerText.includes('Скачать озвучку в MP3') && document.body.innerText.includes('AI-голос')`,
    ),
  );
  await shot('06c-speak.png');

  await clickText('.assistant__tab', 'Диктовка');
  await sleep(400);
  check(
    'диктовка предлагает локальную модель',
    await evaluate(`document.body.innerText.includes('Локальная модель Whisper') && Boolean(document.querySelector('.mic'))`),
  );
  await shot('06d-dictation.png');

  await clickText('.assistant__tab', 'План');
  await sleep(500);
  check(
    'план и читаемость построены',
    await evaluate(
      `Boolean(document.querySelector('.readability__value')) && document.querySelectorAll('.outline__item').length > 0 && document.querySelectorAll('.keyword').length > 0`,
    ),
  );
  await shot('06e-outline.png');

  await clickText('.assistant__tab', 'Пересказ');
  await sleep(300);

  // вставка в новый документ
  const docsBeforeInsert = await evaluate(`JSON.parse(localStorage.getItem('goosetext.state.v2')).docs.length`);
  await clickText('.assistant__pane .btn', 'В новый документ');
  await sleep(900);
  const docsAfterInsert = await evaluate(`JSON.parse(localStorage.getItem('goosetext.state.v2')).docs.length`);
  check('пересказ вставляется новым документом', docsAfterInsert === docsBeforeInsert + 1, `${docsBeforeInsert} → ${docsAfterInsert}`);

  /* ---------------------------- лицензия ---------------------------- */
  await click('.license-pill');
  await sleep(500);
  check('окно лицензии открылось', await evaluate(`Boolean(document.querySelector('.license-plans'))`));
  check('цена больше 100 ₽', await evaluate(`[...document.querySelectorAll('.license-plan__price')].some((el) => parseInt(el.textContent, 10) >= 100)`));
  await shot('07-license.png');

  await clickText('.license__actions .btn', 'У меня есть ключ');
  await sleep(400);
  check('форма активации открылась', await evaluate(`Boolean(document.querySelector('.license-key'))`));
  await evaluate(`document.querySelector('.license-demo summary')?.click()`);
  await sleep(200);
  await clickText('.license-demo .link', 'подставить');
  await sleep(200);
  const keyValue = await evaluate(`document.querySelector('.license-key .input')?.value ?? ''`);
  check('демо-ключ подставляется', keyValue.startsWith('GTXT-'), keyValue);
  await clickText('.license-key .btn--primary', 'Активировать');
  await sleep(700);
  const licensed = await evaluate(`JSON.parse(localStorage.getItem('goosetext.state.v2')).license.plan === 'pro'`);
  const pill = await evaluate(`document.querySelector('.license-pill')?.textContent?.trim() ?? ''`);
  check('лицензия активируется', licensed && pill.includes('Pro'), `pill=${pill}`);
  await shot('08-license-activated.png');

  /* ---------------------------- экспорт PNG ---------------------------- */
  const downloadDir = join(shots, 'downloads');
  await rm(downloadDir, { recursive: true, force: true });
  await mkdir(downloadDir, { recursive: true });
  await call('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  await clickText('.doc-item', 'Без названия');
  await sleep(700);
  await click('.draw-actions .btn');
  let downloaded = [];
  for (let i = 0; i < 40; i++) {
    await sleep(150);
    downloaded = await readdir(downloadDir).catch(() => []);
    if (downloaded.some((f) => f.endsWith('.png'))) break;
  }
  const pngName = downloaded.find((f) => f.endsWith('.png'));
  const pngInfo = pngName ? await stat(join(downloadDir, pngName)) : null;
  check('PNG рисунка экспортируется', Boolean(pngName) && (pngInfo?.size ?? 0) > 1000, `${pngName ?? 'нет файла'} ${pngInfo?.size ?? 0} байт`);

  /* ---------------------------- настройки ---------------------------- */
  await click('[aria-label="Настройки"]');
  await sleep(500);
  await clickText('.settings__navbtn', 'Лицензия');
  await sleep(400);
  check('раздел лицензии в настройках', await evaluate(`Boolean(document.querySelector('.license-mini'))`));
  await shot('09-settings-license.png');
  await click('.modal__head .icon-btn');
  await sleep(400);

  /* ---------------------------- полный экран ---------------------------- */
  await click('[aria-label="Полный экран"]');
  await sleep(600);
  const isFs = await evaluate(`Boolean(document.fullscreenElement)`);
  check('полный экран включается (браузер)', isFs);
  await shot('10-fullscreen.png');
  await click('[aria-label="Полный экран"]');
  await sleep(500);
  check('полный экран выключается', !(await evaluate(`Boolean(document.fullscreenElement)`)));

  /* ---------------------------- мобильный вид ---------------------------- */
  await setViewport(390, 844, true);
  await evaluate(`location.reload()`);
  await waitFor(`Boolean(document.querySelector('.mobile-bar'))`, 12000);
  await sleep(1800);
  await shot('11-mobile.png');
  await click('.mobile-bar__btn');
  await sleep(700);
  await shot('12-mobile-folders.png');
  check('папки видны на телефоне', await evaluate(`Boolean(document.querySelector('.folders'))`));

  /* ---------------------------- ошибки ---------------------------- */
  const errors = cdp.events
    .filter(
      (e) =>
        e.method === 'Runtime.exceptionThrown' ||
        (e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error') ||
        (e.method === 'Console.messageAdded' && e.params?.message?.level === 'error'),
    )
    .map((e) =>
      e.method === 'Runtime.exceptionThrown'
        ? `Исключение: ${e.params.exceptionDetails?.text} ${e.params.exceptionDetails?.exception?.description ?? ''}`
        : `Лог: ${e.params.entry?.text ?? e.params.message?.text ?? ''}`,
    )
    .filter((line) => !line.includes('favicon'));

  check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 4).join(' | '));

  const failed = checks.filter((c) => !c.ok);
  console.log('\nИТОГ:', `${checks.length - failed.length}/${checks.length} проверок прошло`);
  if (errors.length) console.log('Ошибки:\n' + errors.slice(0, 12).join('\n'));

  ws.close();
  chrome.kill();
  await sleep(400);
  if (failed.length) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
