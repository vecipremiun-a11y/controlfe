import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user || !user.tenantId) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const tenantId = user.tenantId;
        const today = new Date().toISOString().split('T')[0];
        const monthStart = today.slice(0, 7) + '-01';

        // Today's sales total
        const salesTodayRow = await query(
            `SELECT COALESCE(SUM(total), 0) as total FROM sales WHERE tenant_id = ? AND DATE(created_at) = ? AND status = 'completed'`,
            [tenantId, today]
        );
        const salesToday = salesTodayRow[0]?.total || 0;

        // Yesterday's sales (for comparison)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        const salesYesterdayRow = await query(
            `SELECT COALESCE(SUM(total), 0) as total FROM sales WHERE tenant_id = ? AND DATE(created_at) = ? AND status = 'completed'`,
            [tenantId, yesterdayStr]
        );
        const salesYesterday = salesYesterdayRow[0]?.total || 0;

        // Appointments today
        const appointmentsTodayRow = await query(
            `SELECT COUNT(*) as count FROM appointments WHERE tenant_id = ? AND date = ?`,
            [tenantId, today]
        );
        const appointmentsToday = appointmentsTodayRow[0]?.count || 0;

        // New clients this month
        const newClientsRow = await query(
            `SELECT COUNT(*) as count FROM clients WHERE tenant_id = ? AND DATE(created_at) >= ?`,
            [tenantId, monthStart]
        );
        const newClientsMonth = newClientsRow[0]?.count || 0;

        // Average ticket this month  
        const avgTicketRow = await query(
            `SELECT COALESCE(AVG(total), 0) as avg FROM sales WHERE tenant_id = ? AND DATE(created_at) >= ? AND status = 'completed'`,
            [tenantId, monthStart]
        );
        const avgTicket = avgTicketRow[0]?.avg || 0;

        // Today's appointments with details
        const todayAppointments = await query(
            `SELECT a.*, s.name as service_name, s.color, p.name as professional_name 
       FROM appointments a 
       LEFT JOIN services s ON a.service_id = s.id 
       LEFT JOIN professionals p ON a.professional_id = p.id 
       WHERE a.tenant_id = ? AND a.date = ? 
       ORDER BY a.start_time ASC`,
            [tenantId, today]
        );

        // Low stock products
        const lowStockProducts = await query(
            `SELECT name, stock, min_stock FROM products WHERE tenant_id = ? AND stock <= min_stock AND active = 1 ORDER BY stock ASC LIMIT 5`,
            [tenantId]
        );

        // Top services this month
        const topServices = await query(
            `SELECT s.name, COUNT(a.id) as count 
       FROM appointments a 
       JOIN services s ON a.service_id = s.id 
       WHERE a.tenant_id = ? AND a.date >= ? 
       GROUP BY s.id, s.name 
       ORDER BY count DESC LIMIT 5`,
            [tenantId, monthStart]
        );

        const salesChange = salesYesterday > 0 ? ((salesToday - salesYesterday) / salesYesterday) * 100 : 0;

        return NextResponse.json({
            stats: {
                salesToday,
                salesChange,
                appointmentsToday,
                appointmentsChange: 0,
                newClientsMonth,
                clientsChange: 0,
                avgTicket: Math.round(avgTicket),
                ticketChange: 0,
                lowStockProducts,
                topServices,
            },
            todayAppointments,
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
