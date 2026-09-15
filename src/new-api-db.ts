import { Pool, type QueryResultRow } from "pg";

const normalizeDatabaseUrl = (value: string) => {
  const raw = String(value || "").replace(/[?&]sslmode=[^&]+/i, "");
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    const match = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (!match) return raw;
    const projectRef = match[1];
    const region = String(process.env.SUPABASE_DB_REGION || "us-west-2").trim();
    url.hostname = String(process.env.SUPABASE_POOLER_HOST || `aws-0-${region}.pooler.supabase.com`).trim();
    url.port = "6543";
    if (url.username === "postgres") url.username = `postgres.${projectRef}`;
    return url.toString();
  } catch {
    return raw;
  }
};

const databaseUrl = normalizeDatabaseUrl(String(process.env.DATABASE_URL || ""));
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
