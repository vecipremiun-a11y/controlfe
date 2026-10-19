import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { isEnabledFor, ensureIntegrationTables } from '@/lib/barberkeylut';

// GET - Notificaciones recientes: reservas online nuevas y, si la integración
// Barber Keylut está activa, reservas nuevas de la app y las que requieren
// atención. created_at se devuelve en ISO UTC para que el navegador lo lea bien.
export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const since = searchParams.get('since');
        const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const lastSeen = searchParams.get('last_seen') || sinceDate;

        const appEnabled = isEnabledFor(user.tenantId);
        if (appEnabled) await ensureIntegrationTables();
        const sources = appEnabled ? `('online', 'app')` : `('online')`;

        const created = await query(
            `SELECT a.id, a.client_name, a.client_phone, a.date, a.start_time, a.end_time,
                    a.status, a.source, a.notes,
                    strftime('%Y-%m-%dT%H:%M:%SZ', a.created_at) AS created_at,
                    COALESCE(s.name, ${appEnabled ? 'a.external_service_name' : 'NULL'}) AS service_name, s.price AS service_price,
                    p.name AS professional_name,
                    CASE WHEN a.source = 'app' THEN 'app' ELSE 'online' END AS kind
             FROM appointments a
             LEFT JOIN services s ON s.id = a.service_id
             LEFT JOIN professionals p ON p.id = a.professional_id
             WHERE a.tenant_id = ? AND a.source IN ${sources} AND a.created_at > datetime(?)
             ORDER BY a.created_at DESC
             LIMIT 20`,
            [user.tenantId, sinceDate]
        );
        let notifications = created;
        let unread = Number((await query(
            `SELECT COUNT(*) AS count FROM appointments WHERE tenant_id = ? AND source IN ${sources} AND created_at > datetime(?)`,
            [user.tenantId, lastSeen]
        ))[0]?.count || 0);

        if (appEnabled) {
            // Reservas de la app pendientes que requieren atención (el barbero no
            // puede, no respondió o hay choque). external_synced_at ya es ISO.
            const attention = await query(
                `SELECT a.id, a.client_name, a.client_phone, a.date, a.start_time, a.end_time, a.status, a.source, a.notes,
                        a.external_synced_at AS created_at, a.external_attention,
                        strftime('%Y-%m-%dT%H:%M:%SZ', a.created_at) AS created_iso,
                        COALESCE(s.name, a.external_service_name) AS service_name, s.price AS service_price,
                        p.name AS professional_name, 'app_attention' AS kind
                 FROM appointments a
                 LEFT JOIN services s ON s.id = a.service_id
                 LEFT JOIN professionals p ON p.id = a.professional_id
                 WHERE a.tenant_id = ? AND a.source = 'app' AND a.status = 'reservado' AND a.external_attention IS NOT NULL
                 ORDER BY a.external_synced_at DESC
                 LIMIT 20`,
                [user.tenantId]
            );
            const attentionIds = new Set(attention.map((a) => a.id));
            notifications = [...attention, ...created.filter((n) => !attentionIds.has(n.id))]
                .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
                .slice(0, 20);
            // Las recién creadas ya se contaron arriba.
            unread += attention.filter((a) => String(a.created_at) > lastSeen && !(String(a.created_iso) > lastSeen)).length;
        }

        return NextResponse.json({ notifications, unread_count: unread });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
