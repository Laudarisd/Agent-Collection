import "server-only";

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { SCHEMA_SQL } from "@/server/db/schema";

declare global {
  // eslint-disable-next-line no-var
  var __aiWorkspacePgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __aiWorkspaceSchemaReady: Promise<void> | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured. Add PostgreSQL before using intelligence features.");
  }
  return new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  });
}

export function getPool(): Pool {
  if (!global.__aiWorkspacePgPool) global.__aiWorkspacePgPool = createPool();
  return global.__aiWorkspacePgPool;
}

export async function ensureSchema(): Promise<void> {
  if (!global.__aiWorkspaceSchemaReady) {
    global.__aiWorkspaceSchemaReady = getPool().query(SCHEMA_SQL).then(() => undefined).catch((error) => {
      global.__aiWorkspaceSchemaReady = undefined;
      throw error;
    });
  }
  return global.__aiWorkspaceSchemaReady;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
  await ensureSchema();
  return getPool().query<T>(text, values);
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
