// 화면이 읽는 JSON 데이터 생성. 로컬 서버(server.js)와 정적 빌드(scripts/build-site.mjs)가 함께 사용
import { CITIES } from './regions.js';
import { getMid, getNow, getShort, latLonToGrid } from './kma.js';

// 각 섹션을 독립적으로 받아, 하나가 실패해도 나머지는 표시
const settle = (p) => p.then((data) => ({ data }), (e) => ({ error: e.message }));

export function cityList() {
  return CITIES.map(({ id, name, lat, lon }) => ({ id, name, lat, lon }));
}

export async function cityWeather(city) {
  const { nx, ny } = latLonToGrid(city.lat, city.lon);
  const [now, short, mid] = await Promise.all([settle(getNow(nx, ny)), settle(getShort(nx, ny)), settle(getMid(city))]);
  return {
    generatedAt: new Date().toISOString(),
    location: { id: city.id, name: city.name, nx, ny },
    now,
    short,
    mid,
  };
}
