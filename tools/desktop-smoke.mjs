/**
 * Проверка настольной сборки: мост, полный экран, новый логотип, рисунок.
 * Запуск: node tools/desktop-smoke.mjs [порт]
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const port = Number(process.argv[2] ?? 9333);
const here = dirname(fileURLToPath(import.meta.url));
const shots = resolve(here, '..', 'shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
if (!page) throw new Error('Приложение не запущено');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});

let id = 0;
const pending = new Map();
const problems = [];
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve: res, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else res(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    problems.push(`Исключение: ${msg.params.exceptionDetails?.text}`);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    problems.push(`console.error: ${msg.params.args?.map((a) => a.value ?? a.description).join(' ')}`);
  }
});

const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const msgId = ++id;
    pending.set(msgId, { resolve: res, reject: rej });
    ws.send(JSON.stringify({ id: msgId, method, params }));
    setTimeout(() => {
      if (pending.has(msgId)) {
        pending.delete(msgId);
        rej(new Error(`Таймаут ${method}`));
      }
    }, 20000);
  });

const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
  return res.result?.value;
};

const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(shots, name), Buffer.from(data, 'base64'));
  console.log('скриншот:', name);
};

await send('Runtime.enable');
await send('Page.enable');
await sleep(1200);

console.log('страница:', page.url);
console.log('мост:', await evaluate('JSON.stringify({ isDesktop: window.goosetext?.isDesktop, platform: window.goosetext?.platform, fullscreen: typeof window.goosetext?.toggleFullscreen })'));
console.log('документов на экране:', await evaluate("document.querySelectorAll('.doc-item').length"));
console.log('папки:', await evaluate("document.querySelectorAll('.folder-row').length"));
console.log('логотип с градиентом:', await evaluate("Boolean(document.querySelector('.titlebar .goose-mark linearGradient'))"));
console.log('CSP не заблокировал React:', await evaluate("Boolean(document.querySelector('.shell'))"));
console.log('версия из моста:', await evaluate("window.goosetext?.version"));

// рисунок создаём через диалог
await evaluate(`[...document.querySelectorAll('.rail__btn')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Новый документ'))?.click()`);
await sleep(400);
await evaluate(`[...document.querySelectorAll('.doc-type')].find((b) => b.textContent.includes('Рисунок'))?.click()`);
await sleep(900);
console.log('холст рисунка:', await evaluate("Boolean(document.querySelector('.draw-canvas'))"));
await shot('13-desktop-drawing.png');

// обратно на заметку
await evaluate(`[...document.querySelectorAll('.kind-chip')].find((b) => b.textContent.trim() === 'Заметка')?.click()`);
await sleep(600);

// полный экран через мост
const before = await evaluate('window.goosetext.getFullscreen()');
await evaluate(`document.querySelector('[aria-label="Полный экран"]')?.click()`);
await sleep(900);
const after = await evaluate('window.goosetext.getFullscreen()');
console.log(`полный экран: ${before} → ${after}`);
await shot('14-desktop-fullscreen.png');
await evaluate(`document.querySelector('[aria-label="Полный экран"]')?.click()`);
await sleep(900);
console.log('полный экран после выхода:', await evaluate('window.goosetext.getFullscreen()'));

// F11 через настоящее нажатие клавиши
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F11', code: 'F11', windowsVirtualKeyCode: 122 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F11', code: 'F11', windowsVirtualKeyCode: 122 });
await sleep(900);
console.log('полный экран по F11:', await evaluate('window.goosetext.getFullscreen()'));
await evaluate('window.goosetext.toggleFullscreen()');
await sleep(600);

console.log('ошибок в консоли:', problems.length, problems.slice(0, 5).join(' | '));
ws.close();
