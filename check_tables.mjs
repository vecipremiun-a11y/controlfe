import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const r = await db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
console.log('Tables:', r.rows.map(r => r.name));
