# 기상청 날씨 대시보드

기상청 API허브의 API로 실시간 날씨, 시간별(단기) 예보, 약 10일(중기) 예보를 한 화면에 보여주는 로컬 대시보드입니다.

## 실행

```bash
cp .env.example .env      # KMA_AUTH_KEY에 인증키 입력
npm start                 # http://localhost:3000
```

Node.js 22 이상, 외부 패키지 없음. 코드 수정 중에는 `npm run dev`(자동 재시작).

## 인증키 발급 (기상청 API허브)

1. [apihub.kma.go.kr](https://apihub.kma.go.kr) 회원가입 (일반국민은 자동승인, 휴대폰 인증 필요)
2. 예특보 메뉴에서 아래 API마다 **활용신청**
   - 단기예보 → 동네예보 조회(`VilageFcstInfoService_2.0`): 초단기실황, 초단기예보, 단기예보
   - 중기예보 → 1.3 중기 육상예보(`fct_afs_wl`), 1.4 중기 기온예보(`fct_afs_wc`)
3. 마이페이지의 **인증키(authKey)**를 `.env`의 `KMA_AUTH_KEY`에 입력

인증키는 하나지만 API마다 활용신청이 따로 있어야 합니다. 신청하지 않은 API를 부르면 HTTP 403이 납니다.

## 사용 API

| 화면 | 오퍼레이션 | 발표 | 비고 |
|---|---|---|---|
| 현재 | `getUltraSrtNcst` 초단기실황 | 매시 정시, 40분 후 제공 | 기온·습도·바람·1시간 강수 |
| 현재(하늘) | `getUltraSrtFcst` 초단기예보 | 매시 30분, 45분 후 제공 | 실황에 없는 하늘상태(SKY) 보완 |
| 시간별 | `getVilageFcst` 단기예보 | 02·05·08·11·14·17·20·23시, 10분 후 제공 | 약 3일, 1시간 간격 |
| 날짜별 | `fct_afs_wl.php` 중기 육상예보 (typ01) | 06·18시 | 오전/오후(7일 이후 하루) 날씨, 강수확률 |
| 날짜별 | `fct_afs_wc.php` 중기 기온예보 (typ01) | 06·18시 | 일 최저·최고 |

- 단기예보는 5km 격자 좌표(nx, ny)가 필요합니다. 위경도는 `lib/kma.js`의 `latLonToGrid`(기상청 LCC 공식)로 변환합니다.
- 중기예보는 격자가 아닌 구역코드를 씁니다. 육상예보(광역, 예: `11B00000`)와 기온(도시, 예: `11B10101`)의 코드 체계가 달라서 `lib/regions.js`에 도시별로 둘 다 적어 두었습니다.
- 단기예보는 최신 발표분이 아직 없으면(`NO_DATA`, 03) 이전 발표분으로 자동 재시도합니다.
- 중기예보 typ01 API는 EUC-KR 쉼표 구분 텍스트로 응답하며, 발표시각을 생략하면 최신 발표분을 줍니다.
- API허브가 가끔 응답을 멈추므로 8초 시간 초과 시 한 번 더 시도합니다.
- 응답은 10분간 메모리에 캐시합니다 (API허브 일반회원 일일 20,000건 한도).

## GitHub Pages 배포

Pages는 정적 파일만 올라가므로, GitHub Actions(`.github/workflows/pages.yml`)가 30분마다(매시 17·47분 UTC) 기상청 데이터를 받아 `data/<도시>.json`을 만들고 화면과 함께 배포합니다. 인증키는 GitHub Secrets에만 둡니다.

1. 저장소 Settings → Secrets and variables → Actions → New repository secret
   - Name: `KMA_AUTH_KEY`, Secret: API허브 인증키
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**
3. Actions 탭 → "날씨 데이터 수집 및 Pages 배포" → Run workflow

주소: `https://<사용자>.github.io/weather/`

- 화면의 "수집" 시각은 데이터를 받은 시각입니다. GitHub의 예약 실행은 몇 분~수십 분 늦을 수 있습니다.
- 저장소에 60일간 활동이 없으면 GitHub가 예약 실행을 멈춥니다. Actions 탭에서 다시 켜면 됩니다.
- 21개 도시 × 5개 API = 1회 105건, 하루 약 5,000건 (일반회원 한도 20,000건)
- 로컬에서 정적 빌드만 해 보려면: `node --env-file=.env scripts/build-site.mjs`

## 구조

```
server.js          로컬 서버: 정적 파일 + data/*.json을 요청 시 생성
lib/kma.js         API 호출, 발표시각 계산, 격자 변환, 응답 정리
lib/data.js        도시별 화면 데이터(JSON) 생성
scripts/build-site.mjs  GitHub Pages용 정적 사이트 생성 (_site/)
.github/workflows/pages.yml  30분마다 수집·배포
lib/regions.js     도시 목록과 중기예보 구역코드
public/            화면 (index.html, style.css, app.js)
```

인증키는 서버에서만 쓰고 브라우저로 보내지 않습니다.

## 도시 추가

`lib/regions.js`에 `{ id, name, lat, lon, midLand, midTa }`를 추가합니다. `id`는 영문 소문자(데이터 파일명)입니다. 구역코드는 중기예보 조회서비스 활용가이드의 구역코드표(xlsx)에서 찾을 수 있습니다.
