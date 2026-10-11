// `yarn test` 로 실행 (meeting_test DB 를 새로 만든 뒤 실행된다)
import 'dotenv/config'
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import app from '../app.js'
import db from '../db/db.js'
import { hashPassword } from '../lib/password.js'

// 테스트용 관리자 계정/서명 키: .env 대신 여기서 고정한다
const ADMIN_PASSWORD = 'test-password'
process.env.ADMIN_USERNAME = 'admin'
process.env.ADMIN_PASSWORD_HASH = hashPassword(ADMIN_PASSWORD)
process.env.TOKEN_SECRET = 'test-secret'

let server
let baseUrl
let adminToken
let userSeq = 0

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://localhost:${server.address().port}/api`
  adminToken = (await api('POST', '/admin/login', { body: { username: 'admin', password: ADMIN_PASSWORD } })).data.token
})

after(async () => {
  server.close()
  await db.end()
})

// token = 참여자 토큰(모임장), user = 회원 토큰, admin = 관리자 토큰
async function api(method, path, { body, token, user, admin } = {}) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'X-Member-Token': token }),
      ...(user && { 'X-User-Token': user }),
      ...(admin && { Authorization: `Bearer ${admin}` }),
    },
    body: body && JSON.stringify(body),
  })
  return { status: res.status, data: await res.json() }
}

async function signup(nickname = '영희') {
  userSeq += 1
  const { data } = await api('POST', '/users', {
    body: { username: `user_${userSeq}`, name: `회원${userSeq}`, nickname, email: `user${userSeq}@test.com`, password: 'secret12' },
  })
  return data.token
}

const inDays = (days) => new Date(Date.now() + days * 86_400_000).toISOString()

const meetingBody = (extra = {}) => ({
  title: '연말 정모',
  name: '김철수',
  nickname: '철수',
  startDate: '2026-12-18',
  endDate: '2026-12-20',
  voteDeadline: inDays(7),
  ...extra,
})

// 투표 마감이 지난 것처럼 만든다
const expireDeadline = (code) =>
  db.query('UPDATE meetings SET vote_deadline = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE code = ?', [code])

async function setupMeeting() {
  const created = await api('POST', '/meetings', { body: meetingBody(), admin: adminToken })
  const { code, token: host } = created.data
  const member = await signup()
  await api('POST', `/meetings/${code}/members`, { user: member })
  return { code, host, member }
}

describe('관리자 / 모임 생성 권한', () => {
  const body = meetingBody({ title: '몰래 만든 모임' })

  test('잘못된 아이디/비밀번호로는 로그인할 수 없다', async () => {
    assert.equal((await api('POST', '/admin/login', { body: { username: 'admin', password: 'wrong' } })).status, 401)
    assert.equal((await api('POST', '/admin/login', { body: { username: 'other', password: ADMIN_PASSWORD } })).status, 401)
    assert.equal((await api('POST', '/admin/login', { body: {} })).status, 401)
  })

  test('관리자 토큰으로 본인 확인', async () => {
    const { status, data } = await api('GET', '/admin/me', { admin: adminToken })
    assert.equal(status, 200)
    assert.equal(data.username, 'admin')
    assert.equal((await api('GET', '/admin/me')).status, 401)
  })

  test('로그인하지 않으면 모임을 만들 수 없다', async () => {
    const { host, member } = await setupMeeting()
    assert.equal((await api('POST', '/meetings', { body })).status, 401)
    // 모임장 참여자 토큰은 로그인이 아니고, 회원 토큰은 관리자 토큰으로 쓸 수 없다
    assert.equal((await api('POST', '/meetings', { body, token: host })).status, 401)
    assert.equal((await api('POST', '/meetings', { body, admin: host })).status, 401)
    assert.equal((await api('POST', '/meetings', { body, admin: member })).status, 401)
  })

  test('회원도 모임을 만들 수 있고, 회원 계정이 모임장이 된다', async () => {
    const owner = await signup('주최자')
    const created = await api('POST', '/meetings', { body: meetingBody({ name: '무시됨', nickname: '무시됨' }), user: owner })
    assert.equal(created.status, 201)
    assert.equal(created.data.token, null)
    const { code } = created.data

    const { data } = await api('GET', `/meetings/${code}`, { user: owner })
    assert.equal(data.me.role, 'HOST')
    assert.equal(data.me.nickname, '주최자')

    // 회원 모임장도 날짜를 확정할 수 있다
    const [option] = (await api('GET', `/meetings/${code}/polls/date`)).data.options
    assert.equal((await api('POST', `/meetings/${code}/polls/date/confirm`, { body: { startDate: option.date }, user: owner })).status, 200)
  })

  test('위조되거나 만료된 관리자 토큰은 거부한다', async () => {
    const [payload, signature] = adminToken.split('.')
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const forged = encode({ typ: 'admin', sub: 'admin', exp: Date.now() + 1e9 })
    const expired = encode({ typ: 'admin', sub: 'admin', exp: Date.now() - 1000 })
    assert.equal((await api('POST', '/meetings', { body, admin: `${forged}.${signature}` })).status, 401)
    assert.equal((await api('POST', '/meetings', { body, admin: `${expired}.${signature}` })).status, 401)
    assert.equal((await api('POST', '/meetings', { body, admin: `${payload}.bad` })).status, 401)
  })
})

describe('모임 삭제', () => {
  // 삭제 후: 상세 404, 캘린더 목록·모임 관리 목록·마이페이지에서 사라지고 투표 기록도 지워진다
  async function assertDeleted(code, optionId, user) {
    assert.equal((await api('GET', `/meetings/${code}`)).status, 404)
    assert.equal((await api('GET', '/meetings')).data.some((item) => item.code === code), false)
    const managed = (await api('GET', '/admin/meetings', { admin: adminToken })).data
    assert.equal(managed.some((item) => item.code === code), false)
    const mine = (await api('GET', '/users/me/meetings', { user })).data
    assert.equal([...mine.hosted, ...mine.voted].some((item) => item.code === code), false)
    const [[{ votes }]] = await db.query('SELECT COUNT(*) AS votes FROM votes WHERE option_id = ?', [optionId])
    assert.equal(votes, 0)
  }

  test('관리자는 모든 모임을 삭제할 수 있고, 투표 기록까지 함께 지워진다', async () => {
    const { code, member } = await setupMeeting()
    const [option] = (await api('GET', `/meetings/${code}/polls/date`)).data.options
    await api('PUT', `/meetings/${code}/polls/date/votes`, { body: { optionIds: [option.id] }, user: member })

    // 비로그인, 일반 참여자는 삭제할 수 없다
    assert.equal((await api('DELETE', `/meetings/${code}`)).status, 401)
    assert.equal((await api('DELETE', `/meetings/${code}`, { user: member })).status, 403)

    assert.equal((await api('DELETE', `/meetings/${code}`, { admin: adminToken })).status, 200)
    await assertDeleted(code, option.id, member)
    assert.equal((await api('DELETE', `/meetings/${code}`, { admin: adminToken })).status, 404)
  })

  test('모임장은 자기 모임을 삭제할 수 있다 (회원 모임장 / 관리자가 만든 모임장 토큰)', async () => {
    // 회원이 만든 모임: 회원 계정이 모임장
    const hostUser = await signup('모임장')
    const created = await api('POST', '/meetings', { body: meetingBody(), user: hostUser })
    const { code } = created.data
    const member = await signup()
    await api('POST', `/meetings/${code}/members`, { user: member })
    const [option] = (await api('GET', `/meetings/${code}/polls/date`)).data.options
    await api('PUT', `/meetings/${code}/polls/date/votes`, { body: { optionIds: [option.id] }, user: member })

    // 다른 모임의 모임장은 삭제할 수 없다
    const other = await setupMeeting()
    assert.equal((await api('DELETE', `/meetings/${code}`, { token: other.host })).status, 401)
    assert.equal((await api('DELETE', `/meetings/${code}`, { user: member })).status, 403)

    assert.equal((await api('DELETE', `/meetings/${code}`, { user: hostUser })).status, 200)
    await assertDeleted(code, option.id, hostUser)

    // 관리자가 만든 모임: 모임장 참여자 토큰으로 삭제
    assert.equal((await api('DELETE', `/meetings/${other.code}`, { token: other.host })).status, 200)
    assert.equal((await api('GET', `/meetings/${other.code}`)).status, 404)
  })
})

describe('모임 관리 (관리자)', () => {
  test('관리자만 모든 모임의 진행 현황을 볼 수 있다', async () => {
    const { code, host, member } = await setupMeeting()
    const [option] = (await api('GET', `/meetings/${code}/polls/date`)).data.options
    await api('PUT', `/meetings/${code}/polls/date/votes`, { body: { optionIds: [option.id] }, user: member })

    assert.equal((await api('GET', '/admin/meetings')).status, 401)
    assert.equal((await api('GET', '/admin/meetings', { user: member })).status, 401)
    assert.equal((await api('GET', '/admin/meetings', { token: host })).status, 401)

    let { status, data } = await api('GET', '/admin/meetings', { admin: adminToken })
    assert.equal(status, 200)
    let row = data.find((item) => item.code === code)
    assert.equal(row.stage, 'VOTE')
    assert.equal(row.hostNickname, '철수')
    assert.equal(row.hostUsername, null)
    assert.equal(row.memberCount, 2)
    // 모임장(생성 시 자동 투표) + 참여자
    assert.equal(row.dateVoterCount, 2)
    assert.equal(row.placeVoterCount, 0)
    assert.equal(row.scheduleStart, null)
    assert.equal(row.place, null)

    // 마감이 지난 모임은 조회할 때 자동 확정된다
    await expireDeadline(code)
    ;({ data } = await api('GET', '/admin/meetings', { admin: adminToken }))
    row = data.find((item) => item.code === code)
    assert.equal(row.stage, 'PLACE')
    assert.equal(row.scheduleStart, option.date)
  })

  test('관리자는 선택한 모임을 한 번에 삭제할 수 있다', async () => {
    const first = await setupMeeting()
    const second = await setupMeeting()
    const keep = await setupMeeting()
    const bulkDelete = (codes, opts) => api('POST', '/admin/meetings/delete', { body: { codes }, ...opts })

    assert.equal((await bulkDelete([first.code], { token: first.host })).status, 401)
    assert.equal((await bulkDelete([first.code], { user: first.member })).status, 401)
    assert.equal((await bulkDelete([], { admin: adminToken })).status, 400)
    assert.equal((await bulkDelete('abc', { admin: adminToken })).status, 400)

    const { status, data } = await bulkDelete([first.code, second.code, 'no-such-code'], { admin: adminToken })
    assert.equal(status, 200)
    assert.equal(data.deleted, 2)
    const codes = (await api('GET', '/meetings')).data.map((item) => item.code)
    assert.equal(codes.includes(first.code), false)
    assert.equal(codes.includes(second.code), false)
    assert.equal(codes.includes(keep.code), true)
  })
})

describe('회원', () => {
  test('회원가입 후 로그인, 내 정보 조회', async () => {
    const signed = await api('POST', '/users', {
      body: { username: 'Gildong_01', name: '홍길동', nickname: '길동', email: 'Gildong@Test.com', password: 'qw1212' },
    })
    assert.equal(signed.status, 201)
    assert.equal(signed.data.user.username, 'gildong_01')
    assert.equal(signed.data.user.email, 'gildong@test.com')
    assert.equal(signed.data.user.password_hash, undefined)

    const login = await api('POST', '/users/login', { body: { username: 'gildong_01', password: 'qw1212' } })
    assert.equal(login.status, 200)
    const me = await api('GET', '/users/me', { user: login.data.token })
    assert.deepEqual([me.data.name, me.data.nickname], ['홍길동', '길동'])
  })

  test('아이디/이메일 중복은 409, 형식 오류는 400', async () => {
    const body = { username: 'dup_user', name: '가', nickname: '나', email: 'dup@test.com', password: 'secret12' }
    assert.equal((await api('POST', '/users', { body })).status, 201)
    const dupId = await api('POST', '/users', { body: { ...body, email: 'other@test.com' } })
    assert.deepEqual([dupId.status, dupId.data.message], [409, '이미 사용 중인 아이디입니다.'])
    const dupEmail = await api('POST', '/users', { body: { ...body, username: 'dup_user2', email: 'DUP@test.com' } })
    assert.deepEqual([dupEmail.status, dupEmail.data.message], [409, '이미 가입된 이메일입니다.'])
    assert.equal((await api('POST', '/users', { body: { ...body, username: 'no_email', email: undefined } })).status, 400)
    assert.equal((await api('POST', '/users', { body: { ...body, username: 'bad_email', email: 'not-an-email' } })).status, 400)
    assert.equal((await api('POST', '/users', { body: { ...body, username: 'ab' } })).status, 400)
    assert.equal((await api('POST', '/users', { body: { ...body, username: 'new_user', password: '123' } })).status, 400)
    assert.equal((await api('POST', '/users', { body: { ...body, username: 'new_user2', nickname: ' ' } })).status, 400)
  })

  test('비밀번호가 틀리면 401, 회원 토큰 없이 내 정보는 401', async () => {
    await api('POST', '/users', { body: { username: 'wrong_pw', name: '가', nickname: '나', email: 'wrong_pw@test.com', password: 'secret12' } })
    assert.equal((await api('POST', '/users/login', { body: { username: 'wrong_pw', password: 'nope' } })).status, 401)
    assert.equal((await api('GET', '/users/me')).status, 401)
    // 관리자 토큰은 회원 토큰으로 쓸 수 없다
    assert.equal((await api('GET', '/users/me', { user: adminToken })).status, 401)
  })
})

describe('비밀번호 변경 / 재설정', () => {
  async function signupAs(username, password = 'secret12') {
    const { data } = await api('POST', '/users', {
      body: { username, name: '이름', nickname: username, email: `${username}@test.com`, password },
    })
    return data
  }

  test('현재 비밀번호를 확인하고 변경하면, 이전 로그인은 끊기고 새 토큰을 받는다', async () => {
    const { token: oldToken, user } = await signupAs('change_pw')
    assert.equal(user.mustChangePassword, false)
    const change = (body, token = oldToken) => api('PUT', '/users/me/password', { body, user: token })

    assert.equal((await change({ currentPassword: 'wrong', newPassword: 'newpass12' })).status, 400)
    assert.equal((await change({ currentPassword: 'secret12', newPassword: '123' })).status, 400)
    assert.equal((await change({ currentPassword: 'secret12', newPassword: 'secret12' })).status, 400)
    assert.equal((await api('PUT', '/users/me/password', { body: { currentPassword: 'secret12', newPassword: 'newpass12' } })).status, 401)

    const changed = await change({ currentPassword: 'secret12', newPassword: 'newpass12' })
    assert.equal(changed.status, 200)
    assert.equal((await api('GET', '/users/me', { user: oldToken })).status, 401)
    assert.equal((await api('GET', '/users/me', { user: changed.data.token })).status, 200)
    assert.equal((await api('POST', '/users/login', { body: { username: 'change_pw', password: 'secret12' } })).status, 401)
    assert.equal((await api('POST', '/users/login', { body: { username: 'change_pw', password: 'newpass12' } })).status, 200)
  })

  test('관리자만 임시 비밀번호를 발급할 수 있고, 임시 비밀번호로 로그인하면 변경 안내 상태가 된다', async () => {
    const { token: oldToken, user } = await signupAs('forgot_pw')
    const reset = (opts) => api('POST', `/admin/users/${user.id}/reset-password`, opts)

    assert.equal((await reset({})).status, 401)
    assert.equal((await reset({ user: oldToken })).status, 401)
    assert.equal((await api('GET', '/admin/users', { user: oldToken })).status, 401)

    const list = await api('GET', '/admin/users', { admin: adminToken })
    const listed = list.data.find((item) => item.username === 'forgot_pw')
    assert.equal(listed.password_hash, undefined)

    const { status, data } = await reset({ admin: adminToken })
    assert.equal(status, 200)
    assert.equal(data.temporaryPassword.length, 10)
    // 기존 로그인은 끊긴다
    assert.equal((await api('GET', '/users/me', { user: oldToken })).status, 401)

    const login = await api('POST', '/users/login', { body: { username: 'forgot_pw', password: data.temporaryPassword } })
    assert.equal(login.status, 200)
    assert.equal(login.data.user.mustChangePassword, true)

    const changed = await api('PUT', '/users/me/password', {
      body: { currentPassword: data.temporaryPassword, newPassword: 'mynewpass' },
      user: login.data.token,
    })
    assert.equal(changed.data.user.mustChangePassword, false)
    assert.equal((await api('POST', '/admin/users/999999/reset-password', { admin: adminToken })).status, 404)
  })
})

describe('비밀번호 찾기 (이름 + 이메일)', () => {
  const verify = (body) => api('POST', '/users/password-reset/verify', { body })
  const reset = (body) => api('POST', '/users/password-reset', { body })

  test('이름과 이메일이 맞으면 새 비밀번호로 바꾸고, 기존 로그인은 끊긴다', async () => {
    const { data: signed } = await api('POST', '/users', {
      body: { username: 'find_me', name: '찾는이', nickname: '찾기', email: 'find@test.com', password: 'oldpass1' },
    })
    assert.equal((await verify({ name: '다른이름', email: 'find@test.com' })).status, 400)
    assert.equal((await verify({ name: '찾는이', email: 'nobody@test.com' })).status, 400)
    assert.equal((await verify({ name: '찾는이' })).status, 400)

    const ok = await verify({ name: ' 찾는이 ', email: 'FIND@test.com' })
    assert.equal(ok.status, 200)
    assert.equal(ok.data.username, 'find_me')
    const { resetToken } = ok.data

    assert.equal((await reset({ resetToken, newPassword: '123' })).status, 400)
    assert.equal((await reset({ resetToken: 'forged.token', newPassword: 'newpass1' })).status, 400)
    // 로그인 토큰은 재설정 토큰으로 쓸 수 없다
    assert.equal((await reset({ resetToken: signed.token, newPassword: 'newpass1' })).status, 400)

    const done = await reset({ resetToken, newPassword: 'newpass1' })
    assert.equal(done.status, 200)
    assert.equal(done.data.user.username, 'find_me')
    assert.equal((await api('GET', '/users/me', { user: signed.token })).status, 401)
    assert.equal((await api('GET', '/users/me', { user: done.data.token })).status, 200)
    assert.equal((await api('POST', '/users/login', { body: { username: 'find_me', password: 'newpass1' } })).status, 200)

    // 같은 재설정 토큰은 한 번만 쓸 수 있다
    assert.equal((await reset({ resetToken, newPassword: 'another1' })).status, 400)
  })

  test('15분 안에 5번 틀리면 429', async () => {
    await api('POST', '/users', {
      body: { username: 'brute_me', name: '진짜', nickname: '무차별', email: 'brute@test.com', password: 'secret12' },
    })
    for (let i = 0; i < 5; i += 1) assert.equal((await verify({ name: `가짜${i}`, email: 'brute@test.com' })).status, 400)
    assert.equal((await verify({ name: '진짜', email: 'brute@test.com' })).status, 429)
  })
})

describe('마이페이지', () => {
  test('내가 개설한 모임과 내가 투표한 모임(내 선택 포함)을 돌려준다', async () => {
    const owner = await signup('개설자')
    const voter = await signup('투표자')
    const created = await api('POST', '/meetings', { body: meetingBody({ title: '내 모임' }), user: owner })
    const { code } = created.data
    await api('POST', `/meetings/${code}/members`, { user: voter })
    // 참여만 하고 투표하지 않은 모임
    const other = await setupMeeting()
    await api('POST', `/meetings/${other.code}/members`, { user: voter })

    const [fri, sat] = (await api('GET', `/meetings/${code}/polls/date`)).data.options
    await api('PUT', `/meetings/${code}/polls/date/votes`, { body: { optionIds: [fri.id, sat.id] }, user: voter })
    await api('POST', `/meetings/${code}/polls/date/confirm`, { body: { startDate: sat.date }, user: owner })

    const mine = (await api('GET', '/users/me/meetings', { user: owner })).data
    assert.deepEqual(mine.hosted.map((meeting) => meeting.title), ['내 모임'])
    assert.equal(mine.hosted[0].memberCount, 2)
    // 모임장은 만들 때 후보 날짜 전체에 자동 투표된다
    assert.deepEqual(mine.voted.map((meeting) => meeting.code), [code])
    assert.deepEqual(mine.voted[0].votes.date, [
      { label: '12/18 (금)', confirmed: false },
      { label: '12/19 (토)', confirmed: true },
      { label: '12/20 (일)', confirmed: false },
    ])

    const theirs = (await api('GET', '/users/me/meetings', { user: voter })).data
    assert.deepEqual(theirs.hosted, [])
    assert.deepEqual(theirs.voted.map((meeting) => meeting.code), [code])
    assert.deepEqual(theirs.voted[0].votes.date, [
      { label: '12/18 (금)', confirmed: false },
      { label: '12/19 (토)', confirmed: true },
    ])
    assert.equal((await api('GET', '/users/me/meetings')).status, 401)
  })
})

describe('모임 생성 / 참여', () => {
  test('모임장은 만들 때 후보 날짜 전체에 자동으로 투표된다 (회원 / 관리자가 만든 모임장 모두)', async () => {
    const owner = await signup('자동투표')
    const byUser = (await api('POST', '/meetings', { body: meetingBody(), user: owner })).data
    let poll = (await api('GET', `/meetings/${byUser.code}/polls/date`, { user: owner })).data
    assert.deepEqual(poll.options.map((option) => option.count), [1, 1, 1])
    assert.equal(poll.myOptionIds.length, 3)

    const byAdmin = (await api('POST', '/meetings', { body: meetingBody(), admin: adminToken })).data
    poll = (await api('GET', `/meetings/${byAdmin.code}/polls/date`, { token: byAdmin.token })).data
    assert.deepEqual(poll.options.map((option) => option.count), [1, 1, 1])
    assert.equal(poll.myOptionIds.length, 3)

    // 다른 사람이 보면 표 수만 보이고 내 선택은 없다
    poll = (await api('GET', `/meetings/${byUser.code}/polls/date`)).data
    assert.deepEqual(poll.myOptionIds, [])

    // 모임장이 투표를 바꾸면 후보 날짜가 그만큼으로 수정된다
    const [first] = poll.options
    await api('PUT', `/meetings/${byUser.code}/polls/date/votes`, { body: { optionIds: [first.id] }, user: owner })
    poll = (await api('GET', `/meetings/${byUser.code}/polls/date`, { user: owner })).data
    assert.deepEqual(poll.options.map((option) => [option.date, option.count]), [['2026-12-18', 1]])
  })

  test('모임을 만들면 초대 코드와 모임장 토큰을 받고, 후보 기간의 날짜가 모두 후보가 된다', async () => {
    const { code, host } = await setupMeeting()
    const { status, data } = await api('GET', `/meetings/${code}`, { token: host })
    assert.equal(status, 200)
    assert.equal(data.title, '연말 정모')
    assert.equal(data.stage, 'VOTE')
    assert.equal(data.me.role, 'HOST')
    assert.equal(data.members.length, 2)
    assert.deepEqual([data.candidateStart, data.candidateEnd], ['2026-12-18', '2026-12-20'])

    const poll = (await api('GET', `/meetings/${code}/polls/date`)).data
    assert.deepEqual(
      poll.options.map((option) => option.label),
      ['12/18 (금)', '12/19 (토)', '12/20 (일)'],
    )
  })

  test('필수값이 비어 있으면 400', async () => {
    const { status } = await api('POST', '/meetings', { body: meetingBody({ title: ' ' }), admin: adminToken })
    assert.equal(status, 400)
  })

  test('후보 기간이 잘못되면 400', async () => {
    const create = (extra) => api('POST', '/meetings', { body: meetingBody(extra), admin: adminToken })
    assert.equal((await create({ startDate: undefined })).status, 400)
    assert.equal((await create({ endDate: '2026-02-30' })).status, 400)
    assert.equal((await create({ startDate: '2026-12-20', endDate: '2026-12-18' })).status, 400)
    // 최대 31일
    assert.equal((await create({ startDate: '2026-12-01', endDate: '2027-01-01' })).status, 400)
    assert.equal((await create({ startDate: '2026-12-01', endDate: '2026-12-31' })).status, 201)
    // 하루짜리 기간도 가능
    assert.equal((await create({ startDate: '2026-12-24', endDate: '2026-12-24' })).status, 201)
  })

  test('잘못된 초대 링크는 404', async () => {
    const user = await signup()
    assert.equal((await api('GET', '/meetings/not-a-code')).status, 404)
    assert.equal((await api('POST', '/meetings/not-a-code/members', { user })).status, 404)
  })

  test('로그인하지 않으면 참여할 수 없다', async () => {
    const { code, host } = await setupMeeting()
    assert.equal((await api('POST', `/meetings/${code}/members`)).status, 401)
    // 모임장 참여자 토큰도 회원 로그인이 아니다
    assert.equal((await api('POST', `/meetings/${code}/members`, { token: host })).status, 401)
  })

  test('회원 정보로 일반 참여자로 등록되고, 다시 참여하면 409', async () => {
    const { code } = await setupMeeting()
    const user = await signup('민수')
    const joined = await api('POST', `/meetings/${code}/members`, { body: { role: 'HOST', nickname: '해커' }, user })
    assert.equal(joined.status, 201)

    const { data } = await api('GET', `/meetings/${code}`, { user })
    assert.equal(data.me.nickname, '민수')
    assert.equal(data.me.role, 'MEMBER')
    assert.equal((await api('POST', `/meetings/${code}/members`, { user })).status, 409)
  })

  test('같은 모임에서 닉네임 중복은 409', async () => {
    const { code } = await setupMeeting()
    const other = await signup('영희')
    assert.equal((await api('POST', `/meetings/${code}/members`, { user: other })).status, 409)
  })

  test('회원 토큰이 없거나 참여하지 않은 모임이면 me 는 null', async () => {
    const first = await setupMeeting()
    const second = await setupMeeting()
    assert.equal((await api('GET', `/meetings/${first.code}`)).data.me, null)
    assert.equal((await api('GET', `/meetings/${first.code}`, { token: second.host })).data.me, null)
    assert.equal((await api('GET', `/meetings/${first.code}`, { user: await signup() })).data.me, null)
  })

  test('후보 삭제 API 는 없다', async () => {
    const { code, host } = await setupMeeting()
    const [option] = (await api('GET', `/meetings/${code}/polls/date`)).data.options
    const { status } = await api('DELETE', `/meetings/${code}/polls/date/options/${option.id}`, { token: host })
    assert.equal(status, 404)
  })
})

describe('모임 목록', () => {
  test('누구나 전체 모임 목록과 확정 일정을 볼 수 있다', async () => {
    const { code, host } = await setupMeeting()
    const [, sat] = (await api('GET', `/meetings/${code}/polls/date`)).data.options
    await api('POST', `/meetings/${code}/polls/date/confirm`, { body: { startDate: sat.date, endDate: '2026-12-20' }, token: host })

    const { status, data } = await api('GET', '/meetings')
    assert.equal(status, 200)
    const meeting = data.find((item) => item.code === code)
    assert.equal(meeting.memberCount, 2)
    assert.equal(meeting.stage, 'PLACE')
    assert.ok(Date.parse(meeting.voteDeadline) > Date.now())
    assert.deepEqual([meeting.startDate, meeting.endDate], ['2026-12-19', '2026-12-20'])
    assert.deepEqual([meeting.candidateStart, meeting.candidateEnd], ['2026-12-18', '2026-12-20'])
  })
})

describe('날짜 투표', () => {
  test('복수 선택 투표, 변경, 집계', async () => {
    const { code, host, member } = await setupMeeting()
    const [, sat, sun] = (await api('GET', `/meetings/${code}/polls/date`)).data.options

    await api('PUT', `/meetings/${code}/polls/date/votes`, { body: { optionIds: [sat.id, sun.id] }, user: member })
    // 투표 변경: 토·일 -> 일
    await api('PUT', `/meetings/${code}/polls/date/votes`, { body: { optionIds: [sun.id] }, user: member })

    const { data } = await api('GET', `/meetings/${code}/polls/date`, { user: member })
    assert.equal(data.voterCount, 2)
    // 모임장(후보 날짜 전체) + 참여자(일)
    assert.deepEqual(data.options.map((option) => option.count), [1, 1, 2])
    assert.deepEqual(data.myOptionIds, [sun.id])
    // 참여자는 투표를 모두 취소할 수 있지만, 모임장은 후보 날짜가 하나는 있어야 한다
    assert.equal((await api('PUT', `/meetings/${code}/polls/date/votes`, { body: { optionIds: [] }, user: member })).status, 200)
    assert.equal((await api('PUT', `/meetings/${code}/polls/date/votes`, { body: { optionIds: [] }, token: host })).status, 400)
  })

  test('로그인하지 않았거나 참여하지 않은 회원은 투표할 수 없다', async () => {
    const { code } = await setupMeeting()
    assert.equal((await api('PUT', `/meetings/${code}/polls/date/votes`, { body: { optionIds: [] } })).status, 401)
    const outsider = await signup('구경꾼')
    assert.equal((await api('PUT', `/meetings/${code}/polls/date/votes`, { body: { optionIds: [] }, user: outsider })).status, 401)
  })

  test('다른 모임의 선택지에는 투표할 수 없다', async () => {
    const first = await setupMeeting()
    const second = await setupMeeting()
    const [foreign] = (await api('GET', `/meetings/${second.code}/polls/date`)).data.options

    const { status } = await api('PUT', `/meetings/${first.code}/polls/date/votes`, {
      body: { optionIds: [foreign.id] },
      user: first.member,
    })
    assert.equal(status, 400)
  })

  test('기간 투표는 없다', async () => {
    const { code } = await setupMeeting()
    assert.equal((await api('GET', `/meetings/${code}/polls/duration`)).status, 404)
  })
})

describe('날짜로 투표 (달력에서 아무 날짜나)', () => {
  test('후보 기간 밖 날짜를 고르면 내 제안 날짜로 추가되고, 표가 없어지면 사라진다', async () => {
    const { code, member } = await setupMeeting()
    const voteDates = (dates, opts = { user: member }) =>
      api('PUT', `/meetings/${code}/polls/date/votes`, { body: { dates }, ...opts })
    const poll = async () => (await api('GET', `/meetings/${code}/polls/date`, { user: member })).data

    assert.equal((await voteDates(['2026-12-19', '2026-12-25', '2026-12-26'])).status, 200)
    let data = await poll()
    const byDate = Object.fromEntries(data.options.map((option) => [option.date, option]))
    // 후보 날짜(모임장 자동 투표 1표 + 나), 제안 날짜(나)
    assert.equal(byDate['2026-12-19'].count, 2)
    assert.equal(byDate['2026-12-25'].count, 1)
    assert.equal(byDate['2026-12-25'].proposedBy, '영희')
    assert.equal(data.myOptionIds.length, 3)
    // 캘린더 목록에도 제안 날짜로 보인다
    let listed = (await api('GET', '/meetings')).data.find((item) => item.code === code)
    assert.deepEqual(listed.proposals.map((proposal) => proposal.date), ['2026-12-25', '2026-12-26'])

    // 다시 고르면 통째로 바뀌고, 표가 없어진 내 제안 날짜(12/25)는 지워진다
    assert.equal((await voteDates(['2026-12-26'])).status, 200)
    data = await poll()
    assert.equal(data.options.some((option) => option.date === '2026-12-25'), false)
    // 후보 기간 날짜는 표가 없어도 남는다
    assert.equal(data.options.some((option) => option.date === '2026-12-19'), true)
    listed = (await api('GET', '/meetings')).data.find((item) => item.code === code)
    assert.deepEqual(listed.proposals.map((proposal) => proposal.date), ['2026-12-26'])

    assert.equal((await voteDates(['2026-02-30'])).status, 400)
    assert.equal((await voteDates('2026-12-26')).status, 400)
    assert.equal((await voteDates(['2026-12-26'], {})).status, 401)
  })

  test('다른 사람이 투표한 내 제안 날짜는 남는다', async () => {
    const { code, member } = await setupMeeting()
    const other = await signup('철이')
    await api('POST', `/meetings/${code}/members`, { user: other })
    const voteDates = (dates, user) => api('PUT', `/meetings/${code}/polls/date/votes`, { body: { dates }, user })
    await voteDates(['2026-12-25'], member)
    await voteDates(['2026-12-25'], other)
    await voteDates([], member)
    const { options } = (await api('GET', `/meetings/${code}/polls/date`)).data
    const christmas = options.find((option) => option.date === '2026-12-25')
    assert.equal(christmas.count, 1)
  })
})

describe('날짜 수정 (모임장) vs 제시 (참여자)', () => {
  test('모임장이 달력에서 날짜를 바꾸면 후보 날짜가 수정되고, 캘린더에도 후보로 보인다', async () => {
    const { code, host, member } = await setupMeeting()
    // 참여자: 후보 12/18 + 후보 밖 12/25(제시)
    await api('PUT', `/meetings/${code}/polls/date/votes`, { body: { dates: ['2026-12-18', '2026-12-25'] }, user: member })
    let listed = (await api('GET', '/meetings')).data.find((item) => item.code === code)
    assert.deepEqual(listed.candidateDates, ['2026-12-18', '2026-12-19', '2026-12-20'])
    assert.deepEqual(listed.proposals, [{ date: '2026-12-25', proposedBy: '영희' }])

    // 모임장: 12/18~20 → 12/26, 12/27 로 수정 (후보 밖 날짜여도 '제시'가 아니다)
    const hostVote = (dates) => api('PUT', `/meetings/${code}/polls/date/votes`, { body: { dates }, token: host })
    assert.equal((await hostVote(['2026-12-26', '2026-12-27'])).status, 200)
    listed = (await api('GET', '/meetings')).data.find((item) => item.code === code)
    assert.deepEqual(listed.candidateDates, ['2026-12-26', '2026-12-27'])
    assert.deepEqual([listed.candidateStart, listed.candidateEnd], ['2026-12-26', '2026-12-27'])
    // 참여자의 제시는 그대로, 빠진 후보 날짜(12/18)의 참여자 표는 사라진다
    assert.deepEqual(listed.proposals, [{ date: '2026-12-25', proposedBy: '영희' }])
    let poll = (await api('GET', `/meetings/${code}/polls/date`, { user: member })).data
    assert.deepEqual(
      poll.options.map((option) => [option.date, option.count, option.proposedBy]),
      [
        ['2026-12-25', 1, '영희'],
        ['2026-12-26', 1, null],
        ['2026-12-27', 1, null],
      ],
    )

    // 모임장이 참여자의 제시 날짜를 고르면 후보로 바뀐다 (참여자 표 유지)
    assert.equal((await hostVote(['2026-12-25', '2026-12-26'])).status, 200)
    listed = (await api('GET', '/meetings')).data.find((item) => item.code === code)
    assert.deepEqual(listed.candidateDates, ['2026-12-25', '2026-12-26'])
    assert.deepEqual(listed.proposals, [])
    poll = (await api('GET', `/meetings/${code}/polls/date`)).data
    assert.equal(poll.options.find((option) => option.date === '2026-12-25').count, 2)

    // 떨어진 날짜도 후보가 될 수 있지만, 첫날~마지막 날은 31일 이내
    assert.equal((await hostVote(['2026-12-01', '2026-12-31'])).status, 200)
    assert.equal((await hostVote(['2026-12-01', '2027-01-01'])).status, 400)
    assert.equal((await hostVote([])).status, 400)
  })

  test('모임장이 날짜 제안 API 를 써도 후보 추가로 처리된다', async () => {
    const { code, host } = await setupMeeting()
    const { status } = await api('POST', `/meetings/${code}/polls/date/options`, { body: { startDate: '2026-12-24' }, token: host })
    assert.equal(status, 201)
    const listed = (await api('GET', '/meetings')).data.find((item) => item.code === code)
    assert.deepEqual(listed.candidateDates, ['2026-12-18', '2026-12-19', '2026-12-20', '2026-12-24'])
    assert.deepEqual(listed.proposals, [])
  })
})

describe('날짜 수정 (모임장)', () => {
  test('투표 중에는 후보 기간을 옮기고, 새 날짜에는 모임장이 자동 투표된다', async () => {
    const { code, host, member } = await setupMeeting()
    const edit = (body, opts) => api('PATCH', `/meetings/${code}/dates`, { body, ...opts })
    // 참여자가 12/19(후보)와 12/30(제안)에 투표
    await api('PUT', `/meetings/${code}/polls/date/votes`, { body: { dates: ['2026-12-19', '2026-12-30'] }, user: member })

    assert.equal((await edit({ startDate: '2026-12-19', endDate: '2026-12-22' }, { user: member })).status, 403)
    assert.equal((await edit({ startDate: '2026-12-19', endDate: '2026-12-22' })).status, 401)
    assert.equal((await edit({ startDate: '2026-12-22', endDate: '2026-12-19' }, { token: host })).status, 400)
    assert.equal((await edit({ startDate: '2026-12-01', endDate: '2027-01-15' }, { token: host })).status, 400)

    const deadline = inDays(3)
    assert.equal((await edit({ startDate: '2026-12-19', endDate: '2026-12-22', voteDeadline: deadline }, { token: host })).status, 200)
    const meeting = (await api('GET', `/meetings/${code}`)).data
    assert.deepEqual([meeting.candidateStart, meeting.candidateEnd], ['2026-12-19', '2026-12-22'])
    assert.equal(Date.parse(meeting.voteDeadline), Math.floor(Date.parse(deadline) / 1000) * 1000)

    const { options } = (await api('GET', `/meetings/${code}/polls/date`)).data
    const counts = Object.fromEntries(options.map((option) => [option.date, option.count]))
    // 12/18 은 빠지고, 12/19~20 은 기존 표 유지, 12/21~22 는 새로 들어와 모임장 1표, 제안 날짜 12/30 은 유지
    assert.deepEqual(counts, { '2026-12-19': 2, '2026-12-20': 1, '2026-12-21': 1, '2026-12-22': 1, '2026-12-30': 1 })

    // 제안 날짜(12/30)를 포함하도록 다시 늘리면 후보 날짜가 되어 '제시' 표시에서 빠진다 (표는 유지)
    assert.equal((await edit({ startDate: '2026-12-19', endDate: '2026-12-31' }, { token: host })).status, 200)
    const listed = (await api('GET', '/meetings')).data.find((item) => item.code === code)
    assert.deepEqual(listed.proposals, [])
    const after = (await api('GET', `/meetings/${code}/polls/date`)).data.options.find((option) => option.date === '2026-12-30')
    assert.equal(after.proposedBy, null)
    assert.equal(after.count, 2)
  })

  test('확정 후에는 확정 일정을 아무 날짜로나 옮길 수 있다 (최대 14일)', async () => {
    const { code, host } = await setupMeeting()
    await api('POST', `/meetings/${code}/polls/date/confirm`, { body: { startDate: '2026-12-18', endDate: '2026-12-19' }, token: host })
    const edit = (body) => api('PATCH', `/meetings/${code}/dates`, { body, token: host })

    assert.equal((await edit({ startDate: '2026-12-01', endDate: '2026-12-15' })).status, 400)
    assert.equal((await edit({ startDate: '2027-01-14', endDate: '2027-01-15' })).status, 200)
    const meeting = (await api('GET', `/meetings/${code}`)).data
    assert.equal(meeting.stage, 'PLACE')
    assert.deepEqual(meeting.confirmed.schedule, { startDate: '2027-01-14', endDate: '2027-01-15' })
    const listed = (await api('GET', '/meetings')).data.find((item) => item.code === code)
    assert.deepEqual([listed.startDate, listed.endDate], ['2027-01-14', '2027-01-15'])
  })
})

describe('날짜 제안', () => {
  const propose = (code, body, opts) => api('POST', `/meetings/${code}/polls/date/options`, { body, ...opts })
  const getPoll = async (code, opts) => (await api('GET', `/meetings/${code}/polls/date`, opts)).data

  test('후보 기간 밖의 날짜를 제안하면 선택지로 추가되고, 제안한 사람의 투표로 찍힌다', async () => {
    const { code, member } = await setupMeeting()
    const { status, data } = await propose(code, { startDate: '2026-12-31', endDate: '2027-01-01' }, { user: member })
    assert.equal(status, 201)
    assert.equal(data.optionIds.length, 2)

    const poll = await getPoll(code, { user: member })
    assert.deepEqual(
      poll.options.map((option) => [option.label, option.proposedBy]),
      [
        ['12/18 (금)', null],
        ['12/19 (토)', null],
        ['12/20 (일)', null],
        ['12/31 (목)', '영희'],
        ['1/1 (금)', '영희'],
      ],
    )
    assert.deepEqual(poll.myOptionIds.sort(), data.optionIds.sort())
  })

  test('이미 있는 날짜를 제안하면 새로 만들지 않고 기존 선택지에 투표한다 (기존 투표는 유지)', async () => {
    const { code, host, member } = await setupMeeting()
    const [fri, sat] = (await getPoll(code)).options
    await api('PUT', `/meetings/${code}/polls/date/votes`, { body: { optionIds: [fri.id] }, user: member })

    // 12/19(기존) ~ 12/21(새 날짜)
    const { data } = await propose(code, { startDate: '2026-12-19', endDate: '2026-12-21' }, { user: member })
    const poll = await getPoll(code, { user: member })
    assert.equal(poll.options.length, 4)
    assert.ok(data.optionIds.includes(sat.id))
    assert.equal(poll.options.find((option) => option.id === sat.id).proposedBy, null)
    assert.deepEqual(
      poll.options.filter((option) => option.count > 0).map((option) => option.label),
      ['12/18 (금)', '12/19 (토)', '12/20 (일)', '12/21 (월)'],
    )

    // 다른 사람이 같은 날짜를 하루만 제안해도 같은 선택지로 찍힌다
    await propose(code, { startDate: '2026-12-21' }, { token: host })
    const after = await getPoll(code)
    assert.equal(after.options.length, 4)
    assert.equal(after.options.find((option) => option.label === '12/21 (월)').count, 2)
  })

  test('참여자만, 날짜 투표 중에만, 올바른 기간만 제안할 수 있다', async () => {
    const { code, host, member } = await setupMeeting()
    assert.equal((await propose(code, { startDate: '2026-12-25' })).status, 401)
    assert.equal((await propose(code, { startDate: '2026-12-25' }, { user: await signup('구경꾼') })).status, 401)
    assert.equal((await propose(code, { startDate: '2026-12-25', endDate: '2026-12-24' }, { user: member })).status, 400)
    assert.equal((await propose(code, { startDate: '2026-02-30' }, { user: member })).status, 400)
    assert.equal((await propose(code, { startDate: '2027-01-01', endDate: '2027-02-15' }, { user: member })).status, 400)
    const [option] = (await getPoll(code)).options
    await api('POST', `/meetings/${code}/polls/date/confirm`, { body: { startDate: option.date }, token: host })
    assert.equal((await propose(code, { startDate: '2026-12-25' }, { user: member })).status, 409)
  })
})

describe('확정 흐름', () => {
  test('날짜를 연속 범위로 확정하면 장소 투표, 장소를 확정하면 일정 확정', async () => {
    const { code, host, member } = await setupMeeting()
    const confirmDate = (body, opts) => api('POST', `/meetings/${code}/polls/date/confirm`, { body, ...opts })
    // 장소 투표는 아직 없다
    assert.equal((await api('GET', `/meetings/${code}/polls/place`)).status, 404)

    assert.equal((await confirmDate({ startDate: '2026-12-19' }, { user: member })).status, 403)
    // 투표 날짜가 아닌 날, 거꾸로 된 범위는 안 된다
    assert.equal((await confirmDate({ startDate: '2026-12-19', endDate: '2026-12-25' }, { token: host })).status, 400)
    assert.equal((await confirmDate({ startDate: '2026-12-20', endDate: '2026-12-19' }, { token: host })).status, 400)
    assert.equal((await confirmDate({}, { token: host })).status, 400)
    assert.equal((await confirmDate({ startDate: '2026-12-19', endDate: '2026-12-20' }, { token: host })).status, 200)
    assert.equal((await confirmDate({ startDate: '2026-12-19' }, { token: host })).status, 409)

    const [, sat] = (await api('GET', `/meetings/${code}/polls/date`)).data.options
    // 확정된 날짜 투표는 더 이상 바꿀 수 없다
    assert.equal((await api('PUT', `/meetings/${code}/polls/date/votes`, { body: { optionIds: [sat.id] }, user: member })).status, 409)

    let { data } = await api('GET', `/meetings/${code}`)
    assert.equal(data.stage, 'PLACE')
    assert.deepEqual(data.confirmed.schedule, { startDate: '2026-12-19', endDate: '2026-12-20' })

    // 장소 투표: 17개 시·도 중 여러 곳 + 의견 하나. 같은 시·도면 같은 선택지
    const place = (body, opts) => api('POST', `/meetings/${code}/polls/place/places`, { body, ...opts })
    assert.equal((await place({ regions: ['강원', '부산'], comment: '바다 보러 가요' }, { user: member })).status, 201)
    assert.equal((await place({ regions: ['강원'] }, { token: host })).status, 201)
    // 다시 투표하면 내 장소 투표는 통째로 바뀐다
    assert.equal((await place({ regions: ['경기', '강원'], comment: '가까운 곳' }, { user: member })).status, 201)
    assert.equal((await place({ regions: ['강릉 펜션'] }, { user: member })).status, 400)
    assert.equal((await place({ regions: [] }, { user: member })).status, 400)
    assert.equal((await place({ regions: ['제주'], comment: 'x'.repeat(301) }, { user: member })).status, 400)
    assert.equal((await place({ regions: ['제주'] })).status, 401)

    const placePoll = (await api('GET', `/meetings/${code}/polls/place`, { user: member })).data
    assert.equal(placePoll.multiple, true)
    assert.deepEqual(
      placePoll.options.map((option) => [option.label, option.count]),
      [
        ['부산', 0],
        ['경기', 1],
        ['강원', 2],
      ],
    )
    assert.equal(placePoll.myComment, '가까운 곳')
    assert.equal(placePoll.myOptionIds.length, 2)

    const gangneung = placePoll.options.find((option) => option.label === '강원')
    assert.equal((await api('POST', `/meetings/${code}/polls/place/confirm`, { body: { optionId: gangneung.id }, user: member })).status, 403)
    assert.equal((await api('POST', `/meetings/${code}/polls/place/confirm`, { body: { optionId: gangneung.id }, token: host })).status, 200)
    ;({ data } = await api('GET', `/meetings/${code}`))
    assert.equal(data.stage, 'DONE')
    assert.equal(data.confirmed.place.label, '강원')
    assert.equal((await place({ regions: ['부산'] }, { user: member })).status, 409)
  })

  test('일정은 최대 14일까지 확정할 수 있다', async () => {
    const created = await api('POST', '/meetings', {
      body: meetingBody({ startDate: '2026-12-01', endDate: '2026-12-31' }),
      admin: adminToken,
    })
    const { code, token: host } = created.data
    const confirmDate = (endDate) =>
      api('POST', `/meetings/${code}/polls/date/confirm`, { body: { startDate: '2026-12-01', endDate }, token: host })
    assert.equal((await confirmDate('2026-12-15')).status, 400)
    assert.equal((await confirmDate('2026-12-14')).status, 200)
  })
})

describe('캘린더 제안 날짜', () => {
  test('날짜 투표 중인 모임은 제안 날짜와 제안자를 목록에 담고, 날짜가 확정되면 빠진다', async () => {
    const { code, host, member } = await setupMeeting()
    await api('POST', `/meetings/${code}/polls/date/options`, { body: { startDate: '2027-01-02', endDate: '2027-01-03' }, user: member })
    // 후보 기간 안의 날짜를 제안하면 새 선택지가 아니므로 제안 날짜가 아니다
    await api('POST', `/meetings/${code}/polls/date/options`, { body: { startDate: '2026-12-19' }, token: host })

    const find = async () => (await api('GET', '/meetings')).data.find((item) => item.code === code)
    assert.deepEqual((await find()).proposals, [
      { date: '2027-01-02', proposedBy: '영희' },
      { date: '2027-01-03', proposedBy: '영희' },
    ])

    const [option] = (await api('GET', `/meetings/${code}/polls/date`)).data.options
    await api('POST', `/meetings/${code}/polls/date/confirm`, { body: { startDate: option.date }, token: host })
    assert.deepEqual((await find()).proposals, [])
  })
})

describe('장소 투표 마감', () => {
  // 날짜를 확정해 장소 투표를 시작한 모임
  async function placeMeeting(extra = {}) {
    const meeting = await setupMeeting()
    const confirmed = await api('POST', `/meetings/${meeting.code}/polls/date/confirm`, {
      body: { startDate: '2026-12-18', endDate: '2026-12-19', ...extra },
      token: meeting.host,
    })
    assert.equal(confirmed.status, 200)
    return meeting
  }
  const place = (code, regions, opts) => api('POST', `/meetings/${code}/polls/place/places`, { body: { regions }, ...opts })
  const expirePlace = (code) =>
    db.query('UPDATE meetings SET place_deadline = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE code = ?', [code])
  const detail = async (code) => (await api('GET', `/meetings/${code}`)).data

  test('날짜가 확정되면 장소 마감은 기본으로 시작일 D-2 23:59 (한국 시간)', async () => {
    const { code } = await placeMeeting()
    const meeting = await detail(code)
    // 12/18 시작 → 12/16 23:59 KST = 12/16 14:59 UTC
    assert.equal(meeting.placeDeadline, '2026-12-16T14:59:00Z')
  })

  test('모임장은 날짜를 확정하면서 장소 마감을 정할 수 있다', async () => {
    const deadline = inDays(5)
    const { code } = await placeMeeting({ placeDeadline: deadline })
    assert.equal(Date.parse((await detail(code)).placeDeadline), Math.floor(Date.parse(deadline) / 1000) * 1000)
    // 정모가 끝난 뒤로는 정할 수 없다
    const other = await setupMeeting()
    const { status } = await api('POST', `/meetings/${other.code}/polls/date/confirm`, {
      body: { startDate: '2026-12-18', placeDeadline: '2026-12-20T00:00:00Z' },
      token: other.host,
    })
    assert.equal(status, 400)
  })

  test('마감이 지나면 최다 득표 지역 하나로 확정된다', async () => {
    const { code, host, member } = await placeMeeting()
    await place(code, ['부산', '강원'], { user: member })
    await place(code, ['부산'], { token: host })
    await expirePlace(code)
    const listed = (await api('GET', '/meetings')).data.find((item) => item.code === code)
    assert.equal(listed.stage, 'DONE')
    assert.equal(listed.place, '부산')
    assert.deepEqual(listed.placeTied, [])
  })

  test('동점이면 동점 지역을 모두 보여 주고, 모임장이 나중에 하나로 정할 수 있다', async () => {
    const { code, host, member } = await placeMeeting()
    await place(code, ['부산', '서울'], { user: member })
    await expirePlace(code)
    let meeting = await detail(code)
    assert.equal(meeting.stage, 'DONE')
    assert.equal(meeting.confirmed.place, null)
    assert.deepEqual(meeting.confirmed.placeTied, ['서울', '부산'])
    // 마감 후에는 투표할 수 없다
    assert.equal((await place(code, ['제주'], { user: member })).status, 409)
    // 참여자는 정할 수 없고, 모임장은 동점 중 하나로 정한다
    const { options } = (await api('GET', `/meetings/${code}/polls/place`)).data
    const busan = options.find((option) => option.label === '부산')
    const confirm = (body, opts) => api('POST', `/meetings/${code}/polls/place/confirm`, { body, ...opts })
    assert.equal((await confirm({ optionId: busan.id }, { user: member })).status, 403)
    assert.equal((await confirm({ optionId: busan.id }, { token: host })).status, 200)
    meeting = await detail(code)
    assert.equal(meeting.confirmed.place.label, '부산')
    assert.deepEqual(meeting.confirmed.placeTied, [])
    assert.equal((await confirm({ optionId: busan.id }, { token: host })).status, 409)
  })

  test('아무도 투표하지 않으면 장소 미정으로 닫히고, 모임장이 아무 시·도로나 정할 수 있다', async () => {
    const { code, host } = await placeMeeting()
    await expirePlace(code)
    let meeting = await detail(code)
    assert.equal(meeting.stage, 'DONE')
    assert.equal(meeting.confirmed.place, null)
    assert.deepEqual(meeting.confirmed.placeTied, [])
    const confirm = (body) => api('POST', `/meetings/${code}/polls/place/confirm`, { body, token: host })
    assert.equal((await confirm({ region: '강릉' })).status, 400)
    assert.equal((await confirm({ region: '제주' })).status, 200)
    meeting = await detail(code)
    assert.equal(meeting.confirmed.place.label, '제주')
  })

  test('지금 마감하기, 마감 수정 (모임장 / 관리자)', async () => {
    const { code, host, member } = await placeMeeting()
    const editDeadline = (placeDeadline, opts) => api('PATCH', `/meetings/${code}/place-deadline`, { body: { placeDeadline }, ...opts })
    const deadline = inDays(3)
    assert.equal((await editDeadline(deadline, { user: member })).status, 403)
    assert.equal((await editDeadline(inDays(-1), { token: host })).status, 400)
    assert.equal((await editDeadline('2026-12-20T00:00:00Z', { token: host })).status, 400)
    assert.equal((await editDeadline(deadline, { token: host })).status, 200)
    assert.equal(Date.parse((await detail(code)).placeDeadline), Math.floor(Date.parse(deadline) / 1000) * 1000)

    await place(code, ['대구'], { user: member })
    const close = (opts) => api('POST', `/meetings/${code}/close-place-vote`, opts)
    assert.equal((await close({ user: member })).status, 403)
    assert.equal((await close({ admin: adminToken })).status, 200)
    const meeting = await detail(code)
    assert.equal(meeting.stage, 'DONE')
    assert.equal(meeting.confirmed.place.label, '대구')
    assert.equal((await close({ token: host })).status, 409)
    assert.equal((await editDeadline(deadline, { token: host })).status, 409)
  })

  test('일정을 앞당겨 장소 마감이 새 시작일 이후가 되면 새 기본 마감으로 당긴다', async () => {
    const { code, host } = await placeMeeting({ placeDeadline: '2026-12-17T12:00:00Z' })
    const edit = (startDate, endDate) => api('PATCH', `/meetings/${code}/dates`, { body: { startDate, endDate }, token: host })
    // 12/17 21:00 KST 마감인데 일정을 12/15~16 으로 → 12/13 23:59 KST
    let res = await edit('2026-12-15', '2026-12-16')
    assert.equal(res.data.placeDeadlineChanged, true)
    assert.equal((await detail(code)).placeDeadline, '2026-12-13T14:59:00Z')
    // 마감보다 뒤로 옮기면 그대로
    res = await edit('2026-12-24', '2026-12-25')
    assert.equal(res.data.placeDeadlineChanged, false)
    assert.equal((await detail(code)).placeDeadline, '2026-12-13T14:59:00Z')
  })
})

describe('투표 마감', () => {
  test('마감 일시가 없거나 지났으면 모임을 만들 수 없다', async () => {
    const create = (voteDeadline) => api('POST', '/meetings', { body: meetingBody({ voteDeadline }), admin: adminToken })
    assert.equal((await create(undefined)).status, 400)
    assert.equal((await create('not-a-date')).status, 400)
    assert.equal((await create(inDays(-1))).status, 400)
    assert.equal((await create(inDays(400))).status, 400)
    assert.equal((await create(inDays(1))).status, 201)
  })

  test('마감이 지나면 최다 득표 날과, 득표가 같은 앞뒤 연속 날까지 일정으로 확정한다', async () => {
    const { code, host, member } = await setupMeeting()
    const [fri, sat, sun] = (await api('GET', `/meetings/${code}/polls/date`)).data.options
    // 금 1표, 토 2표, 일 2표 → 토~일
    await api('PUT', `/meetings/${code}/polls/date/votes`, { body: { optionIds: [sat.id, sun.id] }, token: host })
    await api('PUT', `/meetings/${code}/polls/date/votes`, { body: { optionIds: [fri.id, sat.id, sun.id] }, user: member })

    await expireDeadline(code)
    const { data } = await api('GET', `/meetings/${code}`)
    assert.equal(data.stage, 'PLACE')
    assert.deepEqual(data.confirmed.schedule, { startDate: '2026-12-19', endDate: '2026-12-20' })
    // 마감 후에는 날짜 투표를 바꿀 수 없다
    assert.equal((await api('PUT', `/meetings/${code}/polls/date/votes`, { body: { optionIds: [fri.id] }, user: member })).status, 409)
    assert.equal((await api('GET', `/meetings/${code}/polls/place`)).status, 200)
  })

  test('모임장은 원할 때 바로 마감할 수 있다', async () => {
    const { code, host, member } = await setupMeeting()
    const [, sat] = (await api('GET', `/meetings/${code}/polls/date`)).data.options
    await api('PUT', `/meetings/${code}/polls/date/votes`, { body: { optionIds: [sat.id] }, user: member })

    const close = (opts) => api('POST', `/meetings/${code}/close-vote`, opts)
    assert.equal((await close({})).status, 401)
    assert.equal((await close({ user: member })).status, 403)
    assert.equal((await close({ token: host })).status, 200)
    // 관리자도 마감할 수 있다 (다른 모임으로 확인)
    const other = await setupMeeting()
    assert.equal((await api('POST', `/meetings/${other.code}/close-vote`, { admin: adminToken })).status, 200)

    const { data } = await api('GET', `/meetings/${code}`)
    assert.equal(data.stage, 'PLACE')
    assert.deepEqual(data.confirmed.schedule, { startDate: '2026-12-19', endDate: '2026-12-19' })
    assert.ok(Date.parse(data.voteDeadline) <= Date.now())
    assert.equal((await close({ token: host })).status, 409)
  })

  test('모임장 표만 있으면 후보 기간 전체로 확정한다', async () => {
    const { code } = await setupMeeting()
    await expireDeadline(code)
    const listed = (await api('GET', '/meetings')).data.find((item) => item.code === code)
    assert.deepEqual([listed.startDate, listed.endDate], ['2026-12-18', '2026-12-20'])
  })

  test('표가 없으면 가장 이른 날 하루로 확정한다 (목록 조회만으로도 정리된다)', async () => {
    const { code } = await setupMeeting()
    // 모임장 표도 없는 경우 (모임장은 화면에서 후보를 모두 뺄 수 없으므로 DB 로 만든다)
    await db.query(
      'DELETE v FROM votes v JOIN polls p ON p.id = v.poll_id JOIN meetings m ON m.id = p.meeting_id WHERE m.code = ?',
      [code],
    )
    await expireDeadline(code)
    const listed = (await api('GET', '/meetings')).data.find((item) => item.code === code)
    assert.equal(listed.stage, 'PLACE')
    assert.deepEqual([listed.startDate, listed.endDate], ['2026-12-18', '2026-12-18'])
  })
})
