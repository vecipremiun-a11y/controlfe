import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { tzToday } from '@/lib/utils';
import { canAccess } from '@/lib/permissions';
import { ensureProfessionalColumns } from '@/lib/professionals';
import {
    isEnabledFor, INBOX_ROLES, ensureIntegrationTables, addDays, APP_BOOKING_COLUMNS, appBookingFromRow,
} from '@/lib/barberkeylut';

export const dynamic = 'force-dynamic';

const OPEN_STATUSES = `('reservado', 'confirmado', 'en_atencion')`;

// Punto de Venta → Reservas: reservas web (source 'online') y de la app
// Barber Keylut ('app') que siguen abiertas, de hoy a hoy + 60. Las de la app
// completadas allá que aún falta cobrar se muestran aunque sean de días
// anteriores (hasta 7).
export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        if (!canAccess(user.role, '/salon/agenda')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

        const tenantId = user.tenantId;
        const today = tzToday();
        const until = addDays(today, 60);
        await ensureProfessionalColumns();

        const online = await query(
            `SELECT a.id, a.date, a.start_time, a.end_time, a.status, a.client_name, a.client_phone, a.client_email,
                    a.notes, a.service_id, a.professional_id,
                    strftime('%Y-%m-%dT%H:%M:%SZ', a.created_at) AS created_at,
                    s.name AS service_name, s.price AS service_price,
                    p.name AS professional_name, p.color AS professional_color, p.salon_collects
             FROM appointments a
             LEFT JOIN services s ON s.id = a.service_id
             LEFT JOIN professionals p ON p.id = a.professional_id
             WHERE a.tenant_id = ? AND a.source = 'online' AND a.status IN ${OPEN_STATUSES} AND a.date BETWEEN ? AND ?
             ORDER BY a.date, a.start_time`,
            [tenantId, today, until]
        );
        const items = online.map((r) => ({
            id: r.id,
            source: 'online',
            date: r.date,
            start: r.start_time,
            end: r.end_time,
            status: r.status,
            client: { name: r.client_name, phone: r.client_phone, email: r.client_email },
            service: { id: r.service_id, name: r.service_name || 'Servicio', price: r.service_price ?? 0 },
            professional: { id: r.professional_id, name: r.professional_name, color: r.professional_color, salonCollects: Number(r.salon_collects ?? 1) === 1 },
            notes: r.notes,
            createdAt: r.created_at,
        }));

        const appEnabled = isEnabledFor(tenantId);
        let professionals = [];
        if (appEnabled) {
            await ensureIntegrationTables();
            const rows = await query(
                `SELECT ${APP_BOOKING_COLUMNS}, p.color AS professional_color,
                        strftime('%Y-%m-%dT%H:%M:%SZ', a.created_at) AS created_iso
                 FROM appointments a
                 LEFT JOIN professionals p ON p.id = a.professional_id
                 LEFT JOIN services s ON s.id = a.service_id
                 WHERE a.tenant_id = ? AND a.source = 'app' AND a.status IN ${OPEN_STATUSES} AND a.date BETWEEN ? AND ?
                 ORDER BY a.date, a.start_time`,
                [tenantId, addDays(today, -7), until]
            );
            for (const r of rows) {
                const item = appBookingFromRow(r);
                if (item.date < today && !item.needsCharge) continue;
                items.push({
                    ...item,
                    source: 'app',
                    professional: { ...item.professional, color: r.professional_color, salonCollects: Number(r.salon_collects ?? 1) === 1 },
                    createdAt: r.created_iso,
                });
            }
            // Para reasignar: solo barberos vinculados a la app.
            professionals = await query(
                `SELECT id, name FROM professionals
                 WHERE tenant_id = ? AND active = 1 AND app_barber_uid IS NOT NULL
                 ORDER BY sort_order, name`,
                [tenantId]
            );
        }
        items.sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));

        return NextResponse.json({
            today,
            items,
            app: { enabled: appEnabled, canAct: appEnabled && INBOX_ROLES.includes(user.role), professionals },
        });
    } catch (error) {
        console.error('Reservations GET error:', error?.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
