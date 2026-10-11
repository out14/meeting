// 일정 길이: 당일치기 / n박 n+1일
export function scheduleLength(startDate: string, endDate: string) {
  const nights = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000)
  return nights === 0 ? '당일치기' : `${nights}박 ${nights + 1}일`
}
