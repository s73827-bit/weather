# CLAUDE.md

기상청 API허브 데이터로 실시간·단기·중기 날씨를 보여주는 대시보드. 로컬(`npm start`)과 GitHub Pages(https://s73827-bit.github.io/weather/) 두 곳에서 같은 화면을 쓴다.

## 작업 원칙

[andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)의 4원칙을 이 프로젝트에 맞게 줄인 것. 오타 수정 같은 사소한 작업에는 판단껏 적용한다.

1. **코딩 전에 생각하기**: 가정을 말하고, 해석이 여러 개면 고르지 말고 물어본다. 더 단순한 방법이 있으면 먼저 제안한다.
2. **단순하게**: 요청한 것만 만든다. 한 번 쓰는 추상화, 쓰지 않을 설정 옵션, 일어날 수 없는 경우의 예외 처리는 넣지 않는다. 외부 패키지 없이 Node 내장 모듈만 쓰는 현재 방식을 유지한다.
3. **필요한 곳만 고치기**: 바꾼 모든 줄이 요청과 연결되어야 한다. 주변 코드 스타일(2칸 들여쓰기, 작은따옴표, 한국어 주석)을 따르고, 관련 없는 코드는 고치지 말고 알려만 준다.
4. **검증 가능한 목표로**: "고쳤다"가 아니라 아래 검증 방법으로 확인한 결과를 보고한다. 확인하지 못한 것은 확인하지 못했다고 말한다.

## 구조

```
server.js                    로컬 서버: public/ 정적 파일 + data/*.json을 요청 시 생성
lib/kma.js                   API허브 호출, 발표시각 계산, 격자 변환, 응답 정리
lib/data.js                  도시별 화면 JSON 생성 (server.js와 build-site.mjs가 공유)
lib/regions.js               도시 목록: id, 위경도, 중기 구역코드
scripts/build-site.mjs       Pages용 정적 사이트(_site/) 생성
.github/workflows/pages.yml  30분마다 수집·배포
public/                      화면 (index.html, style.css, app.js)
```

화면(`app.js`)은 항상 상대 경로 `data/<id>.json`을 읽는다. 로컬에서는 server.js가 그 경로를 만들어 응답하고, Pages에서는 Actions가 미리 파일로 만든다. Pages는 `/weather/` 하위 경로이므로 화면 코드에 `/`로 시작하는 절대 경로를 쓰지 않는다.

## 기상청 API허브 (apihub.kma.go.kr)

공공데이터포털(data.go.kr)이 아니라 API허브를 쓴다. 키 파라미터는 `authKey`이다.

| 용도 | API | 형식 |
|---|---|---|
| 현재 | typ02 `VilageFcstInfoService_2.0/getUltraSrtNcst`, `getUltraSrtFcst` | JSON |
| 시간별 | typ02 `VilageFcstInfoService_2.0/getVilageFcst` | JSON |
| 날짜별(4~10일) | typ01 `fct_afs_wl.php`(육상), `fct_afs_wc.php`(기온) | EUC-KR 쉼표 텍스트 |

- API마다 활용신청이 따로 필요하다. 신청하지 않은 API는 HTTP 403 "활용신청이 필요한 API"가 난다. 새 API를 쓰기 전에 사용자에게 신청 여부를 확인한다.
- typ02 중기예보(`MidFcstInfoService`)는 신청되어 있지 않다. 중기는 typ01을 쓴다.
- typ01은 정상 응답이 EUC-KR, 오류 응답이 UTF-8 JSON이다.
- 단기는 5km 격자(nx, ny), 중기는 구역코드를 쓴다. 중기 육상(광역, `11B00000`)과 기온(도시, `11B10101`)은 코드 체계가 다르다.
- 오류 코드: 401 키 오류, 403 미신청, 단기 resultCode `03` 아직 미발표(이전 발표분으로 재시도).
- API허브는 가끔 응답이 늦다. 기본 8초 제한(`KMA_TIMEOUT_MS`), Actions에서는 30초.
- 일반회원 한도는 하루 20,000건. 현재 Actions가 하루 약 5,000건을 쓴다. 수집 주기나 도시를 늘릴 때 계산해 본다.

## 인증키

- 로컬: `.env`의 `KMA_AUTH_KEY` (git 제외). Pages: GitHub Secret `KMA_AUTH_KEY`.
- 키 값을 코드, 커밋, 로그, Actions 출력에 남기지 않는다. 커밋 전에 키 문자열이 없는지 grep으로 확인한다.

## 검증 방법

```bash
npm run dev                                  # http://localhost:3000 (코드 수정 시 자동 재시작)
curl -s localhost:3000/data/seoul.json       # now / short / mid 각각 data 또는 error
node --env-file=.env scripts/build-site.mjs  # 21개 도시 모두 OK인지
node --check <파일>                          # 문법 확인
```

- 화면을 바꿨으면 Playwright로 데스크톱(1100px)과 모바일(390px)을 캡처해서 직접 본다. 데이터가 비동기로 오므로 "수집" 문구가 뜰 때까지 기다린 뒤 찍는다.
- 배포 결과는 GitHub API로 확인한다(`/repos/s73827-bit/weather/actions/runs`). 실행 로그는 로그인이 필요하므로, 실패 원인은 `::error::` 주석(check-runs annotations)으로 남겨서 읽는다.
- 도시나 구역코드를 바꿨으면 21개 도시 전체를 실제로 호출해서 확인한다.

## 커밋

- 커밋 메시지는 한국어로, 무엇을 왜 바꿨는지 쓴다.
- `main`에 push하면 Pages가 바로 재배포된다.
