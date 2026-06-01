import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function migrate() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS daily_closings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      date TEXT NOT NULL,
      total_services INTEGER DEFAULT 0,
      total_revenue REAL DEFAULT 0,
      revenue_by_method TEXT DEFAULT '{}',
      payment_model TEXT DEFAULT 'commission',
      amount_owed REAL DEFAULT 0,
      amount_paid REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'pending',
      notes TEXT,
      closed_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, professional_id, date),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (professional_id) REFERENCES professionals(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_daily_closings_date ON daily_closings(tenant_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_daily_closings_prof ON daily_closings(professional_id, date)`,
    `CREATE TABLE IF NOT EXISTS daily_closing_payments (
      id TEXT PRIMARY KEY,
      closing_id TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'cash',
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (closing_id) REFERENCES daily_closings(id)
    )`,
    `CREATE TABLE IF NOT EXISTS time_entries (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      date TEXT NOT NULL,
      clock_in TEXT NOT NULL,
      clock_out TEXT,
      total_hours REAL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (professional_id) REFERENCES professionals(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(tenant_id, professional_id, date)`,
  ];

  for (const sql of stmts) {
    try {
      await db.execute(sql);
      console.log('OK:', sql.substring(0, 60));
    } catch (e) {
      console.log('ERR:', e.message);
    }
  }
  console.log('\nMigration complete!');
}

migrate();
