import 'dotenv/config'
import app from './app.js'
import db from './db/db.js'
import { settleExpiredMeetings } from './lib/meetingFlow.js'

const PORT = Number(process.env.PORT ?? 4000)

try {
  await db.query('SELECT 1')
  console.log('DB 연결 성공!')
} catch (error) {
  console.error('DB 연결 실패: `yarn db:init` 으로 DB 를 먼저 만들어 주세요.', error.message)
}

// 투표 마감이 지난 모임을 1분마다 정리한다 (조회할 때도 정리하므로 보조 수단)
setInterval(() => {
  settleExpiredMeetings().catch((error) => console.error('투표 마감 처리 실패:', error.message))
}, 60 * 1000)

app.listen(PORT, () => {
  console.log(`Server Running : http://localhost:${PORT}`)
})
