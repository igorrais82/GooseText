/**
 * Локальный кэш моделей распознавания речи.
 *
 * В настольной версии страница живёт на file://, поэтому браузерный кэш
 * ненадёжен. Этот маленький HTTP-сервер один раз скачивает файлы модели
 * с Hugging Face в профиль приложения и дальше отдаёт их с диска — диктовка
 * работает офлайн и не качает 60 МБ при каждом запуске.
 */
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { net } = require('electron');

const MIME = {
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.onnx': 'application/octet-stream',
  '.onnx_data': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.model': 'application/octet-stream',
};

const TTS_LANGS = new Set([
  'ru', 'en', 'de', 'fr', 'es', 'it', 'pt', 'tr', 'uk', 'pl', 'kk',
  'zh-CN', 'ja', 'ko', 'ar',
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
    const response = await net.fetch(url, {
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

function safePath(raw) {
  let value;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!value || value.includes('\0') || value.includes('..')) return null;
  if (!/^[A-Za-z0-9._/-]+$/.test(value)) return null;
  return value.replace(/^\/+/, '');
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  if (MIME[ext]) return MIME[ext];
  if (file.endsWith('.onnx_data')) return MIME['.onnx_data'];
  return 'application/octet-stream';
}

async function downloadModelFile(relative, localPath) {
  const remote = `https://huggingface.co/${relative}`;
  const response = await net.fetch(remote, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Hugging Face ответил ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fsp.mkdir(path.dirname(localPath), { recursive: true });
  const temp = `${localPath}.part`;
  await fsp.writeFile(temp, buffer);
  await fsp.rename(temp, localPath);
}

function startModelServer(cacheRoot) {
  const pending = new Map();

  const server = http.createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/tts') {
      const text = (url.searchParams.get('text') ?? '').slice(0, 8000);
      const lang = url.searchParams.get('lang') ?? 'ru';
      if (!text.trim()) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Пустой текст');
        return;
      }
      try {
        const audio = await synthesizeSpeech(text, lang);
        response.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audio.length,
          'Cache-Control': 'public, max-age=86400',
        });
        response.end(audio);
      } catch (error) {
        console.warn('Озвучка не удалась', error);
        response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(`Озвучка недоступна: ${error.message}`);
      }
      return;
    }

    if (!url.pathname.startsWith('/models/')) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    const relative = safePath(url.pathname.slice('/models/'.length));
    if (!relative) {
      response.writeHead(400);
      response.end('Bad path');
      return;
    }

    const localPath = path.join(cacheRoot, relative);
    if (!localPath.startsWith(path.resolve(cacheRoot))) {
      response.writeHead(400);
      response.end('Bad path');
      return;
    }

    try {
      if (!fs.existsSync(localPath)) {
        if (!pending.has(relative)) {
          pending.set(
            relative,
            downloadModelFile(relative, localPath).finally(() => pending.delete(relative)),
          );
        }
        await pending.get(relative);
      }
      const stat = await fsp.stat(localPath);
      response.writeHead(200, {
        'Content-Type': contentType(localPath),
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      fs.createReadStream(localPath).pipe(response);
    } catch (error) {
      console.warn('Не удалось отдать модель', relative, error);
      response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(`Не удалось скачать модель: ${error.message}`);
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/models/`,
        close: () => server.close(),
      });
    });
  });
}

module.exports = { startModelServer };
