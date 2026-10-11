import express from 'express'
import cors from 'cors'
import adminRouter from './routes/admin.js'
import meetingsRouter from './routes/meetings.js'
import usersRouter from './routes/users.js'
import { loadUser } from './lib/userAuth.js'

const app = express()

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json())

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
