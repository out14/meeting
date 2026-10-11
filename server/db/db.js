import mysql from 'mysql2/promise'

export const dbConfig = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD || undefined,
  // AWS RDS 는 DB_SSL=true 로 암호화 연결 (mysql2 에 내장된 RDS 인증서로 서버를 검증한다)
  ...(process.env.DB_SSL === 'true' && { ssl: 'Amazon RDS' }),
}

export const dbName = process.env.DB_NAME ?? 'meeting'

const db = mysql.createPool({
  ...dbConfig,
  database: dbName,
  dateStrings: true,
  connectionLimit: 10,
})

// 트랜잭션 헬퍼: 콜백이 throw 하면 롤백한다
export async function withTransaction(fn) {
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

export default db
