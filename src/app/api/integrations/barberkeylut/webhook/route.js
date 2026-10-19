import { NextResponse, after } from 'next/server';
import { getDb } from '@/lib/db';
import {
    getConfig, verifySignature, ensureIntegrationTables, applyAppAppointment, markAppAppointmentDeleted,
    applyAppBarber, deactivateAppBarber, importBookingsForLinkedBarber, syncBusy,
} from '@/lib/barberkeylut';

export const dynamic = 'force-dynamic';

// Webhooks de la app Barber Keylut (contrato v1).
// 200 rápido · 400 JSON inválido (la app no reintenta) · 401 firma inválida ·
// 500 error de base (la app reintenta) · 503 integración apagada.
export async function POST(request) {
    const cfg = getConfig();
    if (!cfg.enabled) {
        return NextResponse.json({ error: 'integration_disabled' }, { status: 503 });
    }

    // Cuerpo crudo ANTES de parsear: la firma se calcula sobre él.
    const rawBody = await request.text();
    const valid = verifySignature({
        rawBody,
        timestamp: request.headers.get('x-keylut-timestamp'),
        signature: request.headers.get('x-keylut-signature'),
        secret: cfg.webhookSecret,
    });
    if (!valid) return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });

    let payload;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    const deliveryId = request.headers.get('x-keylut-delivery') || payload?.deliveryId;
    if (!deliveryId || !payload?.event) {
        return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const db = getDb();
    const tenantId = cfg.tenantId;
    const entityId = payload.appointment?.id || payload.barber?.id || null;
    try {
        await ensureIntegrationTables(db);
        const claimed = await db.execute({
            sql: `INSERT OR IGNORE INTO integration_events (delivery_id, source, event, entity_id, result) VALUES (?, 'barberkeylut', ?, ?, 'processing')`,
            args: [deliveryId, payload.event, entityId],
        });
        if (claimed.rowsAffected === 0) return NextResponse.json({ ok: true, duplicate: true });

        let outcome;
        try {
            outcome = await handleEvent(payload, { db, tenantId });
        } catch (e) {
            // Libera el delivery para que el reintento de la app lo procese.
            await db.execute({ sql: `DELETE FROM integration_events WHERE delivery_id = ?`, args: [deliveryId] });
            throw e;
        }
        await db.execute({ sql: `UPDATE integration_events SET result = ? WHERE delivery_id = ?`, args: [outcome.result, deliveryId] });

        // Seguimiento sin demorar la respuesta: reservas del barbero recién
        // vinculado y colaciones en la ocupación si cambió su horario.
        if (outcome.linkedNow || outcome.scheduleChanged) {
            after(async () => {
                if (outcome.linkedNow) await importBookingsForLinkedBarber({ tenantId });
                await syncBusy({ tenantId, force: true });
            });
        }
        return NextResponse.json({ ok: true, result: outcome.result });
    } catch (e) {
        console.error('[barberkeylut] webhook:', e?.code || e?.message);
        return NextResponse.json({ error: 'internal' }, { status: 500 });
    }
}

async function handleEvent(payload, ctx) {
    switch (payload.event) {
        case 'appointment.created':
        case 'appointment.updated':
            if (!payload.appointment?.id) return { result: 'ignored' };
            return applyAppAppointment(payload.appointment, ctx);
        case 'appointment.deleted':
            if (!payload.appointment?.id) return { result: 'ignored' };
            return markAppAppointmentDeleted(payload.appointment.id, ctx);
        case 'barber.created':
        case 'barber.updated':
            if (!payload.barber?.id) return { result: 'ignored' };
            return applyAppBarber(payload.barber, ctx);
        case 'barber.deleted':
            if (!payload.barber?.id) return { result: 'ignored' };
            return deactivateAppBarber(payload.barber.id, ctx);
        default:
            return { result: 'ignored' };
    }
}
