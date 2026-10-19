// 주요 도시 목록. id: 데이터 파일명(data/<id>.json), midLand: 중기육상예보 구역, midTa: 중기기온예보 지점
// 코드 출처: 기상청 중기예보 조회서비스 활용가이드 (구역코드표)
export const CITIES = [
  { id: 'seoul', name: '서울', lat: 37.5665, lon: 126.978, midLand: '11B00000', midTa: '11B10101' },
  { id: 'incheon', name: '인천', lat: 37.4563, lon: 126.7052, midLand: '11B00000', midTa: '11B20201' },
  { id: 'suwon', name: '수원', lat: 37.2636, lon: 127.0286, midLand: '11B00000', midTa: '11B20601' },
  { id: 'chuncheon', name: '춘천', lat: 37.8813, lon: 127.7298, midLand: '11D10000', midTa: '11D10301' },
  { id: 'wonju', name: '원주', lat: 37.3422, lon: 127.9202, midLand: '11D10000', midTa: '11D10401' },
  { id: 'gangneung', name: '강릉', lat: 37.7519, lon: 128.8761, midLand: '11D20000', midTa: '11D20501' },
  { id: 'daejeon', name: '대전', lat: 36.3504, lon: 127.3845, midLand: '11C20000', midTa: '11C20401' },
  { id: 'sejong', name: '세종', lat: 36.48, lon: 127.289, midLand: '11C20000', midTa: '11C20404' },
  { id: 'cheongju', name: '청주', lat: 36.6424, lon: 127.489, midLand: '11C10000', midTa: '11C10301' },
  { id: 'jeonju', name: '전주', lat: 35.8242, lon: 127.148, midLand: '11F10000', midTa: '11F10201' },
  { id: 'gwangju', name: '광주', lat: 35.1595, lon: 126.8526, midLand: '11F20000', midTa: '11F20501' },
  { id: 'mokpo', name: '목포', lat: 34.8118, lon: 126.3922, midLand: '11F20000', midTa: '21F20801' },
  { id: 'yeosu', name: '여수', lat: 34.7604, lon: 127.6622, midLand: '11F20000', midTa: '11F20401' },
  { id: 'daegu', name: '대구', lat: 35.8714, lon: 128.6014, midLand: '11H10000', midTa: '11H10701' },
  { id: 'andong', name: '안동', lat: 36.5684, lon: 128.7294, midLand: '11H10000', midTa: '11H10501' },
  { id: 'pohang', name: '포항', lat: 36.019, lon: 129.3435, midLand: '11H10000', midTa: '11H10201' },
  { id: 'busan', name: '부산', lat: 35.1796, lon: 129.0756, midLand: '11H20000', midTa: '11H20201' },
  { id: 'ulsan', name: '울산', lat: 35.5384, lon: 129.3114, midLand: '11H20000', midTa: '11H20101' },
  { id: 'changwon', name: '창원', lat: 35.228, lon: 128.6811, midLand: '11H20000', midTa: '11H20301' },
  { id: 'jeju', name: '제주', lat: 33.4996, lon: 126.5312, midLand: '11G00000', midTa: '11G00201' },
  { id: 'seogwipo', name: '서귀포', lat: 33.2541, lon: 126.56, midLand: '11G00000', midTa: '11G00401' },
];

export function findCity(id) {
  return CITIES.find((c) => c.id === id);
}
