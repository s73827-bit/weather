// GitHub Pages용 정적 사이트 생성: public/ 복사 + 도시별 data/<id>.json 생성
// 사용: KMA_AUTH_KEY=... node scripts/build-site.mjs [출력폴더=_site]
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CITIES } from '../lib/regions.js';
import { cityList, cityWeather } from '../lib/data.js';

const OUT = process.argv[2] || '_site';

await rm(OUT, { recursive: true, force: true });
await cp('public', OUT, { recursive: true });
await mkdir(join(OUT, 'data'), { recursive: true });
await writeFile(join(OUT, 'data', 'cities.json'), JSON.stringify(cityList()));

let failed = 0;
// API허브 부담을 줄이려고 도시를 순서대로 처리
for (const city of CITIES) {
  const data = await cityWeather(city);
  const errors = ['now', 'short', 'mid'].filter((k) => data[k].error);
  if (errors.length === 3) failed++;
  console.log(`${city.name}: ${errors.length ? '실패 ' + errors.map((k) => `${k}(${data[k].error})`).join(', ') : 'OK'}`);
  await writeFile(join(OUT, 'data', `${city.id}.json`), JSON.stringify(data));
}

// 모든 도시가 완전히 실패하면(키 오류 등) 배포를 막아 이전 정상 사이트를 유지
if (failed === CITIES.length) {
  console.error('모든 도시의 데이터 수집에 실패했습니다. 배포를 중단합니다.');
  process.exit(1);
}
