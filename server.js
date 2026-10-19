// 로컬 개발 서버: 정적 파일 + data/*.json을 요청 시점에 기상청 API로 생성
// GitHub Pages에서는 scripts/build-site.mjs가 같은 경로의 JSON을 미리 만들어 둠
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCity } from './lib/regions.js';
import { cityList, cityWeather } from './lib/data.js';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function serveStatic(path, res) {
  const safe = normalize(path === '/' ? '/index.html' : path).replace(/^([/\\])+/, '');
  const file = join(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/data/cities.json') return sendJson(res, 200, cityList());
    const m = url.pathname.match(/^\/data\/([a-z]+)\.json$/);
    if (m) {
      const city = findCity(m[1]);
      return city ? sendJson(res, 200, await cityWeather(city)) : sendJson(res, 404, { error: '알 수 없는 도시입니다.' });
    }
    return await serveStatic(url.pathname, res);
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: e.message });
  }
}).listen(PORT, () => {
  console.log(`날씨 대시보드: http://localhost:${PORT}`);
  if (!process.env.KMA_AUTH_KEY) console.warn('경고: KMA_AUTH_KEY가 없습니다. .env 파일에 기상청 API허브 인증키를 넣어주세요.');
});
