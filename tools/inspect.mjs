/**
 * Служебный скрипт: открывает GooseText в headless Chrome через DevTools Protocol,
 * нажимает кнопки и сохраняет скриншоты в shots/.
 * Запуск: node tools/inspect.mjs
 */
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const shots = join(root, 'shots');
const profile = join(root, '.chrome-profile');
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_APP = process.env.APP_URL ?? 'http://127.0.0.1:5180/';
const PORT = 9333;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools() {
  for (let i = 0; i < 60; i++) {
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

  const evaluate = async (expression) => {
    const res = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text ?? 'Ошибка в браузере');
    return res.result?.value;
  };

  const shot = async (name) => {
    const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(join(shots, name), Buffer.from(data, 'base64'));
    console.log('скриншот:', name);
  };

  const setViewport = async (width, height, mobile = false) => {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
    });
  };

  const clickByText = (selector, text) =>
    evaluate(`(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find((n) => n.textContent.replace(/\\s+/g, ' ').includes(${JSON.stringify(text)}));
      if (!el) return 'нет элемента: ' + ${JSON.stringify(text)};
      el.click();
      return 'нажал: ' + el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 40);
    })()`);

  await setViewport(1440, 900, false);
  await call('Page.navigate', { url: URL_APP });
  await sleep(2500);
  await shot('home-light.png');

  console.log(await clickByText('.doc-item', 'Сценарий'));
  await sleep(900);
  await shot('screenplay.png');

  console.log(await clickByText('.doc-item', 'Добро пожаловать'));
  await sleep(600);
  console.log(
    await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Проверить текст');
      if (!btn) return 'нет кнопки';
      btn.click();
      return 'запустил проверку';
    })()`),
  );
  await sleep(8000);
  await shot('spell.png');
  console.log('замечаний:', await evaluate(`document.querySelectorAll('.issue').length`));

  // настройки
  const openSettings = async () => {
    await evaluate(`document.querySelector('[aria-label="Настройки"]')?.click()`);
    await sleep(550);
  };
  const closeSettings = async () => {
    await evaluate(`document.querySelector('.modal__head .icon-btn')?.click()`);
    await sleep(650);
  };

  await openSettings();
  await shot('settings.png');

  console.log(await clickByText('.style-card', 'Реалистичный'));
  await sleep(500);
  await shot('settings-realistic.png');
  await closeSettings();
  await shot('style-realistic.png');

  await openSettings();
  console.log(await clickByText('.style-card', 'Минималистичный'));
  await sleep(400);
  await closeSettings();
  await shot('style-minimal.png');

  await openSettings();
  console.log(await clickByText('.style-card', 'Детальный'));
  await sleep(400);
  await closeSettings();
  await shot('style-detailed.png');

  await openSettings();
  console.log(await clickByText('.seg__btn', 'Тёмная'));
  await sleep(400);
  await closeSettings();
  await shot('theme-dark.png');

  await openSettings();
  console.log(await clickByText('.font-option', 'Georgia'));
  await sleep(400);
  await shot('settings-font.png');
  console.log(await clickByText('.settings__navfoot button', 'Сбросить вид'));
  await sleep(500);
  await closeSettings();
  await shot('home-restored.png');

  // панели: закрываем левую и открываем обратно
  await evaluate(`document.querySelectorAll('.titlebar__toggle')[0]?.click()`);
  await sleep(600);
  const railBtns = await evaluate(`document.querySelectorAll('.rail__btn').length`);
  console.log('кнопок в рэйлах:', railBtns);
  await shot('panels-closed.png');
  await evaluate(`document.querySelectorAll('.titlebar__toggle')[0]?.click()`);
  await sleep(400);

  await setViewport(390, 844, true);
  await evaluate(`localStorage.clear(); location.reload()`);
  await sleep(2400);
  await shot('mobile-light.png');

  await evaluate(`document.querySelectorAll('.mobile-bar__btn')[0]?.click()`);
  await sleep(700);
  await shot('mobile-docs.png');

  await evaluate(`document.querySelectorAll('.mobile-bar__btn')[4]?.click()`);
  await sleep(800);
  await shot('mobile-assistant.png');

  await openSettings();
  await shot('mobile-settings.png');
  console.log(await clickByText('.seg__btn', 'Тёмная'));
  await sleep(500);
  await shot('mobile-settings-dark.png');
  await closeSettings();

  await evaluate(`localStorage.clear()`);
  const problems = cdp.events
    .filter(
      (e) =>
        e.method === 'Runtime.exceptionThrown' ||
        (e.method === 'Log.entryAdded' && ['error', 'warning'].includes(e.params?.entry?.level)),
    )
    .map((e) =>
      e.method === 'Runtime.exceptionThrown'
        ? `Исключение: ${e.params.exceptionDetails?.text} ${e.params.exceptionDetails?.exception?.description ?? ''}`
        : `Лог [${e.params.entry.level}]: ${e.params.entry.text}`,
    );
  console.log(problems.length ? `найдены проблемы:\n${problems.join('\n')}` : 'ошибок в консоли нет');

  ws.close();
  chrome.kill();
  await sleep(400);
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
