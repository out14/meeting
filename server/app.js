import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import adminRouter from './routes/admin.js'
import meetingsRouter from './routes/meetings.js'
import usersRouter from './routes/users.js'
import { loadUser } from './lib/userAuth.js'

const app = express()

// 프록시(Nginx, 클라우드 로드밸런서 등) 뒤에서 실행하면 TRUST_PROXY 에 프록시 단계 수를 넣는다 (보통 1)
// 그래야 req.ip 가 실제 사용자 IP 가 되어 로그인 시도 제한이 사용자별로 동작한다
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY)

// 보안 헤더 (클릭재킹·MIME 스니핑 방지, HTTPS 강제 등)
app.use(helmet())
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json({ limit: '20kb' }))

app.use('/api', loadUser)

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/api/admin', adminRouter)
app.use('/api/users', usersRouter)
app.use('/api/meetings', meetingsRouter)

app.use('/api', (_req, res) => {
  res.status(404).json({ message: '존재하지 않는 API입니다.' })
})

// Express 5 는 async 핸들러의 에러도 여기로 넘겨준다
app.use((error, _req, res, _next) => {
  if (error.status && error.status < 500) {
    return res.status(error.status).json({ message: error.message })
  }
  console.error(error)
  res.status(500).json({ message: '서버 오류가 발생했습니다.' })
})

export default app
