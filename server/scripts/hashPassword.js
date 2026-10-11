// 관리자 비밀번호 해시 생성: yarn workspace server admin:hash <비밀번호>
// 출력값을 .env 의 ADMIN_PASSWORD_HASH 에 넣는다
import { hashPassword } from '../lib/password.js'

const password = process.argv[2]
if (!password) {
  console.error('사용법: yarn workspace server admin:hash <비밀번호>')
  process.exit(1)
}
console.log(hashPassword(password))
