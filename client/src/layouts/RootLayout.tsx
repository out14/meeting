import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAdmin, useAdminLogout } from '@src/api/hooks/useAdmin'
import { useSessionExpiry } from '@src/api/hooks/useSessionExpiry'
import { useLogout, useUser } from '@src/api/hooks/useUser'
import { Button } from '@src/components/Button'
import { withRedirect } from '@src/pages/auth/redirect'
// 헤더용 로고: 누끼(logo-cutout.png)를 줄인 것 (원본: logo.png)
import logo from '@src/assets/images/logo-header.png'

export function RootLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: admin } = useAdmin()
  const { data: user } = useUser()
  const adminLogout = useAdminLogout()
  const logout = useLogout()
  useSessionExpiry(!!user, !!admin)

  // 로그인 후 지금 보던 화면(초대 링크 등)으로 돌아온다
  const isAuthPage = ['/login', '/signup', '/find-password', '/find-password/reset', '/admin/login'].includes(location.pathname)
  const here = isAuthPage ? '/' : location.pathname

  // 로그아웃은 관리자/회원 로그인을 모두 끝낸다
  const handleLogout = async () => {
    adminLogout()
    await logout()
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>
          <Link to="/" className="app-logo">
            <img src={logo} alt="" className="app-logo-image" />
            요정 정모
          </Link>
        </h1>
        {/* 버튼 노출은 편의용. 권한은 서버가 토큰으로 검증한다 */}
        <div className="app-header-actions">
          {admin || user ? (
            <>
              {/* 로그인한 사람은 버튼들 왼쪽에 보여준다 */}
              {user ? (
                <Link className="app-header-user" to="/mypage" title="마이페이지">
                  {user.nickname} 님
                </Link>
              ) : (
                <span className="app-header-user">관리자 님</span>
              )}
              <Button className="btn-sm" onClick={() => navigate('/meetings/new')}>
                모임 생성
              </Button>
              {admin && (
                <>
                  <Button className="btn-sm" variant="secondary" onClick={() => navigate('/admin/meetings')}>
                    모임 관리
                  </Button>
                  <Button className="btn-sm" variant="secondary" onClick={() => navigate('/admin/users')}>
                    회원 관리
                  </Button>
                </>
              )}
              {user && (
                <Button className="btn-sm" variant="secondary" onClick={() => navigate('/mypage')}>
                  마이페이지
                </Button>
              )}
              <Button className="btn-sm" variant="secondary" onClick={handleLogout}>
                로그아웃
              </Button>
            </>
          ) : (
            <>
              <Button className="btn-sm" onClick={() => navigate(withRedirect('/login', here))}>
                로그인
              </Button>
              <Button className="btn-sm" variant="secondary" onClick={() => navigate(withRedirect('/signup', here))}>
                회원가입
              </Button>
              <Button className="btn-sm btn-ghost" variant="secondary" onClick={() => navigate('/admin/login')}>
                관리자
              </Button>
            </>
          )}
        </div>
      </header>
      {user?.mustChangePassword && location.pathname !== '/mypage' && (
        <div className="notice notice-bar">
          임시 비밀번호로 로그인했어요.{' '}
          <Link className="link" to="/mypage">
            마이페이지에서 비밀번호를 바꿔 주세요
          </Link>
        </div>
      )}
      <main className="app-content">
        <Outlet />
      </main>
      {/* 지도 데이터 라이선스(CC BY 4.0) 출처 표시 */}
      <footer className="app-footer">
        지도 데이터:{' '}
        <a href="https://github.com/VictorCazanave/svg-maps" target="_blank" rel="noreferrer">
          svg-maps
        </a>{' '}
        (CC BY 4.0)
      </footer>
    </div>
  )
}
