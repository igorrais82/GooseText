import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const port = Number(process.env.PORT ?? 5180);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

async function sendFile(res, filePath, status = 200) {
  const data = await readFile(filePath);
  res.writeHead(status, {
    'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600',
    'Service-Worker-Allowed': '/',
  });
  res.end(data);
}

/* ------------------------------ озвучка ------------------------------ */

const TTS_LANGS = new Set([
  'ru', 'en', 'de', 'fr', 'es', 'it', 'pt', 'tr', 'uk', 'pl', 'kk', 'zh-CN', 'ja', 'ko', 'ar',
]);
const TTS_CACHE = new Map();

function splitForSpeech(text, limit = 180) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…]+[.!?…]*/g) ?? [clean];
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;
    if ((current + ' ' + piece).length > limit && current) {
      chunks.push(current.trim());
      current = '';
    }
    if (piece.length > limit) {
      let part = '';
      for (const word of piece.split(/\s+/)) {
        if ((part + ' ' + word).length > limit && part) {
          chunks.push(part.trim());
          part = '';
        }
        part += (part ? ' ' : '') + word;
      }
      if (part) current = part;
    } else {
      current += (current ? ' ' : '') + piece;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.slice(0, 80);
}

async function synthesizeSpeech(text, lang) {
  const language = TTS_LANGS.has(lang) ? lang : 'ru';
  const key = `${language}|${text}`;
  if (TTS_CACHE.has(key)) return TTS_CACHE.get(key);

  const chunks = splitForSpeech(text);
  if (chunks.length === 0) throw new Error('Пустой текст');

  const buffers = [];
  for (const chunk of chunks) {
    const url =
      'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob' +
      `&tl=${encodeURIComponent(language)}&q=${encodeURIComponent(chunk)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        Referer: 'https://translate.google.com/',
      },
    });
    if (!response.ok) throw new Error(`Озвучка ответила ${response.status}`);
    buffers.push(Buffer.from(await response.arrayBuffer()));
  }

  const audio = Buffer.concat(buffers);
  if (TTS_CACHE.size > 24) TTS_CACHE.clear();
  TTS_CACHE.set(key, audio);
  return audio;
}

const server = createServer(async (req, res) => {
  try {
    const parsed = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (parsed.pathname === '/api/tts') {
      const text = (parsed.searchParams.get('text') ?? '').slice(0, 8000);
      const lang = parsed.searchParams.get('lang') ?? 'ru';
      if (!text.trim()) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Пустой текст');
        return;
      }
      try {
        const audio = await synthesizeSpeech(text, lang);
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audio.length,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(audio);
      } catch (error) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Озвучка недоступна: ${error.message}`);
      }
      return;
    }

    const rawPath = decodeURIComponent(parsed.pathname);
    let relative = normalize(rawPath).replace(/^(\.\.[/\\])+/, '');
    if (relative === '/' || relative === '\\' || relative === '') relative = '/index.html';
    let filePath = join(root, relative);
    if (!filePath.startsWith(root.endsWith(sep) ? root : root + sep)) {
      res.writeHead(403).end('Нет доступа');
      return;
    }
    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = join(filePath, 'index.html');
    } catch {
      filePath = join(root, 'index.html');
    }
    await sendFile(res, filePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Сначала соберите приложение: pnpm build');
      return;
    }
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Ошибка сервера');
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`GooseText уже запущен: http://127.0.0.1:${port}/`);
    process.exit(0);
  }
  throw error;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`GooseText работает: http://127.0.0.1:${port}/`);
  console.log('Чтобы остановить, закройте это окно или нажмите Ctrl+C.');
});
