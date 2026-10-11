import { createBrowserRouter } from 'react-router-dom'
import { RootLayout } from '@src/layouts/RootLayout'
import { AdminLoginPage } from '@src/pages/admin/AdminLoginPage'
import { AdminMeetingsPage } from '@src/pages/admin/AdminMeetingsPage'
import { AdminUsersPage } from '@src/pages/admin/AdminUsersPage'
import { FindPasswordPage } from '@src/pages/auth/FindPasswordPage'
import { LoginPage } from '@src/pages/auth/LoginPage'
import { ResetPasswordPage } from '@src/pages/auth/ResetPasswordPage'
import { SignupPage } from '@src/pages/auth/SignupPage'
import { HomePage } from '@src/pages/HomePage'
import { CreateMeetingPage } from '@src/pages/meeting/CreateMeetingPage'
import { MeetingPage } from '@src/pages/meeting/MeetingPage'
import { MyPage } from '@src/pages/mypage/MyPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'signup', element: <SignupPage /> },
      { path: 'find-password', element: <FindPasswordPage /> },
      { path: 'find-password/reset', element: <ResetPasswordPage /> },
      { path: 'mypage', element: <MyPage /> },
      { path: 'admin/login', element: <AdminLoginPage /> },
      { path: 'admin/users', element: <AdminUsersPage /> },
      { path: 'admin/meetings', element: <AdminMeetingsPage /> },
      { path: 'meetings/new', element: <CreateMeetingPage /> },
      { path: 'm/:code', element: <MeetingPage /> },
    ],
  },
])
