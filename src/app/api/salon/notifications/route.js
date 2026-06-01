import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, execute } from '@/lib/db';

// GET - Fetch recent unread notifications (new appointments from online bookings)
export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const since = searchParams.get('since'); // ISO timestamp to check for new ones

        // Get recent online appointments (last 24 hours or since timestamp)
        const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const notifications = await query(
            `SELECT a.id, a.client_name, a.client_phone, a.date, a.start_time, a.end_time, 
                    a.status, a.source, a.created_at, a.notes,
                    s.name as service_name, s.price as service_price,
                    p.name as professional_name
             FROM appointments a
             LEFT JOIN services s ON s.id = a.service_id
             LEFT JOIN professionals p ON p.id = a.professional_id
             WHERE a.tenant_id = ? AND a.source = 'online' AND a.created_at > ?
             ORDER BY a.created_at DESC
             LIMIT 20`,
            [user.tenantId, sinceDate]
        );

        // Count unread (created after last seen)
        const lastSeen = searchParams.get('last_seen') || sinceDate;
        const unreadCount = await query(
            `SELECT COUNT(*) as count FROM appointments 
             WHERE tenant_id = ? AND source = 'online' AND created_at > ?`,
            [user.tenantId, lastSeen]
        );

        return NextResponse.json({
            notifications,
            unread_count: unreadCount[0]?.count || 0,
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
