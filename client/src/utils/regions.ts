// 장소 투표 선택지: 전국 17개 시·도 (서버 lib/regions.js 와 같은 값)
// mapId: @svg-maps/south-korea 의 지역 id
export const REGIONS = [
  { name: '서울', mapId: 'seoul' },
  { name: '부산', mapId: 'busan' },
  { name: '대구', mapId: 'daegu' },
  { name: '인천', mapId: 'incheon' },
  { name: '광주', mapId: 'gwangju' },
  { name: '대전', mapId: 'daejeon' },
  { name: '울산', mapId: 'ulsan' },
  { name: '세종', mapId: 'sejong' },
  { name: '경기', mapId: 'gyeonggi' },
  { name: '강원', mapId: 'gangwon' },
  { name: '충북', mapId: 'north-chungcheong' },
  { name: '충남', mapId: 'south-chungcheong' },
  { name: '전북', mapId: 'north-jeolla' },
  { name: '전남', mapId: 'south-jeolla' },
  { name: '경북', mapId: 'north-gyeongsang' },
  { name: '경남', mapId: 'south-gyeongsang' },
  { name: '제주', mapId: 'jeju' },
] as const

export type RegionName = (typeof REGIONS)[number]['name']

export const regionNameByMapId = new Map<string, RegionName>(REGIONS.map((region) => [region.mapId, region.name]))
