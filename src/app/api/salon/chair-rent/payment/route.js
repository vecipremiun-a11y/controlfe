import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { queryOne, execute } from '@/lib/db';
import { ensureChairRentTables } from '@/lib/chairRent';
import { generateId } from '@/lib/utils';

function periodDays(freq, daysInMonth) {
    switch (freq) {
        case 'daily': return 1;
        case 'weekly': return 7;
        case 'biweekly': return 15;
        case 'monthly':
        default: return daysInMonth;
    }
}

// Registra un abono al arriendo de un día concreto. `amount` se SUMA a lo
// ya pagado ese día (permite abonos parciales). `set` reemplaza el total.
// El monto que se debe ese día se deriva del arriendo configurado en Personal.
export async function POST(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        await ensureChairRentTables();

        const { professional_id, date, amount, payment_method, notes, set, status } = await request.json();
        if (!professional_id || !date) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
        const value = Number(amount) || 0;

        // Modificar/anular un pago (set=true) solo lo puede hacer un administrador.
        const isAdmin = ['owner', 'admin'].includes(user.role);
        if (set && !isAdmin) {
            return NextResponse.json({ error: 'Solo un administrador puede modificar o anular un pago' }, { status: 403 });
        }

        const prof = await queryOne(
            `SELECT id, COALESCE(rent_amount, 0) AS rent_amount, COALESCE(rent_frequency, 'monthly') AS rent_frequency, payment_mode
             FROM professionals WHERE id = ? AND tenant_id = ?`,
            [professional_id, user.tenantId]
        );
        if (!prof) return NextResponse.json({ error: 'Profesional no encontrado' }, { status: 404 });

        // Monto que se debe ese día (equivalente diario del arriendo)
        const [yy, mm] = date.split('-').map(Number);
        const daysInMonth = new Date(yy, mm, 0).getDate();
        const daily = Math.round((prof.rent_amount || 0) / periodDays(prof.rent_frequency, daysInMonth));

        const existing = await queryOne(
            `SELECT id, amount_due, amount_paid FROM chair_rent_days WHERE professional_id = ? AND date = ?`,
            [professional_id, date]
        );

        // ── Marcar el día como "no se cobra" (descanso / no vino) o revertir ──
        // 'off'    = descanso del barbero, 'absent' = no vino a trabajar,
        // 'normal' = vuelve a cobrarse el arriendo de ese día.
        if (status === 'off' || status === 'absent' || status === 'normal') {
            // Cambiar un día que ya tiene abonos solo lo puede hacer un admin.
            if ((existing?.amount_paid || 0) > 0 && !isAdmin) {
                return NextResponse.json({ error: 'Este día tiene abonos. Solo un administrador puede cambiarlo.' }, { status: 403 });
            }
            const exempt = status !== 'normal';
            const newDue = exempt ? 0 : daily;   // exento = no se cobra
            const newPaid = 0;                    // marcar/revertir limpia abonos
            if (existing) {
                await execute(
                    `UPDATE chair_rent_days SET amount_due = ?, amount_paid = ?, status = ?, payment_method = NULL, notes = ?, updated_at = datetime('now') WHERE id = ?`,
                    [newDue, newPaid, status, notes || null, existing.id]
                );
            } else {
                await execute(
                    `INSERT INTO chair_rent_days (id, tenant_id, professional_id, date, amount_due, amount_paid, payment_method, notes, status)
                     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
                    [generateId(), user.tenantId, professional_id, date, newDue, newPaid, notes || null, status]
                );
            }
            return NextResponse.json({ ok: true, date, status, amount_due: newDue, amount_paid: newPaid });
        }

        if (existing) {
            const due = existing.amount_due || daily;
            // Si el día ya está pagado completo, no se permite abonar de nuevo
            // (solo un administrador puede corregir/anular con set=true).
            if (!set && due > 0 && (existing.amount_paid || 0) >= due) {
                return NextResponse.json({ error: 'Este día ya está pagado. Solo un administrador puede modificarlo.' }, { status: 400 });
            }
            const newPaid = set ? Math.max(0, value) : Math.max(0, (existing.amount_paid || 0) + value);
            await execute(
                `UPDATE chair_rent_days SET amount_paid = ?, amount_due = ?, status = 'normal', payment_method = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
                [newPaid, daily, payment_method || null, notes || null, existing.id]
            );
            return NextResponse.json({ ok: true, date, amount_due: daily, amount_paid: newPaid });
        }

        const paid = Math.max(0, value);
        await execute(
            `INSERT INTO chair_rent_days (id, tenant_id, professional_id, date, amount_due, amount_paid, payment_method, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [generateId(), user.tenantId, professional_id, date, daily, paid, payment_method || null, notes || null]
        );
        return NextResponse.json({ ok: true, date, amount_due: daily, amount_paid: paid });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
