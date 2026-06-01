import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  const stmts = [
    `ALTER TABLE appointments RENAME TO appointments_old`,
    `CREATE TABLE appointments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      branch_id TEXT,
      client_id TEXT,
      professional_id TEXT NOT NULL,
      service_id TEXT,
      combo_id TEXT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT DEFAULT 'reservado' CHECK(status IN ('reservado','confirmado','en_atencion','terminado','no_show','cancelado')),
      client_name TEXT,
      client_phone TEXT,
      client_email TEXT,
      notes TEXT,
      cancel_reason TEXT,
      source TEXT DEFAULT 'manual',
      deposit_paid REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id),
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (professional_id) REFERENCES professionals(id),
      FOREIGN KEY (service_id) REFERENCES services(id)
    )`,
    `INSERT INTO appointments SELECT * FROM appointments_old`,
    `DROP TABLE appointments_old`,
    `CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(tenant_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_appointments_professional ON appointments(professional_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id)`,
  ];

  for (const sql of stmts) {
    try {
      await db.execute(sql);
      console.log('OK:', sql.substring(0, 60));
    } catch (e) {
      console.log('ERR:', sql.substring(0, 60), '-', e.message);
    }
  }

  const count = await db.execute('SELECT COUNT(*) as c FROM appointments');
  console.log('Total appointments after migration:', count.rows[0].c);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
