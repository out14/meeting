import nodemailer from 'nodemailer'

// 메일 발송. SMTP_HOST 가 있으면 SMTP 로 보내고, 없으면(개발·테스트) 실제로 보내지 않고 서버 로그에 남긴다
// 보낸 메일은 개발·테스트에서 확인할 수 있게 outbox 에도 쌓는다 (최근 20통)
export const outbox = []

let transport = null
const getTransport = () => {
  if (!process.env.SMTP_HOST) return null
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    // 465 는 처음부터 TLS, 587 은 STARTTLS
    secure: Number(process.env.SMTP_PORT) === 465,
    // Gmail 앱 비밀번호는 'abcd efgh ijkl mnop' 처럼 띄워 보여주므로 공백은 지운다
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER.trim(), pass: (process.env.SMTP_PASS ?? '').replace(/\s/g, '') }
      : undefined,
  })
  return transport
}

export async function sendMail({ to, subject, text, html }) {
  outbox.push({ to, subject, text })
  if (outbox.length > 20) outbox.shift()

  const smtp = getTransport()
  if (!smtp) {
    if (process.env.NODE_ENV !== 'test') console.log(`[메일 미발송: SMTP 설정 없음] to=${to} subject=${subject}\n${text}`)
    return
  }
  await smtp.sendMail({ from: process.env.MAIL_FROM ?? process.env.SMTP_USER, to, subject, text, html })
}
