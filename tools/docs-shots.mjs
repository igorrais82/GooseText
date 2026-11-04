/**
 * Снимает актуальные скриншоты для README в docs/screenshots.
 * Запуск: node tools/docs-shots.mjs (нужен собранный dist и сервер на 5180)
 */
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = join(root, 'docs', 'screenshots');
const profile = join(root, '.chrome-profile-docs');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_APP = process.env.APP_URL ?? 'http://127.0.0.1:5180/';
const PORT = 9336;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: res, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
        return;
      }
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
  await mkdir(outDir, { recursive: true });
  await rm(profile, { recursive: true, force: true });
  await rm(join(outDir, '05-style-detailed.png'), { force: true });

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
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

  const evaluate = async (expression) => {
    const res = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
    return res.result?.value;
  };

  const shot = async (name) => {
    const { data } = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(outDir, name), Buffer.from(data, 'base64'));
    console.log('скриншот:', name);
  };

  const clickText = (selector, text) =>
    evaluate(`(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find((n) => n.textContent.replace(/\\s+/g, ' ').includes(${JSON.stringify(text)}));
      el?.click();
      return Boolean(el);
    })()`);

  const setViewport = async (width, height, mobile = false) => {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
    });
  };

  const openSettings = async () => {
    await evaluate(`document.querySelector('[aria-label="Настройки"]')?.click()`);
    await sleep(550);
  };
  const closeSettings = async () => {
    await evaluate(`document.querySelector('.modal__head .icon-btn')?.click()`);
    await sleep(500);
  };

  await setViewport(1440, 900, false);
  await call('Page.navigate', { url: URL_APP });
  await sleep(2600);
  await shot('01-app-light.png');

  // сценарий
  await clickText('.doc-item', 'Сценарий: Гусь идёт в кино');
  await sleep(800);
  await shot('06-screenplay.png');

  // проверка ошибок
  await clickText('.doc-item', 'Добро пожаловать');
  await sleep(500);
  await clickText('.assistant__pane .btn--primary', 'Проверить текст');
  await sleep(9000);
  await shot('07-spellcheck.png');

  // перевод
  await clickText('.assistant__tab', 'Перевод');
  await sleep(400);
  await clickText('.assistant__pane .btn--primary', 'Перевести на');
  await sleep(8000);
  await shot('16-translate.png');

  // AI-озвучка
  await clickText('.assistant__tab', 'Озвучка');
  await sleep(400);
  await clickText('.assistant__pane .btn--primary', 'Озвучить');
  await sleep(3200);
  await shot('17-speak.png');
  await clickText('.assistant__pane .btn--ghost', 'Стоп');

  // диктовка и план
  await clickText('.assistant__tab', 'Диктовка');
  await sleep(400);
  await shot('18-dictation.png');
  await clickText('.assistant__tab', 'План');
  await sleep(500);
  await shot('19-outline.png');

  // настройки и стили
  await openSettings();
  await shot('02-settings.png');
  await clickText('.style-card', 'Реалистичный');
  await sleep(400);
  await closeSettings();
  await shot('04-style-realistic.png');

  await openSettings();
  await clickText('.style-card', 'Минималистичный');
  await sleep(400);
  await closeSettings();
  await shot('10-style-minimal.png');

  await openSettings();
  await clickText('.style-card', 'Детальный');
  await sleep(400);
  await closeSettings();
  await shot('05-style-detailed.png');

  await openSettings();
  await clickText('.style-card', 'Контрастный');
  await sleep(400);
  await closeSettings();
  await shot('20-style-contrast.png');

  await openSettings();
  await clickText('.style-card', 'Мягкий');
  await sleep(400);
  await closeSettings();
  await shot('21-style-soft.png');

  await openSettings();
  await clickText('.seg__btn', 'Тёмная');
  await sleep(400);
  await closeSettings();
  await shot('03-theme-dark.png');

  await openSettings();
  await clickText('.seg__btn', 'Светлая');
  await clickText('.settings__navfoot button', 'Сбросить вид');
  await sleep(400);
  await closeSettings();

  // папки и рисунок
  await evaluate(`[...document.querySelectorAll('.rail__btn')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Новый документ'))?.click()`);
  await sleep(400);
  await clickText('.doc-type', 'Рисунок');
  await sleep(700);
  await evaluate(`(() => {
    const input = document.querySelector('.title-input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Схема: как устроен GooseText');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(300);

  const rect = await evaluate(`(() => {
    const r = document.querySelector('.draw-canvas').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  const stroke = async (points) => {
    const [first, ...rest] = points;
    await call('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: rect.x + rect.w * first[0],
      y: rect.y + rect.h * first[1],
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    for (const [px, py] of rest) {
      await call('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: rect.x + rect.w * px,
        y: rect.y + rect.h * py,
        button: 'left',
        buttons: 1,
      });
    }
    const last = points[points.length - 1];
    await call('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: rect.x + rect.w * last[0],
      y: rect.y + rect.h * last[1],
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    await sleep(160);
  };

  const rectPts = (x, y, w, h, steps = 6) => {
    const points = [];
    const edges = [
      [x, y, x + w, y],
      [x + w, y, x + w, y + h],
      [x + w, y + h, x, y + h],
      [x, y + h, x, y],
    ];
    for (const [x1, y1, x2, y2] of edges) {
      for (let i = 0; i <= steps; i++) {
        points.push([x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps]);
      }
    }
    return points;
  };
  const linePts = (x1, y1, x2, y2, steps = 10) =>
    Array.from({ length: steps + 1 }, (_, i) => [x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps]);

  await stroke(rectPts(0.1, 0.2, 0.26, 0.22));
  await stroke(rectPts(0.1, 0.56, 0.26, 0.16));
  await stroke(linePts(0.36, 0.31, 0.48, 0.31));
  await stroke(linePts(0.48, 0.31, 0.48, 0.64));
  await stroke(linePts(0.48, 0.64, 0.36, 0.64));

  // оранжевая стрелка и подписи
  await evaluate(`document.querySelectorAll('.draw-color')[1]?.click()`);
  await stroke(linePts(0.54, 0.31, 0.66, 0.31));
  await stroke(linePts(0.63, 0.27, 0.67, 0.31));
  await stroke(linePts(0.63, 0.35, 0.67, 0.31));
  await stroke(linePts(0.54, 0.64, 0.66, 0.64));

  await evaluate(`document.querySelectorAll('.draw-color')[0]?.click()`);
  await stroke(linePts(0.72, 0.24, 0.9, 0.24));
  await stroke(linePts(0.72, 0.31, 0.86, 0.31));
  await stroke(linePts(0.72, 0.38, 0.8, 0.38));
  await sleep(700);
  await shot('11-drawing.png');

  // пересказ
  await clickText('.doc-item', 'Добро пожаловать');
  await sleep(400);
  await clickText('.assistant__tab', 'Пересказ');
  await sleep(300);
  await clickText('.assistant__pane .btn--primary', 'Пересказать');
  await sleep(1200);
  await shot('12-retell.png');

  // лицензия
  await evaluate(`document.querySelector('.license-pill')?.click()`);
  await sleep(600);
  await shot('13-license.png');
  await evaluate(`document.querySelector('.modal__head .icon-btn')?.click()`);
  await sleep(400);
  await shot('14-folders.png');

  // настройки лицензии
  await openSettings();
  await clickText('.settings__navbtn', 'Лицензия');
  await sleep(500);
  await shot('15-settings-license.png');
  await closeSettings();

  // мобильный вид
  await setViewport(390, 844, true);
  await evaluate('location.reload()');
  await sleep(2600);
  await shot('08-mobile.png');
  await openSettings();
  await shot('09-mobile-settings.png');
  await closeSettings();

  ws.close();
  chrome.kill();
  await sleep(400);
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
