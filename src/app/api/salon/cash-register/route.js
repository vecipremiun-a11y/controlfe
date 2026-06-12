import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, execute } from '@/lib/db';
import { generateId } from '@/lib/utils';
import { ensureCashTables, getOpenRegister, registerSummary, addCashMovement } from '@/lib/cashRegister';

export const dynamic = 'force-dynamic';

// GET: caja abierta del usuario + resumen, movimientos, ventas por método y
// últimos cierres. Si no hay caja abierta, register = null.
export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        await ensureCashTables();

        const register = await getOpenRegister(user.tenantId, user.id);

        // Historial de cierres recientes de este usuario.
        const closings = await query(
            `SELECT id, opened_at, closed_at, opening_amount, expected_amount, actual_amount, difference
             FROM cash_registers
             WHERE tenant_id = ? AND opened_by = ? AND status = 'closed'
             ORDER BY closed_at DESC LIMIT 8`,
            [user.tenantId, user.id]
        );

        if (!register) {
            return NextResponse.json({ register: null, closings });
        }

        const summary = await registerSummary(register);

        const movements = await query(
            `SELECT id, type, amount, description, payment_method, reference_type, created_at
             FROM cash_movements WHERE register_id = ? ORDER BY created_at DESC`,
            [register.id]
        );

        // Ventas asociadas a esta caja, agrupadas por método de pago.
        const byMethod = await query(
            `SELECT payment_method, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
             FROM sales WHERE register_id = ? AND status = 'completed'
             GROUP BY payment_method`,
            [register.id]
        );
        const salesByMethod = { cash: 0, card: 0, transfer: 0, mixed: 0, total: 0, count: 0 };
        for (const r of byMethod) {
            const m = r.payment_method || 'cash';
            salesByMethod[m] = (salesByMethod[m] || 0) + r.total;
            salesByMethod.total += r.total;
            salesByMethod.count += r.count;
        }

        return NextResponse.json({ register, summary, movements, salesByMethod, closings });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: action = 'open' | 'movement' | 'close'
export async function POST(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        await ensureCashTables();

        const body = await request.json();
        const action = body.action || 'open';

        // ── Abrir caja ──
        if (action === 'open') {
            const existing = await getOpenRegister(user.tenantId, user.id);
            if (existing) {
                return NextResponse.json({ error: 'Ya tienes una caja abierta', register: existing }, { status: 409 });
            }
            const id = generateId();
            const opening = Math.max(0, Number(body.opening_amount) || 0);
            await execute(
                `INSERT INTO cash_registers (id, tenant_id, branch_id, opened_by, user_name, opening_amount, expected_amount, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
                [id, user.tenantId, user.branchId || null, user.id, user.name || null, opening, opening]
            );
            const register = await getOpenRegister(user.tenantId, user.id);
            return NextResponse.json({ ok: true, register }, { status: 201 });
        }

        // Las demás acciones requieren caja abierta.
        const register = await getOpenRegister(user.tenantId, user.id);
        if (!register) {
            return NextResponse.json({ error: 'No tienes una caja abierta', code: 'NO_REGISTER' }, { status: 409 });
        }

        // ── Movimiento manual (ingreso / egreso / retiro / depósito) ──
        if (action === 'movement') {
            const type = body.type;
            if (!['income', 'expense', 'withdrawal', 'deposit'].includes(type)) {
                return NextResponse.json({ error: 'Tipo de movimiento inválido' }, { status: 400 });
            }
            const amount = Math.abs(Number(body.amount) || 0);
            if (amount <= 0) return NextResponse.json({ error: 'Monto inválido' }, { status: 400 });
            await addCashMovement({
                registerId: register.id, type, amount,
                description: body.description || null,
                paymentMethod: 'cash', referenceType: 'manual',
                createdBy: user.id,
            });
            const summary = await registerSummary(register);
            return NextResponse.json({ ok: true, summary }, { status: 201 });
        }

        // ── Cerrar caja (cuadre de efectivo) ──
        if (action === 'close') {
            const summary = await registerSummary(register);
            const actual = Math.max(0, Number(body.actual_amount) || 0);
            const difference = Math.round((actual - summary.expected) * 100) / 100;
            await execute(
                `UPDATE cash_registers
                 SET status = 'closed', closed_by = ?, closed_at = datetime('now'),
                     expected_amount = ?, actual_amount = ?, difference = ?, notes = ?
                 WHERE id = ?`,
                [user.id, summary.expected, actual, difference, body.notes || null, register.id]
            );
            return NextResponse.json({
                ok: true,
                close: { expected: summary.expected, actual, difference, opening: summary.opening, cashIn: summary.cashIn, cashOut: summary.cashOut },
            });
        }

        return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
