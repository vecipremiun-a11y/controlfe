// Pruebas de la fila dinámica de turnos (src/lib/turnQueue.js).
// Corren contra una base SQLite temporal con el esquema real; no tocan Turso.
// Ejecutar: npm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { SCHEMA_STATEMENTS } from '../src/lib/schema.js';
import {
    markArrival, markLeave, assignFromWaitlist, requestBarber, recordAppointmentStatus,
    undoAssignment, getTurnState, getTurnLog,
} from '../src/lib/turnQueue.js';

const TENANT = 'tenant-keylut';
const DAY = '2026-10-09';
const tempFiles = [];
const clients = [];

after(() => {
    for (const db of clients) db.close();
    for (const f of tempFiles) {
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.unlinkSync(f + suffix); } catch { /* no existe */ }
        }
    }
});

// Hora de Chile (octubre = UTC-3). Acepta 'HH:MM' o 'HH:MM:SS'.
function at(time) {
    const t = time.length === 5 ? `${time}:00` : time;
    return new Date(`${DAY}T${t}-03:00`);
}

function sqliteUtc(date) {
    return date.toISOString().replace('T', ' ').slice(0, 19);
}

function fmtQueue(queue) {
    if (!queue.length) return '(vacía)';
    return queue.map((e) => {
        const flags = [e.state];
        if (e.pending) flags.push('pendiente');
        return `${e.position}.${e.name}[${flags.join(',')}]${e.is_next ? '◀' : ''}`;
    }).join('  ');
}

async function createShop({ barbers = ['A', 'B', 'C', 'D'], mode = 'round_robin' } = {}) {
    const file = path.join(os.tmpdir(), `turnos-${randomUUID()}.db`);
    tempFiles.push(file);
    const db = createClient({ url: `file:${file.replace(/\\/g, '/')}` });
    clients.push(db);
    // WAL como Turso: las lecturas no bloquean el COMMIT de una escritura.
    await db.execute('PRAGMA journal_mode=WAL');
    for (const sql of SCHEMA_STATEMENTS) await db.execute(sql);
    await db.execute({
        sql: `INSERT INTO tenants (id, name, slug, config) VALUES (?, 'Keylut', 'keylut', ?)`,
        args: [TENANT, JSON.stringify({ assign_mode: mode })],
    });
    for (const name of barbers) {
        await db.execute({
            sql: `INSERT INTO professionals (id, tenant_id, name, active) VALUES (?, ?, ?, 1)`,
            args: [`p${name}`, TENANT, name],
        });
    }
    const services = { corte: 30, barba: 15, lavado: 20 };
    for (const [name, duration] of Object.entries(services)) {
        await db.execute({
            sql: `INSERT INTO services (id, tenant_id, name, duration_min, price) VALUES (?, ?, ?, ?, 10000)`,
            args: [`s-${name}`, TENANT, name, duration],
        });
    }
    return new Shop(db);
}

// Envoltorio que ejecuta eventos con hora controlada e imprime la fila resultante.
class Shop {
    constructor(db) {
        this.db = db;
        this.lastQueue = [];
    }

    print(time, text, queue) {
        this.lastQueue = queue;
        console.log(`  ${time.padEnd(8)} ${text.padEnd(46)} │ ${fmtQueue(queue)}`);
    }

    async arrive(name, time) {
        const r = await markArrival({ tenantId: TENANT, professionalId: `p${name}`, now: at(time), db: this.db });
        this.print(time, `${name} ${r.event === 'regreso' ? 'vuelve' : 'llega'}`, r.queue);
        return r;
    }

    async leave(name, time) {
        const r = await markLeave({ tenantId: TENANT, professionalId: `p${name}`, now: at(time), db: this.db });
        this.print(time, `${name} marca salida`, r.queue);
        return r;
    }

    // Cliente entra a la sala de espera (opcionalmente pidiendo a un barbero).
    async client(clientName, time, { services = ['corte'], wants = null } = {}) {
        const [primary, ...extras] = services;
        const extraRows = extras.length
            ? (await this.db.execute({
                sql: `SELECT id, name, price, duration_min FROM services WHERE id IN (${extras.map(() => '?').join(',')})`,
                args: extras.map((s) => `s-${s}`),
            })).rows
            : [];
        const id = randomUUID();
        await this.db.execute({
            sql: `INSERT INTO waitlist (id, tenant_id, client_name, service_id, professional_id, notes, status, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?)`,
            args: [id, TENANT, clientName, `s-${primary}`, wants ? `p${wants}` : null,
                extraRows.length ? JSON.stringify({ extra_services: extraRows }) : null, sqliteUtc(at(time))],
        });
        return id;
    }

    async auto(time) {
        const r = await assignFromWaitlist({ tenantId: TENANT, now: at(time), db: this.db });
        this.print(time, `Auto-Asignar: ${r.client} → ${r.professional.name} (${r.kind})`, r.queue);
        return r;
    }

    async assignTo(name, time, opts = {}) {
        const r = await assignFromWaitlist({ tenantId: TENANT, professionalId: `p${name}`, now: at(time), db: this.db, ...opts });
        this.print(time, `${name} toma a ${r.client} (${r.kind})`, r.queue);
        return r;
    }

    async request(name, clientName, time, services = ['corte']) {
        const r = await requestBarber({
            tenantId: TENANT, professionalId: `p${name}`, clientName,
            serviceIds: services.map((s) => `s-${s}`), now: at(time), db: this.db,
        });
        const queue = r.queue || (await this.state(time));
        this.print(time, r.status === 'started'
            ? `${clientName} pide a ${name}: lo atiende ya (pedido)`
            : `${clientName} pide a ${name}: espera en la sala`, queue);
        return r;
    }

    // Igual que PUT /api/salon/appointments al cobrar: estado → terminado + registro.
    async finish(name, time, status = 'terminado') {
        const appt = (await this.db.execute({
            sql: `SELECT * FROM appointments WHERE professional_id = ? AND status = 'en_atencion'`,
            args: [`p${name}`],
        })).rows[0];
        assert.ok(appt, `${name} no tiene servicio en curso`);
        await this.db.execute({ sql: `UPDATE appointments SET status = ? WHERE id = ?`, args: [status, appt.id] });
        const r = await recordAppointmentStatus({ tenantId: TENANT, appointment: appt, newStatus: status, now: at(time), db: this.db });
        this.print(time, `${name} termina con ${appt.client_name}`, r.queue);
        return r;
    }

    async state(time) {
        return (await getTurnState(TENANT, { now: at(time), db: this.db })).queue;
    }

    order() {
        return this.lastQueue.map((e) => e.name);
    }

    next() {
        return this.lastQueue.find((e) => e.is_next)?.name || null;
    }

    entry(name) {
        return this.lastQueue.find((e) => e.name === name);
    }

    async lastEvent() {
        const log = await getTurnLog(TENANT, { date: DAY, db: this.db });
        return log[log.length - 1];
    }
}

test('Ejemplo del enunciado: A demora, B es rápido, luego llegan C y D', async () => {
    const s = await createShop();
    await s.arrive('A', '09:00');
    await s.arrive('B', '09:05');
    assert.deepEqual(s.order(), ['A', 'B']);
    assert.equal(s.next(), 'A');

    await s.client('Cliente 1', '09:06');
    assert.equal((await s.auto('09:06')).professional.name, 'A');
    assert.deepEqual(s.order(), ['B', 'A']);

    await s.client('Cliente 2', '09:08');
    assert.equal((await s.auto('09:08')).professional.name, 'B');
    assert.equal(s.entry('A').pending, true, 'A ocupado conserva prioridad pendiente');

    await s.finish('B', '09:25');
    assert.deepEqual(s.order(), ['A', 'B'], 'B termina rápido pero sigue detrás de A');
    assert.equal(s.next(), 'B');

    await s.client('Cliente 3', '09:26');
    const r3 = await s.auto('09:26');
    assert.equal(r3.professional.name, 'B', 'B puede atender mientras A sigue ocupado');
    assert.match(r3.reason, /A \(#1, ocupado\).*prioridad pendiente/);
    assert.deepEqual(s.order(), ['A', 'B'], 'B queda detrás de A, que tiene prioridad pendiente anterior');

    const fin = await s.finish('A', '09:50');
    assert.equal(s.next(), 'A', 'A recupera su prioridad al terminar');
    assert.equal(s.entry('A').position, 1);
    assert.match(fin.reason, /recuperando su turno delante de B/);

    await s.finish('B', '09:55');
    await s.arrive('C', '10:00');
    await s.arrive('D', '10:01');
    assert.deepEqual(s.order(), ['A', 'B', 'C', 'D'], 'C y D entran al final sin desplazar a nadie');

    await s.client('Cliente 4', '10:02');
    assert.equal((await s.auto('10:02')).professional.name, 'A');
    await s.client('Cliente 5', '10:03');
    assert.equal((await s.auto('10:03')).professional.name, 'B');
    await s.client('Cliente 6', '10:04');
    assert.equal((await s.auto('10:04')).professional.name, 'C');
    // A ya emparejó turnos con C y D y llegó antes: queda arriba (ocupado, con
    // prioridad pendiente). Le toca a D, que aún no atiende en esta vuelta.
    assert.deepEqual(s.order(), ['A', 'D', 'B', 'C']);
    assert.equal(s.next(), 'D');
});

test('Empezaron casi juntos y el que empezó después terminó primero', async () => {
    const s = await createShop({ barbers: ['A', 'B'] });
    await s.arrive('A', '09:50');
    await s.arrive('B', '09:51');
    await s.client('Cliente 1', '10:00');
    await s.auto('10:00');
    await s.client('Cliente 2', '10:05');
    await s.auto('10:05');
    await s.finish('B', '10:30');
    await s.finish('A', '10:40');
    assert.deepEqual(s.order(), ['A', 'B']);

    await s.client('Cliente 3', '10:45');
    const r = await s.auto('10:45');
    assert.equal(r.professional.name, 'A', 'le toca a A porque tomó su cliente antes, aunque B terminó primero');
});

test('La rapidez no da ventaja: el barbero lento recupera sus turnos hasta emparejar', async () => {
    const s = await createShop({ barbers: ['A', 'B'] });
    await s.arrive('A', '09:00');
    await s.arrive('B', '09:01');
    await s.client('C1', '09:10'); await s.auto('09:10'); // A (lento)
    await s.client('C2', '09:11'); await s.auto('09:11'); // B
    await s.finish('B', '09:25');
    await s.client('C3', '09:26'); await s.auto('09:26'); // B (A ocupado: el cliente no espera)
    await s.finish('B', '09:40');
    await s.client('C4', '09:41'); await s.auto('09:41'); // B (A sigue ocupado)
    await s.finish('B', '09:55');
    assert.equal(s.entry('A').position, 1, 'A mantiene la posición #1 mientras atiende');
    assert.equal(s.entry('A').pending, true);

    // A lleva 1 turno y B 3: aunque los dos estén libres, le toca a A hasta emparejar.
    await s.finish('A', '10:00');
    await s.client('C5', '10:01');
    assert.equal((await s.auto('10:01')).professional.name, 'A', 'A recupera su turno al terminar');
    await s.finish('A', '10:20');
    await s.client('C6', '10:21');
    assert.equal((await s.auto('10:21')).professional.name, 'A', 'B libre, pero A todavía lleva menos turnos');
    await s.finish('A', '10:40');
    assert.deepEqual((await s.state('10:41')).map((e) => [e.name, e.turns_taken]), [['A', 3], ['B', 3]], 'mismos turnos');

    // Empatados: vuelve a mandar el orden de llegada.
    await s.client('C7', '10:42');
    assert.equal((await s.auto('10:42')).professional.name, 'A', 'empate → el que llegó primero');
    await s.client('C8', '10:43');
    assert.equal((await s.auto('10:43')).professional.name, 'B');
});

test('Caso Dany y Charly: el que se demoró conserva su orden de llegada en la siguiente vuelta', async () => {
    const s = await createShop({ barbers: ['Dany', 'Charly', 'David', 'Jeison', 'Smith', 'jose'] });
    for (const [name, time] of [['Dany', '16:36:30'], ['Charly', '16:36:41'], ['David', '16:39:29'], ['Jeison', '16:39:43'], ['Smith', '16:39:51'], ['jose', '21:14']]) {
        await s.arrive(name, time);
    }
    await s.client('luis', '21:15'); await s.auto('21:15:34'); // Dany (corte largo)
    await s.client('ken', '21:16'); await s.auto('21:16:15'); // Charly (corte corto)
    await s.finish('Charly', '21:34');
    for (const [c, t] of [['los', '21:40:41'], ['marcos', '21:41:04'], ['maicol', '21:41:31'], ['marcos2', '21:41:57']]) {
        await s.client(c, t); await s.auto(t); // David, Jeison, Smith, jose
    }
    await s.client('hilda', '21:42:33');
    assert.equal((await s.auto('21:42:33')).professional.name, 'Charly', 'Dany ocupado: atiende Charly');
    assert.equal(s.order()[0], 'Dany', 'Dany sigue primero con prioridad pendiente');
    await s.finish('Dany', '21:43:45');
    await s.client('jesus', '21:43:52');
    assert.equal((await s.auto('21:43:52')).professional.name, 'Dany');
    assert.deepEqual(s.order(), ['David', 'Jeison', 'Smith', 'jose', 'Dany', 'Charly'],
        'en la siguiente vuelta Dany va antes que Charly: llegó primero');
});

test('Barberos que llegan durante la jornada no desplazan a quienes ya esperaban', async () => {
    const s = await createShop();
    await s.arrive('A', '09:00');
    await s.arrive('B', '09:01');
    await s.client('C1', '09:05'); await s.auto('09:05'); // A ocupado
    assert.deepEqual(s.order(), ['B', 'A']);
    await s.arrive('C', '09:10');
    assert.deepEqual(s.order(), ['B', 'A', 'C']);
    await s.client('C2', '09:11');
    assert.equal((await s.auto('09:11')).professional.name, 'B', 'B ya esperaba: C no lo desplaza');
    await s.client('C3', '09:12');
    assert.equal((await s.auto('09:12')).professional.name, 'C');
    await s.arrive('D', '09:13');
    assert.deepEqual(s.order(), ['A', 'B', 'C', 'D']);
    assert.equal(s.next(), 'D', 'A, B y C ocupados: atiende D pero ellos conservan su prioridad');
    assert.deepEqual(s.lastQueue.filter((e) => e.pending).map((e) => e.name), ['A', 'B', 'C']);
});

test('Servicio combinado (corte + barba + lavado): se registra completo y no borra la prioridad', async () => {
    const s = await createShop({ barbers: ['A', 'B'] });
    await s.arrive('A', '09:00');
    await s.arrive('B', '09:02');
    await s.client('Combo', '09:05', { services: ['corte', 'barba', 'lavado'] });
    const r = await s.auto('09:05');
    assert.equal(r.professional.name, 'A');
    const appt = (await s.db.execute({ sql: `SELECT * FROM appointments WHERE id = ?`, args: [r.appointmentId] })).rows[0];
    assert.equal(appt.start_time, '09:05');
    assert.equal(appt.end_time, '10:10', '30 + 15 + 20 = 65 minutos');
    assert.equal(JSON.parse(appt.notes).extra_services.map((x) => x.name).join('+'), 'barba+lavado');
    assert.equal(appt.turn_kind, 'turno');
    assert.ok(appt.started_at);

    await s.client('C2', '09:06'); await s.auto('09:06'); // B
    await s.finish('B', '09:30');
    await s.client('C3', '09:31'); await s.auto('09:31'); // B otra vez
    await s.finish('B', '09:55');
    await s.finish('A', '10:12');
    assert.equal(s.next(), 'A', 'el servicio largo no le quitó la prioridad');
    const done = (await s.db.execute({ sql: `SELECT finished_at FROM appointments WHERE id = ?`, args: [r.appointmentId] })).rows[0];
    assert.equal(done.finished_at, at('10:12').toISOString());
    const ev = await s.lastEvent();
    assert.match(ev.reason, /Terminó el servicio de Combo \(67 min\)/);
});

test('Cliente que pide a un barbero: no consume turno y el barbero conserva su lugar', async () => {
    const s = await createShop({ barbers: ['A', 'B', 'C'] });
    await s.arrive('A', '09:00');
    await s.arrive('B', '09:01');
    await s.arrive('C', '09:02');

    // C es el último, pero su cliente lo busca: lo atiende sin moverse de la fila.
    const r = await s.request('C', 'Fiel de C', '09:05');
    assert.equal(r.status, 'started');
    assert.equal(r.kind, 'pedido');
    assert.deepEqual(s.order(), ['A', 'B', 'C']);
    assert.equal(s.entry('C').turns_taken, 0);

    await s.client('C1', '09:06'); await s.auto('09:06'); // A
    await s.client('C2', '09:07'); await s.auto('09:07'); // B
    assert.deepEqual(s.order(), ['C', 'A', 'B']);
    assert.equal(s.entry('C').pending, true, 'le toca a C pero atiende a su cliente: conserva la prioridad');

    await s.finish('A', '09:30');
    await s.client('C3', '09:31');
    assert.equal((await s.auto('09:31')).professional.name, 'A', 'el turno pasa al siguiente libre');
    assert.deepEqual(s.order(), ['C', 'B', 'A']);

    await s.finish('C', '09:40');
    assert.equal(s.next(), 'C', 'C recupera su turno al terminar con su cliente');

    // Si el barbero pedido está ocupado, el cliente espera por él y Auto-Asignar no se lo da a otro.
    await s.client('C4', '09:41'); await s.auto('09:41'); // C por turno
    const w = await s.request('C', 'Otro fiel de C', '09:42');
    assert.equal(w.status, 'waiting');
    await s.finish('B', '09:50');
    await s.client('C5', '09:51');
    const r5 = await s.auto('09:51');
    assert.equal(r5.client, 'C5', 'el cliente general no espera por el que pidió a C');
    assert.equal(r5.professional.name, 'B');
    await s.finish('C', '10:00');
    const r6 = await s.auto('10:00');
    assert.equal(r6.client, 'Otro fiel de C');
    assert.equal(r6.professional.name, 'C');
    assert.equal(r6.kind, 'pedido');
});

test('Asignación manual fuera de turno: exige confirmación y queda registrada', async () => {
    const s = await createShop({ barbers: ['A', 'B'] });
    await s.arrive('A', '09:00');
    await s.arrive('B', '09:01');
    await s.client('C1', '09:05');
    await assert.rejects(
        assignFromWaitlist({ tenantId: TENANT, professionalId: 'pB', now: at('09:05'), db: s.db }),
        (e) => e.code === 'OUT_OF_TURN' && /Le toca a A \(#1\)/.test(e.message),
    );
    const r = await s.assignTo('B', '09:05', { force: true });
    assert.equal(r.kind, 'fuera_de_turno');
    assert.deepEqual(s.order(), ['A', 'B']);
    assert.equal(s.next(), 'A', 'A no pierde su lugar');
    assert.match(r.reason, /fuera de turno.*le tocaba a A/);
});

test('Salida y regreso: al volver entra al final; ocupado no puede marcar salida', async () => {
    const s = await createShop({ barbers: ['A', 'B', 'C'] });
    await s.arrive('A', '09:00');
    await s.arrive('B', '09:01');
    await s.arrive('C', '09:02');
    await s.client('C1', '09:05'); await s.auto('09:05'); // A
    await assert.rejects(
        markLeave({ tenantId: TENANT, professionalId: 'pA', now: at('09:06'), db: s.db }),
        /está atendiendo/,
    );
    await s.leave('B', '12:00');
    assert.deepEqual(s.order(), ['C', 'A']);
    await s.arrive('B', '13:00');
    assert.deepEqual(s.order(), ['C', 'A', 'B']);
    const entries = (await s.db.execute({ sql: `SELECT clock_in, clock_out, total_hours FROM time_entries WHERE professional_id = 'pB' ORDER BY clock_in` })).rows;
    assert.equal(entries.length, 2, 'asistencia: una entrada por cada llegada');
    assert.equal(entries[0].total_hours, 2.98);
    assert.equal(entries[1].clock_out, null);
});

test('Llegadas en el mismo minuto: va primero el que se marcó primero, aunque sea por segundos', async () => {
    const s = await createShop({ barbers: ['A', 'B', 'C'] });
    await s.arrive('B', '09:00:10');
    await s.arrive('A', '09:00:12');
    await s.arrive('C', '09:00:15');
    assert.deepEqual(s.order(), ['B', 'A', 'C']);
    assert.equal(s.next(), 'B');
    const shifts = (await s.db.execute(`SELECT professional_id, initial_position FROM barber_turns ORDER BY initial_position`)).rows;
    assert.deepEqual(shifts.map((r) => r.professional_id), ['pB', 'pA', 'pC'], 'la posición inicial es el orden de marcado');
    await s.client('C1', '09:01');
    assert.equal((await s.auto('09:01')).professional.name, 'B');
});

test('Anular una asignación devuelve al cliente a la sala y al barbero a su lugar', async () => {
    const s = await createShop({ barbers: ['A', 'B'] });
    await s.arrive('A', '09:00');
    await s.arrive('B', '09:01');
    await s.client('C1', '09:05');
    const r = await s.auto('09:05');
    assert.deepEqual(s.order(), ['B', 'A']);
    const u = await undoAssignment({ tenantId: TENANT, appointmentId: r.appointmentId, now: at('09:06'), db: s.db });
    s.print('09:06', 'Se anula la asignación de C1', u.queue);
    assert.deepEqual(s.order(), ['A', 'B']);
    assert.equal(s.next(), 'A');
    const w = (await s.db.execute(`SELECT status FROM waitlist WHERE client_name = 'C1'`)).rows[0];
    assert.equal(w.status, 'waiting');
    assert.equal(s.entry('A').turns_taken, 0);
});

test('Concurrencia: asignaciones simultáneas no duplican clientes ni turnos', async () => {
    const s = await createShop({ barbers: ['A', 'B', 'C'] });
    await Promise.all([
        markArrival({ tenantId: TENANT, professionalId: 'pA', now: at('09:00'), db: s.db }),
        markArrival({ tenantId: TENANT, professionalId: 'pB', now: at('09:00'), db: s.db }),
        markArrival({ tenantId: TENANT, professionalId: 'pC', now: at('09:00'), db: s.db }),
    ]);
    let st = await getTurnState(TENANT, { now: at('09:01'), db: s.db });
    assert.deepEqual(st.queue.map((e) => e.position), [1, 2, 3], 'llegadas simultáneas reciben posiciones distintas');

    // Un solo cliente y tres pulsaciones simultáneas de Auto-Asignar: se asigna una vez.
    await s.client('Único', '09:05');
    const results = await Promise.allSettled([1, 2, 3].map(() => assignFromWaitlist({ tenantId: TENANT, now: at('09:05'), db: s.db })));
    const ok = results.filter((r) => r.status === 'fulfilled');
    assert.equal(ok.length, 1);
    for (const r of results.filter((x) => x.status === 'rejected')) assert.match(r.reason.message, /No hay clientes en espera/);
    const appts = (await s.db.execute(`SELECT COUNT(*) AS n FROM appointments`)).rows[0];
    assert.equal(Number(appts.n), 1);

    // Dos clientes y dos asignaciones simultáneas: van a barberos distintos.
    await s.client('X', '09:06');
    await s.client('Y', '09:06:30');
    const two = await Promise.all([1, 2].map(() => assignFromWaitlist({ tenantId: TENANT, now: at('09:07'), db: s.db })));
    assert.notEqual(two[0].professional.name, two[1].professional.name);
    assert.notEqual(two[0].client, two[1].client);
    st = await getTurnState(TENANT, { now: at('09:08'), db: s.db });
    s.print('09:08', 'Tras asignaciones simultáneas', st.queue);
    const seqs = st.queue.map((e) => e.queue_seq);
    assert.equal(new Set(seqs).size, seqs.length, 'sin prioridades duplicadas');
    assert.ok(st.queue.every((e) => e.state === 'ocupado'));
});

test('Registro obligatorio: llegada, posición inicial, inicio/término, clientes, prioridad y motivos', async () => {
    const s = await createShop({ barbers: ['A', 'B'] });
    await s.arrive('A', '09:00');
    await s.arrive('B', '09:05');
    await s.client('C1', '09:10'); await s.auto('09:10');
    await s.client('C2', '09:11'); await s.auto('09:11');
    await s.finish('B', '09:30');

    const shifts = (await s.db.execute(`SELECT * FROM barber_turns ORDER BY initial_position`)).rows;
    assert.deepEqual(shifts.map((r) => [r.professional_id, r.arrived_at, r.initial_position, r.clients_served, r.turns_taken]), [
        ['pA', at('09:00').toISOString(), 1, 1, 1],
        ['pB', at('09:05').toISOString(), 2, 1, 1],
    ]);
    const appts = (await s.db.execute(`SELECT professional_id, started_at, finished_at FROM appointments ORDER BY started_at`)).rows;
    assert.deepEqual(appts.map((a) => [a.professional_id, a.started_at, a.finished_at]), [
        ['pA', at('09:10').toISOString(), null],
        ['pB', at('09:11').toISOString(), at('09:30').toISOString()],
    ]);

    const log = await getTurnLog(TENANT, { date: DAY, db: s.db });
    assert.deepEqual(log.map((e) => e.event), ['llegada', 'llegada', 'turno', 'turno', 'fin']);
    assert.ok(log.every((e) => e.reason && e.queue_after.length > 0));
    const turnA = log[2];
    assert.deepEqual([turnA.position_before, turnA.position_after], [1, 2]);
    const fin = log[4];
    assert.deepEqual(fin.queue_after.map((q) => [q.name, q.state, q.pending]), [['A', 'ocupado', true], ['B', 'libre', false]]);

    console.log('\n  Registro del día:');
    for (const e of log) console.log(`    [${e.event}] ${e.professional_name}: ${e.reason}`);
});
