import { execute } from '@/lib/db';

// Definición de tablas para el control de arriendo de sillón.
// Se crean de forma idempotente (CREATE IF NOT EXISTS) tanto en /api/setup
// como en caliente desde las rutas, para no requerir migraciones manuales.
export const CHAIR_RENT_TABLES = [
    `CREATE TABLE IF NOT EXISTS chair_rent_days (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        professional_id TEXT NOT NULL,
        date TEXT NOT NULL,
        amount_due REAL NOT NULL DEFAULT 0,
        amount_paid REAL NOT NULL DEFAULT 0,
        payment_method TEXT,
        notes TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(professional_id, date)
    )`,
];

let ready = false;
export async function ensureChairRentTables() {
    if (ready) return;
    for (const sql of CHAIR_RENT_TABLES) await execute(sql);
    ready = true;
}
