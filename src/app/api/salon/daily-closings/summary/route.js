import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET: Summary of closings for a month (or date range) with accumulated debt
export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const month = searchParams.get('month'); // YYYY-MM
        const professionalId = searchParams.get('professional_id');

        if (!month) {
            return NextResponse.json({ error: 'Falta parámetro month (YYYY-MM)' }, { status: 400 });
        }

        const fromDate = `${month}-01`;
        const [year, mon] = month.split('-').map(Number);
        const lastDay = new Date(year, mon, 0).getDate();
        const toDate = `${month}-${String(lastDay).padStart(2, '0')}`;

        // Per-professional summary for the month
        let summarySQL = `
            SELECT 
                p.id as professional_id,
                p.name as professional_name,
                p.payment_mode,
                p.color,
                p.avatar_url,
                COUNT(dc.id) as days_worked,
                COALESCE(SUM(dc.total_services), 0) as total_services,
                COALESCE(SUM(dc.total_revenue), 0) as total_revenue,
                COALESCE(SUM(dc.amount_owed), 0) as total_owed,
                COALESCE(SUM(dc.amount_paid), 0) as total_paid,
                COALESCE(SUM(dc.amount_owed), 0) - COALESCE(SUM(dc.amount_paid), 0) as total_debt
            FROM professionals p
            LEFT JOIN daily_closings dc ON dc.professional_id = p.id AND dc.date >= ? AND dc.date <= ? AND dc.tenant_id = ?
            WHERE p.tenant_id = ? AND p.active = 1`;

        const params = [fromDate, toDate, user.tenantId, user.tenantId];

        if (professionalId) {
            summarySQL += ` AND p.id = ?`;
            params.push(professionalId);
        }

        summarySQL += ` GROUP BY p.id ORDER BY p.sort_order, p.name`;

        const summary = await query(summarySQL, params);

        // Daily detail for calendar view
        let dailyParams = [user.tenantId, fromDate, toDate];
        let dailySQL = `SELECT dc.professional_id, dc.date, dc.payment_status, dc.amount_owed, dc.amount_paid, dc.total_services, dc.total_revenue
                         FROM daily_closings dc
                         WHERE dc.tenant_id = ? AND dc.date >= ? AND dc.date <= ?`;

        if (professionalId) {
            dailySQL += ` AND dc.professional_id = ?`;
            dailyParams.push(professionalId);
        }

        dailySQL += ` ORDER BY dc.date`;

        const dailyData = await query(dailySQL, dailyParams);

        // Accumulated total debt (all time, not just this month)
        let debtParams = [user.tenantId];
        let debtSQL = `SELECT 
                          p.id as professional_id,
                          COALESCE(SUM(dc.amount_owed), 0) - COALESCE(SUM(dc.amount_paid), 0) as accumulated_debt
                        FROM professionals p
                        LEFT JOIN daily_closings dc ON dc.professional_id = p.id AND dc.tenant_id = ? AND dc.payment_status != 'paid' AND dc.payment_status != 'waived'
                        WHERE p.tenant_id = ? AND p.active = 1`;
        debtParams.push(user.tenantId);

        if (professionalId) {
            debtSQL += ` AND p.id = ?`;
            debtParams.push(professionalId);
        }

        debtSQL += ` GROUP BY p.id`;

        const debts = await query(debtSQL, debtParams);
        const debtMap = {};
        for (const d of debts) {
            debtMap[d.professional_id] = Math.round((d.accumulated_debt || 0) * 100) / 100;
        }

        // Attach accumulated debt to summary
        for (const s of summary) {
            s.accumulated_debt = debtMap[s.professional_id] || 0;
        }

        return NextResponse.json({
            month,
            summary,
            daily: dailyData,
        });
    } catch (error) {
        console.error('Daily closings summary error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
