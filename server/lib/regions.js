// 장소 투표 선택지: 전국 17개 시·도 (이 이름이 투표 값이다)
export const REGIONS = [
  '서울',
  '부산',
  '대구',
  '인천',
  '광주',
  '대전',
  '울산',
  '세종',
  '경기',
  '강원',
  '충북',
  '충남',
  '전북',
  '전남',
  '경북',
  '경남',
  '제주',
]

export const isRegion = (value) => REGIONS.includes(value)
