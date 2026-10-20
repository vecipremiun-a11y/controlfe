// Pruebas de las cuentas de clientes en Barbershop (src/lib/tabs.js) contra
// una base SQLite temporal. Ejecutar: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { SCHEMA_STATEMENTS } from '../src/lib/schema.js';
import { tzToday } from '../src/lib/utils.js';
import {
    ensureTabTables, getAccountsOverview, getAccountDetail, addToAccount, removeAccountItem,
    assertTabItemsOpen, markTabItemsPaid, appointmentServiceLines, TabError,
} from '../src/lib/tabs.js';

const TENANT = 'tenant-tabs';
const USER = { id: 'u1', name: 'Recepción' };
const tempFiles = [];
const clients = [];

after(() => {
    for (const db of clients) db.close();
    for (const f of tempFiles) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch { /* no existe */ } }
});

async function createDb() {
    const file = path.join(os.tmpdir(), `tabs-${crypto.randomUUID()}.db`);
    tempFiles.push(file);
    const db = createClient({ url: `file:${file.replace(/\\/g, '/')}` });
    clients.push(db);
    await db.execute('PRAGMA journal_mode=WAL');
    for (const sql of SCHEMA_STATEMENTS) await db.execute(sql);
    // Columnas que producción agregó por migración.
    await db.execute(`ALTER TABLE professionals ADD COLUMN salon_collects INTEGER NOT NULL DEFAULT 1`);
    await db.execute(`ALTER TABLE appointments ADD COLUMN waitlist_id TEXT`);
    await ensureTabTables(db);
    await db.execute({ sql: `INSERT INTO tenants (id, name, slug) VALUES (?, 'Keylut', 'keylut-tabs')`, args: [TENANT] });
    await db.execute({ sql: `INSERT INTO professionals (id, tenant_id, name) VALUES ('p-dany', ?, 'Dany')`, args: [TENANT] });
    await db.execute({ sql: `INSERT INTO professionals (id, tenant_id, name, salon_collects) VALUES ('p-charly', ?, 'Charly', 0)`, args: [TENANT] });
    await db.execute({ sql: `INSERT INTO services (id, tenant_id, name, duration_min, price) VALUES ('s-corte', ?, 'Corte', 30, 8000)`, args: [TENANT] });
    await db.execute({ sql: `INSERT INTO services (id, tenant_id, name, duration_min, price) VALUES ('s-infantil', ?, 'Corte infantil', 30, 6000)`, args: [TENANT] });
    return db;
}

const agua = { type: 'product', item_id: 'prod-agua', name: 'Agua 500ml', quantity: 1, unit_price: 950 };
const bebida = { type: 'product', item_id: 'prod-bebida', name: 'Bebida', quantity: 2, unit_price: 1500 };

async function waiting(db, id, name, serviceId = 's-corte') {
    await db.execute({ sql: `INSERT INTO waitlist (id, tenant_id, client_name, service_id, status) VALUES (?, ?, ?, ?, 'waiting')`, args: [id, TENANT, name, serviceId] });
}

// Asignación como la hace la fila de turnos: cita en atención con waitlist_id.
async function assign(db, waitlistId, apptId, profId, serviceId = 's-corte', notes = null) {
    const w = (await db.execute({ sql: `SELECT client_name FROM waitlist WHERE id = ?`, args: [waitlistId] })).rows[0];
    await db.execute({
        sql: `INSERT INTO appointments (id, tenant_id, professional_id, service_id, date, start_time, end_time, status, client_name, notes, source, waitlist_id)
              VALUES (?, ?, ?, ?, ?, '10:00', '10:30', 'en_atencion', ?, ?, 'walk_in', ?)`,
        args: [apptId, TENANT, profId, serviceId, tzToday(), w.client_name, notes, waitlistId],
    });
    await db.execute({ sql: `UPDATE waitlist SET status = 'booked' WHERE id = ?`, args: [waitlistId] });
}

test('Consumo anotado mientras espera pasa a su cita al atenderlo', async () => {
    const db = await createDb();
    await waiting(db, 'w-pedro', 'Pedro');
    const r = await addToAccount({ db, tenantId: TENANT, user: USER, target: { waitlistId: 'w-pedro' }, items: [agua] });
    assert.equal(r.clientName, 'Pedro');

    let ov = await getAccountsOverview({ db, tenantId: TENANT });
    assert.equal(ov.waiting[0].account.total, 950);
    assert.equal(ov.pending.length, 0);

    // Se anota de nuevo en la misma cuenta (no se crea otra).
    await addToAccount({ db, tenantId: TENANT, user: USER, target: { waitlistId: 'w-pedro' }, items: [bebida] });
    assert.equal(Number((await db.execute(`SELECT COUNT(*) AS n FROM client_tabs`)).rows[0].n), 1);

    await assign(db, 'w-pedro', 'a-pedro', 'p-dany', 's-corte', JSON.stringify({ extra_services: [{ id: 's-barba', name: 'Barba', price: 5000 }] }));
    ov = await getAccountsOverview({ db, tenantId: TENANT });
    assert.equal(ov.waiting.length, 0);
    assert.equal(ov.inService[0].appointmentId, 'a-pedro');
    assert.deepEqual(ov.inService[0].account && [ov.inService[0].account.total, ov.inService[0].account.count], [3950, 3]);

    const d = await getAccountDetail({ db, tenantId: TENANT, target: { appointmentId: 'a-pedro' } });
    assert.equal(d.state, 'in_service');
    assert.equal(d.key, 'appt:a-pedro');
    assert.equal(d.serviceChargeable, true, 'Dany: el salón cobra');
    assert.deepEqual(d.services.map((s) => [s.name, s.price]), [['Corte', 8000], ['Barba', 5000]]);
    assert.equal(d.productsTotal, 3950);
    // Por la cuenta o por la cita es el mismo cliente.
    assert.equal((await getAccountDetail({ db, tenantId: TENANT, target: { tabId: r.tabId } })).key, 'appt:a-pedro');
});

test('Barbero que cobra sus servicios: solo el consumo; al terminar la cuenta queda pendiente', async () => {
    const db = await createDb();
    await waiting(db, 'w-juan', 'Juan');
    await assign(db, 'w-juan', 'a-juan', 'p-charly');
    await addToAccount({ db, tenantId: TENANT, user: USER, target: { appointmentId: 'a-juan' }, items: [agua] });

    let d = await getAccountDetail({ db, tenantId: TENANT, target: { appointmentId: 'a-juan' } });
    assert.equal(d.serviceChargeable, false, 'Charly cobra su corte');
    assert.equal(d.professional.salonCollects, false);

    // Charly finaliza: el cliente ya no está en atención pero debe el agua.
    await db.execute(`UPDATE appointments SET status = 'terminado' WHERE id = 'a-juan'`);
    const ov = await getAccountsOverview({ db, tenantId: TENANT });
    assert.equal(ov.inService.length, 0);
    assert.deepEqual(ov.pending.map((p) => [p.clientName, p.account.total]), [['Juan', 950]]);
    d = await getAccountDetail({ db, tenantId: TENANT, target: { tabId: ov.pending[0].tabId } });
    assert.equal(d.state, 'done');
    assert.equal(d.serviceChargeable, false);
});

test('Cuenta suelta (cliente sin servicio), quitar anotaciones y cobro', async () => {
    const db = await createDb();
    const r = await addToAccount({ db, tenantId: TENANT, user: USER, target: { newClientName: 'Papá de Tomás' }, items: [agua, bebida] });
    let d = await getAccountDetail({ db, tenantId: TENANT, target: { tabId: r.tabId } });
    assert.equal(d.state, 'account');
    assert.equal(d.products.length, 2);
    assert.equal(d.products[0].addedBy, 'Recepción');

    await removeAccountItem({ db, tenantId: TENANT, itemId: d.products[0].id });
    await assert.rejects(removeAccountItem({ db, tenantId: TENANT, itemId: d.products[0].id }), TabError);
    d = await getAccountDetail({ db, tenantId: TENANT, target: { tabId: r.tabId } });
    assert.deepEqual(d.products.map((i) => i.name), ['Bebida']);

    const ids = d.products.map((i) => i.id);
    await assertTabItemsOpen({ db, tenantId: TENANT, ids });
    await markTabItemsPaid({ db, tenantId: TENANT, ids, saleId: 'sale-1' });
    await assert.rejects(assertTabItemsOpen({ db, tenantId: TENANT, ids }), (e) => e.code === 'TAB_CHANGED', 'no se cobra dos veces');
    const ov = await getAccountsOverview({ db, tenantId: TENANT });
    assert.equal(ov.pending.length, 0, 'pagada: ya no aparece');
});

test('Servicio ya cobrado (línea de una venta con varias cuentas) no se vuelve a ofrecer', async () => {
    const db = await createDb();
    await waiting(db, 'w-tomas', 'Tomás', 's-infantil');
    await assign(db, 'w-tomas', 'a-tomas', 'p-dany', 's-infantil');
    let d = await getAccountDetail({ db, tenantId: TENANT, target: { appointmentId: 'a-tomas' } });
    assert.equal(d.serviceChargeable, true);
    await db.execute({ sql: `INSERT INTO sales (id, tenant_id, appointment_id, subtotal, total, status) VALUES ('sale-papa', ?, 'a-otro', 14000, 14000, 'completed')`, args: [TENANT] });
    await db.execute(`INSERT INTO sale_items (id, sale_id, type, item_id, item_name, quantity, unit_price, total, appointment_id) VALUES ('si-1', 'sale-papa', 'service', 's-infantil', 'Corte infantil', 1, 6000, 6000, 'a-tomas')`);
    d = await getAccountDetail({ db, tenantId: TENANT, target: { appointmentId: 'a-tomas' } });
    assert.equal(d.serviceCharged, true);
    assert.equal(d.serviceChargeable, false);
});

test('Validaciones y líneas de servicio de una cita', async () => {
    const db = await createDb();
    await assert.rejects(addToAccount({ db, tenantId: TENANT, user: USER, target: {}, items: [agua] }), TabError);
    await assert.rejects(addToAccount({ db, tenantId: TENANT, user: USER, target: { newClientName: 'X' }, items: [] }), TabError);
    await assert.rejects(addToAccount({ db, tenantId: TENANT, user: USER, target: { waitlistId: 'no-existe' }, items: [agua] }), TabError);
    assert.deepEqual(appointmentServiceLines({ service_id: null, source: 'app', service_name: 'Corte app', service_price: 10000, professional_id: 'p1', notes: 'texto libre' }),
        [{ item_id: 'app-service', name: 'Corte app', price: 10000, professional_id: 'p1' }]);
});

test('Servicio anotado = servicio extra del barbero: lo cobra el local solo si cobra a ese barbero', async () => {
    const db = await createDb();
    const lavado = { type: 'service', item_id: 's-lavado', name: 'Lavado', quantity: 1, unit_price: 3000 };

    // Nick con Dany (el salón cobra): corte + lavado son servicio; el agua es consumo.
    await waiting(db, 'w-nick', 'Nick');
    await assign(db, 'w-nick', 'a-nick', 'p-dany');
    await addToAccount({ db, tenantId: TENANT, user: USER, target: { appointmentId: 'a-nick' }, items: [lavado, agua] });
    let d = await getAccountDetail({ db, tenantId: TENANT, target: { appointmentId: 'a-nick' } });
    assert.deepEqual(d.extraServices.map((s) => s.name), ['Lavado']);
    assert.deepEqual(d.products.map((p) => p.name), ['Agua 500ml']);
    assert.equal(d.serviceChargeable, true);
    assert.equal(d.extrasChargeable, true);
    assert.deepEqual([d.servicesTotal, d.extrasTotal, d.productsTotal], [8000, 3000, 950]);
    let ov = await getAccountsOverview({ db, tenantId: TENANT });
    assert.equal(ov.inService[0].account.total, 3950, 'cuenta: lavado + agua');

    // Juan con Charly (cobra sus servicios): el lavado lo cobra Charly; el local, solo el agua.
    await waiting(db, 'w-juan', 'Juan');
    await assign(db, 'w-juan', 'a-juan', 'p-charly');
    await addToAccount({ db, tenantId: TENANT, user: USER, target: { appointmentId: 'a-juan' }, items: [lavado, agua] });
    d = await getAccountDetail({ db, tenantId: TENANT, target: { appointmentId: 'a-juan' } });
    assert.equal(d.serviceChargeable, false);
    assert.equal(d.extrasChargeable, false);
    assert.equal(d.productsTotal, 950);
    ov = await getAccountsOverview({ db, tenantId: TENANT });
    assert.equal(ov.inService.find((a) => a.appointmentId === 'a-juan').account.total, 950, 'el lavado no suma a lo que cobra el local');

    // Charly termina y el local cobra el agua: no queda nada pendiente por el lavado.
    await db.execute(`UPDATE appointments SET status = 'terminado' WHERE id = 'a-juan'`);
    await markTabItemsPaid({ db, tenantId: TENANT, ids: d.products.map((p) => p.id), saleId: 'sale-agua' });
    ov = await getAccountsOverview({ db, tenantId: TENANT });
    assert.equal(ov.pending.length, 0, 'el lavado de Charly no deja la cuenta pendiente');

    // En espera: el servicio extra se cobra cuando lo atiendan.
    await waiting(db, 'w-ana', 'Ana');
    await addToAccount({ db, tenantId: TENANT, user: USER, target: { waitlistId: 'w-ana' }, items: [lavado] });
    d = await getAccountDetail({ db, tenantId: TENANT, target: { waitlistId: 'w-ana' } });
    assert.equal(d.state, 'waiting');
    assert.equal(d.extrasChargeable, false);
});
