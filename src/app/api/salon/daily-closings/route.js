import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, execute, queryOne, transaction } from '@/lib/db';
import { generateId } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// GET: Fetch closings for a date (or range)
export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');
        const professionalId = searchParams.get('professional_id');
        const from = searchParams.get('from');
        const to = searchParams.get('to');

        let sql = `SELECT dc.*, p.name as professional_name, p.payment_mode, p.color, p.avatar_url
                    FROM daily_closings dc
                    JOIN professionals p ON dc.professional_id = p.id
                    WHERE dc.tenant_id = ?`;
        const params = [user.tenantId];

        if (professionalId) {
            sql += ` AND dc.professional_id = ?`;
            params.push(professionalId);
        }

        if (date) {
            sql += ` AND dc.date = ?`;
            params.push(date);
        } else if (from && to) {
            sql += ` AND dc.date >= ? AND dc.date <= ?`;
            params.push(from, to);
        }

        sql += ` ORDER BY dc.date DESC, p.name`;

        const closings = await query(sql, params);

        // Fetch payments for each closing
        if (closings.length > 0) {
            const closingIds = closings.map(c => c.id);
            const payments = await query(
                `SELECT * FROM daily_closing_payments WHERE closing_id IN (${closingIds.map(() => '?').join(',')}) ORDER BY created_at`,
                closingIds
            );

            for (const closing of closings) {
                closing.payments = payments.filter(p => p.closing_id === closing.id);
            }
        }

        return NextResponse.json({ closings });
    } catch (error) {
        console.error('Daily closings GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Create a daily closing (from "Corte del Día")
export async function POST(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const body = await request.json();
        const { professional_id, date, total_services, total_revenue, revenue_by_method, notes } = body;

        if (!professional_id || !date) {
            return NextResponse.json({ error: 'Faltan parámetros requeridos' }, { status: 400 });
        }

        // Check if closing already exists for this professional and date
        const existing = await queryOne(
            `SELECT id FROM daily_closings WHERE tenant_id = ? AND professional_id = ? AND date = ?`,
            [user.tenantId, professional_id, date]
        );

        if (existing) {
            return NextResponse.json({ error: 'Ya existe un cierre para este profesional en esta fecha' }, { status: 409 });
        }

        // Get professional payment model details
        const prof = await queryOne(
            `SELECT payment_mode, commission_percent, base_salary, per_service_rate, rent_amount, rent_frequency, running_balance
             FROM professionals WHERE id = ? AND tenant_id = ?`,
            [professional_id, user.tenantId]
        );

        if (!prof) {
            return NextResponse.json({ error: 'Profesional no encontrado' }, { status: 404 });
        }

        // Calculate amount_owed based on payment model
        const rev = total_revenue || 0;
        const svcCount = total_services || 0;
        let amountOwed = 0;
        const paymentModel = prof.payment_mode || 'commission';

        switch (paymentModel) {
            case 'commission':
                // Professional earns commission % of revenue
                amountOwed = rev * ((prof.commission_percent || 0) / 100);
                break;
            case 'rent':
                // Professional pays fixed rent to the business
                if (prof.rent_frequency === 'daily') {
                    amountOwed = prof.rent_amount || 0;
                } else if (prof.rent_frequency === 'weekly') {
                    amountOwed = (prof.rent_amount || 0) / 7;
                } else {
                    // monthly
                    amountOwed = (prof.rent_amount || 0) / 30;
                }
                break;
            case 'salary':
                // Fixed monthly salary, prorated daily
                amountOwed = (prof.base_salary || 0) / 30;
                break;
            case 'mixed':
                // Base salary + commission
                const dailySalary = (prof.base_salary || 0) / 30;
                const commission = rev * ((prof.commission_percent || 0) / 100);
                amountOwed = dailySalary + commission;
                break;
            case 'per_service':
                // Fixed amount per service
                amountOwed = (prof.per_service_rate || 0) * svcCount;
                break;
        }

        // For hourly model, get time entries
        if (paymentModel === 'hourly') {
            const timeEntry = await queryOne(
                `SELECT SUM(total_hours) as total_hours FROM time_entries WHERE tenant_id = ? AND professional_id = ? AND date = ?`,
                [user.tenantId, professional_id, date]
            );
            amountOwed = (prof.per_service_rate || 0) * (timeEntry?.total_hours || 0);
        }

        const id = generateId();
        const roundedOwed = Math.round(amountOwed * 100) / 100;

        // Both rent and commission models use running_balance:
        //   - Commission/salary/mixed/per_service: balance = what business owes professional
        //   - Rent: balance = what professional owes business (debt)
        // In both cases, closing the day ADDS to the running_balance.
        const currentBalance = prof.running_balance || 0;

        if (roundedOwed > 0) {
            const newBalance = Math.round((currentBalance + roundedOwed) * 100) / 100;
            const movementId = generateId();
            const movementNote = paymentModel === 'rent' ? 'Arriendo del día' : 'Cierre del día';

            await transaction([
                {
                    sql: `INSERT INTO daily_closings (id, tenant_id, professional_id, date, total_services, total_revenue, revenue_by_method, payment_model, amount_owed, amount_paid, payment_status, notes, closed_by)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', ?, ?)`,
                    args: [id, user.tenantId, professional_id, date, svcCount, rev,
                           JSON.stringify(revenue_by_method || {}), paymentModel,
                           roundedOwed, notes || null, user.userId || null]
                },
                {
                    sql: `INSERT INTO professional_movements (id, tenant_id, professional_id, date, type, amount, balance_after, reference_id, notes, created_by)
                          VALUES (?, ?, ?, ?, 'earning', ?, ?, ?, ?, ?)`,
                    args: [movementId, user.tenantId, professional_id, date, roundedOwed, newBalance, id, movementNote, user.userId || null]
                },
                {
                    sql: `UPDATE professionals SET running_balance = ? WHERE id = ?`,
                    args: [newBalance, professional_id]
                }
            ]);

            return NextResponse.json({
                id,
                amount_owed: roundedOwed,
                payment_model: paymentModel,
                running_balance: newBalance,
                message: 'Cierre registrado'
            }, { status: 201 });
        } else {
            // Zero owed — just insert the closing
            await execute(
                `INSERT INTO daily_closings (id, tenant_id, professional_id, date, total_services, total_revenue, revenue_by_method, payment_model, amount_owed, amount_paid, payment_status, notes, closed_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', ?, ?)`,
                [id, user.tenantId, professional_id, date, svcCount, rev,
                 JSON.stringify(revenue_by_method || {}), paymentModel,
                 roundedOwed, notes || null, user.userId || null]
            );

            return NextResponse.json({
                id,
                amount_owed: roundedOwed,
                payment_model: paymentModel,
                message: 'Cierre registrado'
            }, { status: 201 });
        }
    } catch (error) {
        console.error('Daily closings POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
