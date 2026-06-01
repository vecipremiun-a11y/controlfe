import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, execute, queryOne, transaction } from '@/lib/db';
import { generateId } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// GET: Fetch movements for a professional (with optional date range)
export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const professionalId = searchParams.get('professional_id');
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        const type = searchParams.get('type');
        const limit = parseInt(searchParams.get('limit') || '100');

        let sql = `SELECT pm.*, p.name as professional_name
                    FROM professional_movements pm
                    JOIN professionals p ON pm.professional_id = p.id
                    WHERE pm.tenant_id = ?`;
        const params = [user.tenantId];

        if (professionalId) {
            sql += ` AND pm.professional_id = ?`;
            params.push(professionalId);
        }
        if (type) {
            sql += ` AND pm.type = ?`;
            params.push(type);
        }
        if (from) {
            sql += ` AND pm.date >= ?`;
            params.push(from);
        }
        if (to) {
            sql += ` AND pm.date <= ?`;
            params.push(to);
        }

        sql += ` ORDER BY pm.created_at DESC LIMIT ?`;
        params.push(limit);

        const movements = await query(sql, params);

        // Also return current balances if no specific professional
        let balances = [];
        if (!professionalId) {
            balances = await query(
                `SELECT id, name, running_balance, pay_frequency, pay_day, color, avatar_url
                 FROM professionals WHERE tenant_id = ? AND active = 1 ORDER BY name`,
                [user.tenantId]
            );
        }

        return NextResponse.json({ movements, balances });
    } catch (error) {
        console.error('Professional movements GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Register an advance (adelanto)
export async function POST(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const body = await request.json();
        const { professional_id, amount, payment_method, notes } = body;

        if (!professional_id || !amount || amount <= 0) {
            return NextResponse.json({ error: 'Profesional y monto son requeridos' }, { status: 400 });
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
        const newBalance = Math.round((currentBalance - amount) * 100) / 100;

        const today = new Date().toISOString().split('T')[0];
        const id = generateId();

        // Insert movement + update balance in transaction
        await transaction([
            {
                sql: `INSERT INTO professional_movements (id, tenant_id, professional_id, date, type, amount, balance_after, payment_method, notes, created_by)
                      VALUES (?, ?, ?, ?, 'advance', ?, ?, ?, ?, ?)`,
                args: [id, user.tenantId, professional_id, today, amount, newBalance, payment_method || 'cash', notes || null, user.userId || null]
            },
            {
                sql: `UPDATE professionals SET running_balance = ? WHERE id = ?`,
                args: [newBalance, professional_id]
            }
        ]);

        return NextResponse.json({
            id,
            type: 'advance',
            amount,
            balance_after: newBalance,
            professional_name: prof.name,
            message: 'Adelanto registrado'
        }, { status: 201 });
    } catch (error) {
        console.error('Professional movements POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
