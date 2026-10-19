const $ = (sel) => document.querySelector(sel);
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const STORE_KEY = 'weather.city';

// ---------- 유틸 ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toDate = (ymd) => new Date(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8));
const fmtTime = (hhmm) => `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
const fmtTemp = (t) => (t == null ? '–' : `${Math.round(t)}°`);

function kstParts() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return { ymd: `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`, hour: d.getUTCHours() };
}

function dayName(ymd) {
  const today = kstParts().ymd;
  const diff = Math.round((toDate(ymd) - toDate(today)) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === 2) return '모레';
  return `${DOW[toDate(ymd).getDay()]}요일`;
}
const shortDate = (ymd) => `${+ymd.slice(4, 6)}/${+ymd.slice(6, 8)}`;

function windDirText(deg) {
  if (deg == null) return '';
  const dirs = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  return dirs[Math.round(deg / 45) % 8] + '풍';
}

// ---------- 날씨 분류와 아이콘 ----------
function kindOf(desc) {
  const s = desc || '';
  if (s.includes('비') && s.includes('눈')) return 'sleet';
  if (/비|빗방울|소나기/.test(s)) return 'rain';
  if (/눈/.test(s)) return 'snow';
  if (/흐/.test(s)) return 'cloudy';
  if (/구름/.test(s)) return 'partly';
  return 'clear';
}

const isNightHour = (h) => h < 6 || h >= 19;

const CLOUD = '<path class="ic-cloud" d="M14 34h20a7 7 0 0 0 0-14 10 10 0 0 0-19-2 8 8 0 0 0-1 16z"/>';
function icon(kind, night = false) {
  const sun = night
    ? '<path class="ic-moon" d="M27 6a12 12 0 1 0 13 15A10 10 0 0 1 27 6z"/>'
    : '<circle class="ic-sun" cx="24" cy="20" r="9"/>';
  const smallSun = night
    ? '<path class="ic-moon" d="M30 4a9 9 0 1 0 10 11 7 7 0 0 1-10-11z"/>'
    : '<circle class="ic-sun" cx="31" cy="14" r="7"/>';
  const drops = '<path class="ic-drop" d="M17 39l-2 5M25 39l-2 5M33 39l-2 5"/>';
  const flakes = '<circle class="ic-flake" cx="16" cy="42" r="2"/><circle class="ic-flake" cx="24" cy="44" r="2"/><circle class="ic-flake" cx="32" cy="42" r="2"/>';
  const body = {
    clear: sun,
    partly: smallSun + CLOUD,
    cloudy: CLOUD,
    rain: CLOUD + drops,
    snow: CLOUD + flakes,
    sleet: CLOUD + '<path class="ic-drop" d="M17 39l-2 5M31 39l-2 5"/><circle class="ic-flake" cx="24" cy="43" r="2"/>',
  }[kind];
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;
}

function skyTheme(now) {
  if (isNightHour(kstParts().hour)) return 'night';
  const k = kindOf(now.desc);
  if (k === 'rain' || k === 'sleet') return 'rain';
  if (k === 'snow') return 'snow';
  if (k === 'cloudy') return 'cloudy';
  if (k === 'partly') return 'partly-day';
  return 'clear-day';
}

function errorBox(message) {
  const hint = /인증키|KMA_AUTH_KEY|접근이 거부|활용신청/.test(message)
    ? '<small>.env의 KMA_AUTH_KEY와 기상청 API허브의 활용신청 상태를 확인하세요.</small>'
    : '';
  return `<div class="error">${esc(message)}${hint}</div>`;
}

// ---------- 현재 날씨 ----------
function renderNow(res, location) {
  const el = $('#now');
  if (res.error) {
    el.innerHTML = errorBox(`실시간 정보를 불러오지 못했습니다: ${res.error}`);
    return;
  }
  const n = res.data;
  document.body.dataset.sky = skyTheme(n);
  const night = isNightHour(kstParts().hour);
  const rain = n.rain1h && n.rain1h !== 0 ? `${n.rain1h}mm` : '없음';
  el.innerHTML = `
    <p class="temp">${n.temp == null ? '–' : n.temp.toFixed(1)}<sup>°C</sup></p>
    <div class="side">
      <p class="cond">${icon(kindOf(n.desc), night)}${esc(n.desc)}</p>
      <p class="where">${esc(location.name)} · ${fmtTime(n.baseTime)} 관측</p>
      <dl>
        <div><dt>습도</dt><dd>${n.humidity ?? '–'}%</dd></div>
        <div><dt>바람</dt><dd>${windDirText(n.windDir)} ${n.windSpeed ?? '–'}m/s</dd></div>
        <div><dt>1시간 강수</dt><dd>${rain}</dd></div>
      </dl>
    </div>`;
}

// ---------- 시간별 차트 ----------
function renderHourly(res) {
  const el = $('#hourly');
  if (res.error) {
    el.innerHTML = errorBox(`단기예보를 불러오지 못했습니다: ${res.error}`);
    $('#short-src').textContent = '';
    return;
  }
  const { hourly, baseDate, baseTime } = res.data;
  $('#short-src').textContent = `단기예보 ${shortDate(baseDate)} ${fmtTime(baseTime)} 발표`;

  const { ymd, hour } = kstParts();
  const nowKey = ymd + String(hour).padStart(2, '0') + '00';
  const pts = hourly.filter((h) => h.date + h.time >= nowKey && h.temp != null);
  if (!pts.length) {
    el.innerHTML = '<p class="empty">표시할 예보가 없습니다.</p>';
    return;
  }

  const COL = 48, H = 210, PAD = 10;
  const W = pts.length * COL + PAD * 2;
  const temps = pts.map((p) => p.temp);
  const tMin = Math.min(...temps), tMax = Math.max(...temps);
  const span = Math.max(tMax - tMin, 4);
  const yTop = 98, yBot = 146;
  const x = (i) => PAD + i * COL + COL / 2;
  const y = (t) => yBot - ((t - tMin) / span) * (yBot - yTop);

  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.temp).toFixed(1)}`).join('');
  const area = `${line}L${x(pts.length - 1)},${yBot + 6}L${x(0)},${yBot + 6}Z`;

  let cols = '';
  pts.forEach((p, i) => {
    const h = +p.time.slice(0, 2);
    const newDay = i === 0 || p.time === '0000';
    if (newDay) {
      if (i > 0) cols += `<line class="day-rule" x1="${PAD + i * COL}" x2="${PAD + i * COL}" y1="4" y2="${H - 4}"/>`;
      cols += `<text class="d-label" x="${PAD + i * COL + 4}" y="16">${dayName(p.date)} ${shortDate(p.date)}</text>`;
    }
    cols += `<text class="h-label" x="${x(i)}" y="38" text-anchor="middle">${i === 0 ? '지금' : h + '시'}</text>`;
    cols += `<g transform="translate(${x(i) - 17},42) scale(0.7)">${icon(kindOf(p.desc), isNightHour(h)).replace(/<\/?svg[^>]*>/g, '')}</g>`;
    cols += `<circle class="dot" cx="${x(i)}" cy="${y(p.temp)}" r="2.6"/>`;
    cols += `<text class="t-label" x="${x(i)}" y="${y(p.temp) - 9}" text-anchor="middle">${fmtTemp(p.temp)}</text>`;
    if (p.pop != null) {
      const bh = (p.pop / 100) * 26;
      cols += `<rect class="pop-bar" x="${x(i) - 9}" y="${H - 14 - bh}" width="18" height="${Math.max(bh, 1)}" rx="2"/>`;
      if (p.pop >= 20) cols += `<text class="pop-label" x="${x(i)}" y="${H - 44}" text-anchor="middle">${p.pop}%</text>`;
    }
  });

  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="시간별 기온과 강수확률">
    <path class="area" d="${area}"/><path class="curve" d="${line}"/>${cols}</svg>`;
}

// ---------- 날짜별 (단기 + 중기 합침) ----------
const severity = (h) => (h.pty > 0 ? 10 : 0) + (h.sky ?? 0);
const worst = (slots) => slots.reduce((a, b) => (a && severity(a) >= severity(b) ? a : b), null);

function renderDaily(shortRes, midRes) {
  const el = $('#daily');
  const rows = [];
  const srcParts = [];

  if (shortRes.data) {
    const { hourly, daily } = shortRes.data;
    for (const d of daily) {
      // 대표 날씨: 오전(06~12시)·오후(12~18시) 중 가장 궂은 예보
      const ofDay = hourly.filter((h) => h.date === d.date);
      const am = worst(ofDay.filter((h) => h.time >= '0600' && h.time < '1200')) ?? worst(ofDay);
      const pm = worst(ofDay.filter((h) => h.time >= '1200' && h.time <= '1800')) ?? am;
      if (!am) continue;
      rows.push({ date: d.date, wfAm: am.desc, wfPm: pm.desc, min: d.min, max: d.max, pop: d.pop, src: '단기' });
    }
  }
  if (midRes.data) {
    srcParts.push(`중기예보 ${shortDate(midRes.data.tmFc)} ${fmtTime(midRes.data.tmFc.slice(8))} 발표 (${midRes.data.region} 권역)`);
    const have = new Set(rows.map((r) => r.date));
    for (const d of midRes.data.days) {
      if (have.has(d.date)) continue;
      rows.push({
        date: d.date, wfAm: d.wfAm, wfPm: d.wfPm, min: d.min ?? null, max: d.max ?? null,
        pop: Math.max(d.popAm ?? 0, d.popPm ?? 0), src: '중기',
      });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const today = kstParts().ymd;
  const list = rows.filter((r) => r.date >= today);

  $('#daily-src').textContent = srcParts.join(' ');
  let html = '';
  if (midRes.error) html += `<li style="display:block">${errorBox(`중기예보를 불러오지 못했습니다: ${midRes.error}`)}</li>`;
  if (midRes.data?.tempError) html += `<li style="display:block"><p class="empty">중기 기온 조회 실패: ${esc(midRes.data.tempError)}</p></li>`;

  if (!list.length) {
    el.innerHTML = html || '<li class="empty">표시할 예보가 없습니다.</li>';
    return;
  }

  const all = list.flatMap((r) => [r.min, r.max]).filter((v) => v != null);
  const lo = Math.min(...all), hi = Math.max(...all);
  const pct = (v) => ((v - lo) / Math.max(hi - lo, 1)) * 100;

  html += list.map((r) => {
    const wf = r.wfAm === r.wfPm ? r.wfAm : `${r.wfAm} → ${r.wfPm}`;
    const bar = r.min != null && r.max != null
      ? `<div class="fill" style="left:${pct(r.min)}%;right:${100 - pct(r.max)}%"></div>` : '';
    return `<li>
      <div class="day"><b>${dayName(r.date)}</b><span>${shortDate(r.date)}</span></div>
      <div class="icons">${icon(kindOf(r.wfAm))}${r.wfPm !== r.wfAm ? icon(kindOf(r.wfPm)) : ''}</div>
      <div class="wf" title="${esc(wf)}">${esc(wf)}</div>
      <div class="pop">${r.pop ? r.pop + '%' : ''}</div>
      <div class="range"><span class="lo">${fmtTemp(r.min)}</span><div class="track">${bar}</div><span class="hi">${fmtTemp(r.max)}</span></div>
    </li>`;
  }).join('');
  el.innerHTML = html;
}

// ---------- 데이터 로딩 ----------
let lastQuery = null;

async function load(query) {
  lastQuery = query;
  $('#stamp').textContent = '불러오는 중…';
  try {
    const res = await fetch(`/api/weather?${new URLSearchParams(query)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    renderNow(data.now, data.location);
    renderHourly(data.short);
    renderDaily(data.short, data.mid);
    const t = new Date();
    $('#stamp').textContent = `${data.location.name} · ${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')} 갱신`;
  } catch (e) {
    $('#now').innerHTML = errorBox(`서버에 연결하지 못했습니다: ${e.message}`);
    $('#stamp').textContent = '';
  }
}

async function init() {
  const cities = await fetch('/api/cities').then((r) => r.json());
  const select = $('#city');
  let saved = null;
  try { saved = localStorage.getItem(STORE_KEY); } catch {}
  select.innerHTML = cities.map((c) => `<option ${c === saved ? 'selected' : ''}>${esc(c)}</option>`).join('');

  select.addEventListener('change', () => {
    try { localStorage.setItem(STORE_KEY, select.value); } catch {}
    load({ city: select.value });
  });

  $('#locate').addEventListener('click', () => {
    if (!navigator.geolocation) return alert('이 브라우저는 위치 정보를 지원하지 않습니다.');
    $('#stamp').textContent = '위치 확인 중…';
    navigator.geolocation.getCurrentPosition(
      (pos) => load({ lat: pos.coords.latitude.toFixed(4), lon: pos.coords.longitude.toFixed(4) }),
      (err) => { $('#stamp').textContent = `위치를 가져오지 못했습니다 (${err.message})`; },
      { timeout: 10000 },
    );
  });

  $('#refresh').addEventListener('click', () => load(lastQuery));

  load({ city: select.value });
  // 10분마다 자동 갱신
  setInterval(() => load(lastQuery), 10 * 60 * 1000);
}

init();
