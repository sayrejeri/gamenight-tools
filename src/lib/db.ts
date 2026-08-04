import mysql, { type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";

const globalForDatabase = globalThis as unknown as { gameNightPool?: Pool };

function createDatabasePool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return mysql.createPool({
    uri: databaseUrl,
    connectionLimit: 10,
    waitForConnections: true,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    charset: "utf8mb4",
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
}

export function getPool(): Pool {
  if (!globalForDatabase.gameNightPool) {
    globalForDatabase.gameNightPool = createDatabasePool();
  }

  return globalForDatabase.gameNightPool;
}

export async function query<T extends RowDataPacket[]>(sql: string, values: unknown[] = []): Promise<T> {
  const [rows] = await getPool().query<T>(sql, values);
  return rows;
}

export async function withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
