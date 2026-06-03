import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Amplía los roles permitidos en la tabla users.
// SQLite no permite modificar un CHECK in situ, así que se recrea la tabla.
// Se usa executeMultiple para correr el script en una sola conexión y poder
// desactivar las FK durante la recreación (professionals y sales referencian users).
async function migrate() {
  const before = await db.execute('SELECT COUNT(*) c FROM users');
  const countBefore = Number(before.rows[0].c);
  console.log('Usuarios antes:', countBefore);

  await db.executeMultiple(`
    PRAGMA foreign_keys=OFF;
    CREATE TABLE users_new (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      branch_id TEXT,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      avatar_url TEXT,
      role TEXT DEFAULT 'vendedor' CHECK(role IN ('owner','admin','supervisor','recepcionista','bodeguero','vendedor','receptionist','professional')),
      active INTEGER DEFAULT 1,
      last_login TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id)
    );
    INSERT INTO users_new (id, tenant_id, branch_id, email, password_hash, name, phone, avatar_url, role, active, last_login, created_at, updated_at)
      SELECT id, tenant_id, branch_id, email, password_hash, name, phone, avatar_url, role, active, last_login, created_at, updated_at FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_tenant ON users(email, tenant_id);
    PRAGMA foreign_keys=ON;
  `);

  const after = await db.execute('SELECT COUNT(*) c FROM users');
  const countAfter = Number(after.rows[0].c);
  console.log('Usuarios después:', countAfter);

  const ddl = await db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
  console.log('--- Nuevo DDL users ---');
  console.log(ddl.rows[0].sql);

  // Verificar integridad de las FK tras la recreación
  const fkCheck = await db.execute('PRAGMA foreign_key_check');
  console.log('foreign_key_check (debe estar vacío):', fkCheck.rows.length === 0 ? 'OK' : JSON.stringify(fkCheck.rows));

  if (countAfter !== countBefore) {
    throw new Error('¡El conteo de usuarios cambió! Revisar.');
  }
  console.log('✅ Migración OK: roles ampliados, datos intactos.');
}

migrate().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
