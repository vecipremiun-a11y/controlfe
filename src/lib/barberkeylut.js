import crypto from 'node:crypto';
import { getDb } from './db.js';
import { generateId, tzToday, APP_TIMEZONE } from './utils.js';
import { withWriteTx } from './writeTx.js';

// ============================================
// Integración con la app Barber Keylut (contrato v1)
// ============================================
//
// La app es la dueña de las reservas hechas en la app. ControlFe guarda una
// copia en appointments (source = 'app', external_id = id de la app) y solo la
// cambia llamando a la API de la app; los únicos estados locales permitidos
// son en_atencion y terminado (al terminar se avisa con /complete).
//
// Las citas propias de ControlFe, los días bloqueados y las colaciones se
// informan a la app como "ocupación" (/busy), para que no ofrezca esos horarios.
// Los barberos se sincronizan en ambos sentidos (POST/PATCH /barbers y webhooks).
//
// Solo un salón usa la integración y se configura con variables de entorno. Si
// falta alguna, la integración queda apagada. Nunca se registran la API key ni
// el secreto del webhook.

export function getConfig() {
    const tenantId = process.env.BARBERKEYLUT_TENANT_ID || '';
    const apiUrl = (process.env.BARBERKEYLUT_API_URL || '').replace(/\/+$/, '');
    const apiKey = process.env.BARBERKEYLUT_API_KEY || '';
    const webhookSecret = process.env.BARBERKEYLUT_WEBHOOK_SECRET || '';
    return { enabled: !!(tenantId && apiUrl && apiKey && webhookSecret), tenantId, apiUrl, apiKey, webhookSecret };
}

export function isEnabledFor(tenantId) {
    const cfg = getConfig();
    return cfg.enabled && cfg.tenantId === tenantId;
}

// Roles que pueden responder reservas de la app en nombre de un barbero.
export const INBOX_ROLES = ['owner', 'admin', 'supervisor', 'recepcionista', 'receptionist'];

const ROLE_ACTOR_LABEL = {
    owner: 'dueño', admin: 'administración', supervisor: 'supervisión',
    recepcionista: 'recepción', receptionist: 'recepción',
};

// actor que verán el barbero y el cliente, ej. "Ana (recepción)".
export function getActor(user) {
    const label = ROLE_ACTOR_LABEL[user?.role];
    return { id: user?.id || 'controlfe', name: label ? `${user.name} (${label})` : (user?.name || 'ControlFe') };
}

function logError(context, e) {
    console.error(`[barberkeylut] ${context}:`, e?.status ?? '', e?.code || e?.message || e);
}

// ============================================
// Tablas y columnas (idempotente)
// ============================================

const INTEGRATION_TABLES = [
    // Deduplicación de webhooks por X-Keylut-Delivery.
    `CREATE TABLE IF NOT EXISTS integration_events (
        delivery_id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        event TEXT NOT NULL,
        entity_id TEXT,
        result TEXT,
        received_at TEXT DEFAULT (datetime('now'))
    )`,
    // Estado clave/valor de la integración (última sincronización, etc.).
    `CREATE TABLE IF NOT EXISTS integration_state (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
    )`,
];

const INTEGRATION_MIGRATIONS = [
    `ALTER TABLE appointments ADD COLUMN external_id TEXT`,
    `ALTER TABLE appointments ADD COLUMN external_revision INTEGER`,
    `ALTER TABLE appointments ADD COLUMN external_status TEXT`,
    `ALTER TABLE appointments ADD COLUMN external_attention TEXT`,
    `ALTER TABLE appointments ADD COLUMN external_barber_reason TEXT`,
    `ALTER TABLE appointments ADD COLUMN external_handled_by TEXT`,
    `ALTER TABLE appointments ADD COLUMN external_handled_source TEXT`,
    `ALTER TABLE appointments ADD COLUMN external_service_name TEXT`,
    `ALTER TABLE appointments ADD COLUMN external_service_price REAL`,
    `ALTER TABLE appointments ADD COLUMN external_barber_uid TEXT`,
    `ALTER TABLE appointments ADD COLUMN external_barber_name TEXT`,
    `ALTER TABLE appointments ADD COLUMN external_synced_at TEXT`,
    // Actor (JSON) mientras falta avisar a la app que la cita terminó.
    `ALTER TABLE appointments ADD COLUMN external_complete_pending TEXT`,
    `ALTER TABLE professionals ADD COLUMN app_barber_uid TEXT`,
    `ALTER TABLE professionals ADD COLUMN app_uses INTEGER NOT NULL DEFAULT 0`,
    // 'active' (vinculado) | 'invited' (esperando que se registre en la app)
    `ALTER TABLE professionals ADD COLUMN app_link_status TEXT`,
    `ALTER TABLE professionals ADD COLUMN app_barber_revision INTEGER`,
    // Creado desde la app: faltan sus datos de pago en Personal.
    `ALTER TABLE professionals ADD COLUMN needs_payment_setup INTEGER NOT NULL DEFAULT 0`,
];

const INTEGRATION_INDEXES = [
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_external ON appointments(tenant_id, source, external_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_professionals_app_uid ON professionals(tenant_id, app_barber_uid)`,
];

const readyClients = new WeakSet();
export async function ensureIntegrationTables(db = getDb()) {
    if (readyClients.has(db)) return;
    for (const sql of INTEGRATION_TABLES) await db.execute(sql);
    for (const sql of INTEGRATION_MIGRATIONS) {
        try { await db.execute(sql); } catch { /* la columna ya existe */ }
    }
    for (const sql of INTEGRATION_INDEXES) await db.execute(sql);
    readyClients.add(db);
}

async function rows(ex, sql, args = []) {
    return (await ex.execute({ sql, args })).rows;
}

async function one(ex, sql, args = []) {
    return (await rows(ex, sql, args))[0] || null;
}

async function getState(ex, key) {
    return (await one(ex, `SELECT value FROM integration_state WHERE key = ?`, [key]))?.value ?? null;
}

async function setState(ex, key, value) {
    await ex.execute({
        sql: `INSERT INTO integration_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        args: [key, value],
    });
}

// ============================================
// Firma de webhooks
// ============================================

// X-Keylut-Signature = "sha256=" + HMAC-SHA256 hex de `${timestamp}.${cuerpoCrudo}`.
// El timestamp se acepta en segundos o milisegundos y no puede diferir más de 300 s.
export function verifySignature({ rawBody, timestamp, signature, secret, now = Date.now() }) {
    if (typeof rawBody !== 'string' || !timestamp || !signature || !secret) return false;
    const numeric = Number(timestamp);
    const tsMs = Number.isFinite(numeric) ? (numeric < 1e12 ? numeric * 1000 : numeric) : Date.parse(timestamp);
    if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > 300 * 1000) return false;
    const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`);
    const received = Buffer.from(String(signature));
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

// ============================================
// API de la app (ControlFe -> app)
// ============================================

export class AppApiError extends Error {
    constructor(status, code, message, appointment = null) {
        super(message);
        this.status = status;
        this.code = code;
        this.appointment = appointment;
    }
}

async function apiFetch(path, { method = 'GET', body, idempotencyKey } = {}) {
    const cfg = getConfig();
    if (!cfg.enabled) throw new AppApiError(0, 'disabled', 'La integración con la app está apagada');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
        const headers = { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' };
        if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
        const res = await fetch(`${cfg.apiUrl}${path}`, {
            method, headers, body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal, cache: 'no-store',
        });
        let json = null;
        try { json = await res.json(); } catch { /* sin cuerpo */ }
        if (!res.ok) {
            const err = json?.error || {};
            throw new AppApiError(res.status, err.code || `http_${res.status}`, err.message || `Error ${res.status} de la app`, err.appointment || null);
        }
        return json || {};
    } catch (e) {
        if (e instanceof AppApiError) throw e;
        throw new AppApiError(0, 'network', 'No se pudo conectar con la app');
    } finally {
        clearTimeout(timer);
    }
}

const enc = encodeURIComponent;

export const appApi = {
    health: () => apiFetch('/health'),
    barbers: () => apiFetch('/barbers'),
    createBarber: (body) => apiFetch('/barbers', { method: 'POST', body }),
    updateBarber: (uid, body) => apiFetch(`/barbers/${enc(uid)}`, { method: 'PATCH', body }),
    deleteInvite: (email) => apiFetch(`/barbers/invites/${enc(email)}`, { method: 'DELETE' }),
    appointments: ({ from, to, status, attention } = {}) => {
        const qs = new URLSearchParams();
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);
        if (status) qs.set('status', status);
        if (attention) qs.set('attention', 'true');
        return apiFetch(`/appointments?${qs}`);
    },
    appointment: (id) => apiFetch(`/appointments/${enc(id)}`),
    confirm: (id, body, key) => apiFetch(`/appointments/${enc(id)}/confirm`, { method: 'POST', body, idempotencyKey: key }),
    cancel: (id, body, key) => apiFetch(`/appointments/${enc(id)}/cancel`, { method: 'POST', body, idempotencyKey: key }),
    reassign: (id, body, key) => apiFetch(`/appointments/${enc(id)}/reassign`, { method: 'POST', body, idempotencyKey: key }),
    complete: (id, body, key) => apiFetch(`/appointments/${enc(id)}/complete`, { method: 'POST', body, idempotencyKey: key }),
    putBusy: (externalId, body) => apiFetch(`/busy/${enc(externalId)}`, { method: 'PUT', body }),
    deleteBusy: (externalId) => apiFetch(`/busy/${enc(externalId)}`, { method: 'DELETE' }),
    syncBusy: (body) => apiFetch('/busy/sync', { method: 'POST', body }),
};

// UUID estable para un valor: mismos reintentos → misma Idempotency-Key.
export function stableUuid(seed) {
    const h = crypto.createHash('sha1').update(seed).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ============================================
// Conversiones
// ============================================

export const STATUS_FROM_APP = {
    pending: 'reservado',
    confirmed: 'confirmado',
    cancelled: 'cancelado',
    completed: 'terminado',
    no_show: 'no_show',
};

// Estado local a partir del estado de la app. Reglas:
//  - terminado local (cobrado o finalizado en el salón) nunca se revierte.
//  - en_atencion local se mantiene si la app dice pending o confirmed.
//  - completed en la app: si el salón cobra a ese barbero y aún no hay cobro,
//    queda "falta cobrar" (sin terminar); si el barbero cobra solo, terminado.
export function resolveLocalStatus({ appStatus, localStatus = null, salonCollects = 1, charged = false }) {
    if (localStatus === 'terminado') return 'terminado';
    if (appStatus === 'completed') {
        if (Number(salonCollects) === 1 && !charged) return localStatus === 'en_atencion' ? 'en_atencion' : 'confirmado';
        return 'terminado';
    }
    if (localStatus === 'en_atencion' && (appStatus === 'pending' || appStatus === 'confirmed')) return 'en_atencion';
    return STATUS_FROM_APP[appStatus] || 'reservado';
}

// schedules (day_of_week 0 = domingo) → [{ day: 1-7 (1 = lunes), start, end }]
export function scheduleToApp(scheduleRows) {
    return scheduleRows
        .filter((r) => Number(r.active ?? 1) === 1 && r.start_time && r.end_time)
        .map((r) => ({ day: Number(r.day_of_week) === 0 ? 7 : Number(r.day_of_week), start: r.start_time, end: r.end_time }))
        .sort((a, b) => a.day - b.day);
}

// "+56912345678" ← (country_code "+56", phone "9 1234 5678")
export function phoneToE164(countryCode, phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return null;
    if (String(phone).trim().startsWith('+')) return `+${digits}`;
    const cc = String(countryCode || '+56').replace(/\D/g, '');
    return digits.startsWith(cc) && digits.length > 9 ? `+${digits}` : `+${cc}${digits}`;
}

// "+56912345678" → { countryCode: "+56", phone: "912345678" } (Chile por defecto)
export function phoneFromE164(e164) {
    const digits = String(e164 || '').replace(/\D/g, '');
    if (!digits) return { countryCode: '+56', phone: null };
    if (digits.startsWith('56') && digits.length >= 10) return { countryCode: '+56', phone: digits.slice(2) };
    return { countryCode: '+56', phone: digits };
}

function digitsTail(phone, n = 9) {
    return String(phone || '').replace(/\D/g, '').slice(-n);
}

export function addDays(dateStr, n) {
    const d = new Date(`${dateStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

// ============================================
// Citas de la app (app -> ControlFe)
// ============================================

async function findOrCreateAppClient(ex, tenantId, client) {
    const name = client?.name?.trim() || 'Cliente app';
    const phone = client?.phone?.trim() || null;
    if (phone) {
        const exact = await one(ex, `SELECT id FROM clients WHERE tenant_id = ? AND phone = ? LIMIT 1`, [tenantId, phone]);
        if (exact) return exact.id;
        // Mismo número con otro formato ("+56 9 1234 5678" vs "912345678").
        const tail = digitsTail(phone);
        if (tail.length === 9) {
            const candidates = await rows(ex,
                `SELECT id, phone FROM clients WHERE tenant_id = ? AND active = 1 AND phone LIKE ?`,
                [tenantId, `%${tail.slice(-4)}`]);
            const match = candidates.find((c) => digitsTail(c.phone) === tail);
            if (match) return match.id;
        }
    }
    const id = generateId();
    await ex.execute({
        sql: `INSERT INTO clients (id, tenant_id, name, phone, source) VALUES (?, ?, ?, ?, 'app')`,
        args: [id, tenantId, name, phone],
    });
    return id;
}

// Upsert de una reserva de la app por (tenant_id, source='app', external_id).
// result: 'inserted' | 'updated' | 'stale' (revision vieja) | 'unlinked'
// (barbero sin vincular: no se inserta) | 'ignored'.
export async function applyAppAppointment(appt, { db = getDb(), tenantId, now = new Date() } = {}) {
    if (!appt?.id) return { result: 'ignored' };
    await ensureIntegrationTables(db);
    return withWriteTx(db, async (tx) => {
        const existing = await one(tx,
            `SELECT a.*, p.salon_collects AS prof_salon_collects FROM appointments a
             LEFT JOIN professionals p ON p.id = a.professional_id
             WHERE a.tenant_id = ? AND a.source = 'app' AND a.external_id = ?`,
            [tenantId, appt.id]);
        const revision = Number(appt.revision) || 0;
        if (existing && Number(existing.external_revision || 0) >= revision) {
            return { result: 'stale', appointmentId: existing.id };
        }

        const prof = appt.barber?.id
            ? await one(tx, `SELECT id, salon_collects FROM professionals WHERE tenant_id = ? AND app_barber_uid = ?`, [tenantId, appt.barber.id])
            : null;
        if (!prof && !existing) return { result: 'unlinked' };
        // Si ya existía y el nuevo barbero no está vinculado, se conserva el
        // profesional anterior y la bandeja lo marca "Barbero sin vincular".
        const professionalId = prof ? prof.id : existing.professional_id;
        const salonCollects = prof ? prof.salon_collects : existing.prof_salon_collects;
        const charged = existing
            ? !!(await one(tx, `SELECT 1 AS x FROM sales WHERE appointment_id = ? AND status = 'completed' LIMIT 1`, [existing.id]))
            : false;
        const status = resolveLocalStatus({ appStatus: appt.status, localStatus: existing?.status || null, salonCollects, charged });

        const clientId = await findOrCreateAppClient(tx, tenantId, appt.client);
        const serviceName = appt.service?.name?.trim() || null;
        const serviceId = serviceName
            ? (await one(tx, `SELECT id FROM services WHERE tenant_id = ? AND active = 1 AND lower(name) = lower(?) LIMIT 1`, [tenantId, serviceName]))?.id || null
            : null;
        const handledBy = appt.handledBy || null;
        const completedInApp = appt.status === 'completed';

        const fields = {
            professional_id: professionalId,
            client_id: clientId,
            service_id: serviceId,
            date: appt.date,
            start_time: appt.start,
            end_time: appt.end,
            status,
            client_name: appt.client?.name || null,
            client_phone: appt.client?.phone || null,
            notes: appt.notes || null,
            cancel_reason: status === 'cancelado' ? (appt.cancelReason || existing?.cancel_reason || null) : (existing?.cancel_reason || null),
            external_revision: revision,
            external_status: appt.status || null,
            external_attention: appt.status === 'pending' ? (appt.attention || null) : null,
            external_barber_reason: appt.barberResponse?.reason || null,
            external_handled_by: handledBy ? JSON.stringify(handledBy) : null,
            external_handled_source: handledBy?.source || null,
            external_service_name: serviceName,
            external_service_price: appt.service?.price ?? null,
            external_barber_uid: appt.barber?.id || null,
            external_barber_name: appt.barber?.name || null,
            external_synced_at: now.toISOString(),
            // Si la app ya la tiene completada, no hace falta avisarle.
            external_complete_pending: completedInApp ? null : (existing?.external_complete_pending || null),
        };
        const names = Object.keys(fields);
        if (existing) {
            await tx.execute({
                sql: `UPDATE appointments SET ${names.map((n) => `${n} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
                args: [...names.map((n) => fields[n]), existing.id],
            });
            return { result: 'updated', appointmentId: existing.id, status };
        }
        const id = generateId();
        await tx.execute({
            sql: `INSERT INTO appointments (id, tenant_id, source, external_id, ${names.join(', ')})
                  VALUES (?, ?, 'app', ?, ${names.map(() => '?').join(', ')})`,
            args: [id, tenantId, appt.id, ...names.map((n) => fields[n])],
        });
        return { result: 'inserted', appointmentId: id, status };
    });
}

// appointment.deleted: se marca cancelada (nunca se borra).
export async function markAppAppointmentDeleted(externalId, { db = getDb(), tenantId } = {}) {
    await ensureIntegrationTables(db);
    const r = await db.execute({
        sql: `UPDATE appointments SET status = 'cancelado', cancel_reason = 'Eliminada en la app', external_status = 'cancelled',
                external_attention = NULL, external_synced_at = ?, updated_at = datetime('now')
              WHERE tenant_id = ? AND source = 'app' AND external_id = ? AND status <> 'terminado'`,
        args: [new Date().toISOString(), tenantId, externalId],
    });
    return { result: r.rowsAffected ? 'cancelled' : 'ignored' };
}

// Trae las reservas de la app del rango y aplica solo las que cambiaron.
// Devuelve las que no se pudieron guardar por barbero sin vincular.
export async function refreshFromApp({ db = getDb(), tenantId, from, to }) {
    await ensureIntegrationTables(db);
    const data = await appApi.appointments({ from, to });
    const list = Array.isArray(data.appointments) ? data.appointments : [];
    const known = new Map();
    if (list.length) {
        const ids = list.map((a) => a.id);
        for (let i = 0; i < ids.length; i += 200) {
            const chunk = ids.slice(i, i + 200);
            const found = await rows(db,
                `SELECT external_id, external_revision FROM appointments WHERE tenant_id = ? AND source = 'app' AND external_id IN (${chunk.map(() => '?').join(',')})`,
                [tenantId, ...chunk]);
            for (const f of found) known.set(f.external_id, Number(f.external_revision || 0));
        }
    }
    const unlinked = [];
    let applied = 0;
    for (const appt of list) {
        if (known.has(appt.id) && known.get(appt.id) >= (Number(appt.revision) || 0)) continue;
        const r = await applyAppAppointment(appt, { db, tenantId });
        if (r.result === 'unlinked') unlinked.push(appt);
        else if (r.result === 'inserted' || r.result === 'updated') applied++;
    }
    return { unlinked, applied, total: list.length };
}

// Avisa a la app que una cita source='app' terminó en el salón. Si falla, la
// deja "pendiente de avisar" (con el actor) para reintentar.
export async function completeInApp({ db = getDb(), tenantId, appointmentId, actor }) {
    await ensureIntegrationTables(db);
    const appt = await one(db, `SELECT id, external_id, source FROM appointments WHERE id = ? AND tenant_id = ?`, [appointmentId, tenantId]);
    if (!appt || appt.source !== 'app' || !appt.external_id) return { result: 'ignored' };
    try {
        const res = await appApi.complete(appt.external_id, { actor }, stableUuid(`complete:${appt.id}`));
        if (res.appointment) await applyAppAppointment(res.appointment, { db, tenantId });
        await db.execute({ sql: `UPDATE appointments SET external_complete_pending = NULL WHERE id = ?`, args: [appt.id] });
        return { result: 'completed' };
    } catch (e) {
        if (e.status === 409) {
            // Cancelada o no_show en la app: no se reintenta.
            if (e.appointment) await applyAppAppointment(e.appointment, { db, tenantId });
            await db.execute({ sql: `UPDATE appointments SET external_complete_pending = NULL WHERE id = ?`, args: [appt.id] });
            return { result: 'already_handled' };
        }
        logError('complete', e);
        await db.execute({ sql: `UPDATE appointments SET external_complete_pending = ? WHERE id = ?`, args: [JSON.stringify(actor || {}), appt.id] });
        return { result: 'pending' };
    }
}

export async function retryPendingCompletes({ db = getDb(), tenantId, limit = 20 }) {
    await ensureIntegrationTables(db);
    const pending = await rows(db,
        `SELECT id, external_complete_pending FROM appointments
         WHERE tenant_id = ? AND source = 'app' AND external_complete_pending IS NOT NULL LIMIT ?`,
        [tenantId, limit]);
    let done = 0;
    for (const p of pending) {
        let actor = null;
        try { actor = JSON.parse(p.external_complete_pending); } catch { /* actor inválido */ }
        const r = await completeInApp({ db, tenantId, appointmentId: p.id, actor: actor?.id ? actor : { id: 'controlfe', name: 'ControlFe' } });
        if (r.result !== 'pending') done++;
    }
    return { pending: pending.length, done };
}

// ============================================
// Barberos (app <-> ControlFe)
// ============================================

// Inicio y fin por día desde la app; la colación de ControlFe se conserva.
async function applyScheduleFromApp(tx, professionalId, schedule) {
    const appDays = new Map();
    for (const s of Array.isArray(schedule) ? schedule : []) {
        if (!s?.start || !s?.end) continue;
        appDays.set(Number(s.day) === 7 ? 0 : Number(s.day), s);
    }
    const current = await rows(tx, `SELECT * FROM schedules WHERE professional_id = ? AND active = 1`, [professionalId]);
    let changed = false;
    for (let dow = 0; dow <= 6; dow++) {
        const cur = current.filter((r) => Number(r.day_of_week) === dow);
        const app = appDays.get(dow);
        if (app && cur.length) {
            if (cur[0].start_time !== app.start || cur[0].end_time !== app.end) {
                await tx.execute({ sql: `UPDATE schedules SET start_time = ?, end_time = ? WHERE id = ?`, args: [app.start, app.end, cur[0].id] });
                changed = true;
            }
            for (const extra of cur.slice(1)) {
                await tx.execute({ sql: `UPDATE schedules SET active = 0 WHERE id = ?`, args: [extra.id] });
                changed = true;
            }
        } else if (app) {
            await tx.execute({
                sql: `INSERT INTO schedules (id, professional_id, day_of_week, start_time, end_time, active) VALUES (?, ?, ?, ?, ?, 1)`,
                args: [generateId(), professionalId, dow, app.start, app.end],
            });
            changed = true;
        } else if (cur.length) {
            for (const r of cur) await tx.execute({ sql: `UPDATE schedules SET active = 0 WHERE id = ?`, args: [r.id] });
            changed = true;
        }
    }
    return changed;
}

// Upsert de un barbero de la app: por app_barber_uid, si no por email
// (invitación pendiente) y si no, lo crea con datos de pago por completar.
// No llama a la API de vuelta (sin rebote).
export async function applyAppBarber(barber, { db = getDb(), tenantId } = {}) {
    if (!barber?.id) return { result: 'ignored' };
    await ensureIntegrationTables(db);
    return withWriteTx(db, async (tx) => {
        let prof = await one(tx, `SELECT * FROM professionals WHERE tenant_id = ? AND app_barber_uid = ?`, [tenantId, barber.id]);
        if (!prof && barber.email) {
            prof = await one(tx,
                `SELECT * FROM professionals WHERE tenant_id = ? AND app_barber_uid IS NULL AND lower(email) = lower(?)
                 ORDER BY (app_link_status = 'invited') DESC, active DESC LIMIT 1`,
                [tenantId, barber.email.trim()]);
        }
        const revision = Number(barber.revision) || 0;
        if (prof && prof.app_barber_uid === barber.id && Number(prof.app_barber_revision || 0) >= revision) {
            return { result: 'stale', professionalId: prof.id };
        }
        const { countryCode, phone } = phoneFromE164(barber.phone);
        const active = barber.active === false ? 0 : 1;
        if (prof) {
            const linkedNow = prof.app_barber_uid !== barber.id;
            await tx.execute({
                sql: `UPDATE professionals SET name = ?, email = ?, phone = COALESCE(?, phone), country_code = ?,
                        avatar_url = COALESCE(?, avatar_url), active = ?, app_barber_uid = ?, app_uses = 1,
                        app_link_status = 'active', app_barber_revision = ?, updated_at = datetime('now')
                      WHERE id = ?`,
                args: [barber.name || prof.name, barber.email || prof.email, phone, countryCode,
                    barber.photoUrl || null, active, barber.id, revision, prof.id],
            });
            const scheduleChanged = barber.schedule ? await applyScheduleFromApp(tx, prof.id, barber.schedule) : false;
            return { result: 'updated', professionalId: prof.id, linkedNow, scheduleChanged };
        }
        const id = generateId();
        await tx.execute({
            sql: `INSERT INTO professionals (id, tenant_id, name, email, phone, country_code, avatar_url, active,
                    app_barber_uid, app_uses, app_link_status, app_barber_revision, needs_payment_setup)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', ?, 1)`,
            args: [id, tenantId, barber.name || 'Barbero', barber.email || null, phone, countryCode,
                barber.photoUrl || null, active, barber.id, revision],
        });
        await applyScheduleFromApp(tx, id, barber.schedule);
        return { result: 'created', professionalId: id, linkedNow: true, scheduleChanged: true };
    });
}

// barber.deleted: se desactiva, nunca se borra.
export async function deactivateAppBarber(uid, { db = getDb(), tenantId } = {}) {
    await ensureIntegrationTables(db);
    const r = await db.execute({
        sql: `UPDATE professionals SET active = 0, updated_at = datetime('now') WHERE tenant_id = ? AND app_barber_uid = ?`,
        args: [tenantId, uid],
    });
    return { result: r.rowsAffected ? 'deactivated' : 'ignored' };
}

async function loadProfessional(db, tenantId, professionalId) {
    return one(db, `SELECT * FROM professionals WHERE id = ? AND tenant_id = ?`, [professionalId, tenantId]);
}

async function scheduleForApp(db, professionalId) {
    return scheduleToApp(await rows(db, `SELECT * FROM schedules WHERE professional_id = ? AND active = 1`, [professionalId]));
}

// Después de guardar un profesional en Personal. Devuelve { status, message }
// para mostrar al usuario, o null si no hubo nada que hacer con la app.
//   appUses  → casilla "Usa la app Barber Keylut"
//   linkUid  → barbero existente elegido en el selector (vinculación manual)
export async function syncProfessionalToApp({ db = getDb(), tenantId, professionalId, previous, appUses, linkUid = '' }) {
    await ensureIntegrationTables(db);
    const p = await loadProfessional(db, tenantId, professionalId);
    if (!p) return null;
    try {
        if (!appUses) {
            if (!previous || !Number(previous.app_uses)) return null;
            if (p.app_barber_uid) await appApi.updateBarber(p.app_barber_uid, { active: false });
            else if (previous.app_link_status === 'invited' && previous.email) await appApi.deleteInvite(previous.email);
            await db.execute({
                sql: `UPDATE professionals SET app_uses = 0, app_link_status = CASE WHEN app_barber_uid IS NULL THEN NULL ELSE app_link_status END WHERE id = ?`,
                args: [p.id],
            });
            return { status: 'disabled', message: 'Ya no usa la app Barber Keylut.' };
        }

        // Vinculación manual con un barbero que ya existe en la app.
        if (linkUid && linkUid !== p.app_barber_uid) {
            const taken = await one(db, `SELECT name FROM professionals WHERE tenant_id = ? AND app_barber_uid = ? AND id <> ?`, [tenantId, linkUid, p.id]);
            if (taken) return { status: 'error', message: `Ese barbero de la app ya está vinculado a ${taken.name}.` };
            await db.execute({
                sql: `UPDATE professionals SET app_barber_uid = ?, app_uses = 1, app_link_status = 'active' WHERE id = ?`,
                args: [linkUid, p.id],
            });
            return { status: 'linked', linkedNow: true, uid: linkUid, message: 'Vinculado con su cuenta de la app.' };
        }

        const fields = {
            name: p.name,
            phone: phoneToE164(p.country_code, p.phone),
            photoUrl: p.avatar_url || null,
        };
        if (!p.app_barber_uid) {
            const res = await appApi.createBarber({ email: p.email, ...fields, schedule: await scheduleForApp(db, p.id) });
            if (res.status === 'invited') {
                await db.execute({ sql: `UPDATE professionals SET app_uses = 1, app_link_status = 'invited' WHERE id = ?`, args: [p.id] });
                return { status: 'invited', message: `Invitado: se activa cuando se registre en la app con ${res.email || p.email}.` };
            }
            const uid = res.barber?.id;
            if (!uid) return { status: 'error', message: 'La app no devolvió el barbero.' };
            const taken = await one(db, `SELECT name FROM professionals WHERE tenant_id = ? AND app_barber_uid = ? AND id <> ?`, [tenantId, uid, p.id]);
            if (taken) return { status: 'error', message: `Ese correo ya es de un barbero vinculado a ${taken.name}.` };
            await db.execute({
                sql: `UPDATE professionals SET app_barber_uid = ?, app_uses = 1, app_link_status = 'active', app_barber_revision = ? WHERE id = ?`,
                args: [uid, Number(res.barber?.revision) || null, p.id],
            });
            return {
                status: 'linked', linkedNow: true, uid,
                message: res.alreadyBarber ? 'Ya era barbero en la app: quedó vinculado.' : 'Creado y vinculado en la app.',
            };
        }

        // Ya vinculado: PATCH solo con lo que cambió.
        const patch = {};
        if (!previous || previous.name !== p.name) patch.name = fields.name;
        if (!previous || phoneToE164(previous.country_code, previous.phone) !== fields.phone) patch.phone = fields.phone;
        if (!previous || (previous.avatar_url || null) !== fields.photoUrl) patch.photoUrl = fields.photoUrl;
        if (previous && !Number(previous.app_uses)) patch.active = true;
        if (Object.keys(patch).length) await appApi.updateBarber(p.app_barber_uid, patch);
        if (!Number(p.app_uses)) await db.execute({ sql: `UPDATE professionals SET app_uses = 1 WHERE id = ?`, args: [p.id] });
        return Object.keys(patch).length ? { status: 'updated', message: null } : null;
    } catch (e) {
        if (e.code === 'role_conflict') {
            await db.execute({ sql: `UPDATE professionals SET app_uses = 0 WHERE id = ?`, args: [p.id] });
            return { status: 'error', message: e.message || 'Ese correo es administrador en la app y no puede ser barbero.' };
        }
        logError('barber sync', e);
        return { status: 'error', message: 'Se guardó en ControlFe, pero no se pudo avisar a la app. Vuelve a guardar más tarde.' };
    }
}

// Horario guardado en Personal: la app recibe inicio y fin de cada día.
export async function pushScheduleToApp({ db = getDb(), tenantId, professionalId }) {
    await ensureIntegrationTables(db);
    const p = await loadProfessional(db, tenantId, professionalId);
    if (!p?.app_barber_uid || !Number(p.app_uses)) return;
    try {
        await appApi.updateBarber(p.app_barber_uid, { schedule: await scheduleForApp(db, p.id) });
    } catch (e) {
        logError('schedule', e);
    }
}

// Profesional eliminado (borrado lógico) en Personal.
export async function onProfessionalDeleted({ previous }) {
    if (!previous || !Number(previous.app_uses)) return;
    try {
        if (previous.app_barber_uid) await appApi.updateBarber(previous.app_barber_uid, { active: false });
        else if (previous.app_link_status === 'invited' && previous.email) await appApi.deleteInvite(previous.email);
    } catch (e) {
        logError('barber delete', e);
    }
}

// Barbero recién vinculado: trae sus reservas de la app (las que llegaron
// mientras no estaba vinculado) y las guarda.
export async function importBookingsForLinkedBarber({ db = getDb(), tenantId, now = new Date() }) {
    const from = tzToday(APP_TIMEZONE, now);
    try {
        return await refreshFromApp({ db, tenantId, from, to: addDays(from, 60) });
    } catch (e) {
        logError('import bookings', e);
        return null;
    }
}

// ============================================
// Ocupación (ControlFe -> app)
// ============================================

const BUSY_STATUSES = new Set(['reservado', 'confirmado', 'en_atencion', 'terminado']);

// Cita propia de ControlFe creada o cambiada: PUT o DELETE /busy/{id}.
// Nunca bloquea la acción del usuario: los errores se registran y la
// sincronización completa los corrige.
export async function pushOccupancyForAppointment(appointmentId, { db = getDb() } = {}) {
    const cfg = getConfig();
    if (!cfg.enabled || !appointmentId) return;
    try {
        await ensureIntegrationTables(db);
        const a = await one(db,
            `SELECT a.id, a.tenant_id, a.source, a.status, a.date, a.start_time, a.end_time, p.app_barber_uid
             FROM appointments a LEFT JOIN professionals p ON p.id = a.professional_id WHERE a.id = ?`,
            [appointmentId]);
        if (!a || a.tenant_id !== cfg.tenantId || a.source === 'app' || !a.app_barber_uid) return;
        if (BUSY_STATUSES.has(a.status)) {
            await appApi.putBusy(a.id, { barberId: a.app_barber_uid, date: a.date, start: a.start_time, end: a.end_time, kind: 'appointment' });
        } else {
            await appApi.deleteBusy(a.id);
        }
    } catch (e) {
        logError('busy appointment', e);
    }
}

// Días libres guardados en Personal (se borran y recrean con ids nuevos).
export async function pushOccupancyForExceptions({ db = getDb(), tenantId, professionalId, removedIds = [], addedRows = [] }) {
    if (!isEnabledFor(tenantId)) return;
    try {
        await ensureIntegrationTables(db);
        const p = await loadProfessional(db, tenantId, professionalId);
        if (!p?.app_barber_uid) return;
        for (const id of removedIds) await appApi.deleteBusy(`exc-${id}`);
        for (const r of addedRows) {
            if ((r.type || 'blocked') !== 'blocked') continue;
            await appApi.putBusy(`exc-${r.id}`, {
                barberId: p.app_barber_uid, date: r.date,
                start: r.start_time || '00:00', end: r.end_time || '24:00', kind: 'block',
            });
        }
    } catch (e) {
        logError('busy exceptions', e);
    }
}

// Sincronización completa de hoy a hoy + 60: reemplaza toda la ocupación de
// ControlFe en la app. Sin `force`, como máximo una vez cada 10 minutos.
export async function syncBusy({ db = getDb(), tenantId, force = false, now = new Date(), days = 60 } = {}) {
    if (!isEnabledFor(tenantId)) return { skipped: 'disabled' };
    await ensureIntegrationTables(db);
    const last = await getState(db, 'busy_sync_at');
    if (!force && last && now.getTime() - Date.parse(last) < 10 * 60 * 1000) return { skipped: 'recent' };
    await setState(db, 'busy_sync_at', now.toISOString());

    const from = tzToday(APP_TIMEZONE, now);
    const to = addDays(from, days);
    const items = [];
    const appts = await rows(db,
        `SELECT a.id, a.date, a.start_time, a.end_time, p.app_barber_uid FROM appointments a
         JOIN professionals p ON p.id = a.professional_id
         WHERE a.tenant_id = ? AND COALESCE(a.source, 'manual') <> 'app' AND p.app_barber_uid IS NOT NULL
           AND a.status IN ('reservado','confirmado','en_atencion','terminado') AND a.date BETWEEN ? AND ?`,
        [tenantId, from, to]);
    for (const a of appts) {
        items.push({ externalId: a.id, barberId: a.app_barber_uid, date: a.date, start: a.start_time, end: a.end_time, kind: 'appointment' });
    }
    const blocks = await rows(db,
        `SELECT e.id, e.date, e.start_time, e.end_time, p.app_barber_uid FROM schedule_exceptions e
         JOIN professionals p ON p.id = e.professional_id
         WHERE p.tenant_id = ? AND p.app_barber_uid IS NOT NULL AND e.type = 'blocked' AND e.date BETWEEN ? AND ?`,
        [tenantId, from, to]);
    for (const b of blocks) {
        items.push({ externalId: `exc-${b.id}`, barberId: b.app_barber_uid, date: b.date, start: b.start_time || '00:00', end: b.end_time || '24:00', kind: 'block' });
    }
    const breaks = await rows(db,
        `SELECT s.professional_id, s.day_of_week, s.break_start, s.break_end, p.app_barber_uid FROM schedules s
         JOIN professionals p ON p.id = s.professional_id
         WHERE p.tenant_id = ? AND p.active = 1 AND p.app_barber_uid IS NOT NULL AND s.active = 1
           AND s.break_start IS NOT NULL AND s.break_start <> '' AND s.break_end IS NOT NULL AND s.break_end <> ''`,
        [tenantId]);
    for (let date = from; date <= to; date = addDays(date, 1)) {
        const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
        for (const b of breaks.filter((x) => Number(x.day_of_week) === dow)) {
            items.push({
                externalId: `brk-${b.professional_id}-${date.replace(/-/g, '')}`, barberId: b.app_barber_uid,
                date, start: b.break_start, end: b.break_end, kind: 'break',
            });
        }
    }
    try {
        await appApi.syncBusy({ from, to, items });
        return { items: items.length };
    } catch (e) {
        logError('busy sync', e);
        await setState(db, 'busy_sync_at', last || '');
        return { error: e.code || 'error' };
    }
}

// ============================================
// Auditoría
// ============================================

export async function writeAudit({ db = getDb(), tenantId, user, action, entityId, details = {} }) {
    try {
        await db.execute({
            sql: `INSERT INTO audit_logs (id, tenant_id, user_id, user_name, action, entity, entity_id, details)
                  VALUES (?, ?, ?, ?, ?, 'app_booking', ?, ?)`,
            args: [generateId(), tenantId, user?.id || null, user?.name || null, action, entityId || null, JSON.stringify(details)],
        });
    } catch (e) {
        logError('audit', e);
    }
}
