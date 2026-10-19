import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDb, query } from '@/lib/db';
import { canAccess } from '@/lib/permissions';
import { isEnabledFor, ensureIntegrationTables, appApi } from '@/lib/barberkeylut';

export const dynamic = 'force-dynamic';

// Barberos de la app para el selector "Barbero en la app" de Personal.
export async function GET(request) {
    const user = await getCurrentUser(request);
    if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    if (!canAccess(user.role, '/salon/personal')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
    if (!isEnabledFor(user.tenantId)) return NextResponse.json({ enabled: false });

    const db = getDb();
    await ensureIntegrationTables(db);
    const linked = await query(
        `SELECT id, name, app_barber_uid FROM professionals WHERE tenant_id = ? AND app_barber_uid IS NOT NULL`,
        [user.tenantId]
    );
    const linkedBy = Object.fromEntries(linked.map((p) => [p.app_barber_uid, { id: p.id, name: p.name }]));
    try {
        const data = await appApi.barbers();
        return NextResponse.json({
            enabled: true,
            barbers: (data.barbers || []).map((b) => ({ ...b, linkedTo: linkedBy[b.id] || null })),
            invites: data.invites || [],
        });
    } catch (e) {
        return NextResponse.json({ enabled: true, barbers: [], invites: [], error: e.code === 'network' ? 'No se pudo conectar con la app' : e.message });
    }
}
