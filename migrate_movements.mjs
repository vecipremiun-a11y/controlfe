import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function migrate() {
  const stmts = [
    // Add pay_frequency, pay_day, running_balance to professionals
    `ALTER TABLE professionals ADD COLUMN pay_frequency TEXT DEFAULT 'daily'`,
    `ALTER TABLE professionals ADD COLUMN pay_day TEXT`,
    `ALTER TABLE professionals ADD COLUMN running_balance REAL DEFAULT 0`,

    // Create professional_movements table
    `CREATE TABLE IF NOT EXISTS professional_movements (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('earning','advance','settlement','adjustment')),
      amount REAL NOT NULL,
      balance_after REAL NOT NULL DEFAULT 0,
      reference_id TEXT,
      payment_method TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (professional_id) REFERENCES professionals(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_prof_movements_date ON professional_movements(tenant_id, professional_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_prof_movements_type ON professional_movements(professional_id, type)`,
  ];

  for (const sql of stmts) {
    try {
      await db.execute(sql);
      console.log('OK:', sql.substring(0, 60));
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        console.log('SKIP (already exists):', sql.substring(0, 60));
      } else {
        console.log('ERR:', e.message);
      }
    }
  }
  console.log('\nMigration complete!');
}

migrate();
