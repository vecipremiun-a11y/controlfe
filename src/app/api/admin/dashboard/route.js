import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user || user.type !== 'saas') {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const monthStart = new Date().toISOString().slice(0, 7) + '-01';

        const activeTenants = (await query(`SELECT COUNT(*) as c FROM tenants WHERE status = 'activo'`))[0]?.c || 0;
        const newTenantsMonth = (await query(`SELECT COUNT(*) as c FROM tenants WHERE DATE(created_at) >= ?`, [monthStart]))[0]?.c || 0;
        const totalAppointments = (await query(`SELECT COUNT(*) as c FROM appointments`))[0]?.c || 0;

        // Calculate MRR from active subscriptions
        const mrrRow = await query(`
      SELECT COALESCE(SUM(p.price_monthly), 0) as mrr 
      FROM tenants t 
      JOIN plans p ON t.plan_id = p.id 
      WHERE t.status = 'activo'
    `);
        const mrr = mrrRow[0]?.mrr || 0;

        const recentTenants = await query(`
      SELECT t.*, p.name as plan_name 
      FROM tenants t 
      LEFT JOIN plans p ON t.plan_id = p.id 
      ORDER BY t.created_at DESC 
      LIMIT 10
    `);

        return NextResponse.json({
            activeTenants,
            newTenantsMonth,
            mrr,
            totalAppointments,
            recentTenants,
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
