// Pruebas de la integración con la app Barber Keylut (src/lib/barberkeylut.js).
// Firma, reglas de estado y upserts de reservas y barberos contra una base
// SQLite temporal. No llaman a la API de la app. Ejecutar: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { SCHEMA_STATEMENTS } from '../src/lib/schema.js';
import {
    verifySignature, resolveLocalStatus, scheduleToApp, phoneToE164, phoneFromE164, ensureIntegrationTables,
    applyAppAppointment, markAppAppointmentDeleted, applyAppBarber, deactivateAppBarber, pushScheduleToApp,
} from '../src/lib/barberkeylut.js';

const TENANT = 'tenant-keylut';
const tempFiles = [];
const clients = [];

after(() => {
    for (const db of clients) db.close();
    for (const f of tempFiles) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch { /* no existe */ } }
});

async function createDb() {
    const file = path.join(os.tmpdir(), `bk-${crypto.randomUUID()}.db`);
    tempFiles.push(file);
    const db = createClient({ url: `file:${file.replace(/\\/g, '/')}` });
    clients.push(db);
    await db.execute('PRAGMA journal_mode=WAL');
    for (const sql of SCHEMA_STATEMENTS) await db.execute(sql);
    // Columnas que producción agregó por migración.
    await db.execute(`ALTER TABLE professionals ADD COLUMN salon_collects INTEGER NOT NULL DEFAULT 1`);
    await db.execute(`ALTER TABLE professionals ADD COLUMN country_code TEXT DEFAULT '+56'`);
    await ensureIntegrationTables(db);
    await db.execute({ sql: `INSERT INTO tenants (id, name, slug) VALUES (?, 'Keylut', 'keylut')`, args: [TENANT] });
    await db.execute({ sql: `INSERT INTO professionals (id, tenant_id, name, app_barber_uid, app_uses, app_link_status) VALUES ('p-pedro', ?, 'Pedro', 'uid-pedro', 1, 'active')`, args: [TENANT] });
    await db.execute({ sql: `INSERT INTO professionals (id, tenant_id, name, app_barber_uid, app_uses, app_link_status, salon_collects) VALUES ('p-juan', ?, 'Juan', 'uid-juan', 1, 'active', 0)`, args: [TENANT] });
    await db.execute({ sql: `INSERT INTO services (id, tenant_id, name, duration_min, price) VALUES ('s-corte', ?, 'Corte Clásico', 30, 10000)`, args: [TENANT] });
    return db;
}

function booking(overrides = {}) {
    return {
        id: 'a1B2c3', status: 'pending', date: '2026-10-20', start: '15:00', end: '15:30',
        startAt: '2026-10-20T15:00:00-03:00', endAt: '2026-10-20T15:30:00-03:00', durationMinutes: 30,
        service: { id: 'svc-app', name: 'corte clásico', price: 10000 },
        barber: { id: 'uid-pedro', name: 'Pedro' },
        client: { id: 'uid-cli', name: 'Cliente Prueba', phone: '+56911112222' },
        notes: null, attention: null, barberResponse: { status: 'none', reason: null, at: null },
        handledBy: null, cancelReason: null, createdAt: '2026-10-18T22:10:00.000Z', revision: 100,
        ...overrides,
    };
}

async function getAppt(db, externalId = 'a1B2c3') {
    return (await db.execute({ sql: `SELECT * FROM appointments WHERE source = 'app' AND external_id = ?`, args: [externalId] })).rows[0];
}

function sign(secret, ts, body) {
    return `sha256=${crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;
}

test('Firma del webhook: válida, secreto incorrecto, cuerpo alterado y timestamp vencido', () => {
    const secret = 'secreto-de-prueba';
    const body = JSON.stringify({ event: 'appointment.created' });
    const now = Date.now();
    const ts = String(Math.floor(now / 1000));
    assert.equal(verifySignature({ rawBody: body, timestamp: ts, signature: sign(secret, ts, body), secret, now }), true);
    assert.equal(verifySignature({ rawBody: body, timestamp: ts, signature: sign('otro', ts, body), secret, now }), false);
    assert.equal(verifySignature({ rawBody: body + ' ', timestamp: ts, signature: sign(secret, ts, body), secret, now }), false);
    const old = String(Math.floor(now / 1000) - 301);
    assert.equal(verifySignature({ rawBody: body, timestamp: old, signature: sign(secret, old, body), secret, now }), false, 'más de 300 s');
    const ms = String(now);
    assert.equal(verifySignature({ rawBody: body, timestamp: ms, signature: sign(secret, ms, body), secret, now }), true, 'acepta milisegundos');
    assert.equal(verifySignature({ rawBody: body, timestamp: ts, signature: 'sha256=corta', secret, now }), false);
});

test('Mapeo de estados y estados locales permitidos', () => {
    assert.equal(resolveLocalStatus({ appStatus: 'pending' }), 'reservado');
    assert.equal(resolveLocalStatus({ appStatus: 'confirmed' }), 'confirmado');
    assert.equal(resolveLocalStatus({ appStatus: 'cancelled' }), 'cancelado');
    assert.equal(resolveLocalStatus({ appStatus: 'no_show' }), 'no_show');
    assert.equal(resolveLocalStatus({ appStatus: 'confirmed', localStatus: 'en_atencion' }), 'en_atencion', 'confirmed no revierte en_atencion');
    assert.equal(resolveLocalStatus({ appStatus: 'confirmed', localStatus: 'terminado' }), 'terminado', 'confirmed no revierte terminado');
    assert.equal(resolveLocalStatus({ appStatus: 'completed', salonCollects: 1, charged: false }), 'confirmado', 'falta cobrar');
    assert.equal(resolveLocalStatus({ appStatus: 'completed', salonCollects: 1, charged: true }), 'terminado');
    assert.equal(resolveLocalStatus({ appStatus: 'completed', salonCollects: 0 }), 'terminado', 'el barbero se cobra solo');
});

test('Conversiones de horario y teléfono', () => {
    assert.deepEqual(scheduleToApp([
        { day_of_week: 0, start_time: '10:00', end_time: '14:00', active: 1 },
        { day_of_week: 1, start_time: '09:00', end_time: '18:00', active: 1 },
        { day_of_week: 2, start_time: '09:00', end_time: '18:00', active: 0 },
    ]), [{ day: 1, start: '09:00', end: '18:00' }, { day: 7, start: '10:00', end: '14:00' }]);
    assert.equal(phoneToE164('+56', '9 1234 5678'), '+56912345678');
    assert.equal(phoneToE164('+56', '+56 9 1234 5678'), '+56912345678');
    assert.deepEqual(phoneFromE164('+56912345678'), { countryCode: '+56', phone: '912345678' });
});

test('Reserva de la app: upsert, revision vieja ignorada y estados locales', async () => {
    const db = await createDb();
    let r = await applyAppAppointment(booking(), { db, tenantId: TENANT });
    assert.equal(r.result, 'inserted');
    let a = await getAppt(db);
    assert.equal(a.status, 'reservado');
    assert.equal(a.professional_id, 'p-pedro');
    assert.equal(a.service_id, 's-corte', 'servicio por nombre sin distinguir mayúsculas');
    assert.equal(a.external_service_name, 'corte clásico');
    const cli = (await db.execute({ sql: `SELECT source FROM clients WHERE id = ?`, args: [a.client_id] })).rows[0];
    assert.equal(cli.source, 'app');

    assert.equal((await applyAppAppointment(booking({ status: 'confirmed' }), { db, tenantId: TENANT })).result, 'stale', 'misma revision');
    assert.equal((await applyAppAppointment(booking({ status: 'confirmed', revision: 50 }), { db, tenantId: TENANT })).result, 'stale', 'revision menor');
    assert.equal((await getAppt(db)).status, 'reservado');

    r = await applyAppAppointment(booking({ status: 'confirmed', revision: 101, handledBy: { source: 'controlfe', name: 'Ana (recepción)', action: 'confirm', at: '2026-10-19T12:00:00Z' } }), { db, tenantId: TENANT });
    assert.equal(r.result, 'updated');
    a = await getAppt(db);
    assert.equal(a.status, 'confirmado');
    assert.equal(a.external_handled_source, 'controlfe');

    await db.execute({ sql: `UPDATE appointments SET status = 'en_atencion' WHERE id = ?`, args: [a.id] });
    await applyAppAppointment(booking({ status: 'confirmed', revision: 102 }), { db, tenantId: TENANT });
    assert.equal((await getAppt(db)).status, 'en_atencion', 'confirmed no revierte en_atencion');

    await applyAppAppointment(booking({ status: 'pending', revision: 103, attention: 'barber_unavailable', barberResponse: { status: 'unavailable', reason: 'Estoy enfermo', at: null } }), { db, tenantId: TENANT });
    a = await getAppt(db);
    assert.equal(a.status, 'en_atencion');
    assert.equal(a.external_attention, 'barber_unavailable');
    assert.equal(a.external_barber_reason, 'Estoy enfermo');

    await applyAppAppointment(booking({ status: 'cancelled', revision: 104, cancelReason: 'Cliente canceló' }), { db, tenantId: TENANT });
    a = await getAppt(db);
    assert.equal(a.status, 'cancelado');
    assert.equal(a.cancel_reason, 'Cliente canceló');
    assert.equal(a.external_attention, null);
});

test('Barbero sin vincular: la reserva no se inserta', async () => {
    const db = await createDb();
    const r = await applyAppAppointment(booking({ id: 'x-unlinked', barber: { id: 'uid-nadie', name: 'Nuevo' } }), { db, tenantId: TENANT });
    assert.equal(r.result, 'unlinked');
    assert.equal(await getAppt(db, 'x-unlinked'), undefined);
});

test('Completada en la app: falta cobrar si el salón cobra; terminada si cobra el barbero', async () => {
    const db = await createDb();
    await applyAppAppointment(booking({ status: 'confirmed' }), { db, tenantId: TENANT });
    await applyAppAppointment(booking({ status: 'completed', revision: 101 }), { db, tenantId: TENANT });
    let a = await getAppt(db);
    assert.equal(a.status, 'confirmado', 'Pedro (salón cobra) sin cobro: falta cobrar');
    assert.equal(a.external_status, 'completed');

    await db.execute({ sql: `INSERT INTO sales (id, tenant_id, appointment_id, subtotal, total, status) VALUES ('sale-1', ?, ?, 10000, 10000, 'completed')`, args: [TENANT, a.id] });
    await applyAppAppointment(booking({ status: 'completed', revision: 102 }), { db, tenantId: TENANT });
    assert.equal((await getAppt(db)).status, 'terminado', 'con cobro queda terminada');

    await applyAppAppointment(booking({ id: 'juan-1', status: 'completed', barber: { id: 'uid-juan', name: 'Juan' } }), { db, tenantId: TENANT });
    assert.equal((await getAppt(db, 'juan-1')).status, 'terminado', 'Juan se cobra solo');
});

test('Cliente existente con el mismo número en otro formato', async () => {
    const db = await createDb();
    await db.execute({ sql: `INSERT INTO clients (id, tenant_id, name, phone) VALUES ('c-old', ?, 'Cliente Prueba', '9 1111 2222')`, args: [TENANT] });
    await applyAppAppointment(booking(), { db, tenantId: TENANT });
    assert.equal((await getAppt(db)).client_id, 'c-old');
});

test('appointment.deleted: queda cancelada con el motivo de la app', async () => {
    const db = await createDb();
    await applyAppAppointment(booking({ status: 'confirmed' }), { db, tenantId: TENANT });
    await markAppAppointmentDeleted('a1B2c3', { db, tenantId: TENANT });
    const a = await getAppt(db);
    assert.equal(a.status, 'cancelado');
    assert.equal(a.cancel_reason, 'Eliminada en la app');
});

test('Barberos desde la app: crear, vincular invitado por email, horario sin perder colación y desactivar', async () => {
    const db = await createDb();
    const schedule = [1, 2, 3, 4, 5].map((day) => ({ day, start: '10:00', end: '19:00' }));
    let r = await applyAppBarber({ id: 'uid-nuevo', name: 'Nuevo', email: 'nuevo@x.cl', phone: '+56933334444', photoUrl: 'https://x/foto.jpg', active: true, schedule, revision: 1 }, { db, tenantId: TENANT });
    assert.equal(r.result, 'created');
    let p = (await db.execute({ sql: `SELECT * FROM professionals WHERE id = ?`, args: [r.professionalId] })).rows[0];
    assert.equal(p.needs_payment_setup, 1);
    assert.equal(p.phone, '933334444');
    assert.equal(p.avatar_url, 'https://x/foto.jpg');
    let rows = (await db.execute({ sql: `SELECT day_of_week FROM schedules WHERE professional_id = ? AND active = 1 ORDER BY day_of_week`, args: [p.id] })).rows;
    assert.deepEqual(rows.map((x) => x.day_of_week), [1, 2, 3, 4, 5]);

    // Colación definida en ControlFe y cambio de horario desde la app.
    await db.execute({ sql: `UPDATE schedules SET break_start = '13:00', break_end = '14:00' WHERE professional_id = ? AND day_of_week = 1`, args: [p.id] });
    r = await applyAppBarber({ id: 'uid-nuevo', name: 'Nuevo', email: 'nuevo@x.cl', active: true, schedule: [{ day: 1, start: '11:00', end: '20:00' }, { day: 6, start: '09:00', end: '13:00' }], revision: 2 }, { db, tenantId: TENANT });
    assert.equal(r.scheduleChanged, true);
    rows = (await db.execute({ sql: `SELECT day_of_week, start_time, end_time, break_start FROM schedules WHERE professional_id = ? AND active = 1 ORDER BY day_of_week`, args: [p.id] })).rows;
    assert.deepEqual(rows.map((x) => [x.day_of_week, x.start_time, x.end_time, x.break_start]), [[1, '11:00', '20:00', '13:00'], [6, '09:00', '13:00', null]]);

    assert.equal((await applyAppBarber({ id: 'uid-nuevo', name: 'Viejo', revision: 2 }, { db, tenantId: TENANT })).result, 'stale');

    // Invitado desde ControlFe que se registró en la app: se vincula por email.
    await db.execute({ sql: `INSERT INTO professionals (id, tenant_id, name, email, app_uses, app_link_status) VALUES ('p-inv', ?, 'Invitado', 'Inv@X.cl', 1, 'invited')`, args: [TENANT] });
    r = await applyAppBarber({ id: 'uid-inv', name: 'Invitado', email: 'inv@x.cl', active: true, revision: 1 }, { db, tenantId: TENANT });
    assert.equal(r.professionalId, 'p-inv');
    assert.equal(r.linkedNow, true);
    p = (await db.execute(`SELECT app_barber_uid, app_link_status FROM professionals WHERE id = 'p-inv'`)).rows[0];
    assert.deepEqual([p.app_barber_uid, p.app_link_status], ['uid-inv', 'active']);

    await deactivateAppBarber('uid-inv', { db, tenantId: TENANT });
    assert.equal((await db.execute(`SELECT active FROM professionals WHERE id = 'p-inv'`)).rows[0].active, 0);
});

test('Al vincular manda el horario de ControlFe; después, el último cambio manda', async () => {
    const db = await createDb();
    const scheduleOf = async (id) => (await db.execute({
        sql: `SELECT day_of_week, start_time, end_time, break_start FROM schedules WHERE professional_id = ? AND active = 1 ORDER BY day_of_week`, args: [id],
    })).rows.map((x) => [x.day_of_week, x.start_time, x.end_time, x.break_start]);
    await db.execute({ sql: `INSERT INTO professionals (id, tenant_id, name, email, app_uses, app_link_status) VALUES ('p-jose', ?, 'jose', 'jose@x.cl', 1, 'invited')`, args: [TENANT] });
    await db.execute(`INSERT INTO schedules (id, professional_id, day_of_week, start_time, end_time, break_start, break_end, active) VALUES ('h-jose', 'p-jose', 2, '09:00', '18:00', '12:00', '13:00', 1)`);
    const appDefault = [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, start: '09:00', end: '20:00' }));

    // Se registra en la app (invitado): queda vinculado sin tomar el horario por defecto.
    let r = await applyAppBarber({ id: 'uid-jose', name: 'Jose Roa', email: 'jose@x.cl', active: true, schedule: appDefault, revision: 1 }, { db, tenantId: TENANT });
    assert.equal(r.linkedNow, true);
    assert.equal(r.pushSchedule, true, 'el horario de ControlFe se envía a la app');
    assert.equal(r.scheduleChanged, false);
    assert.deepEqual(await scheduleOf('p-jose'), [[2, '09:00', '18:00', '12:00']]);

    // Ya vinculado: el cambio hecho en la app se aplica, sin PATCH de vuelta, y conserva la colación.
    r = await applyAppBarber({ id: 'uid-jose', name: 'Jose Roa', email: 'jose@x.cl', active: true, schedule: [{ day: 2, start: '10:00', end: '19:00' }], revision: 2 }, { db, tenantId: TENANT });
    assert.equal(r.pushSchedule, false);
    assert.equal(r.scheduleChanged, true);
    assert.deepEqual(await scheduleOf('p-jose'), [[2, '10:00', '19:00', '12:00']]);

    // Sin horario en ControlFe: al vincular se toma el de la app.
    await db.execute({ sql: `INSERT INTO professionals (id, tenant_id, name, email, app_uses, app_link_status) VALUES ('p-sin', ?, 'Sin Horario', 'sin@x.cl', 1, 'invited')`, args: [TENANT] });
    r = await applyAppBarber({ id: 'uid-sin', name: 'Sin Horario', email: 'sin@x.cl', active: true, schedule: [{ day: 1, start: '09:00', end: '20:00' }], revision: 1 }, { db, tenantId: TENANT });
    assert.equal(r.pushSchedule, false);
    assert.deepEqual(await scheduleOf('p-sin'), [[1, '09:00', '20:00', null]]);
});

test('pushScheduleToApp: PATCH con el horario de ControlFe; al vincular sin horario no borra el de la app', async () => {
    const db = await createDb();
    const env = { ...process.env };
    const realFetch = globalThis.fetch;
    const calls = [];
    Object.assign(process.env, {
        BARBERKEYLUT_TENANT_ID: TENANT, BARBERKEYLUT_API_URL: 'https://app.test/v1',
        BARBERKEYLUT_API_KEY: 'k', BARBERKEYLUT_WEBHOOK_SECRET: 's',
    });
    globalThis.fetch = async (url, init) => {
        calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
        return new Response(JSON.stringify({ barber: { id: 'uid-pedro', revision: 9 } }), { status: 200 });
    };
    try {
        await db.execute(`INSERT INTO schedules (id, professional_id, day_of_week, start_time, end_time, break_start, break_end, active) VALUES
            ('h1', 'p-pedro', 0, '10:00', '14:00', NULL, NULL, 1), ('h2', 'p-pedro', 2, '09:00', '18:00', '12:00', '13:00', 1), ('h3', 'p-pedro', 3, '09:00', '18:00', NULL, NULL, 0)`);
        assert.deepEqual(await pushScheduleToApp({ db, tenantId: TENANT, professionalId: 'p-pedro', onLink: true }), { result: 'sent', days: 2 });
        assert.deepEqual(calls[0], {
            url: 'https://app.test/v1/barbers/uid-pedro', method: 'PATCH',
            body: { schedule: [{ day: 2, start: '09:00', end: '18:00' }, { day: 7, start: '10:00', end: '14:00' }] },
        });
        assert.deepEqual(await pushScheduleToApp({ db, tenantId: TENANT, professionalId: 'p-juan', onLink: true }), { result: 'empty' });
        assert.equal(calls.length, 1, 'Juan no tiene horario: no se envía nada');
        assert.deepEqual(await pushScheduleToApp({ db, tenantId: TENANT, professionalId: 'p-juan' }), { result: 'sent', days: 0 });
        assert.deepEqual(calls[1].body, { schedule: [] }, 'cambio en Personal sin días: la app queda sin días');
    } finally {
        globalThis.fetch = realFetch;
        for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
    }
});
