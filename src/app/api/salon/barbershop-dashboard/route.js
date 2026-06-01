import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user || !user.tenantId) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const tenantId = user.tenantId;
        const today = new Date().toISOString().split('T')[0];

        // 0. Tenant config (currency + operational config)
        const tenantConfig = await query(`SELECT currency, config FROM tenants WHERE id = ?`, [tenantId]);
        const currency = tenantConfig[0]?.currency || 'USD';
        let opConfig = {};
        try { opConfig = JSON.parse(tenantConfig[0]?.config || '{}'); } catch {}

        // 1. Waiting customers from waitlist
        const waitingCustomers = await query(
            `SELECT w.id, w.client_name, w.client_phone, w.service_id, w.professional_id, w.notes, w.created_at,
                    s.name as service_name, s.duration_min, s.price as service_price
             FROM waitlist w
             LEFT JOIN services s ON w.service_id = s.id
             WHERE w.tenant_id = ? AND w.status = 'waiting'
             ORDER BY w.created_at ASC`,
            [tenantId]
        );

        // 2. Active professionals with their current appointment status
        const professionals = await query(
            `SELECT p.id, p.name, p.phone, p.email, p.avatar_url, p.color, p.specialties, p.is_available, p.commission_percent, p.payment_mode, p.base_salary, p.per_service_rate, p.rent_amount, p.rent_frequency, p.running_balance, p.pay_frequency
             FROM professionals p
             WHERE p.tenant_id = ? AND p.active = 1
             ORDER BY p.sort_order, p.name`,
            [tenantId]
        );

        // 3. Current active appointments (en_atencion) for today
        const activeAppointments = await query(
            `SELECT a.id, a.professional_id, a.client_id, a.service_id, a.start_time, a.end_time,
                    a.client_name, a.status, a.notes,
                    s.name as service_name, s.duration_min, s.price as service_price,
                    c.name as client_full_name
             FROM appointments a
             LEFT JOIN services s ON a.service_id = s.id
             LEFT JOIN clients c ON a.client_id = c.id
             WHERE a.tenant_id = ? AND a.date = ? AND a.status = 'en_atencion'`,
            [tenantId, today]
        );

        // 4. Queued appointments (reservado or confirmado) for today
        const queuedAppointments = await query(
            `SELECT a.id, a.professional_id, a.client_name, a.start_time,
                    s.name as service_name
             FROM appointments a
             LEFT JOIN services s ON a.service_id = s.id
             WHERE a.tenant_id = ? AND a.date = ? AND a.status IN ('reservado', 'confirmado')
             ORDER BY a.start_time ASC`,
            [tenantId, today]
        );

        // 5a. Count completed services per professional today (for smart assign)
        const todayServiceCounts = await query(
            `SELECT professional_id,
                    COUNT(*) as services_today,
                    MAX(created_at) as last_service_at
             FROM sale_items si
             JOIN sales s ON si.sale_id = s.id
             WHERE s.tenant_id = ? AND DATE(s.created_at) = ? AND s.status = 'completed'
             GROUP BY professional_id`,
            [tenantId, today]
        );
        const serviceCountMap = {};
        for (const sc of todayServiceCounts) {
            serviceCountMap[sc.professional_id] = {
                count: sc.services_today,
                lastAt: sc.last_service_at,
            };
        }

        // 5b. Check today's closings (safe – table may not exist yet)
        let closingMap = {};
        try {
            const todayClosings = await query(
                `SELECT professional_id, payment_status FROM daily_closings WHERE tenant_id = ? AND date = ?`,
                [tenantId, today]
            );
            for (const c of todayClosings) { closingMap[c.professional_id] = c.payment_status; }
        } catch (_) { /* table may not exist */ }

        // 6. Build professional status map
        const professionalsWithStatus = professionals.map((prof) => {
            const currentAppt = activeAppointments.find(a => a.professional_id === prof.id);
            const queue = queuedAppointments.filter(a => a.professional_id === prof.id);

            let status = prof.is_available === 0 ? 'unavailable' : 'available';

            if (currentAppt) {
                status = queue.length > 0 ? 'busy_with_queue' : 'busy';
            } else if (prof.is_available === 0) {
                status = 'unavailable';
            }

            return {
                ...prof,
                status,
                currentAppointment: currentAppt || null,
                queue,
                queueCount: queue.length,
                dayClosed: !!closingMap[prof.id],
                dayClosingStatus: closingMap[prof.id] || null,
                servicesToday: serviceCountMap[prof.id]?.count || 0,
                lastServiceAt: serviceCountMap[prof.id]?.lastAt || null,
            };
        });

        // 6. Today's sales summary
        const salesSummary = await query(
            `SELECT COUNT(*) as total_sales, COALESCE(SUM(total), 0) as total_revenue,
                    COALESCE(SUM(tip), 0) as total_tips
             FROM sales
             WHERE tenant_id = ? AND DATE(created_at) = ? AND status = 'completed'`,
            [tenantId, today]
        );

        // 7. Recent completed sales for checkout reference
        const recentSales = await query(
            `SELECT s.id, s.total, s.tip, s.payment_method, s.created_at,
                    c.name as client_name
             FROM sales s
             LEFT JOIN clients c ON s.client_id = c.id
             WHERE s.tenant_id = ? AND DATE(s.created_at) = ? AND s.status = 'completed'
             ORDER BY s.created_at DESC
             LIMIT 5`,
            [tenantId, today]
        );

        // 8. Products for the "Add Product" feature
        const products = await query(
            `SELECT id, name, price, stock
             FROM products
             WHERE tenant_id = ? AND active = 1 AND stock > 0
             ORDER BY name ASC`,
            [tenantId]
        );

        // 9. Services list for reference
        const services = await query(
            `SELECT id, name, price, duration_min
             FROM services
             WHERE tenant_id = ? AND active = 1
             ORDER BY sort_order, name`,
            [tenantId]
        );

        return NextResponse.json({
            currency,
            assignMode: opConfig.assign_mode || 'least_busy',
            waitingCustomers,
            professionals: professionalsWithStatus,
            salesSummary: salesSummary[0] || { total_sales: 0, total_revenue: 0, total_tips: 0 },
            recentSales,
            products,
            services,
        });
    } catch (error) {
        console.error('Barbershop dashboard error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
