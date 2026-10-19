import { NextResponse, after } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, queryOne, execute } from '@/lib/db';
import { generateId } from '@/lib/utils';
import { uploadImage } from '@/lib/upload';
import { ensureProfessionalColumns, parseSalonCollects } from '@/lib/professionals';
import {
    isEnabledFor, ensureIntegrationTables, syncProfessionalToApp, pushScheduleToApp, onProfessionalDeleted,
    pushOccupancyForExceptions, importBookingsForLinkedBarber, syncBusy,
} from '@/lib/barberkeylut';

// Casilla "Usa la app Barber Keylut" (FormData la manda como texto). Si no
// viene, se conserva lo que había.
function parseAppUses(value, previous) {
    if (value === undefined || value === null) return Number(previous?.app_uses) === 1;
    return value === true || value === 'true' || value === '1';
}

// Después de vincular un barbero: sus reservas pendientes en la app y la
// ocupación (colaciones, citas, días libres).
function afterLinked(tenantId) {
    after(async () => {
        await importBookingsForLinkedBarber({ tenantId });
        await syncBusy({ tenantId, force: true });
    });
}

export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        await ensureProfessionalColumns();
        const appEnabled = isEnabledFor(user.tenantId);
        if (appEnabled) await ensureIntegrationTables();

        const monthStart = new Date().toISOString().slice(0, 7) + '-01';
        const professionals = await query(
            `SELECT p.*, 
       (SELECT COUNT(*) FROM appointments a WHERE a.professional_id = p.id AND a.date >= ?) as appointments_count
       FROM professionals p 
       WHERE p.tenant_id = ? AND p.active = 1 
       ORDER BY p.sort_order, p.name`,
            [monthStart, user.tenantId]
        );

        // Also fetch schedules for each professional
        const profIds = professionals.map(p => p.id);
        let schedules = [];
        if (profIds.length > 0) {
            schedules = await query(
                `SELECT * FROM schedules WHERE professional_id IN (${profIds.map(() => '?').join(',')}) AND active = 1 ORDER BY day_of_week, start_time`,
                profIds
            );
        }

        // Fetch schedule exceptions (days off) for next 90 days
        let exceptions = [];
        if (profIds.length > 0) {
            const today = new Date().toISOString().split('T')[0];
            exceptions = await query(
                `SELECT * FROM schedule_exceptions WHERE professional_id IN (${profIds.map(() => '?').join(',')}) AND date >= ? ORDER BY date`,
                [...profIds, today]
            );
        }

        // Fetch assigned services for each professional
        let profServices = [];
        if (profIds.length > 0) {
            profServices = await query(
                `SELECT ps.*, s.name as service_name, s.price as default_price, s.duration_min as default_duration, s.color as service_color, s.category_id
                 FROM professional_services ps
                 JOIN services s ON s.id = ps.service_id
                 WHERE ps.professional_id IN (${profIds.map(() => '?').join(',')})
                 ORDER BY s.name`,
                profIds
            );
        }

        // Attach schedules, exceptions and services to professionals
        const profsWithSchedules = professionals.map(p => ({
            ...p,
            schedules: schedules.filter(s => s.professional_id === p.id),
            exceptions: exceptions.filter(e => e.professional_id === p.id),
            services: profServices.filter(ps => ps.professional_id === p.id),
        }));

        return NextResponse.json({ professionals: profsWithSchedules, barberkeylut: { enabled: appEnabled } });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        
        const contentType = request.headers.get('content-type') || '';
        let body;
        let avatarFile = null;

        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            body = {};
            for (const [key, value] of formData.entries()) {
                if (key === 'avatar') {
                    avatarFile = value;
                } else {
                    body[key] = value;
                }
            }
        } else {
            body = await request.json();
        }

        const id = generateId();
        const commission_percent = body.commission_percent !== undefined ? parseFloat(body.commission_percent) : 50;
        const payment_mode = body.payment_mode || 'commission';
        const base_salary = body.base_salary ? parseFloat(body.base_salary) : 0;
        const per_service_rate = body.per_service_rate ? parseFloat(body.per_service_rate) : 0;
        const rent_amount = body.rent_amount ? parseFloat(body.rent_amount) : 0;
        const rent_frequency = body.rent_frequency || 'monthly';
        const pay_frequency = body.pay_frequency || 'daily';
        const pay_day = body.pay_day || null;
        const access_role = body.access_role || 'own_agenda';
        const country_code = body.country_code || '+56';
        const salon_collects = parseSalonCollects(body.salon_collects);
        const appEnabled = isEnabledFor(user.tenantId);
        const appUses = appEnabled && parseAppUses(body.app_uses, null);
        if (appUses && !String(body.email || '').trim()) {
            return NextResponse.json({ error: 'El email es obligatorio para usar la app Barber Keylut' }, { status: 400 });
        }

        let avatar_url = null;
        if (avatarFile && avatarFile.size > 0) {
            avatar_url = await saveAvatar(avatarFile, id);
        }

        await ensureProfessionalColumns();
        await execute(
            `INSERT INTO professionals (id, tenant_id, branch_id, name, phone, email, color, commission_percent, rut, payment_mode, base_salary, per_service_rate, rent_amount, rent_frequency, pay_frequency, pay_day, access_role, country_code, avatar_url, salon_collects) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, user.tenantId, user.branchId || null, body.name, body.phone || null, body.email || null, body.color || '#6C5CE7', commission_percent, body.rut || null, payment_mode, base_salary, per_service_rate, rent_amount, rent_frequency, pay_frequency, pay_day, access_role, country_code, avatar_url, salon_collects]
        );

        // Create default schedules (Mon-Sat, 9-18)
        for (let day = 1; day <= 6; day++) {
            await execute(
                `INSERT INTO schedules (id, professional_id, day_of_week, start_time, end_time, break_start, break_end) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [generateId(), id, day, '09:00', '18:00', '12:00', '13:00']
            );
        }

        // Assign services if provided
        if (body.service_ids) {
            const serviceIds = typeof body.service_ids === 'string' ? JSON.parse(body.service_ids) : body.service_ids;
            for (const svcId of serviceIds) {
                await execute(
                    `INSERT INTO professional_services (id, professional_id, service_id) VALUES (?, ?, ?)`,
                    [generateId(), id, svcId]
                );
            }
        }

        let app = null;
        if (appEnabled) {
            await ensureIntegrationTables();
            app = await syncProfessionalToApp({ tenantId: user.tenantId, professionalId: id, previous: null, appUses, linkUid: body.app_link_uid || '' });
            if (app?.linkedNow) afterLinked(user.tenantId);
        }

        return NextResponse.json({ id, app }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        const contentType = request.headers.get('content-type') || '';
        let body;
        let avatarFile = null;

        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            body = {};
            for (const [key, value] of formData.entries()) {
                if (key === 'avatar') {
                    avatarFile = value;
                } else {
                    body[key] = value;
                }
            }
        } else {
            body = await request.json();
        }

        // Horario y Libres envían solo name + schedules/exceptions: en ese caso no
        // se toca el perfil (antes se reescribía con valores por defecto y se
        // perdían el modo de pago, el arriendo, el teléfono, etc.).
        const appEnabled = isEnabledFor(user.tenantId);
        if (appEnabled) await ensureIntegrationTables();
        const previous = await queryOne(`SELECT * FROM professionals WHERE id = ? AND tenant_id = ?`, [id, user.tenantId]);
        let app = null;

        if (body.payment_mode !== undefined) {
            const appUses = appEnabled && parseAppUses(body.app_uses, previous);
            if (appUses && !String(body.email || '').trim()) {
                return NextResponse.json({ error: 'El email es obligatorio para usar la app Barber Keylut' }, { status: 400 });
            }
            const commission_percent = body.commission_percent !== undefined ? parseFloat(body.commission_percent) : 50;
            const payment_mode = body.payment_mode || 'commission';
            const base_salary = body.base_salary ? parseFloat(body.base_salary) : 0;
            const per_service_rate = body.per_service_rate ? parseFloat(body.per_service_rate) : 0;
            const rent_amount = body.rent_amount ? parseFloat(body.rent_amount) : 0;
            const rent_frequency = body.rent_frequency || 'monthly';
            const pay_frequency = body.pay_frequency || 'daily';
            const pay_day = body.pay_day || null;
            const access_role = body.access_role || 'own_agenda';
            const country_code = body.country_code || '+56';
            const salon_collects = parseSalonCollects(body.salon_collects);

            let avatarClause = '';
            let params = [body.name, body.phone || null, body.email || null, body.color || '#6C5CE7', commission_percent, body.rut || null, payment_mode, base_salary, per_service_rate, rent_amount, rent_frequency, pay_frequency, pay_day, access_role, country_code, salon_collects];

            if (avatarFile && avatarFile.size > 0) {
                const avatar_url = await saveAvatar(avatarFile, id);
                avatarClause = ', avatar_url = ?';
                params.push(avatar_url);
            }

            params.push(id, user.tenantId);

            await ensureProfessionalColumns();
            await execute(
                `UPDATE professionals SET name = ?, phone = ?, email = ?, color = ?, commission_percent = ?, rut = ?, payment_mode = ?, base_salary = ?, per_service_rate = ?, rent_amount = ?, rent_frequency = ?, pay_frequency = ?, pay_day = ?, access_role = ?, country_code = ?, salon_collects = ?${avatarClause}, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
                params
            );

            if (appEnabled) {
                // Guardar el formulario completo revisa los datos de pago.
                await execute(`UPDATE professionals SET needs_payment_setup = 0 WHERE id = ? AND tenant_id = ?`, [id, user.tenantId]);
                app = await syncProfessionalToApp({ tenantId: user.tenantId, professionalId: id, previous, appUses, linkUid: body.app_link_uid || '' });
                if (app?.linkedNow) afterLinked(user.tenantId);
            }
        }

        // Update schedules if provided
        if (body.schedules) {
            const schedules = typeof body.schedules === 'string' ? JSON.parse(body.schedules) : body.schedules;
            // Deactivate all existing schedules
            await execute(`UPDATE schedules SET active = 0 WHERE professional_id = ?`, [id]);
            // Insert new ones
            for (const sched of schedules) {
                if (sched.enabled) {
                    await execute(
                        `INSERT INTO schedules (id, professional_id, day_of_week, start_time, end_time, break_start, break_end, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                        [generateId(), id, sched.day, sched.start_time, sched.end_time, sched.break_start || null, sched.break_end || null]
                    );
                }
            }
            // La app recibe inicio y fin de cada día; la colación va como ocupación.
            if (appEnabled) {
                after(async () => {
                    await pushScheduleToApp({ tenantId: user.tenantId, professionalId: id });
                    await syncBusy({ tenantId: user.tenantId, force: true });
                });
            }
        }

        // Update exceptions (days off) if provided
        if (body.exceptions) {
            const exceptions = typeof body.exceptions === 'string' ? JSON.parse(body.exceptions) : body.exceptions;
            // Remove future exceptions then re-insert
            const today = new Date().toISOString().split('T')[0];
            // Se borran y recrean con ids nuevos: la app recibe DELETE de los
            // anteriores y PUT de los nuevos.
            const removed = appEnabled
                ? await query(`SELECT id FROM schedule_exceptions WHERE professional_id = ? AND date >= ?`, [id, today])
                : [];
            await execute(`DELETE FROM schedule_exceptions WHERE professional_id = ? AND date >= ?`, [id, today]);
            const added = [];
            for (const exc of exceptions) {
                const excId = generateId();
                await execute(
                    `INSERT INTO schedule_exceptions (id, professional_id, date, type, reason) VALUES (?, ?, ?, ?, ?)`,
                    [excId, id, exc.date, exc.type || 'blocked', exc.reason || null]
                );
                added.push({ id: excId, date: exc.date, type: exc.type || 'blocked' });
            }
            if (appEnabled) {
                after(() => pushOccupancyForExceptions({
                    tenantId: user.tenantId, professionalId: id, removedIds: removed.map((r) => r.id), addedRows: added,
                }));
            }
        }

        // Update assigned services if provided
        if (body.service_ids) {
            const serviceIds = typeof body.service_ids === 'string' ? JSON.parse(body.service_ids) : body.service_ids;
            // Remove all current assignments and re-insert
            await execute(`DELETE FROM professional_services WHERE professional_id = ?`, [id]);
            for (const svcId of serviceIds) {
                await execute(
                    `INSERT INTO professional_services (id, professional_id, service_id) VALUES (?, ?, ?)`,
                    [generateId(), id, svcId]
                );
            }
        }

        return NextResponse.json({ message: 'Profesional actualizado', app });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const appEnabled = isEnabledFor(user.tenantId);
        if (appEnabled) await ensureIntegrationTables();
        const previous = appEnabled ? await queryOne(`SELECT * FROM professionals WHERE id = ? AND tenant_id = ?`, [id, user.tenantId]) : null;
        await execute(`UPDATE professionals SET active = 0 WHERE id = ? AND tenant_id = ?`, [id, user.tenantId]);
        // Vinculado → la app lo desactiva; solo invitado → se borra la invitación.
        if (appEnabled) after(() => onProfessionalDeleted({ previous }));
        return NextResponse.json({ message: 'Profesional eliminado' });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function saveAvatar(file, professionalId) {
    return uploadImage(file, 'avatars', professionalId);
}
