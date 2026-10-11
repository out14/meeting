export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// 문자열 필드 검증: 앞뒤 공백 제거 후 길이 체크
export function requireText(value, field, maxLength) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new HttpError(400, `${field}을(를) 입력해 주세요.`)
  if (text.length > maxLength) throw new HttpError(400, `${field}은(는) ${maxLength}자 이하로 입력해 주세요.`)
  return text
}
