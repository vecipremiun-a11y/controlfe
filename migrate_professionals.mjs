import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function migrate() {
  const alters = [
    `ALTER TABLE professionals ADD COLUMN rut TEXT`,
    `ALTER TABLE professionals ADD COLUMN payment_mode TEXT DEFAULT 'commission'`,
    `ALTER TABLE professionals ADD COLUMN base_salary REAL DEFAULT 0`,
    `ALTER TABLE professionals ADD COLUMN per_service_rate REAL DEFAULT 0`,
    `ALTER TABLE professionals ADD COLUMN rent_amount REAL DEFAULT 0`,
    `ALTER TABLE professionals ADD COLUMN rent_frequency TEXT DEFAULT 'monthly'`,
    `ALTER TABLE professionals ADD COLUMN access_role TEXT DEFAULT 'own_agenda'`,
    `ALTER TABLE professionals ADD COLUMN country_code TEXT DEFAULT '+56'`,
  ];

  const creates = [
    `CREATE TABLE IF NOT EXISTS professional_rent_payments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      amount REAL NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      paid_at TEXT,
      status TEXT DEFAULT 'pending',
      payment_method TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (professional_id) REFERENCES professionals(id)
    )`
  ];

  for (const sql of alters) {
    try {
      await db.execute(sql);
      console.log('OK:', sql.substring(0, 70));
    } catch (e) {
      if (e.message?.includes('duplicate column')) {
        console.log('SKIP (exists):', sql.substring(0, 70));
      } else {
        console.log('ERR:', e.message);
      }
    }
  }

  for (const sql of creates) {
    try {
      await db.execute(sql);
      console.log('OK: CREATE TABLE professional_rent_payments');
    } catch (e) {
      console.log('ERR:', e.message);
    }
  }

  console.log('Migration done!');
}

migrate();
