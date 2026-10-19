import { getDb } from './db.js';
import { generateId, tzToday, tzTime, APP_TIMEZONE } from './utils.js';

// ============================================
// Fila de turnos de barberos: "fila dinámica con prioridad pendiente"
// ============================================
//
// Regla: cada barbero conserva su orden de llegada y todos atienden la misma
// cantidad de clientes por turno. La rapidez no da posición: un barbero que se
// demora (o da un mejor servicio) no se queda atrás.
//
// La fila se ordena por (vueltas, orden de llegada):
//  - vueltas = turns_taken + lap_offset: cuántos turnos lleva (o tiene
//    acreditados) en el día. Le toca al barbero libre con MENOS vueltas y, entre
//    iguales, al que llegó primero (barber_turns.queue_seq).
//  - Si al que le toca está ocupado, atiende el siguiente libre (el cliente no
//    espera). El ocupado conserva su prioridad pendiente: al terminar lleva
//    menos vueltas y vuelve a tocarle, hasta emparejar.
//  - Visualmente, quien toma un cliente baja al final de su vuelta.
//  - Quien llega (o vuelve) durante la jornada se suma a la vuelta más avanzada
//    con un nuevo orden de llegada: entra al final sin desplazar a nadie y no se
//    le deben los turnos atendidos antes.
//  - Un cliente que pide a un barbero, o una reserva de agenda, no consume turno.
//
// Toda operación que cambia la fila corre en una transacción de escritura y deja
// un registro en barber_turn_events con el motivo y la fila resultante.

// Tipos de servicio según cómo se asignó (appointments.turn_kind).
const CONSUMES_TURN = new Set(['turno', 'fuera_de_turno']);

const TURN_TABLES = [
    // Estado de cada barbero en la fila del día (un registro por barbero y día).
    `CREATE TABLE IF NOT EXISTS barber_turns (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        professional_id TEXT NOT NULL,
        date TEXT NOT NULL,
        arrived_at TEXT NOT NULL,
        initial_position INTEGER NOT NULL,
        queue_seq INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','out')),
        clients_served INTEGER NOT NULL DEFAULT 0,
        turns_taken INTEGER NOT NULL DEFAULT 0,
        lap_offset INTEGER NOT NULL DEFAULT 0,
        last_turn_at TEXT,
        left_at TEXT,
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(tenant_id, professional_id, date)
    )`,
    // Dos barberos nunca comparten orden de llegada en el mismo día.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_barber_turns_seq ON barber_turns(tenant_id, date, queue_seq)`,
    // Registro de cada evento de la fila con su motivo y la fila resultante.
    `CREATE TABLE IF NOT EXISTS barber_turn_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        date TEXT NOT NULL,
        professional_id TEXT,
        event TEXT NOT NULL,
        appointment_id TEXT,
        waitlist_id TEXT,
        position_before INTEGER,
        position_after INTEGER,
        seq_before INTEGER,
        seq_after INTEGER,
        reason TEXT NOT NULL,
        queue_after TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_barber_turn_events_day ON barber_turn_events(tenant_id, date, created_at)`,
];

// Columnas agregadas después de crear las tablas, y en appointments: cómo se
// asignó y hora real de inicio/término.
const TURN_MIGRATIONS = [
    `ALTER TABLE barber_turns ADD COLUMN lap_offset INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE appointments ADD COLUMN turn_kind TEXT`,
    `ALTER TABLE appointments ADD COLUMN started_at TEXT`,
    `ALTER TABLE appointments ADD COLUMN finished_at TEXT`,
    `ALTER TABLE appointments ADD COLUMN waitlist_id TEXT`,
];

const readyClients = new WeakSet();
export async function ensureTurnTables(db = getDb()) {
    if (readyClients.has(db)) return;
    for (const sql of TURN_TABLES) await db.execute(sql);
    for (const sql of TURN_MIGRATIONS) {
        try { await db.execute(sql); } catch { /* la columna ya existe */ }
    }
    readyClients.add(db);
}

// Error de negocio con código HTTP (y opcionalmente un código para la UI).
export class TurnError extends Error {
    constructor(message, { status = 400, code = null } = {}) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

// ============================================
// Lógica de la fila (pura, sin base de datos)
// ============================================

// Ordena la fila del día y calcula el estado de cada barbero:
//  - 'libre'     → puede tomar el próximo cliente.
//  - 'ocupado'   → atendiendo (servicio en_atencion).
//  - 'reservado' → libre, pero tiene en espera un cliente que lo pidió.
// Orden: menos vueltas primero; entre iguales, el que llegó antes.
// `pending` marca a quien está delante del que atiende ahora pero no puede
// atender: conserva su prioridad y la recupera apenas quede libre.
export function buildQueue(shifts, { busyIds = new Set(), reservedIds = new Set(), mode = 'round_robin' } = {}) {
    const laps = (s) => (Number(s.turns_taken) || 0) + (Number(s.lap_offset) || 0);
    const entries = shifts
        .filter((s) => s.status === 'active')
        .sort((a, b) => (laps(a) - laps(b)) || (Number(a.queue_seq) - Number(b.queue_seq)))
        .map((s, i) => {
            const busy = busyIds.has(s.professional_id);
            const reserved = !busy && reservedIds.has(s.professional_id);
            return {
                professional_id: s.professional_id,
                name: s.name,
                position: i + 1,
                queue_seq: Number(s.queue_seq),
                state: busy ? 'ocupado' : reserved ? 'reservado' : 'libre',
                arrived_at: s.arrived_at,
                initial_position: Number(s.initial_position),
                clients_served: Number(s.clients_served) || 0,
                turns_taken: Number(s.turns_taken) || 0,
                laps: laps(s),
                last_turn_at: s.last_turn_at || null,
                pending: false,
                is_next: false,
            };
        });
    const next = pickNext(entries, mode);
    for (const e of entries) {
        e.is_next = !!next && e.professional_id === next.professional_id;
        e.pending = e.state !== 'libre' && (!next || e.position < next.position);
    }
    return entries;
}

// A quién le toca el próximo cliente sin preferencia de barbero.
//  - 'round_robin' (por turno): el primer barbero libre según la fila.
//  - 'least_busy': el libre con menos clientes hoy; empate → el de mejor posición.
export function pickNext(entries, mode = 'round_robin') {
    const free = entries.filter((e) => e.state === 'libre');
    if (free.length === 0) return null;
    if (mode === 'least_busy') {
        return [...free].sort((a, b) => (a.clients_served - b.clients_served) || (a.position - b.position))[0];
    }
    return free[0];
}

function positionOf(queue, professionalId) {
    return queue.find((e) => e.professional_id === professionalId)?.position ?? null;
}

function joinNames(names) {
    if (names.length <= 1) return names.join('');
    return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

const STATE_LABEL = { ocupado: 'ocupado', reservado: 'espera a su cliente', libre: 'libre' };

function describeTake({ kind, barber, clientName, before, after }) {
    const posAfter = positionOf(after, barber.professional_id);
    if (kind === 'pedido') {
        return `Atiende a ${clientName}, que lo pidió. No consume turno: conserva su posición #${barber.position}.`;
    }
    const ahead = before.filter((e) => e.position < barber.position);
    const plural = ahead.length > 1 ? 'n' : '';
    const turns = after.find((e) => e.professional_id === barber.professional_id)?.turns_taken;
    if (kind === 'fuera_de_turno') {
        const next = before.find((e) => e.is_next);
        let text = `Atiende a ${clientName} fuera de turno (asignación manual${next ? `; le tocaba a ${next.name}, #${next.position}` : ''}). Cuenta como su ${turns}º turno y queda #${posAfter} en la fila.`;
        if (ahead.length) text += ` ${joinNames(ahead.map((e) => e.name))} conserva${plural} su lugar.`;
        return text;
    }
    let text = `Atiende a ${clientName} por turno (su ${turns}º turno) y queda #${posAfter} en la fila.`;
    if (ahead.length) {
        const parts = ahead.map((e) => `${e.name} (#${e.position}, ${STATE_LABEL[e.state]})`);
        text += ` Delante estaba${plural} ${joinNames(parts)}: conserva${plural} su prioridad pendiente.`;
    }
    return text;
}

function describeFinish({ newStatus, clientName, minutes, entry, after, startedAt }) {
    const verb = newStatus === 'terminado' ? `Terminó el servicio de ${clientName}`
        : newStatus === 'no_show' ? `${clientName} no se presentó`
            : `Se canceló el servicio de ${clientName}`;
    const duration = newStatus === 'terminado' && minutes != null ? ` (${minutes} min)` : '';
    let text = `${verb}${duration}. Queda libre en la posición #${entry.position}`;
    // Quienes tomaron clientes mientras atendía quedaron detrás de él: llevan
    // más turnos o llegaron después, así que recupera su lugar.
    const passed = startedAt
        ? after.filter((e) => e.position > entry.position && e.last_turn_at && e.last_turn_at > startedAt)
        : [];
    if (passed.length) {
        text += `, recuperando su turno delante de ${joinNames(passed.map((e) => e.name))}, que ${passed.length > 1 ? 'tomaron' : 'tomó'} clientes mientras atendía`;
    }
    if (entry.is_next) text += '. Le toca el próximo cliente';
    else if (entry.state === 'reservado') text += '. Tiene un cliente que lo pidió esperando';
    return `${text}.`;
}

// ============================================
// Base de datos
// ============================================

async function rows(ex, sql, args = []) {
    return (await ex.execute({ sql, args })).rows;
}

async function one(ex, sql, args = []) {
    return (await rows(ex, sql, args))[0] || null;
}

function isBusyError(e) {
    return e?.code === 'SQLITE_BUSY' || /database is locked|SQLITE_BUSY/i.test(e?.message || '');
}

// Escrituras de este proceso en cola, una a la vez por cliente de base: no se
// abren transacciones simultáneas (ni reintentos entre ellas). Entre procesos
// distintos, BEGIN IMMEDIATE de withWriteTx sigue garantizando el orden.
const writeQueues = new WeakMap();
function enqueueWrite(db, task) {
    const previous = writeQueues.get(db) || Promise.resolve();
    const run = previous.then(task, task);
    writeQueues.set(db, run.catch(() => {}));
    return run;
}

// Ejecuta `fn` dentro de una transacción de escritura (BEGIN IMMEDIATE): las
// operaciones concurrentes sobre la fila se serializan. Si la base está
// ocupada por otra escritura, reintenta con espera creciente.
function withWriteTx(db, fn, options) {
    return enqueueWrite(db, () => runWriteTx(db, fn, options));
}

async function runWriteTx(db, fn, { retries = 8 } = {}) {
    for (let attempt = 0; ; attempt++) {
        let tx = null;
        try {
            tx = await db.transaction('write');
            const result = await fn(tx);
            await tx.commit();
            return result;
        } catch (e) {
            if (tx && !tx.closed) {
                try { await tx.rollback(); } catch { /* ya cerrada */ }
            }
            if (isBusyError(e) && attempt < retries) {
                await new Promise((r) => setTimeout(r, 25 * 2 ** attempt + Math.random() * 25));
                continue;
            }
            throw e;
        } finally {
            if (tx && !tx.closed) tx.close();
        }
    }
}

async function getAssignMode(ex, tenantId) {
    const t = await one(ex, `SELECT config FROM tenants WHERE id = ?`, [tenantId]);
    try { return JSON.parse(t?.config || '{}').assign_mode || 'least_busy'; } catch { return 'least_busy'; }
}

// Carga la fila del día con el estado actual de cada barbero.
async function loadDay(ex, tenantId, date) {
    const shifts = await rows(ex,
        `SELECT bt.*, p.name FROM barber_turns bt
         JOIN professionals p ON p.id = bt.professional_id
         WHERE bt.tenant_id = ? AND bt.date = ? AND p.active = 1
         ORDER BY bt.queue_seq`,
        [tenantId, date]);
    const busy = await rows(ex,
        `SELECT DISTINCT professional_id FROM appointments WHERE tenant_id = ? AND date = ? AND status = 'en_atencion'`,
        [tenantId, date]);
    const reserved = await rows(ex,
        `SELECT DISTINCT professional_id FROM waitlist WHERE tenant_id = ? AND status = 'waiting' AND professional_id IS NOT NULL`,
        [tenantId]);
    const mode = await getAssignMode(ex, tenantId);
    const busyIds = new Set(busy.map((r) => r.professional_id));
    const reservedIds = new Set(reserved.map((r) => r.professional_id));
    return { shifts, mode, queue: buildQueue(shifts, { busyIds, reservedIds, mode }) };
}

async function nextSeq(ex, tenantId, date) {
    const r = await one(ex,
        `SELECT COALESCE(MAX(queue_seq), 0) + 1 AS seq FROM barber_turns WHERE tenant_id = ? AND date = ?`,
        [tenantId, date]);
    return Number(r.seq);
}

function queueSnapshot(queue) {
    return JSON.stringify(queue.map((e) => ({
        id: e.professional_id, name: e.name, pos: e.position, state: e.state,
        pending: e.pending, next: e.is_next, served: e.clients_served, turns: e.turns_taken, laps: e.laps,
    })));
}

async function logEvent(ex, ev) {
    await ex.execute({
        sql: `INSERT INTO barber_turn_events (id, tenant_id, date, professional_id, event, appointment_id, waitlist_id,
                position_before, position_after, seq_before, seq_after, reason, queue_after, created_by, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [generateId(), ev.tenantId, ev.date, ev.professionalId || null, ev.event, ev.appointmentId || null,
            ev.waitlistId || null, ev.before ?? null, ev.after ?? null, ev.seqBefore ?? null, ev.seqAfter ?? null,
            ev.reason, queueSnapshot(ev.queue), ev.userId || null, ev.now.toISOString()],
    });
}

// 'YYYY-MM-DD HH:MM:SS' en UTC, igual que datetime('now') de SQLite.
function sqliteDateTime(date) {
    return date.toISOString().replace('T', ' ').slice(0, 19);
}

function addMinutes(hhmm, minutes) {
    const [h, m] = hhmm.split(':').map(Number);
    const total = h * 60 + m + minutes;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Servicios adicionales guardados en notes (mismo formato que el check-in).
function extraServices(notes) {
    if (!notes) return [];
    try {
        const parsed = JSON.parse(notes);
        return Array.isArray(parsed?.extra_services) ? parsed.extra_services : [];
    } catch {
        return [];
    }
}

// Mismo criterio que POST /api/salon/appointments para encontrar o crear el cliente.
async function findOrCreateClient(ex, tenantId, { clientId, name, phone }) {
    if (clientId) {
        const c = await one(ex, `SELECT id FROM clients WHERE id = ? AND tenant_id = ?`, [clientId, tenantId]);
        if (c) return c.id;
    }
    if (!name) return null;
    const existing = await one(ex,
        `SELECT id FROM clients WHERE tenant_id = ? AND (name = ? OR phone = ?) LIMIT 1`,
        [tenantId, name, phone || '']);
    if (existing) return existing.id;
    const id = generateId();
    await ex.execute({
        sql: `INSERT INTO clients (id, tenant_id, name, phone, source) VALUES (?, ?, ?, ?, 'manual')`,
        args: [id, tenantId, name, phone || null],
    });
    return id;
}

// Crea el servicio en curso (appointment en_atencion), actualiza la fila y lo registra.
async function startService(tx, ctx) {
    const { tenantId, date, day, barber, kind, now, userId } = ctx;
    const iso = now.toISOString();
    const startTime = tzTime(APP_TIMEZONE, now);
    const endTime = addMinutes(startTime, ctx.durationMin);
    const clientId = await findOrCreateClient(tx, tenantId, { clientId: ctx.clientId, name: ctx.clientName, phone: ctx.clientPhone });

    const appointmentId = generateId();
    await tx.execute({
        sql: `INSERT INTO appointments (id, tenant_id, branch_id, client_id, professional_id, service_id, date, start_time, end_time,
                status, client_name, client_phone, notes, source, turn_kind, started_at, waitlist_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_atencion', ?, ?, ?, ?, ?, ?, ?)`,
        args: [appointmentId, tenantId, ctx.branchId || null, clientId, barber.professional_id, ctx.serviceId || null,
            date, startTime, endTime, ctx.clientName, ctx.clientPhone || null, ctx.notes || null, ctx.source,
            kind, iso, ctx.waitlistId || null],
    });

    if (ctx.waitlistId) {
        // Condicional: si otro proceso ya lo asignó, se anula toda la transacción.
        const r = await tx.execute({
            sql: `UPDATE waitlist SET status = 'booked' WHERE id = ? AND tenant_id = ? AND status = 'waiting'`,
            args: [ctx.waitlistId, tenantId],
        });
        if (r.rowsAffected !== 1) throw new TurnError(`${ctx.clientName} ya fue asignado`, { status: 409 });
    }

    // Tomar un turno suma una vuelta; el orden de llegada (queue_seq) no cambia.
    const shift = day.shifts.find((s) => s.professional_id === barber.professional_id);
    const consumes = CONSUMES_TURN.has(kind);
    const seq = Number(shift.queue_seq);
    await tx.execute({
        sql: `UPDATE barber_turns SET clients_served = clients_served + 1, turns_taken = turns_taken + ?,
                last_turn_at = CASE WHEN ? = 1 THEN ? ELSE last_turn_at END, updated_at = ?
              WHERE id = ?`,
        args: [consumes ? 1 : 0, consumes ? 1 : 0, iso, iso, shift.id],
    });

    const after = await loadDay(tx, tenantId, date);
    const reason = describeTake({ kind, barber, clientName: ctx.clientName, before: day.queue, after: after.queue });
    await logEvent(tx, {
        tenantId, date, professionalId: barber.professional_id, event: kind, appointmentId,
        waitlistId: ctx.waitlistId, before: barber.position, after: positionOf(after.queue, barber.professional_id),
        seqBefore: seq, seqAfter: seq, reason, queue: after.queue, userId, now,
    });
    return {
        appointmentId, kind, reason, queue: after.queue,
        professional: { id: barber.professional_id, name: barber.name },
        client: ctx.clientName,
    };
}

// ============================================
// Operaciones
// ============================================

export async function getTurnState(tenantId, { now = new Date(), db = getDb() } = {}) {
    await ensureTurnTables(db);
    const date = tzToday(APP_TIMEZONE, now);
    const day = await loadDay(db, tenantId, date);
    return { date, mode: day.mode, shifts: day.shifts, queue: day.queue };
}

export async function getTurnLog(tenantId, { date = null, now = new Date(), db = getDb() } = {}) {
    await ensureTurnTables(db);
    const day = date || tzToday(APP_TIMEZONE, now);
    const events = await rows(db,
        `SELECT e.*, p.name AS professional_name FROM barber_turn_events e
         LEFT JOIN professionals p ON p.id = e.professional_id
         WHERE e.tenant_id = ? AND e.date = ?
         ORDER BY e.created_at, e.rowid`,
        [tenantId, day]);
    return events.map((e) => ({ ...e, queue_after: e.queue_after ? JSON.parse(e.queue_after) : [] }));
}

// El barbero marca llegada (o vuelve a la fila después de salir): entra al final.
export async function markArrival({ tenantId, professionalId, userId = null, now = new Date(), db = getDb() }) {
    await ensureTurnTables(db);
    return withWriteTx(db, async (tx) => {
        const date = tzToday(APP_TIMEZONE, now);
        const iso = now.toISOString();
        const prof = await one(tx, `SELECT id, name FROM professionals WHERE id = ? AND tenant_id = ? AND active = 1`, [professionalId, tenantId]);
        if (!prof) throw new TurnError('Profesional no encontrado', { status: 404 });
        const shift = await one(tx, `SELECT * FROM barber_turns WHERE tenant_id = ? AND professional_id = ? AND date = ?`, [tenantId, professionalId, date]);
        if (shift?.status === 'active') throw new TurnError(`${prof.name} ya está en la fila`, { status: 409 });

        const before = await loadDay(tx, tenantId, date);
        const seq = await nextSeq(tx, tenantId, date);
        // Se suma a la vuelta más avanzada de quienes están en la fila: entra al
        // final y no se le deben los turnos atendidos antes de llegar (o mientras
        // no estaba).
        const maxLaps = before.queue.reduce((m, e) => Math.max(m, e.laps), 0);
        if (shift) {
            const turns = Number(shift.turns_taken) || 0;
            const ownLaps = turns + (Number(shift.lap_offset) || 0);
            await tx.execute({
                sql: `UPDATE barber_turns SET status = 'active', queue_seq = ?, lap_offset = ?, left_at = NULL, updated_at = ? WHERE id = ?`,
                args: [seq, Math.max(maxLaps, ownLaps) - turns, iso, shift.id],
            });
        } else {
            await tx.execute({
                sql: `INSERT INTO barber_turns (id, tenant_id, professional_id, date, arrived_at, initial_position, queue_seq, lap_offset, status, updated_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
                args: [generateId(), tenantId, professionalId, date, iso, before.queue.length + 1, seq, maxLaps, iso],
            });
        }

        // Asistencia: reutiliza time_entries (entrada/salida del profesional).
        const open = await one(tx,
            `SELECT id FROM time_entries WHERE tenant_id = ? AND professional_id = ? AND date = ? AND clock_out IS NULL`,
            [tenantId, professionalId, date]);
        if (!open) {
            await tx.execute({
                sql: `INSERT INTO time_entries (id, tenant_id, professional_id, date, clock_in) VALUES (?, ?, ?, ?, ?)`,
                args: [generateId(), tenantId, professionalId, date, iso],
            });
        }
        await tx.execute({ sql: `UPDATE professionals SET is_available = 1 WHERE id = ? AND tenant_id = ?`, args: [professionalId, tenantId] });

        const after = await loadDay(tx, tenantId, date);
        const pos = positionOf(after.queue, professionalId);
        const hhmm = tzTime(APP_TIMEZONE, now);
        const event = shift ? 'regreso' : 'llegada';
        const reason = shift
            ? `Volvió a las ${hhmm} y entra al final de la fila (#${pos}); los turnos atendidos mientras no estaba no se le deben.`
            : `Llegó a las ${hhmm}: posición inicial #${pos}, al final de la fila sin desplazar a nadie.`;
        await logEvent(tx, {
            tenantId, date, professionalId, event, before: null, after: pos,
            seqBefore: shift ? shift.queue_seq : null, seqAfter: seq, reason, queue: after.queue, userId, now,
        });
        return { event, position: pos, reason, queue: after.queue };
    });
}

// El barbero marca salida: deja la fila. Si vuelve, entra al final.
export async function markLeave({ tenantId, professionalId, userId = null, now = new Date(), db = getDb() }) {
    await ensureTurnTables(db);
    return withWriteTx(db, async (tx) => {
        const date = tzToday(APP_TIMEZONE, now);
        const iso = now.toISOString();
        const before = await loadDay(tx, tenantId, date);
        const entry = before.queue.find((e) => e.professional_id === professionalId);
        if (!entry) throw new TurnError('Este barbero no está en la fila', { status: 409 });
        if (entry.state === 'ocupado') {
            throw new TurnError(`${entry.name} está atendiendo. Cobra o anula ese servicio antes de marcar su salida.`, { status: 409 });
        }
        const shift = before.shifts.find((s) => s.professional_id === professionalId);
        await tx.execute({
            sql: `UPDATE barber_turns SET status = 'out', left_at = ?, updated_at = ? WHERE id = ?`,
            args: [iso, iso, shift.id],
        });

        const open = await one(tx,
            `SELECT id, clock_in FROM time_entries WHERE tenant_id = ? AND professional_id = ? AND date = ? AND clock_out IS NULL`,
            [tenantId, professionalId, date]);
        if (open) {
            const hours = Math.round(((now - new Date(open.clock_in)) / 3600000) * 100) / 100;
            await tx.execute({
                sql: `UPDATE time_entries SET clock_out = ?, total_hours = ? WHERE id = ?`,
                args: [iso, Math.max(0, hours), open.id],
            });
        }
        await tx.execute({ sql: `UPDATE professionals SET is_available = 0 WHERE id = ? AND tenant_id = ?`, args: [professionalId, tenantId] });

        const after = await loadDay(tx, tenantId, date);
        const reason = `Marcó salida a las ${tzTime(APP_TIMEZONE, now)} y deja la fila (estaba #${entry.position}). Si vuelve, entra al final.`;
        await logEvent(tx, {
            tenantId, date, professionalId, event: 'salida', before: entry.position, after: null,
            seqBefore: entry.queue_seq, seqAfter: null, reason, queue: after.queue, userId, now,
        });
        return { event: 'salida', reason, queue: after.queue };
    });
}

// Asigna un cliente de la sala de espera.
//  - Sin professionalId (Auto-Asignar): el primer cliente que pueda atenderse
//    ahora. Si pidió a un barbero libre, va con él; si no, al que le toca.
//  - Con professionalId (botón de la estación): primero los clientes que lo
//    pidieron; si no hay, el siguiente cliente general. Si no le toca, exige
//    `force` y cuenta como turno tomado fuera de orden.
export async function assignFromWaitlist({
    tenantId, professionalId = null, waitlistId = null, force = false,
    userId = null, branchId = null, now = new Date(), db = getDb(),
}) {
    await ensureTurnTables(db);
    return withWriteTx(db, async (tx) => {
        const date = tzToday(APP_TIMEZONE, now);
        const day = await loadDay(tx, tenantId, date);
        const byId = new Map(day.queue.map((e) => [e.professional_id, e]));
        const next = day.queue.find((e) => e.is_next) || null;
        const waiting = await rows(tx,
            `SELECT w.*, s.duration_min FROM waitlist w
             LEFT JOIN services s ON s.id = w.service_id
             WHERE w.tenant_id = ? AND w.status = 'waiting'
             ORDER BY w.created_at, w.rowid`,
            [tenantId]);

        let customer = null;
        if (waitlistId) {
            customer = waiting.find((w) => w.id === waitlistId);
            if (!customer) throw new TurnError('Ese cliente ya no está en espera', { status: 409 });
        }

        let barber = null;
        let kind = null;
        if (professionalId) {
            barber = byId.get(professionalId);
            if (!barber) throw new TurnError('Este barbero no está en la fila: marca su llegada primero', { status: 409 });
            if (barber.state === 'ocupado') throw new TurnError(`${barber.name} está atendiendo a otro cliente`, { status: 409 });
            customer = customer
                || waiting.find((w) => w.professional_id === professionalId)
                || waiting.find((w) => !w.professional_id);
            if (!customer) throw new TurnError('No hay clientes en espera', { status: 409 });
            if (customer.professional_id && customer.professional_id !== professionalId) {
                throw new TurnError(`${customer.client_name} está esperando a otro barbero`, { status: 409 });
            }
            if (customer.professional_id === professionalId) kind = 'pedido';
            else if (next?.professional_id === professionalId) kind = 'turno';
            else if (force) kind = 'fuera_de_turno';
            else {
                throw new TurnError(
                    `Le toca a ${next ? `${next.name} (#${next.position})` : 'otro barbero'}. Si ${barber.name} atiende igual, contará como su turno y pasará al final de la fila.`,
                    { status: 409, code: 'OUT_OF_TURN' });
            }
        } else {
            for (const w of customer ? [customer] : waiting) {
                if (w.professional_id) {
                    const e = byId.get(w.professional_id);
                    if (e && e.state !== 'ocupado') { customer = w; barber = e; kind = 'pedido'; break; }
                } else if (next) {
                    customer = w; barber = next; kind = 'turno'; break;
                }
            }
            if (!barber) {
                throw new TurnError(waiting.length ? 'No hay barberos libres en la fila' : 'No hay clientes en espera', { status: 409 });
            }
        }

        const extras = extraServices(customer.notes);
        const durationMin = (customer.duration_min || 30) + extras.reduce((sum, s) => sum + (Number(s.duration_min) || 0), 0);
        return startService(tx, {
            tenantId, date, day, barber, kind, now, userId, branchId, durationMin,
            clientId: customer.client_id, clientName: customer.client_name, clientPhone: customer.client_phone,
            serviceId: customer.service_id, notes: customer.notes, source: 'walk_in', waitlistId: customer.id,
        });
    });
}

// Registro rápido de un cliente que pide a un barbero: si está libre lo atiende
// ya; si no, el cliente espera en la sala marcado para él. Nunca consume turno.
export async function requestBarber({
    tenantId, professionalId, clientName, clientPhone = null, clientId = null, serviceIds = [],
    userId = null, branchId = null, now = new Date(), db = getDb(),
}) {
    await ensureTurnTables(db);
    if (!clientName?.trim()) throw new TurnError('Ingresa el nombre del cliente');
    if (!serviceIds.length) throw new TurnError('Selecciona al menos un servicio');
    return withWriteTx(db, async (tx) => {
        const date = tzToday(APP_TIMEZONE, now);
        const day = await loadDay(tx, tenantId, date);
        const barber = day.queue.find((e) => e.professional_id === professionalId);
        if (!barber) throw new TurnError('Ese barbero no está en la fila: marca su llegada primero', { status: 409 });

        const svcRows = await rows(tx,
            `SELECT id, name, price, duration_min FROM services WHERE tenant_id = ? AND id IN (${serviceIds.map(() => '?').join(',')})`,
            [tenantId, ...serviceIds]);
        const services = serviceIds.map((id) => svcRows.find((s) => s.id === id)).filter(Boolean);
        if (!services.length) throw new TurnError('Servicio no encontrado', { status: 404 });
        const [primary, ...extras] = services;
        const notes = extras.length ? JSON.stringify({ extra_services: extras }) : null;

        if (barber.state === 'libre') {
            const durationMin = services.reduce((sum, s) => sum + (Number(s.duration_min) || 0), 0) || 30;
            const result = await startService(tx, {
                tenantId, date, day, barber, kind: 'pedido', now, userId, branchId, durationMin,
                clientId, clientName: clientName.trim(), clientPhone, serviceId: primary.id, notes, source: 'manual',
            });
            return { status: 'started', ...result };
        }

        // Ocupado (o con otro cliente que lo pidió antes): espera en la sala.
        const waitlistEntry = generateId();
        await tx.execute({
            sql: `INSERT INTO waitlist (id, tenant_id, client_id, client_name, client_phone, service_id, professional_id, notes, status, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?)`,
            args: [waitlistEntry, tenantId, clientId, clientName.trim(), clientPhone, primary.id, professionalId, notes, sqliteDateTime(now)],
        });
        return { status: 'waiting', waitlistId: waitlistEntry, professional: { id: barber.professional_id, name: barber.name }, client: clientName.trim() };
    });
}

// Se llama cuando cambia el estado de una cita (cobro en Barbershop, Agenda…):
// guarda la hora real de inicio/término y lo registra en la fila. No mueve la
// prioridad: al terminar, el barbero queda libre en la posición que conservaba.
export async function recordAppointmentStatus({ tenantId, appointment, newStatus, userId = null, now = new Date(), db = getDb() }) {
    const prev = appointment.status;
    const starting = newStatus === 'en_atencion' && prev !== 'en_atencion';
    const ending = prev === 'en_atencion' && ['terminado', 'cancelado', 'no_show'].includes(newStatus);
    if (!starting && !ending) return null;
    await ensureTurnTables(db);
    return withWriteTx(db, async (tx) => {
        const iso = now.toISOString();
        const appt = await one(tx, `SELECT * FROM appointments WHERE id = ? AND tenant_id = ?`, [appointment.id, tenantId]);
        if (!appt) return null;
        if (starting) {
            await tx.execute({
                sql: `UPDATE appointments SET started_at = COALESCE(started_at, ?), turn_kind = COALESCE(turn_kind, 'reserva') WHERE id = ?`,
                args: [iso, appt.id],
            });
        } else {
            await tx.execute({ sql: `UPDATE appointments SET finished_at = ? WHERE id = ?`, args: [iso, appt.id] });
        }

        const shift = await one(tx,
            `SELECT * FROM barber_turns WHERE tenant_id = ? AND professional_id = ? AND date = ? AND status = 'active'`,
            [tenantId, appt.professional_id, appt.date]);
        if (!shift) return null; // el barbero no está en la fila de ese día
        if (starting) {
            await tx.execute({
                sql: `UPDATE barber_turns SET clients_served = clients_served + 1, updated_at = ? WHERE id = ?`,
                args: [iso, shift.id],
            });
        }

        const after = await loadDay(tx, tenantId, appt.date);
        const entry = after.queue.find((e) => e.professional_id === appt.professional_id);
        if (!entry) return null;
        const clientName = appt.client_name || 'el cliente';
        let reason;
        if (starting) {
            reason = `Inicia la reserva de ${clientName}. No consume turno: conserva su posición #${entry.position}.`;
        } else {
            const minutes = appt.started_at ? Math.max(0, Math.round((now - new Date(appt.started_at)) / 60000)) : null;
            reason = describeFinish({ newStatus, clientName, minutes, entry, after: after.queue, startedAt: appt.started_at });
        }
        await logEvent(tx, {
            tenantId, date: appt.date, professionalId: appt.professional_id, event: starting ? 'reserva' : 'fin',
            appointmentId: appt.id, before: entry.position, after: entry.position,
            seqBefore: entry.queue_seq, seqAfter: entry.queue_seq, reason, queue: after.queue, userId, now,
        });
        return { reason, queue: after.queue };
    });
}

// Anula una asignación hecha por error: el cliente vuelve a la sala de espera
// (en su lugar original) y el barbero recupera la posición que tenía.
export async function undoAssignment({ tenantId, appointmentId, userId = null, now = new Date(), db = getDb() }) {
    await ensureTurnTables(db);
    return withWriteTx(db, async (tx) => {
        const iso = now.toISOString();
        const appt = await one(tx, `SELECT * FROM appointments WHERE id = ? AND tenant_id = ?`, [appointmentId, tenantId]);
        const fromQueue = CONSUMES_TURN.has(appt?.turn_kind) || appt?.turn_kind === 'pedido';
        if (!appt || appt.status !== 'en_atencion' || !fromQueue) {
            throw new TurnError('Solo se puede anular un servicio en curso asignado desde la fila', { status: 409 });
        }
        await tx.execute({
            sql: `UPDATE appointments SET status = 'cancelado', cancel_reason = 'Asignación anulada', finished_at = ?, updated_at = datetime('now') WHERE id = ?`,
            args: [iso, appt.id],
        });
        let backToWaitlist = false;
        if (appt.waitlist_id) {
            const r = await tx.execute({
                sql: `UPDATE waitlist SET status = 'waiting' WHERE id = ? AND tenant_id = ? AND status = 'booked'`,
                args: [appt.waitlist_id, tenantId],
            });
            backToWaitlist = r.rowsAffected === 1;
        }

        const day = await loadDay(tx, tenantId, appt.date);
        const shift = day.shifts.find((s) => s.professional_id === appt.professional_id && s.status === 'active');
        if (!shift) return { reason: null, queue: day.queue };
        // Devolver el turno basta para que recupere su lugar: el orden de llegada
        // nunca cambió.
        const posBefore = positionOf(day.queue, appt.professional_id);
        const consumes = CONSUMES_TURN.has(appt.turn_kind);
        const seq = Number(shift.queue_seq);
        await tx.execute({
            sql: `UPDATE barber_turns SET clients_served = MAX(clients_served - 1, 0), turns_taken = MAX(turns_taken - ?, 0), updated_at = ? WHERE id = ?`,
            args: [consumes ? 1 : 0, iso, shift.id],
        });

        const after = await loadDay(tx, tenantId, appt.date);
        const posAfter = positionOf(after.queue, appt.professional_id);
        const name = shift.name;
        let reason = `Se anuló la asignación de ${appt.client_name || 'el cliente'}`;
        reason += backToWaitlist ? ', que vuelve a la sala de espera en su lugar' : '';
        reason += consumes ? `. ${name} recupera su posición #${posAfter}.` : `. ${name} sigue en la posición #${posAfter}.`;
        await logEvent(tx, {
            tenantId, date: appt.date, professionalId: appt.professional_id, event: 'anulado', appointmentId: appt.id,
            waitlistId: appt.waitlist_id, before: posBefore, after: posAfter, seqBefore: seq, seqAfter: seq,
            reason, queue: after.queue, userId, now,
        });
        return { reason, queue: after.queue };
    });
}
