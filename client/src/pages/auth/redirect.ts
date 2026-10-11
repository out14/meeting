// 로그인/회원가입 후 돌아갈 경로 (?redirect=/m/abc). 외부 주소로는 보내지 않는다
export function readRedirect(params: URLSearchParams) {
  const path = params.get('redirect')
  return path?.startsWith('/') && !path.startsWith('//') ? path : '/'
}

export const withRedirect = (to: string, redirect: string) =>
  redirect === '/' ? to : `${to}?redirect=${encodeURIComponent(redirect)}`
