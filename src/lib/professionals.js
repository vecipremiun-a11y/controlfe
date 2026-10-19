import { execute } from '@/lib/db';

// Columnas de professionals agregadas después del esquema original. Se crean de
// forma idempotente en caliente (misma convención que chairRent/cashRegister).
const PROFESSIONAL_MIGRATIONS = [
    // 1 = el salón cobra sus servicios: en Barbershop aparece "Enviar a Cobro".
    // 0 = el barbero cobra por su cuenta (p. ej. arriendo de sillón): solo se
    //     lleva su orden de atención y el botón es "Finalizar servicio".
    `ALTER TABLE professionals ADD COLUMN salon_collects INTEGER NOT NULL DEFAULT 1`,
];

let ready = false;
export async function ensureProfessionalColumns() {
    if (ready) return;
    for (const sql of PROFESSIONAL_MIGRATIONS) {
        try { await execute(sql); } catch { /* la columna ya existe */ }
    }
    ready = true;
}

// Valor de salon_collects enviado por el formulario (FormData lo manda como texto).
export function parseSalonCollects(value) {
    if (value === undefined || value === null || value === '') return 1;
    return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}
