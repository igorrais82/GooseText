/**
 * Снимает скриншот уже запущенного приложения (Electron или Chrome)
 * через удалённую отладку. Запуск: node tools/shot-cdp.mjs [порт] [файл]
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const port = Number(process.argv[2] ?? 9333);
const outName = process.argv[3] ?? 'desktop-app.png';
const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '..', 'shots', outName);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && /index\.html|127\.0\.0\.1/.test(t.url)) ?? list.find((t) => t.type === 'page');
if (!page) throw new Error('Не нашёл страницу приложения');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});

let id = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve: res, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else res(msg.result);
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
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
  return res.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await sleep(1500);

console.log('страница:', page.url);
console.log(
  'desktop-мост:',
  await evaluate('JSON.stringify({ isDesktop: !!window.goosetext?.isDesktop, platform: window.goosetext?.platform })'),
);
console.log('документов на экране:', await evaluate("document.querySelectorAll('.doc-item').length"));
console.log('текст документа (начало):', await evaluate("document.querySelector('.editor__content')?.innerText.slice(0, 60)"));

const { data } = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(outPath, Buffer.from(data, 'base64'));
console.log('скриншот:', outPath);

ws.close();
