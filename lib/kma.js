// 기상청 API허브(apihub.kma.go.kr) 클라이언트
// - 단기예보: VilageFcstInfoService_2.0 (초단기실황 / 초단기예보 / 단기예보)
// - 중기예보: typ01 중기 육상예보 / 중기 기온예보 (텍스트)

const SHORT_BASE = 'https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0';
const TYP01_BASE = 'https://apihub.kma.go.kr/api/typ01/url';

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

export class KmaError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// ---------- 격자 변환 (기상청 LCC 투영, 5km 격자) ----------
export function latLonToGrid(lat, lon) {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD, olon = OLON * DEGRAD, olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

// ---------- 시간 계산 (항상 KST 기준) ----------
function kstNow() {
  return new Date(Date.now() + 9 * 3600 * 1000); // UTC getter로 읽으면 KST 값
}
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const addHours = (d, h) => new Date(d.getTime() + h * 3600 * 1000);

// 초단기실황: 매시 정시 발표, 약 40분 후 제공
function ncstBase(stepBack = 0) {
  let d = kstNow();
  if (d.getUTCMinutes() < 40) d = addHours(d, -1);
  d = addHours(d, -stepBack);
  return { base_date: ymd(d), base_time: `${pad(d.getUTCHours())}00` };
}

// 초단기예보: 매시 30분 발표, 약 45분 후 제공
function ultraFcstBase(stepBack = 0) {
  let d = kstNow();
  if (d.getUTCMinutes() < 45) d = addHours(d, -1);
  d = addHours(d, -stepBack);
  return { base_date: ymd(d), base_time: `${pad(d.getUTCHours())}30` };
}

// 단기예보: 02,05,08,11,14,17,20,23시 발표, 약 10분 후 제공
function vilageBase(stepBack = 0) {
  let d = kstNow();
  d = addHours(d, -3 * stepBack);
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  const hours = [23, 20, 17, 14, 11, 8, 5, 2];
  const h = hours.find((hh) => hh * 60 + 10 <= mins);
  if (h === undefined) {
    const prev = addHours(d, -24);
    return { base_date: ymd(prev), base_time: '2300' };
  }
  return { base_date: ymd(d), base_time: `${pad(h)}00` };
}

// ---------- 공통 호출 ----------
function authKey() {
  const key = process.env.KMA_AUTH_KEY?.trim();
  if (!key) throw new KmaError('KMA_AUTH_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.', 'NO_KEY');
  return encodeURIComponent(key);
}

async function call(url, params) {
  const qs = Object.entries({ pageNo: 1, numOfRows: 1000, dataType: 'JSON', ...params })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const full = `${url}?authKey=${authKey()}&${qs}`;

  const hit = cache.get(full);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;

  const res = await fetchRetry(full);
  const text = await res.text();

  // 인증 오류 등은 JSON 요청에도 XML로 응답함
  if (text.trimStart().startsWith('<')) {
    const msg = text.match(/<returnAuthMsg>(.*?)<\/returnAuthMsg>/)?.[1]
      || text.match(/<resultMsg>(.*?)<\/resultMsg>/)?.[1]
      || text.match(/<errMsg>(.*?)<\/errMsg>/)?.[1]
      || `HTTP ${res.status}`;
    const code = text.match(/<returnReasonCode>(.*?)<\/returnReasonCode>/)?.[1]
      || text.match(/<resultCode>(.*?)<\/resultCode>/)?.[1];
    throw new KmaError(explain(code, msg), code || 'XML');
  }
  if (!res.ok) throw httpError(res, text, url);

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new KmaError(`응답을 해석할 수 없습니다: ${text.slice(0, 200)}`, 'PARSE');
  }
  const header = json.response?.header;
  if (header?.resultCode !== '00') {
    throw new KmaError(explain(header?.resultCode, header?.resultMsg), header?.resultCode);
  }
  const items = json.response.body?.items?.item ?? [];
  for (const [k, v] of cache) if (Date.now() - v.at >= CACHE_TTL_MS) cache.delete(k);
  cache.set(full, { at: Date.now(), items });
  return items;
}

// API허브는 가끔 응답이 멈추므로 시간 초과 시 한 번 더 시도
async function fetchRetry(url, tries = 2) {
  for (let i = 0; ; i++) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(Number(process.env.KMA_TIMEOUT_MS) || 8000) });
    } catch (e) {
      if (e.name !== 'TimeoutError') throw new KmaError(`기상청 서버에 연결하지 못했습니다: ${e.message}`, 'NET');
      if (i + 1 >= tries) throw new KmaError('기상청 서버 응답이 늦어 시간 초과되었습니다. 잠시 후 새로고침하세요.', 'TIMEOUT');
    }
  }
}

// API허브는 인증·권한 오류를 HTTP 상태코드로 알려줌 (403: 미신청 API 또는 잘못된 키)
// 예: {"result":{"status":403,"message":"활용신청이 필요한 API 입니다. ..."}}
function httpError(res, text, url) {
  let msg = text.slice(0, 200);
  try {
    msg = JSON.parse(text).result?.message ?? msg;
  } catch {}
  return new KmaError(`${msg} [HTTP ${res.status}, ${url.split('?')[0].split('/').pop()}]`, `HTTP${res.status}`);
}

// typ01 텍스트 API: EUC-KR, disp=1이면 쉼표 구분. '#'으로 시작하는 줄은 설명/헤더
// 헤더 줄(# REG_ID TM_FC ...)의 컬럼명으로 각 행을 객체로 만듦
async function callText(file, params) {
  const qs = Object.entries({ disp: 1, help: 1, ...params })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const full = `${TYP01_BASE}/${file}?${qs}&authKey=${authKey()}`;

  const hit = cache.get(full);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;

  const res = await fetchRetry(full);
  // 정상 응답은 EUC-KR 텍스트, 오류 응답은 UTF-8 JSON
  const text = new TextDecoder(res.ok ? 'euc-kr' : 'utf-8').decode(await res.arrayBuffer());
  if (!res.ok) throw httpError(res, text, full);

  let columns = null;
  const items = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('# REG_ID')) columns = line.slice(1).trim().split(/\s+/);
    if (!line || line.startsWith('#') || !columns) continue;
    const cells = line.split(',').map((c) => c.trim());
    items.push(Object.fromEntries(columns.map((c, i) => [c, cells[i]])));
  }
  cache.set(full, { at: Date.now(), items });
  return items;
}

function explain(code, msg) {
  const known = {
    '03': '아직 발표되지 않은 자료입니다 (NO_DATA)',
    '10': '요청 파라미터가 잘못되었습니다',
    '20': '서비스 접근이 거부되었습니다 (API허브 활용신청 승인 여부 확인)',
    '22': '일일 호출 한도를 초과했습니다',
    '30': '등록되지 않은 인증키입니다',
    '31': '인증키 기한이 만료되었습니다',
  };
  return known[code] ? `${known[code]} [${code}: ${msg}]` : `${msg ?? '알 수 없는 오류'} [${code ?? '-'}]`;
}

// 최신 발표분이 아직 없으면(NO_DATA) 한 단계 이전 발표분으로 재시도
async function withFallback(baseFn, fetchFn, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const items = await fetchFn(baseFn(i));
      if (items.length) return items;
      lastErr = new KmaError('빈 응답', '03');
    } catch (e) {
      if (e.code !== '03') throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}

// ---------- 코드 해석 ----------
const SKY = { 1: '맑음', 3: '구름많음', 4: '흐림' };
const PTY = { 0: '', 1: '비', 2: '비/눈', 3: '눈', 4: '소나기', 5: '빗방울', 6: '빗방울눈날림', 7: '눈날림' };

function describe(sky, pty) {
  const p = PTY[Number(pty)];
  if (p) return p;
  return SKY[Number(sky)] ?? '-';
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ---------- 공개 API ----------

// 실시간: 초단기실황 + 초단기예보(하늘상태 보완)
export async function getNow(nx, ny) {
  const ncst = await withFallback(ncstBase, (b) => call(`${SHORT_BASE}/getUltraSrtNcst`, { ...b, nx, ny }));
  const obs = Object.fromEntries(ncst.map((i) => [i.category, i.obsrValue]));

  let sky = null;
  let nextHours = [];
  try {
    const fc = await withFallback(ultraFcstBase, (b) => call(`${SHORT_BASE}/getUltraSrtFcst`, { ...b, nx, ny }));
    const slots = groupBySlot(fc);
    sky = slots[0]?.SKY ?? null;
    nextHours = slots.map((s) => ({
      date: s.date, time: s.time, temp: num(s.T1H), sky: num(s.SKY), pty: num(s.PTY),
      desc: describe(s.SKY, s.PTY), rain: s.RN1,
    }));
  } catch {
    // 하늘상태는 부가정보이므로 실패해도 실황은 표시
  }

  return {
    baseDate: ncst[0].baseDate,
    baseTime: ncst[0].baseTime,
    temp: num(obs.T1H),
    humidity: num(obs.REH),
    rain1h: num(obs.RN1),
    windSpeed: num(obs.WSD),
    windDir: num(obs.VEC),
    pty: num(obs.PTY),
    sky: num(sky),
    desc: describe(sky, obs.PTY),
    nextHours,
  };
}

function groupBySlot(items) {
  const map = new Map();
  for (const it of items) {
    const key = it.fcstDate + it.fcstTime;
    if (!map.has(key)) map.set(key, { date: it.fcstDate, time: it.fcstTime });
    map.get(key)[it.category] = it.fcstValue;
  }
  return [...map.values()].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

// 단기예보: 약 3~4일치 시간별 예보
export async function getShort(nx, ny) {
  const items = await withFallback(vilageBase, (b) => call(`${SHORT_BASE}/getVilageFcst`, { ...b, nx, ny }));
  const slots = groupBySlot(items);

  const hourly = slots.map((s) => ({
    date: s.date,
    time: s.time,
    temp: num(s.TMP),
    sky: num(s.SKY),
    pty: num(s.PTY),
    desc: describe(s.SKY, s.PTY),
    pop: num(s.POP),
    pcp: s.PCP,
    sno: s.SNO,
    humidity: num(s.REH),
    windSpeed: num(s.WSD),
  }));

  // 날짜별 최저/최고: TMN/TMX가 있으면 우선, 없으면 시간별 기온에서 계산
  const daily = new Map();
  for (const s of slots) {
    if (!daily.has(s.date)) daily.set(s.date, { date: s.date, temps: [], pops: [], tmn: null, tmx: null });
    const d = daily.get(s.date);
    if (s.TMP != null) d.temps.push(Number(s.TMP));
    if (s.POP != null) d.pops.push(Number(s.POP));
    if (s.TMN != null) d.tmn = Number(s.TMN);
    if (s.TMX != null) d.tmx = Number(s.TMX);
  }

  return {
    baseDate: items[0].baseDate,
    baseTime: items[0].baseTime,
    hourly,
    // 마지막 날처럼 몇 시간치만 있는 날은 최저/최고가 왜곡되므로 제외 (첫날은 남은 시간만이라도 표시)
    daily: [...daily.values()].filter((d, i) => i === 0 || d.tmx != null || d.temps.length >= 12).map((d) => ({
      date: d.date,
      min: d.tmn ?? (d.temps.length ? Math.min(...d.temps) : null),
      max: d.tmx ?? (d.temps.length ? Math.max(...d.temps) : null),
      pop: d.pops.length ? Math.max(...d.pops) : null,
    })),
  };
}

// 중기예보: typ01 중기 육상예보(fct_afs_wl) + 중기 기온예보(fct_afs_wc)
// tmfc를 생략하면 가장 최근 발표분을 돌려줌. 발효시각(TM_EF)이 절대 날짜라 일자 계산이 필요 없음
export async function getMid(city) {
  const land = await callText('fct_afs_wl.php', { reg: city.midLand });
  if (!land.length) throw new KmaError('중기 육상예보 자료가 없습니다', '03');

  let temps = [];
  let tempError = null;
  try {
    temps = await callText('fct_afs_wc.php', { reg: city.midTa });
  } catch (e) {
    tempError = e.message;
  }

  const days = new Map();
  const day = (tmEf) => {
    const date = tmEf.slice(0, 8);
    if (!days.has(date)) days.set(date, { date });
    return days.get(date);
  };

  // MOD: A02 = 12시간 단위(00시 발효 = 오전, 12시 발효 = 오후), A01 = 하루 단위
  for (const r of land) {
    const d = day(r.TM_EF);
    const pop = num(r.RN_ST);
    if (r.MOD === 'A01') {
      d.wfAm = d.wfPm = r.WF;
      d.popAm = d.popPm = pop;
    } else if (r.TM_EF.slice(8, 10) === '00') {
      d.wfAm = r.WF;
      d.popAm = pop;
    } else {
      d.wfPm = r.WF;
      d.popPm = pop;
    }
  }
  for (const r of temps) {
    const d = day(r.TM_EF);
    d.min = num(r.MIN);
    d.max = num(r.MAX);
  }

  return {
    tmFc: land[0].TM_FC,
    region: city.name,
    tempError,
    days: [...days.values()].filter((d) => d.wfAm || d.wfPm).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
