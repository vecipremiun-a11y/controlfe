import { createClient } from '@libsql/client';

let db = null;

export function getDb() {
  if (!db) {
    db = createClient({
      url: process.env.TURSO_DATABASE_URL || 'file:local.db',
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return db;
}

// Helper to run a query and return rows
export async function query(sql, params = []) {
  const client = getDb();
  const result = await client.execute({ sql, args: params });
  return result.rows;
}

// Helper to run a query and return the first row
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// Helper to run an insert and return lastInsertRowid
export async function execute(sql, params = []) {
  const client = getDb();
  const result = await client.execute({ sql, args: params });
  return result;
}

// Run multiple statements in a transaction
export async function transaction(statements) {
  const client = getDb();
  const results = await client.batch(statements, 'write');
  return results;
}
