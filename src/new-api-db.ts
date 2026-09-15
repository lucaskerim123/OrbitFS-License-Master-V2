import { Pool, type QueryResultRow } from "pg";

const databaseUrl = String(process.env.DATABASE_URL || "").replace(/[?&]sslmode=[^&]+/i, "");
export const db = databaseUrl ? new Pool({
  connectionString: databaseUrl,
  max: 5,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
  statement_timeout: 8000,
  ssl: { rejectUnauthorized: false },
}) : null;

export const query = async <T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) => {
  if (!db) throw new Error("Database is not configured");
  return db.query<T>(sql, values);
};
