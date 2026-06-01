import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, execute, queryOne, transaction } from '@/lib/db';
import { generateId } from '@/lib/utils';

// POST: Register a payment against a daily closing
export async function POST(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const body = await request.json();
        const { closing_id, amount, payment_method, notes } = body;

        if (!closing_id || !amount || amount <= 0) {
            return NextResponse.json({ error: 'Faltan parámetros o monto inválido' }, { status: 400 });
        }

        // Verify closing belongs to this tenant
        const closing = await queryOne(
            `SELECT * FROM daily_closings WHERE id = ? AND tenant_id = ?`,
            [closing_id, user.tenantId]
        );

        if (!closing) {
            return NextResponse.json({ error: 'Cierre no encontrado' }, { status: 404 });
        }

        if (closing.payment_status === 'paid') {
            return NextResponse.json({ error: 'Este cierre ya está completamente pagado' }, { status: 400 });
        }

        const paymentAmount = Math.round(parseFloat(amount) * 100) / 100;
        const newTotalPaid = Math.round(((closing.amount_paid || 0) + paymentAmount) * 100) / 100;
        const amountOwed = closing.amount_owed || 0;

        let newStatus = 'partial';
        if (newTotalPaid >= amountOwed) {
            newStatus = 'paid';
        }

        // Insert payment record
        const paymentId = generateId();
        await execute(
            `INSERT INTO daily_closing_payments (id, closing_id, amount, payment_method, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
            [paymentId, closing_id, paymentAmount, payment_method || 'cash', notes || null, user.userId || null]
        );

        // Update closing totals
        await execute(
            `UPDATE daily_closings SET amount_paid = ?, payment_status = ?, updated_at = datetime('now') WHERE id = ?`,
            [newTotalPaid, newStatus, closing_id]
        );

        // For rent model: deduct payment from running_balance (reduces debt)
        if (closing.payment_model === 'rent') {
            const prof = await queryOne(
                `SELECT id, running_balance FROM professionals WHERE id = ?`,
                [closing.professional_id]
            );
            if (prof) {
                const currentBalance = prof.running_balance || 0;
                const newBalance = Math.round((currentBalance - paymentAmount) * 100) / 100;
                const movId = generateId();
                const today = new Date().toISOString().split('T')[0];
                await transaction([
                    {
                        sql: `INSERT INTO professional_movements (id, tenant_id, professional_id, date, type, amount, balance_after, reference_id, payment_method, notes, created_by)
                              VALUES (?, ?, ?, ?, 'settlement', ?, ?, ?, ?, ?, ?)`,
                        args: [movId, user.tenantId, closing.professional_id, today, paymentAmount, newBalance, closing_id, payment_method || 'cash', 'Pago arriendo', user.userId || null]
                    },
                    {
                        sql: `UPDATE professionals SET running_balance = ? WHERE id = ?`,
                        args: [newBalance, closing.professional_id]
                    }
                ]);
            }
        }

        return NextResponse.json({
            id: paymentId,
            amount_paid: newTotalPaid,
            payment_status: newStatus,
            remaining: Math.max(0, Math.round((amountOwed - newTotalPaid) * 100) / 100),
            message: 'Pago registrado'
        });
    } catch (error) {
        console.error('Daily closing payments POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// GET: Get payments for a specific closing
export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const closingId = searchParams.get('closing_id');

        if (!closingId) {
            return NextResponse.json({ error: 'Falta closing_id' }, { status: 400 });
        }

        // Verify closing belongs to tenant
        const closing = await queryOne(
            `SELECT dc.*, p.name as professional_name FROM daily_closings dc JOIN professionals p ON dc.professional_id = p.id WHERE dc.id = ? AND dc.tenant_id = ?`,
            [closingId, user.tenantId]
        );

        if (!closing) {
            return NextResponse.json({ error: 'Cierre no encontrado' }, { status: 404 });
        }

        const payments = await query(
            `SELECT * FROM daily_closing_payments WHERE closing_id = ? ORDER BY created_at`,
            [closingId]
        );

        return NextResponse.json({ closing, payments });
    } catch (error) {
        console.error('Daily closing payments GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
