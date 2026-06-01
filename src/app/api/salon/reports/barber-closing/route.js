import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user || !user.tenantId) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const professional_id = searchParams.get('professional_id');
        let date = searchParams.get('date');

        if (!professional_id) {
            return NextResponse.json({ error: 'Falta professional_id' }, { status: 400 });
        }

        // Default to today if no date provided
        if (!date) {
            date = new Date().toISOString().split('T')[0];
        }

        // 1. Get professional details (for commission percent)
        const profResult = await query(
            `SELECT id, name, commission_percent FROM professionals WHERE id = ? AND tenant_id = ?`,
            [professional_id, user.tenantId]
        );

        if (profResult.length === 0) {
            return NextResponse.json({ error: 'Profesional no encontrado' }, { status: 404 });
        }

        const professional = profResult[0];
        const commissionPercent = professional.commission_percent || 0;

        // 2. Fetch completed sale items handled by this professional today
        const items = await query(
            `SELECT si.id, si.item_name, si.quantity, si.total as item_total,
                    s.id as sale_id, s.total as sale_total, s.payment_method, s.created_at
             FROM sale_items si
             JOIN sales s ON si.sale_id = s.id
             WHERE si.professional_id = ? 
               AND s.tenant_id = ?
               AND DATE(s.created_at) = ?
               AND s.status = 'completed'`,
            [professional_id, user.tenantId, date]
        );

        // 3. Calculate Totals
        let totalRevenue = 0;
        let revenueByMethod = { cash: 0, card: 0, transfer: 0, mixed: 0 };
        let totalServices = items.length;

        items.forEach(item => {
            const amount = item.item_total;
            totalRevenue += amount;

            const method = item.payment_method || 'cash';
            if (revenueByMethod[method] !== undefined) {
                revenueByMethod[method] += amount;
            } else {
                revenueByMethod[method] = amount;
            }
        });

        const commissionEarned = totalRevenue * (commissionPercent / 100);

        return NextResponse.json({
            professional_name: professional.name,
            date: date,
            total_services: totalServices,
            total_revenue: totalRevenue,
            commission_percent: commissionPercent,
            commission_earned: commissionEarned,
            revenue_by_method: revenueByMethod,
            items: items
        });

    } catch (error) {
        console.error('Barber closing report API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
