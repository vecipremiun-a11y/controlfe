import { execute, query, queryOne } from '@/lib/db';

// Tablas de caja (apertura/cierre + movimientos de efectivo). Existen en
// schema.js, pero las creamos de forma idempotente para no depender de /setup.
const CASH_TABLES = [
    `CREATE TABLE IF NOT EXISTS cash_registers (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        branch_id TEXT,
        opened_by TEXT NOT NULL,
        opened_at TEXT DEFAULT (datetime('now')),
        closed_by TEXT,
        closed_at TEXT,
        opening_amount REAL DEFAULT 0,
        expected_amount REAL DEFAULT 0,
        actual_amount REAL,
        difference REAL DEFAULT 0,
        status TEXT DEFAULT 'open' CHECK(status IN ('open','closed')),
        notes TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS cash_movements (
        id TEXT PRIMARY KEY,
        register_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('income','expense','withdrawal','deposit')),
        amount REAL NOT NULL,
        description TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )`,
];

// Columnas extra para enlazar el movimiento con su origen (venta, arriendo…).
const CASH_MIGRATIONS = [
    `ALTER TABLE cash_movements ADD COLUMN payment_method TEXT`,
    `ALTER TABLE cash_movements ADD COLUMN reference_type TEXT`,
    `ALTER TABLE cash_movements ADD COLUMN reference_id TEXT`,
    `ALTER TABLE cash_registers ADD COLUMN user_name TEXT`,
];

let ready = false;
export async function ensureCashTables() {
    if (ready) return;
    for (const sql of CASH_TABLES) await execute(sql);
    for (const sql of CASH_MIGRATIONS) {
        try { await execute(sql); } catch { /* la columna ya existe */ }
    }
    ready = true;
}

// Caja abierta del usuario (modelo: una caja por usuario).
export async function getOpenRegister(tenantId, userId) {
    return queryOne(
        `SELECT * FROM cash_registers WHERE tenant_id = ? AND opened_by = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1`,
        [tenantId, userId]
    );
}

// Efectivo esperado = apertura + ingresos/depósitos − egresos/retiros.
export async function registerSummary(register) {
    const movs = await query(
        `SELECT type, amount FROM cash_movements WHERE register_id = ?`,
        [register.id]
    );
    let cashIn = 0, cashOut = 0;
    for (const m of movs) {
        if (m.type === 'income' || m.type === 'deposit') cashIn += (m.amount || 0);
        else cashOut += (m.amount || 0); // expense, withdrawal
    }
    const opening = register.opening_amount || 0;
    const expected = Math.round((opening + cashIn - cashOut) * 100) / 100;
    return { opening, cashIn: Math.round(cashIn), cashOut: Math.round(cashOut), expected };
}

// Registra un movimiento de efectivo en la caja abierta (best-effort).
export async function addCashMovement({ registerId, type, amount, description, paymentMethod, referenceType, referenceId, createdBy }) {
    const { generateId } = await import('@/lib/utils');
    await execute(
        `INSERT INTO cash_movements (id, register_id, type, amount, description, payment_method, reference_type, reference_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), registerId, type, Math.abs(Number(amount) || 0), description || null,
         paymentMethod || null, referenceType || null, referenceId || null, createdBy || null]
    );
}
