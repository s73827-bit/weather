import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITIES, findCity, nearestCity } from './lib/regions.js';
import { getMid, getNow, getShort, latLonToGrid } from './lib/kma.js';

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

// 각 섹션을 독립적으로 받아, 하나가 실패해도 나머지는 표시
const settle = (p) => p.then((data) => ({ data }), (e) => ({ error: e.message }));

async function handleWeather(url, res) {
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  const useCoords = url.searchParams.has('lat') && Number.isFinite(lat) && Number.isFinite(lon);

  const city = useCoords ? nearestCity(lat, lon) : findCity(url.searchParams.get('city') || '서울');
  if (!city) return sendJson(res, 400, { error: '알 수 없는 도시입니다.' });

  const { nx, ny } = useCoords ? latLonToGrid(lat, lon) : latLonToGrid(city.lat, city.lon);
  const [now, short, mid] = await Promise.all([settle(getNow(nx, ny)), settle(getShort(nx, ny)), settle(getMid(city))]);

  sendJson(res, 200, {
    location: { name: useCoords ? `내 위치 (${city.name} 인근)` : city.name, nx, ny, midRegion: city.name },
    now,
    short,
    mid,
  });
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
    if (url.pathname === '/api/cities') return sendJson(res, 200, CITIES.map((c) => c.name));
    if (url.pathname === '/api/weather') return await handleWeather(url, res);
    return await serveStatic(url.pathname, res);
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: e.message });
  }
}).listen(PORT, () => {
  console.log(`날씨 대시보드: http://localhost:${PORT}`);
  if (!process.env.KMA_AUTH_KEY) console.warn('경고: KMA_AUTH_KEY가 없습니다. .env 파일에 기상청 API허브 인증키를 넣어주세요.');
});
