// DB 생성 + 테이블 생성. `--reset` 이면 DB 를 지우고 다시 만든다 (테스트용)
import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import mysql from 'mysql2/promise'
import { dbConfig, dbName } from './db.js'
import { defaultPlaceDeadline } from '../lib/placeDeadline.js'

const reset = process.argv.includes('--reset')
const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')

const hasColumn = async (conn, table, column) => {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?',
    [dbName, table, column],
  )
  return rows.length > 0
}

const columnType = async (conn, table, column) => {
  const [[row]] = await conn.query(
    'SELECT column_type AS type FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?',
    [dbName, table, column],
  )
  return row?.type ?? ''
}

// 이미 만들어진 DB 를 최신 스키마로 맞춘다 (여러 번 실행해도 안전)
async function migrate(conn) {
  // 날짜 투표 후보 기간: 기존 모임은 등록된 후보 날짜(없으면 생성일)로 채운다
  if (!(await hasColumn(conn, 'meetings', 'candidate_start'))) {
    await conn.query('ALTER TABLE meetings ADD COLUMN candidate_start DATE NULL AFTER stage, ADD COLUMN candidate_end DATE NULL AFTER candidate_start')
    await conn.query(`
      UPDATE meetings m
        LEFT JOIN (
          SELECT p.meeting_id, MIN(o.date_value) AS first_date, MAX(o.date_value) AS last_date
            FROM polls p JOIN poll_options o ON o.poll_id = p.id
           WHERE p.type = 'DATE'
           GROUP BY p.meeting_id
        ) d ON d.meeting_id = m.id
         SET m.candidate_start = COALESCE(d.first_date, DATE(m.created_at)),
             m.candidate_end = COALESCE(d.last_date, DATE(m.created_at))`)
    await conn.query('ALTER TABLE meetings MODIFY candidate_start DATE NOT NULL, MODIFY candidate_end DATE NOT NULL')
    console.log('마이그레이션: meetings.candidate_start / candidate_end 추가')
  }

  // 비밀번호 재설정/변경
  if (!(await hasColumn(conn, 'users', 'token_version'))) {
    await conn.query(`
      ALTER TABLE users
        ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER password_hash,
        ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER must_change_password`)
    console.log('마이그레이션: users.must_change_password / token_version 추가')
  }

  // 이메일 (비밀번호 찾기용). 기존 회원은 NULL
  if (!(await hasColumn(conn, 'users', 'email'))) {
    await conn.query('ALTER TABLE users ADD COLUMN email VARCHAR(254) NULL AFTER nickname, ADD UNIQUE KEY uq_user_email (email)')
    console.log('마이그레이션: users.email 추가')
  }

  // 날짜 제안: 제안한 참여자
  if (!(await hasColumn(conn, 'poll_options', 'proposed_by'))) {
    await conn.query(`
      ALTER TABLE poll_options
        ADD COLUMN proposed_by INT UNSIGNED NULL AFTER sort_order,
        ADD CONSTRAINT fk_option_proposer FOREIGN KEY (proposed_by) REFERENCES meeting_members (id) ON DELETE SET NULL`)
    console.log('마이그레이션: poll_options.proposed_by 추가')
  }

  // 진행 단계: DATE/DURATION → VOTE(날짜·기간 동시 투표), PLACE(장소 투표) 추가
  if (!(await columnType(conn, 'meetings', 'stage')).includes('VOTE')) {
    await conn.query("ALTER TABLE meetings MODIFY stage ENUM('DATE', 'DURATION', 'VOTE', 'PLACE', 'DONE') NOT NULL DEFAULT 'VOTE'")
    await conn.query("UPDATE meetings SET stage = 'VOTE' WHERE stage IN ('DATE', 'DURATION')")
    await conn.query("ALTER TABLE meetings MODIFY stage ENUM('VOTE', 'PLACE', 'DONE') NOT NULL DEFAULT 'VOTE'")
    console.log('마이그레이션: meetings.stage → VOTE / PLACE / DONE')
  }
  if (!(await columnType(conn, 'polls', 'type')).includes('PLACE')) {
    await conn.query("ALTER TABLE polls MODIFY type ENUM('DATE', 'DURATION', 'PLACE') NOT NULL")
    console.log('마이그레이션: polls.type 에 PLACE 추가')
  }
  // 투표 마감: 기존 진행 중 모임은 지금부터 7일 뒤로 둔다
  if (!(await hasColumn(conn, 'meetings', 'vote_deadline'))) {
    await conn.query('ALTER TABLE meetings ADD COLUMN vote_deadline DATETIME NULL AFTER candidate_end')
    await conn.query(
      "UPDATE meetings SET vote_deadline = IF(stage = 'VOTE', UTC_TIMESTAMP() + INTERVAL 7 DAY, created_at)",
    )
    await conn.query('ALTER TABLE meetings MODIFY vote_deadline DATETIME NOT NULL')
    console.log('마이그레이션: meetings.vote_deadline 추가 (진행 중 모임은 7일 뒤 마감)')
  }
  // 기간 투표 제거: 확정 일정을 meetings.schedule_start / end 로 옮기고 기간 투표를 지운다
  if (!(await hasColumn(conn, 'meetings', 'schedule_start'))) {
    await conn.query('ALTER TABLE meetings ADD COLUMN schedule_start DATE NULL AFTER vote_deadline, ADD COLUMN schedule_end DATE NULL AFTER schedule_start')
    // 날짜·기간이 모두 확정된 모임 → 시작일 + 숙박 수
    await conn.query(`
      UPDATE meetings m
        JOIN polls pd ON pd.meeting_id = m.id AND pd.type = 'DATE'
        JOIN poll_options od ON od.id = pd.confirmed_option_id
        LEFT JOIN polls pu ON pu.meeting_id = m.id AND pu.type = 'DURATION'
        LEFT JOIN poll_options ou ON ou.id = pu.confirmed_option_id
         SET m.schedule_start = od.date_value,
             m.schedule_end = od.date_value + INTERVAL COALESCE(ou.nights, 0) DAY`)
    console.log('마이그레이션: meetings.schedule_start / schedule_end 추가')
  }
  if ((await columnType(conn, 'polls', 'type')).includes('DURATION')) {
    // 날짜는 확정됐지만 기간 투표만 남아 있던 모임은 장소 투표로 넘긴다
    await conn.query("DELETE FROM polls WHERE type = 'DURATION'")
    await conn.query(`
      INSERT IGNORE INTO polls (meeting_id, type, multiple)
      SELECT id, 'PLACE', 0 FROM meetings WHERE stage = 'VOTE' AND schedule_start IS NOT NULL`)
    await conn.query("UPDATE meetings SET stage = 'PLACE' WHERE stage = 'VOTE' AND schedule_start IS NOT NULL")
    await conn.query("ALTER TABLE polls MODIFY type ENUM('DATE', 'PLACE') NOT NULL")
    console.log('마이그레이션: 기간 투표(DURATION) 제거')
  }
  if (await hasColumn(conn, 'poll_options', 'nights')) {
    await conn.query('ALTER TABLE poll_options DROP COLUMN nights')
    console.log('마이그레이션: poll_options.nights 제거')
  }

  if (!(await hasColumn(conn, 'poll_options', 'memo'))) {
    await conn.query('ALTER TABLE poll_options ADD COLUMN memo VARCHAR(100) NULL AFTER date_value')
    console.log('마이그레이션: poll_options.memo 추가')
  }

  // 장소 투표는 여러 시·도를 고를 수 있다 (이미 만들어진 장소 투표도)
  await conn.query("UPDATE polls SET multiple = 1 WHERE type = 'PLACE' AND multiple = 0")

  // 장소 투표 의견
  if (!(await hasColumn(conn, 'votes', 'comment'))) {
    await conn.query('ALTER TABLE votes ADD COLUMN comment VARCHAR(300) NULL AFTER member_id')
    console.log('마이그레이션: votes.comment 추가')
  }

  // 장소 투표 마감: 이미 장소 투표 중인 모임은 확정 일정 기준 기본 마감으로 채운다
  if (!(await hasColumn(conn, 'meetings', 'place_deadline'))) {
    await conn.query('ALTER TABLE meetings ADD COLUMN place_deadline DATETIME NULL AFTER schedule_end')
    const [placing] = await conn.query("SELECT id, DATE_FORMAT(schedule_start, '%Y-%m-%d') AS start FROM meetings WHERE stage = 'PLACE'")
    for (const { id, start } of placing) {
      const deadline = defaultPlaceDeadline(start).toISOString().slice(0, 19).replace('T', ' ')
      await conn.query('UPDATE meetings SET place_deadline = ? WHERE id = ?', [deadline, id])
    }
    console.log(`마이그레이션: meetings.place_deadline 추가 (장소 투표 중 ${placing.length}개 기본 마감)`)
  }

  // 회원 참여: 참여자에 user_id 연결, 회원은 참여자 토큰 없이 식별하므로 token_hash 는 NULL 허용
  if (!(await hasColumn(conn, 'meeting_members', 'user_id'))) {
    await conn.query(`
      ALTER TABLE meeting_members
        ADD COLUMN user_id INT UNSIGNED NULL AFTER role,
        MODIFY token_hash CHAR(64) NULL,
        ADD UNIQUE KEY uq_member_user (meeting_id, user_id),
        ADD CONSTRAINT fk_member_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE`)
    console.log('마이그레이션: meeting_members.user_id 추가')
  }
}

const conn = await mysql.createConnection({ ...dbConfig, multipleStatements: true })
try {
  if (reset) await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``)
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await conn.query(`USE \`${dbName}\``)
  await conn.query(schema)
  await migrate(conn)
  console.log(`DB 초기화 완료: ${dbName}`)
} finally {
  await conn.end()
}
