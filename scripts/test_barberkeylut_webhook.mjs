// Firma y envía webhooks de ejemplo de la app Barber Keylut a ControlFe y
// comprueba el contrato v1:
//   firma mala → 401 · timestamp vencido → 401 · JSON inválido → 400
//   delivery repetido → 200 sin duplicar · revision vieja → ignorada
//   barbero sin vincular → no se inserta en appointments
//
// Uso (contra un ControlFe local con la integración encendida):
//   BARBERKEYLUT_WEBHOOK_SECRET=... TEST_BARBER_UID=<uid de un barbero vinculado> \
//     node scripts/test_barberkeylut_webhook.mjs [http://localhost:3000]
//
// Sin TEST_BARBER_UID se omiten las pruebas que necesitan un barbero vinculado.
// Al final envía appointment.deleted para dejar cancelada la reserva de prueba.
import crypto from 'node:crypto';

const BASE = (process.argv[2] || process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const SECRET = process.env.BARBERKEYLUT_WEBHOOK_SECRET;
const BARBER_UID = process.env.TEST_BARBER_UID || '';
const URL_WEBHOOK = `${BASE}/api/integrations/barberkeylut/webhook`;

if (!SECRET) {
    console.error('Falta BARBERKEYLUT_WEBHOOK_SECRET.');
    process.exit(2);
}

const runId = Date.now().toString(36);
const results = [];

function signature(secret, timestamp, body) {
    return `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

async function send(payload, { deliveryId = crypto.randomUUID(), secret = SECRET, timestamp, rawBody } = {}) {
    const body = rawBody ?? JSON.stringify({ ...payload, deliveryId });
    const ts = timestamp ?? String(Math.floor(Date.now() / 1000));
    const res = await fetch(URL_WEBHOOK, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Keylut-Timestamp': ts,
            'X-Keylut-Signature': signature(secret, ts, body),
            'X-Keylut-Delivery': deliveryId,
        },
        body,
    });
    let json = null;
    try { json = await res.json(); } catch { /* sin cuerpo */ }
    return { status: res.status, json, deliveryId };
}

function check(name, ok, detail) {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'OK  ' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function booking(id, barberId, revision, status = 'pending') {
    return {
        id, status, date: '2026-12-01', start: '15:00', end: '15:30',
        startAt: '2026-12-01T15:00:00-03:00', endAt: '2026-12-01T15:30:00-03:00', durationMinutes: 30,
        service: { id: 'svc-test', name: 'Corte de prueba', price: 10000 },
        barber: { id: barberId, name: 'Barbero de prueba' },
        client: { id: 'cli-test', name: 'Cliente de prueba', phone: '+56900000000' },
        notes: 'Reserva de prueba del script', attention: null,
        barberResponse: { status: 'none', reason: null, at: null },
        handledBy: null, cancelReason: null, createdAt: new Date().toISOString(), revision,
    };
}

console.log(`Webhook: ${URL_WEBHOOK}\n`);

// 1. Firma mala
let r = await send({ event: 'appointment.created', occurredAt: new Date().toISOString(), appointment: booking(`t-${runId}-bad`, BARBER_UID || 'x', 1) }, { secret: 'secreto-incorrecto' });
check('Firma mala → 401', r.status === 401, `status ${r.status}`);

// 2. Timestamp de hace 10 minutos
r = await send({ event: 'appointment.created', occurredAt: new Date().toISOString(), appointment: booking(`t-${runId}-old`, BARBER_UID || 'x', 1) },
    { timestamp: String(Math.floor(Date.now() / 1000) - 600) });
check('Timestamp vencido (> 300 s) → 401', r.status === 401, `status ${r.status}`);

// 3. JSON inválido con firma válida
r = await send(null, { rawBody: '{ esto no es json' });
check('JSON inválido → 400', r.status === 400, `status ${r.status}`);

// 4. Barbero sin vincular
const unlinkedId = `t-${runId}-unlinked`;
r = await send({ event: 'appointment.created', occurredAt: new Date().toISOString(), appointment: booking(unlinkedId, `uid-sin-vincular-${runId}`, 1) });
check('Barbero sin vincular → no se inserta', r.status === 200 && r.json?.result === 'unlinked', `status ${r.status}, result ${r.json?.result}`);

if (BARBER_UID) {
    const id = `t-${runId}`;
    const revision = Date.now();

    // 5. Alta normal
    r = await send({ event: 'appointment.created', occurredAt: new Date().toISOString(), appointment: booking(id, BARBER_UID, revision) });
    check('appointment.created → se guarda', r.status === 200 && r.json?.result === 'inserted', `status ${r.status}, result ${r.json?.result}`);

    // 6. Mismo delivery repetido
    const repeated = r.deliveryId;
    r = await send({ event: 'appointment.created', occurredAt: new Date().toISOString(), appointment: booking(id, BARBER_UID, revision) }, { deliveryId: repeated });
    check('Delivery repetido → 200 sin duplicar', r.status === 200 && r.json?.duplicate === true, `status ${r.status}, duplicate ${r.json?.duplicate}`);

    // 7. Revision vieja (otro delivery)
    r = await send({ event: 'appointment.updated', occurredAt: new Date().toISOString(), appointment: booking(id, BARBER_UID, revision - 1, 'confirmed') });
    check('Revision vieja → ignorada', r.status === 200 && r.json?.result === 'stale', `status ${r.status}, result ${r.json?.result}`);

    // 8. Revision nueva
    r = await send({ event: 'appointment.updated', occurredAt: new Date().toISOString(), appointment: booking(id, BARBER_UID, revision + 1, 'confirmed') });
    check('Revision nueva → se actualiza', r.status === 200 && r.json?.result === 'updated', `status ${r.status}, result ${r.json?.result}`);

    // Limpieza: la reserva de prueba queda cancelada.
    r = await send({ event: 'appointment.deleted', occurredAt: new Date().toISOString(), appointment: { id } });
    check('appointment.deleted → cancelada', r.status === 200 && r.json?.result === 'cancelled', `status ${r.status}, result ${r.json?.result}`);
} else {
    console.log('\n(Sin TEST_BARBER_UID: se omiten alta, delivery repetido y revision vieja.)');
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones OK`);
process.exit(failed.length ? 1 : 0);
