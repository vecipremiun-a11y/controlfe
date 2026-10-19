import { NextResponse, after } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDb, query } from '@/lib/db';
import { tzToday } from '@/lib/utils';
import {
    isEnabledFor, INBOX_ROLES, ensureIntegrationTables, refreshFromApp, retryPendingCompletes, syncBusy, addDays,
} from '@/lib/barberkeylut';

export const dynamic = 'force-dynamic';

// Bandeja "Reservas de la app". ?refresh=1 (al abrirla) trae las reservas de
// hoy a hoy + 60 desde la app como respaldo por si se perdió un webhook; los
// refrescos siguientes leen solo la base local.
export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        if (!INBOX_ROLES.includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
        if (!isEnabledFor(user.tenantId)) return NextResponse.json({ enabled: false });

        const tenantId = user.tenantId;
        const db = getDb();
        await ensureIntegrationTables(db);
        const today = tzToday();
        const { searchParams } = new URL(request.url);

        let unlinked = null;
        let refreshError = null;
        if (searchParams.get('refresh')) {
            try {
                const r = await refreshFromApp({ db, tenantId, from: today, to: addDays(today, 60) });
                unlinked = r.unlinked
                    .filter((a) => a.status === 'pending' || a.status === 'confirmed')
                    .map(fromApi);
            } catch (e) {
                refreshError = e.code === 'network' ? 'network' : (e.code || 'error');
            }
            after(async () => {
                await retryPendingCompletes({ tenantId });
                await syncBusy({ tenantId });
            });
        }

        const rows = await query(
            `SELECT a.id, a.external_id, a.date, a.start_time, a.end_time, a.status, a.client_name, a.client_phone,
                    a.notes, a.cancel_reason, a.service_id, a.professional_id,
                    a.external_status, a.external_attention, a.external_barber_reason, a.external_handled_by,
                    a.external_service_name, a.external_service_price, a.external_barber_uid, a.external_barber_name,
                    a.external_complete_pending,
                    p.name AS professional_name, p.app_barber_uid, p.salon_collects,
                    s.name AS service_name, s.price AS service_price,
                    EXISTS (SELECT 1 FROM sales sa WHERE sa.appointment_id = a.id AND sa.status = 'completed') AS charged
             FROM appointments a
             LEFT JOIN professionals p ON p.id = a.professional_id
             LEFT JOIN services s ON s.id = a.service_id
             WHERE a.tenant_id = ? AND a.source = 'app' AND a.date BETWEEN ? AND ?
             ORDER BY a.date, a.start_time`,
            [tenantId, addDays(today, -7), addDays(today, 60)]
        );
        const professionals = await query(
            `SELECT id, name FROM professionals
             WHERE tenant_id = ? AND active = 1 AND app_barber_uid IS NOT NULL
             ORDER BY sort_order, name`,
            [tenantId]
        );

        return NextResponse.json({
            enabled: true,
            today,
            items: rows.map(fromRow),
            unlinked,
            refreshError,
            professionals,
        });
    } catch (error) {
        console.error('App bookings GET error:', error?.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function parseJson(value) {
    try { return value ? JSON.parse(value) : null; } catch { return null; }
}

function fromRow(r) {
    const closed = ['terminado', 'cancelado', 'no_show'].includes(r.status);
    return {
        id: r.id,
        externalId: r.external_id,
        date: r.date,
        start: r.start_time,
        end: r.end_time,
        status: r.status,
        externalStatus: r.external_status,
        client: { name: r.client_name, phone: r.client_phone },
        service: {
            id: r.service_id,
            name: r.service_name || r.external_service_name || 'Servicio',
            price: r.service_price ?? r.external_service_price ?? 0,
        },
        professional: { id: r.professional_id, name: r.professional_name },
        barberName: r.external_barber_name,
        attention: r.status === 'reservado' ? r.external_attention : null,
        barberReason: r.external_barber_reason,
        handledBy: parseJson(r.external_handled_by),
        barberUnlinked: !!r.external_barber_uid && r.external_barber_uid !== r.app_barber_uid,
        needsCharge: r.external_status === 'completed' && Number(r.salon_collects) === 1 && !Number(r.charged) && !closed,
        completePending: !!r.external_complete_pending,
        cancelReason: r.cancel_reason,
        notes: r.notes,
    };
}

// Reserva de un barbero aún sin vincular: se muestra con los datos de la API.
function fromApi(a) {
    return {
        id: null,
        externalId: a.id,
        date: a.date,
        start: a.start,
        end: a.end,
        status: 'unlinked',
        externalStatus: a.status,
        client: { name: a.client?.name || null, phone: a.client?.phone || null },
        service: { id: null, name: a.service?.name || 'Servicio', price: a.service?.price ?? 0 },
        professional: null,
        barberName: a.barber?.name || null,
        attention: a.status === 'pending' ? a.attention || null : null,
        barberReason: a.barberResponse?.reason || null,
        handledBy: a.handledBy || null,
        barberUnlinked: true,
        needsCharge: false,
        completePending: false,
        cancelReason: a.cancelReason || null,
        notes: a.notes || null,
    };
}
