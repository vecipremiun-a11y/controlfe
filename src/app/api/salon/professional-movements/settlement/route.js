import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, execute, queryOne, transaction } from '@/lib/db';
import { generateId } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// POST: Settle (liquidar) a professional — pay accumulated balance and reset
export async function POST(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const body = await request.json();
        const { professional_id, payment_method, notes } = body;

        if (!professional_id) {
            return NextResponse.json({ error: 'Profesional es requerido' }, { status: 400 });
        }

        // Get current balance
        const prof = await queryOne(
            `SELECT id, name, running_balance FROM professionals WHERE id = ? AND tenant_id = ?`,
            [professional_id, user.tenantId]
        );
        if (!prof) {
            return NextResponse.json({ error: 'Profesional no encontrado' }, { status: 404 });
        }

        const currentBalance = prof.running_balance || 0;
        if (currentBalance <= 0) {
            return NextResponse.json({ error: 'No hay balance pendiente para liquidar' }, { status: 400 });
        }

        const today = new Date().toISOString().split('T')[0];
        const id = generateId();

        // Insert settlement movement + reset balance to 0
        await transaction([
            {
                sql: `INSERT INTO professional_movements (id, tenant_id, professional_id, date, type, amount, balance_after, payment_method, notes, created_by)
                      VALUES (?, ?, ?, ?, 'settlement', ?, 0, ?, ?, ?)`,
                args: [id, user.tenantId, professional_id, today, currentBalance, payment_method || 'cash', notes || null, user.userId || null]
            },
            {
                sql: `UPDATE professionals SET running_balance = 0 WHERE id = ?`,
                args: [professional_id]
            }
        ]);

        return NextResponse.json({
            id,
            type: 'settlement',
            amount: currentBalance,
            balance_after: 0,
            professional_name: prof.name,
            message: 'Liquidación completada'
        }, { status: 201 });
    } catch (error) {
        console.error('Settlement POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
