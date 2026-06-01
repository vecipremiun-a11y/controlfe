import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const range = searchParams.get('range') || 'month';

        let dateFilter;
        const now = new Date();
        switch (range) {
            case 'today': dateFilter = now.toISOString().split('T')[0]; break;
            case 'week':
                const weekAgo = new Date(now);
                weekAgo.setDate(weekAgo.getDate() - 7);
                dateFilter = weekAgo.toISOString().split('T')[0]; break;
            case 'year':
                dateFilter = `${now.getFullYear()}-01-01`; break;
            default: dateFilter = now.toISOString().slice(0, 7) + '-01';
        }

        const totalSalesRow = await query(
            `SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count FROM sales WHERE tenant_id = ? AND DATE(created_at) >= ? AND status = 'completed'`,
            [user.tenantId, dateFilter]
        );
        const totalSales = totalSalesRow[0]?.total || 0;
        const salesCount = totalSalesRow[0]?.count || 0;
        const avgTicket = salesCount > 0 ? totalSales / salesCount : 0;

        const totalApptsRow = await query(
            `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_shows FROM appointments WHERE tenant_id = ? AND date >= ?`,
            [user.tenantId, dateFilter]
        );
        const totalAppointments = totalApptsRow[0]?.total || 0;
        const noShows = totalApptsRow[0]?.no_shows || 0;
        const noShowRate = totalAppointments > 0 ? ((noShows / totalAppointments) * 100).toFixed(1) : 0;

        const topServices = await query(
            `SELECT s.name, COUNT(a.id) as count, COALESCE(SUM(s.price), 0) as revenue
       FROM appointments a JOIN services s ON a.service_id = s.id
       WHERE a.tenant_id = ? AND a.date >= ?
       GROUP BY s.id ORDER BY count DESC LIMIT 5`,
            [user.tenantId, dateFilter]
        );

        const professionalStats = await query(
            `SELECT p.name, p.color, COUNT(a.id) as appointments, COALESCE(SUM(s.price), 0) as revenue
       FROM professionals p
       LEFT JOIN appointments a ON a.professional_id = p.id AND a.date >= ?
       LEFT JOIN services s ON a.service_id = s.id
       WHERE p.tenant_id = ? AND p.active = 1
       GROUP BY p.id ORDER BY revenue DESC`,
            [dateFilter, user.tenantId]
        );

        // Calculate occupancy (simplified)
        const profStats = professionalStats.map(p => ({
            ...p,
            occupancy: Math.min(Math.round((p.appointments / (22 * 8)) * 100), 100),
        }));

        const topProducts = await query(
            `SELECT si.item_name as name, SUM(si.quantity) as quantity, SUM(si.total) as revenue
       FROM sale_items si JOIN sales s ON si.sale_id = s.id
       WHERE s.tenant_id = ? AND si.type = 'product' AND DATE(s.created_at) >= ?
       GROUP BY si.item_id ORDER BY quantity DESC LIMIT 5`,
            [user.tenantId, dateFilter]
        );

        const newClients = (await query(
            `SELECT COUNT(*) as c FROM clients WHERE tenant_id = ? AND DATE(created_at) >= ?`,
            [user.tenantId, dateFilter]
        ))[0]?.c || 0;

        const recurringClients = (await query(
            `SELECT COUNT(*) as c FROM clients WHERE tenant_id = ? AND total_visits >= 2`,
            [user.tenantId]
        ))[0]?.c || 0;

        const lostThreshold = new Date();
        lostThreshold.setDate(lostThreshold.getDate() - 45);
        const lostClients = (await query(
            `SELECT COUNT(*) as c FROM clients WHERE tenant_id = ? AND last_visit IS NOT NULL AND DATE(last_visit) < ? AND active = 1`,
            [user.tenantId, lostThreshold.toISOString().split('T')[0]]
        ))[0]?.c || 0;

        return NextResponse.json({
            totalSales, totalAppointments, avgTicket: Math.round(avgTicket), noShowRate,
            topServices, professionalStats: profStats, topProducts,
            newClients, recurringClients, lostClients,
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
