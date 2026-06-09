import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { reportDateFilter, tzOffset, tzToday } from '@/lib/utils';

export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const range = searchParams.get('range') || 'month';
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        const today = tzToday();

        // Resolve the period in app (Chile) timezone. `offset` converts the
        // UTC created_at/last_visit columns to local time inside SQL.
        // Custom range (from/to) is bounded on both ends; presets are open-ended.
        let startDate, endDate, offset;
        if (from && to) {
            // Normalize so the order doesn't matter
            startDate = from <= to ? from : to;
            endDate = from <= to ? to : from;
            offset = tzOffset();
        } else {
            const r = reportDateFilter(range);
            startDate = r.dateFilter;
            endDate = null;
            offset = r.offset;
        }

        // Build date conditions. `utcClause`/`localClause` return a WHERE
        // fragment and its bound params for a UTC column (converted with the
        // offset) or a local-date column respectively.
        const utcClause = (col) => endDate
            ? { sql: `DATE(${col}, ?) BETWEEN ? AND ?`, params: [offset, startDate, endDate] }
            : { sql: `DATE(${col}, ?) >= ?`, params: [offset, startDate] };
        const localClause = (col) => endDate
            ? { sql: `${col} BETWEEN ? AND ?`, params: [startDate, endDate] }
            : { sql: `${col} >= ?`, params: [startDate] };

        const salesC = utcClause('created_at');
        const totalSalesRow = await query(
            `SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count FROM sales WHERE tenant_id = ? AND ${salesC.sql} AND status = 'completed'`,
            [user.tenantId, ...salesC.params]
        );
        const totalSales = totalSalesRow[0]?.total || 0;
        const salesCount = totalSalesRow[0]?.count || 0;
        const avgTicket = salesCount > 0 ? totalSales / salesCount : 0;

        const apptC = localClause('date');
        const totalApptsRow = await query(
            `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_shows FROM appointments WHERE tenant_id = ? AND ${apptC.sql}`,
            [user.tenantId, ...apptC.params]
        );
        const totalAppointments = totalApptsRow[0]?.total || 0;
        const noShows = totalApptsRow[0]?.no_shows || 0;
        const noShowRate = totalAppointments > 0 ? ((noShows / totalAppointments) * 100).toFixed(1) : 0;

        const topServicesC = localClause('a.date');
        const topServices = await query(
            `SELECT s.name, COUNT(a.id) as count, COALESCE(SUM(s.price), 0) as revenue
       FROM appointments a JOIN services s ON a.service_id = s.id
       WHERE a.tenant_id = ? AND ${topServicesC.sql}
       GROUP BY s.id ORDER BY count DESC LIMIT 5`,
            [user.tenantId, ...topServicesC.params]
        );

        const profApptC = localClause('a.date');
        const professionalStats = await query(
            `SELECT p.name, p.color, COUNT(a.id) as appointments, COALESCE(SUM(s.price), 0) as revenue
       FROM professionals p
       LEFT JOIN appointments a ON a.professional_id = p.id AND ${profApptC.sql}
       LEFT JOIN services s ON a.service_id = s.id
       WHERE p.tenant_id = ? AND p.active = 1
       GROUP BY p.id ORDER BY revenue DESC`,
            [...profApptC.params, user.tenantId]
        );

        // Calculate occupancy (simplified)
        const profStats = professionalStats.map(p => ({
            ...p,
            occupancy: Math.min(Math.round((p.appointments / (22 * 8)) * 100), 100),
        }));

        const topProductsC = utcClause('s.created_at');
        const topProducts = await query(
            `SELECT si.item_name as name, SUM(si.quantity) as quantity, SUM(si.total) as revenue
       FROM sale_items si JOIN sales s ON si.sale_id = s.id
       WHERE s.tenant_id = ? AND si.type = 'product' AND ${topProductsC.sql}
       GROUP BY si.item_id ORDER BY quantity DESC LIMIT 5`,
            [user.tenantId, ...topProductsC.params]
        );

        const newClientsC = utcClause('created_at');
        const newClients = (await query(
            `SELECT COUNT(*) as c FROM clients WHERE tenant_id = ? AND ${newClientsC.sql}`,
            [user.tenantId, ...newClientsC.params]
        ))[0]?.c || 0;

        const recurringClients = (await query(
            `SELECT COUNT(*) as c FROM clients WHERE tenant_id = ? AND total_visits >= 2`,
            [user.tenantId]
        ))[0]?.c || 0;

        const lostThreshold = (await query(`SELECT DATE(?, '-45 days') as d`, [today]))[0]?.d;
        const lostClients = (await query(
            `SELECT COUNT(*) as c FROM clients WHERE tenant_id = ? AND last_visit IS NOT NULL AND DATE(last_visit, ?) < ? AND active = 1`,
            [user.tenantId, offset, lostThreshold]
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
