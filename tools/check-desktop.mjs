/**
 * Проверка настольного приложения: подключается к запущенному окну Electron
 * и проверяет работу проверки текста, сохранения и напоминаний.
 * Запуск: node tools/check-desktop.mjs [порт]
 */
const port = Number(process.argv[2] ?? 9333);
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
    }, 25000);
  });

const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
  return res.result?.value;
};

await send('Runtime.enable');

console.log('окно:', page.title, '→', page.url);
console.log('мост:', await evaluate('JSON.stringify(window.goosetext ?? null)'));

console.log(
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Проверить текст');
    if (!btn) return 'кнопка проверки не найдена';
    btn.click();
    return 'запустил проверку текста';
  })()`),
);
await sleep(9000);

console.log('итог проверки:', await evaluate(`document.querySelector('.spell-summary')?.innerText.replace(/\\n/g, ' | ') ?? 'нет результата'`));
console.log('замечаний в списке:', await evaluate(`document.querySelectorAll('.issue').length`));
console.log('сообщение о сети:', await evaluate(`document.querySelector('.notice')?.innerText.replace(/\\n/g, ' ') ?? 'нет'`));

console.log('сохранение:', await evaluate(`(() => {
  const raw = localStorage.getItem('goosetext.state.v2');
  if (!raw) return 'в localStorage пусто';
  const parsed = JSON.parse(raw);
  return 'документов в хранилище: ' + parsed.docs.length;
})()`));

console.log(
  await evaluate(`[
    document.querySelectorAll('.doc-item').length,
    document.querySelectorAll('.helper').length
  ].join('/')`),
);

ws.close();
