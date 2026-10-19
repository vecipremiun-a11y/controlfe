import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDb, queryOne } from '@/lib/db';
import {
    isEnabledFor, INBOX_ROLES, ensureIntegrationTables, appApi, applyAppAppointment, getActor, writeAudit,
} from '@/lib/barberkeylut';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES = {
    same_barber: 'La reserva ya está asignada a ese barbero.',
    slot_taken: 'Ese barbero ya tiene ocupado ese horario.',
    barber_inactive: 'Ese barbero está inactivo en la app.',
    not_found: 'La reserva ya no existe en la app.',
    unauthorized: 'La app rechazó la conexión (revisa la API key).',
};

// Responder una reserva de la app en nombre del barbero. [id] es el id de la
// reserva en la app. Body: { action: 'confirm' | 'cancel' | 'reassign',
// reason?, professional_id?, confirm?, note?, idempotency_key }
// La cita local solo se actualiza con el appointment que devuelve la app.
export async function POST(request, { params }) {
    const { id: externalId } = await params;
    const user = await getCurrentUser(request);
    if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    if (!INBOX_ROLES.includes(user.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
    if (!isEnabledFor(user.tenantId)) return NextResponse.json({ error: 'La integración con la app está apagada' }, { status: 404 });

    const tenantId = user.tenantId;
    const db = getDb();
    await ensureIntegrationTables(db);
    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
    const key = body.idempotency_key || crypto.randomUUID();
    const actor = getActor(user);

    let call;
    const details = { action: body.action, externalId };
    switch (body.action) {
        case 'confirm':
            call = () => appApi.confirm(externalId, { actor, ...(body.note ? { note: body.note } : {}) }, key);
            break;
        case 'cancel': {
            const reason = String(body.reason || '').trim();
            if (!reason) return NextResponse.json({ error: 'El motivo es obligatorio' }, { status: 400 });
            details.reason = reason;
            call = () => appApi.cancel(externalId, { actor, reason }, key);
            break;
        }
        case 'reassign': {
            const prof = await queryOne(
                `SELECT id, name, app_barber_uid FROM professionals WHERE id = ? AND tenant_id = ? AND active = 1 AND app_barber_uid IS NOT NULL`,
                [body.professional_id, tenantId]);
            if (!prof) return NextResponse.json({ error: 'Ese profesional no está vinculado a la app' }, { status: 400 });
            details.toProfessional = prof.name;
            details.confirm = body.confirm !== false;
            call = () => appApi.reassign(externalId, { actor, barberId: prof.app_barber_uid, confirm: body.confirm !== false }, key);
            break;
        }
        default:
            return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
    }

    try {
        const res = await call();
        const applied = res.appointment ? await applyAppAppointment(res.appointment, { db, tenantId }) : null;
        await writeAudit({ db, tenantId, user, action: `app_booking.${body.action}`, entityId: externalId, details: { ...details, result: 'ok' } });
        return NextResponse.json({ ok: true, result: applied?.result || null, status: res.appointment?.status || null });
    } catch (e) {
        if (e.status === 409) {
            if (e.appointment) await applyAppAppointment(e.appointment, { db, tenantId });
            const who = e.appointment?.handledBy?.name;
            await writeAudit({ db, tenantId, user, action: `app_booking.${body.action}`, entityId: externalId, details: { ...details, result: 'already_handled', by: who || null } });
            return NextResponse.json({
                code: 'already_handled',
                error: who ? `Esta reserva ya fue respondida por ${who}.` : 'Esta reserva ya fue respondida.',
            }, { status: 409 });
        }
        await writeAudit({ db, tenantId, user, action: `app_booking.${body.action}`, entityId: externalId, details: { ...details, result: e.code || 'error' } });
        if (e.status === 0) {
            return NextResponse.json({ code: 'network', error: 'No se pudo conectar con la app. Reintentar.' }, { status: 502 });
        }
        return NextResponse.json({ code: e.code, error: ERROR_MESSAGES[e.code] || e.message }, { status: e.status >= 400 && e.status < 500 ? e.status : 502 });
    }
}
