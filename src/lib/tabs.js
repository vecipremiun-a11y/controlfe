// ============================================================
//  Cuentas de clientes en Barbershop
// ============================================================
// Lo que un cliente consume mientras espera o se atiende (una bebida, un
// producto) y los servicios extra que le hace su barbero se anotan en su
// cuenta y se cobran después: con el servicio, aparte, o junto con la cuenta
// de otro cliente (ej. un padre que paga lo de sus hijos).
//
// Productos = consumo: los cobra siempre el local. Servicios extra = como el
// servicio principal: los cobra el local solo si cobra los servicios de ese
// barbero (professionals.salon_collects = 1); si no, los cobra el barbero.
//
//   client_tabs       una cuenta por cliente: ligada a su lugar en la sala de
//                     espera (waitlist_id), a su cita (appointment_id) o a
//                     ninguno (cuenta suelta con solo el nombre).
//   client_tab_items  lo anotado: open → paid (al cobrarse, con su venta)
//                     o removed (quitado por error).
//
// La cuenta de quien espera pasa sola a su cita: al asignarlo se crea la cita
// con appointments.waitlist_id, y la cuenta se busca por ese vínculo.
import { getDb } from './db.js';
import { generateId, tzToday } from './utils.js';
import { withWriteTx } from './writeTx.js';
import { isEnabledFor, ensureIntegrationTables } from './barberkeylut.js';

const TAB_TABLES = [
    `CREATE TABLE IF NOT EXISTS client_tabs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        date TEXT NOT NULL,
        client_name TEXT NOT NULL,
        waitlist_id TEXT,
        appointment_id TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_client_tabs_tenant ON client_tabs(tenant_id, date)`,
    `CREATE TABLE IF NOT EXISTS client_tab_items (
        id TEXT PRIMARY KEY,
        tab_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        type TEXT NOT NULL,
        item_id TEXT,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'open',
        sale_id TEXT,
        created_by TEXT,
        created_by_name TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_client_tab_items_tab ON client_tab_items(tab_id, status)`,
];

// Cada línea de la venta sabe de qué cita viene (varias cuentas en un mismo
// cobro) y qué anotación de cuenta paga.
const TAB_MIGRATIONS = [
    `ALTER TABLE sale_items ADD COLUMN appointment_id TEXT`,
    `ALTER TABLE sale_items ADD COLUMN tab_item_id TEXT`,
];

export class TabError extends Error {
    constructor(message, status = 400, code = 'invalid') {
        super(message);
        this.status = status;
        this.code = code;
    }
}

const readyClients = new WeakSet();
export async function ensureTabTables(db = getDb()) {
    if (readyClients.has(db)) return;
    for (const sql of TAB_TABLES) await db.execute(sql);
    for (const sql of TAB_MIGRATIONS) {
        try { await db.execute(sql); } catch { /* la columna ya existe */ }
    }
    readyClients.add(db);
}

async function rows(ex, sql, args = []) {
    return (await ex.execute({ sql, args })).rows;
}

async function one(ex, sql, args = []) {
    return (await rows(ex, sql, args))[0] || null;
}

const money = (v) => Number(v) || 0;

// Servicios de una cita como líneas de cobro: el principal y los extra que
// Barbershop guarda en notes ({ extra_services: [...] }).
export function appointmentServiceLines(appt) {
    if (!appt) return [];
    const lines = [{
        item_id: appt.service_id || (appt.source === 'app' ? 'app-service' : 'sin-servicio'),
        name: appt.service_name || 'Servicio',
        price: money(appt.service_price),
        professional_id: appt.professional_id || null,
    }];
    try {
        const parsed = appt.notes ? JSON.parse(appt.notes) : null;
        for (const s of Array.isArray(parsed?.extra_services) ? parsed.extra_services : []) {
            lines.push({ item_id: s.id, name: s.name, price: money(s.price), professional_id: appt.professional_id || null });
        }
    } catch { /* notes es texto libre */ }
    return lines;
}

async function appointmentColumns(db, tenantId) {
    // Las citas de la app pueden traer un servicio que no existe en ControlFe.
    if (isEnabledFor(tenantId)) {
        await ensureIntegrationTables(db);
        return `COALESCE(s.name, a.external_service_name) AS service_name, COALESCE(s.price, a.external_service_price) AS service_price`;
    }
    return `s.name AS service_name, s.price AS service_price`;
}

// Cuenta (con sus anotaciones abiertas) de cada cliente con algo pendiente.
async function loadOpenTabs(db, tenantId) {
    const tabs = await rows(db,
        `SELECT t.id, t.client_name, t.waitlist_id, t.appointment_id, t.created_at,
                COALESCE(t.appointment_id, (
                    SELECT a.id FROM appointments a
                    WHERE a.tenant_id = t.tenant_id AND t.waitlist_id IS NOT NULL AND a.waitlist_id = t.waitlist_id
                      AND a.status <> 'cancelado'
                    ORDER BY a.created_at DESC LIMIT 1
                )) AS resolved_appointment_id
         FROM client_tabs t
         WHERE t.tenant_id = ? AND EXISTS (SELECT 1 FROM client_tab_items i WHERE i.tab_id = t.id AND i.status = 'open')
         ORDER BY t.created_at`,
        [tenantId]);
    if (!tabs.length) return [];
    const items = await rows(db,
        `SELECT i.id, i.tab_id, i.type, i.item_id, i.name, i.quantity, i.unit_price, i.created_by_name,
                strftime('%Y-%m-%dT%H:%M:%SZ', i.created_at) AS created_at
         FROM client_tab_items i JOIN client_tabs t ON t.id = i.tab_id
         WHERE t.tenant_id = ? AND i.status = 'open'
         ORDER BY i.created_at`,
        [tenantId]);
    // ¿El salón cobra los servicios de quien lo atiende? (los servicios extra
    // de un barbero que cobra lo suyo no se le cobran al cliente desde aquí).
    const apptIds = [...new Set(tabs.map((t) => t.resolved_appointment_id).filter(Boolean))];
    const collects = new Map();
    if (apptIds.length) {
        const appts = await rows(db,
            `SELECT a.id, p.salon_collects FROM appointments a LEFT JOIN professionals p ON p.id = a.professional_id
             WHERE a.id IN (${apptIds.map(() => '?').join(',')})`,
            apptIds);
        for (const a of appts) collects.set(a.id, Number(a.salon_collects ?? 1) === 1);
    }
    return tabs.map((t) => {
        const own = items.filter((i) => i.tab_id === t.id).map(itemOut);
        const salonCollects = t.resolved_appointment_id ? collects.get(t.resolved_appointment_id) !== false : true;
        const owed = own.filter((i) => i.type === 'product' || salonCollects);
        return {
            id: t.id,
            clientName: t.client_name,
            waitlistId: t.waitlist_id,
            appointmentId: t.resolved_appointment_id,
            items: own,
            // Lo que el local le cobrará: productos y, si cobra a ese barbero, los servicios extra.
            total: owed.reduce((s, i) => s + i.quantity * i.unitPrice, 0),
            count: owed.reduce((s, i) => s + i.quantity, 0),
        };
    });
}

function itemOut(i) {
    return {
        id: i.id, type: i.type, itemId: i.item_id, name: i.name,
        quantity: Number(i.quantity) || 1, unitPrice: money(i.unit_price),
        addedBy: i.created_by_name || null, addedAt: i.created_at,
    };
}

const accountSummary = (tab) => (tab ? { tabId: tab.id, total: tab.total, count: tab.count } : null);

// Clientes a los que se les puede anotar consumo: los que esperan, los que se
// están atendiendo y las cuentas con algo pendiente de clientes que ya no
// están en ninguna de las dos (ej. el barbero cobró su corte y faltan los
// productos).
export async function getAccountsOverview({ db = getDb(), tenantId }) {
    await ensureTabTables(db);
    const today = tzToday();
    const waiting = await rows(db,
        `SELECT w.id, w.client_name, w.service_id, strftime('%Y-%m-%dT%H:%M:%SZ', w.created_at) AS created_at,
                s.name AS service_name, p.name AS professional_name
         FROM waitlist w
         LEFT JOIN services s ON s.id = w.service_id
         LEFT JOIN professionals p ON p.id = w.professional_id
         WHERE w.tenant_id = ? AND w.status = 'waiting'
         ORDER BY w.created_at`,
        [tenantId]);
    const inService = await rows(db,
        `SELECT a.id, a.client_name, a.waitlist_id, a.professional_id, a.start_time, ${await appointmentColumns(db, tenantId)},
                p.name AS professional_name, p.color AS professional_color, p.salon_collects
         FROM appointments a
         LEFT JOIN services s ON s.id = a.service_id
         LEFT JOIN professionals p ON p.id = a.professional_id
         WHERE a.tenant_id = ? AND a.date = ? AND a.status = 'en_atencion'
         ORDER BY a.start_time`,
        [tenantId, today]);
    const tabs = await loadOpenTabs(db, tenantId);

    const waitingIds = new Set(waiting.map((w) => w.id));
    const serviceIds = new Set(inService.map((a) => a.id));
    const used = new Set();
    const tabFor = (pred) => {
        const t = tabs.find((x) => !used.has(x.id) && pred(x));
        if (t) used.add(t.id);
        return t || null;
    };

    const inServiceOut = inService.map((a) => {
        const tab = tabFor((t) => t.appointmentId === a.id);
        return {
            appointmentId: a.id,
            clientName: a.client_name || 'Cliente',
            serviceName: a.service_name || 'Servicio',
            professional: { id: a.professional_id, name: a.professional_name, color: a.professional_color, salonCollects: Number(a.salon_collects ?? 1) === 1 },
            account: accountSummary(tab),
        };
    });
    const waitingOut = waiting.map((w) => {
        const tab = tabFor((t) => t.waitlistId === w.id && !serviceIds.has(t.appointmentId));
        return {
            waitlistId: w.id,
            clientName: w.client_name,
            serviceName: w.service_name || null,
            professionalName: w.professional_name || null,
            since: w.created_at,
            account: accountSummary(tab),
        };
    });
    const pending = tabs
        .filter((t) => !used.has(t.id) && t.total > 0 && !(t.waitlistId && waitingIds.has(t.waitlistId) && !t.appointmentId))
        .map((t) => ({ tabId: t.id, clientName: t.clientName, appointmentId: t.appointmentId, account: accountSummary(t), items: t.items }));

    return { waiting: waitingOut, inService: inServiceOut, pending };
}

// Cuenta de un cliente para verla o cobrarla. target: { tabId } |
// { waitlistId } | { appointmentId }.
export async function getAccountDetail({ db = getDb(), tenantId, target }) {
    await ensureTabTables(db);
    let tab = null;
    let appt = null;
    let wait = null;

    if (target.tabId) {
        tab = await one(db, `SELECT * FROM client_tabs WHERE id = ? AND tenant_id = ?`, [target.tabId, tenantId]);
        if (!tab) throw new TabError('La cuenta no existe', 404, 'not_found');
    }
    const appointmentId = target.appointmentId || tab?.appointment_id || null;
    const waitlistId = target.waitlistId || tab?.waitlist_id || null;

    if (appointmentId) {
        appt = await one(db,
            `SELECT a.*, ${await appointmentColumns(db, tenantId)}, p.name AS professional_name, p.salon_collects
             FROM appointments a
             LEFT JOIN services s ON s.id = a.service_id
             LEFT JOIN professionals p ON p.id = a.professional_id
             WHERE a.id = ? AND a.tenant_id = ?`,
            [appointmentId, tenantId]);
    } else if (waitlistId) {
        // Si ya pasó a atención, la cita manda.
        appt = await one(db,
            `SELECT a.*, ${await appointmentColumns(db, tenantId)}, p.name AS professional_name, p.salon_collects
             FROM appointments a
             LEFT JOIN services s ON s.id = a.service_id
             LEFT JOIN professionals p ON p.id = a.professional_id
             WHERE a.tenant_id = ? AND a.waitlist_id = ? AND a.status <> 'cancelado'
             ORDER BY a.created_at DESC LIMIT 1`,
            [tenantId, waitlistId]);
        if (!appt) {
            wait = await one(db,
                `SELECT w.*, s.name AS service_name, s.price AS service_price, p.name AS professional_name
                 FROM waitlist w
                 LEFT JOIN services s ON s.id = w.service_id
                 LEFT JOIN professionals p ON p.id = w.professional_id
                 WHERE w.id = ? AND w.tenant_id = ?`,
                [waitlistId, tenantId]);
        }
    }
    if (!tab) tab = await findTab(db, tenantId, { appointment: appt, waitlistId: wait?.id || waitlistId });

    const anotado = tab
        ? (await rows(db,
            `SELECT id, type, item_id, name, quantity, unit_price, created_by_name,
                    strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at
             FROM client_tab_items WHERE tab_id = ? AND status = 'open' ORDER BY created_at`,
            [tab.id])).map(itemOut)
        : [];
    // Un servicio anotado no es consumo: es un servicio extra del barbero.
    const products = anotado.filter((i) => i.type === 'product');
    const extraServices = anotado.filter((i) => i.type === 'service');

    // Estado del cliente y si el salón cobra su servicio ahora.
    const OPEN_APPT = ['reservado', 'confirmado', 'en_atencion'];
    let state = 'account';
    if (appt) state = appt.status === 'en_atencion' ? 'in_service' : OPEN_APPT.includes(appt.status) ? 'booked' : 'done';
    else if (wait) state = wait.status === 'waiting' ? 'waiting' : 'done';
    const salonCollects = appt ? Number(appt.salon_collects ?? 1) === 1 : true;
    const services = appt ? appointmentServiceLines(appt) : wait?.service_id
        ? [{ item_id: wait.service_id, name: wait.service_name || 'Servicio', price: money(wait.service_price), professional_id: wait.professional_id || null }]
        : [];
    const charged = appt ? !!(await one(db,
        `SELECT 1 AS x FROM sales sa WHERE sa.appointment_id = ? AND sa.status = 'completed'
         UNION SELECT 1 FROM sale_items si JOIN sales sa ON sa.id = si.sale_id WHERE si.appointment_id = ? AND sa.status = 'completed'
         LIMIT 1`,
        [appt.id, appt.id])) : false;
    const serviceChargeable = !!appt && salonCollects && !charged && OPEN_APPT.includes(appt.status);
    // Servicios extra: los cobra el local si cobra a ese barbero y ya se
    // hicieron (en atención o terminado); en espera, al terminar. En una
    // cuenta suelta (sin cita) los cobra el local.
    const extrasChargeable = extraServices.length > 0 && (appt
        ? salonCollects && (OPEN_APPT.includes(appt.status) || appt.status === 'terminado')
        : state === 'account');
    const sum = (list) => list.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

    return {
        // Mismo cliente = misma clave, venga de su estación, su cuenta o su reserva.
        key: appt ? `appt:${appt.id}` : tab ? `tab:${tab.id}` : `wait:${waitlistId}`,
        tabId: tab?.id || null,
        clientName: appt?.client_name || wait?.client_name || tab?.client_name || 'Cliente',
        state,
        appointmentId: appt?.id || null,
        waitlistId: appt?.waitlist_id || wait?.id || waitlistId || null,
        professional: appt?.professional_id
            ? { id: appt.professional_id, name: appt.professional_name, salonCollects }
            : wait?.professional_id ? { id: wait.professional_id, name: wait.professional_name, salonCollects: true } : null,
        services,
        serviceChargeable,
        serviceCharged: charged,
        servicesTotal: services.reduce((s, l) => s + l.price, 0),
        extraServices,
        extrasChargeable,
        extrasTotal: sum(extraServices),
        products,
        productsTotal: sum(products),
    };
}

async function findTab(ex, tenantId, { appointment, waitlistId }) {
    if (appointment) {
        const t = await one(ex,
            `SELECT * FROM client_tabs WHERE tenant_id = ? AND (appointment_id = ? OR (waitlist_id IS NOT NULL AND waitlist_id = ?))
             ORDER BY created_at LIMIT 1`,
            [tenantId, appointment.id, appointment.waitlist_id || '']);
        if (t) return t;
    }
    if (waitlistId) {
        return one(ex, `SELECT * FROM client_tabs WHERE tenant_id = ? AND waitlist_id = ? ORDER BY created_at LIMIT 1`, [tenantId, waitlistId]);
    }
    return null;
}

// Anota productos o servicios en la cuenta de un cliente (la crea si no
// tiene). target: { tabId } | { waitlistId } | { appointmentId } | { newClientName }.
export async function addToAccount({ db = getDb(), tenantId, user, target, items }) {
    await ensureTabTables(db);
    const clean = (Array.isArray(items) ? items : [])
        .map((i) => ({
            type: i.type === 'service' ? 'service' : 'product',
            item_id: i.item_id || null,
            name: String(i.name || '').trim(),
            quantity: Math.max(1, Math.round(Number(i.quantity) || 1)),
            unit_price: Math.max(0, money(i.unit_price)),
        }))
        .filter((i) => i.name);
    if (!clean.length) throw new TabError('No hay nada que anotar');

    return withWriteTx(db, async (tx) => {
        let tab = null;
        if (target?.tabId) {
            tab = await one(tx, `SELECT * FROM client_tabs WHERE id = ? AND tenant_id = ?`, [target.tabId, tenantId]);
            if (!tab) throw new TabError('La cuenta no existe', 404, 'not_found');
        } else if (target?.appointmentId) {
            const appt = await one(tx, `SELECT id, client_name, waitlist_id FROM appointments WHERE id = ? AND tenant_id = ?`, [target.appointmentId, tenantId]);
            if (!appt) throw new TabError('La cita no existe', 404, 'not_found');
            tab = await findTab(tx, tenantId, { appointment: appt });
            if (!tab) tab = await createTab(tx, tenantId, user, { clientName: appt.client_name, appointmentId: appt.id, waitlistId: appt.waitlist_id });
        } else if (target?.waitlistId) {
            const w = await one(tx, `SELECT id, client_name FROM waitlist WHERE id = ? AND tenant_id = ?`, [target.waitlistId, tenantId]);
            if (!w) throw new TabError('El cliente ya no está en la sala de espera', 404, 'not_found');
            tab = await findTab(tx, tenantId, { waitlistId: w.id });
            if (!tab) tab = await createTab(tx, tenantId, user, { clientName: w.client_name, waitlistId: w.id });
        } else if (String(target?.newClientName || '').trim()) {
            tab = await createTab(tx, tenantId, user, { clientName: String(target.newClientName).trim() });
        } else {
            throw new TabError('Elige a quién anotarle la cuenta');
        }

        for (const i of clean) {
            await tx.execute({
                sql: `INSERT INTO client_tab_items (id, tab_id, tenant_id, type, item_id, name, quantity, unit_price, created_by, created_by_name)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [generateId(), tab.id, tenantId, i.type, i.item_id, i.name, i.quantity, i.unit_price, user?.id || null, user?.name || null],
            });
        }
        return { tabId: tab.id, clientName: tab.client_name, added: clean.length };
    });
}

async function createTab(tx, tenantId, user, { clientName, waitlistId = null, appointmentId = null }) {
    const tab = { id: generateId(), client_name: clientName || 'Cliente', waitlist_id: waitlistId, appointment_id: appointmentId };
    await tx.execute({
        sql: `INSERT INTO client_tabs (id, tenant_id, date, client_name, waitlist_id, appointment_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [tab.id, tenantId, tzToday(), tab.client_name, waitlistId, appointmentId, user?.id || null],
    });
    return tab;
}

// Quita una anotación hecha por error (no se borra: queda como removed).
export async function removeAccountItem({ db = getDb(), tenantId, itemId }) {
    await ensureTabTables(db);
    const r = await db.execute({
        sql: `UPDATE client_tab_items SET status = 'removed' WHERE id = ? AND tenant_id = ? AND status = 'open'`,
        args: [itemId, tenantId],
    });
    if (!r.rowsAffected) throw new TabError('Esa anotación ya se cobró o se quitó', 409, 'not_open');
    return { removed: true };
}

// Antes de cobrar: las anotaciones deben seguir abiertas (evita cobrar dos
// veces la misma si dos cajas cargan la misma cuenta).
export async function assertTabItemsOpen({ db = getDb(), tenantId, ids }) {
    if (!ids.length) return;
    await ensureTabTables(db);
    const ph = ids.map(() => '?').join(',');
    const open = await rows(db,
        `SELECT id FROM client_tab_items WHERE tenant_id = ? AND status = 'open' AND id IN (${ph})`,
        [tenantId, ...ids]);
    if (open.length !== new Set(ids).size) {
        throw new TabError('Parte de esa cuenta ya se cobró o se quitó. Vuelve a cargarla.', 409, 'TAB_CHANGED');
    }
}

export async function markTabItemsPaid({ db = getDb(), tenantId, ids, saleId }) {
    if (!ids.length) return;
    const ph = ids.map(() => '?').join(',');
    await db.execute({
        sql: `UPDATE client_tab_items SET status = 'paid', sale_id = ? WHERE tenant_id = ? AND status = 'open' AND id IN (${ph})`,
        args: [saleId, tenantId, ...ids],
    });
}
