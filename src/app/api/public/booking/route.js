import { NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { generateId } from '@/lib/utils';

// GET - Public: fetch salon info, services, professionals and available slots
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const slug = searchParams.get('slug');
        const date = searchParams.get('date');
        const serviceId = searchParams.get('service_id');
        const professionalId = searchParams.get('professional_id');

        if (!slug) return NextResponse.json({ error: 'Slug requerido' }, { status: 400 });

        // Get tenant by slug
        const tenant = await query(`SELECT id, name, slug, phone, address, city, logo_url, config FROM tenants WHERE slug = ? AND status = 'activo'`, [slug]);
        if (tenant.length === 0) return NextResponse.json({ error: 'Salón no encontrado' }, { status: 404 });
        const tenantData = tenant[0];
        const tenantId = tenantData.id;

        // Parse booking config from tenant
        let bookingConfig = {};
        try { bookingConfig = JSON.parse(tenantData.config || '{}'); } catch {}
        const config = {
            min_advance_hours: bookingConfig.min_advance_hours || 1,
            max_advance_days: bookingConfig.max_advance_days || 30,
            buffer_minutes: bookingConfig.buffer_minutes || 0,
            booking_fields: bookingConfig.booking_fields || null,
        };

        // Get active services with their assigned professionals
        const services = await query(
            `SELECT s.id, s.name, s.description, s.duration_min, s.price, s.color, s.category_id, sc.name as category_name
             FROM services s 
             LEFT JOIN service_categories sc ON sc.id = s.category_id
             WHERE s.tenant_id = ? AND s.active = 1 
             ORDER BY s.sort_order, s.name`,
            [tenantId]
        );

        // Get active professionals
        const professionals = await query(
            `SELECT p.id, p.name, p.avatar_url, p.color 
             FROM professionals p 
             WHERE p.tenant_id = ? AND p.active = 1 
             ORDER BY p.sort_order, p.name`,
            [tenantId]
        );

        // Get professional-service assignments
        const profServices = await query(
            `SELECT ps.professional_id, ps.service_id 
             FROM professional_services ps
             JOIN professionals p ON p.id = ps.professional_id
             WHERE p.tenant_id = ? AND p.active = 1`,
            [tenantId]
        );

        // Build professional list with their service IDs
        const profsWithServices = professionals.map(p => ({
            ...p,
            service_ids: profServices.filter(ps => ps.professional_id === p.id).map(ps => ps.service_id),
        }));

        // If date and service are provided, calculate available slots
        let slots = [];
        if (date && serviceId) {
            slots = await getAvailableSlots(tenantId, date, serviceId, professionalId, config);
        }

        return NextResponse.json({
            salon: {
                name: tenantData.name,
                slug: tenantData.slug,
                phone: tenantData.phone,
                address: tenantData.address,
                city: tenantData.city,
                logo_url: tenantData.logo_url,
            },
            services,
            professionals: profsWithServices,
            slots,
            config,
        });
    } catch (error) {
        console.error('Public booking GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST - Public: create a booking
export async function POST(request) {
    try {
        const body = await request.json();
        const { slug, service_id, professional_id, date, start_time, client_name, client_phone, client_email, notes, custom_fields } = body;

        if (!slug || !service_id || !professional_id || !date || !start_time || !client_name || !client_phone) {
            return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
        }

        // Validate tenant
        const tenant = await query(`SELECT id, config FROM tenants WHERE slug = ? AND status = 'activo'`, [slug]);
        if (tenant.length === 0) return NextResponse.json({ error: 'Salón no encontrado' }, { status: 404 });
        const tenantId = tenant[0].id;

        let bookingConfig = {};
        try { bookingConfig = JSON.parse(tenant[0].config || '{}'); } catch {}
        const config = {
            min_advance_hours: bookingConfig.min_advance_hours || 1,
            max_advance_days: bookingConfig.max_advance_days || 30,
            buffer_minutes: bookingConfig.buffer_minutes || 0,
        };

        // Validate service exists
        const svc = await query(`SELECT id, duration_min, price FROM services WHERE id = ? AND tenant_id = ? AND active = 1`, [service_id, tenantId]);
        if (svc.length === 0) return NextResponse.json({ error: 'Servicio no disponible' }, { status: 400 });
        const durationMin = svc[0].duration_min;

        // Validate professional exists
        const prof = await query(`SELECT id FROM professionals WHERE id = ? AND tenant_id = ? AND active = 1`, [professional_id, tenantId]);
        if (prof.length === 0) return NextResponse.json({ error: 'Profesional no disponible' }, { status: 400 });

        // Validate date is not in the past and within allowed range
        const now = new Date();
        const bookingDate = new Date(date + 'T' + start_time);
        const minAdvance = new Date(now.getTime() + config.min_advance_hours * 60 * 60 * 1000);
        if (bookingDate < minAdvance) {
            return NextResponse.json({ error: 'La hora seleccionada ya no está disponible' }, { status: 400 });
        }
        const maxDate = new Date(now.getTime() + config.max_advance_days * 24 * 60 * 60 * 1000);
        if (bookingDate > maxDate) {
            return NextResponse.json({ error: 'La fecha está fuera del rango permitido' }, { status: 400 });
        }

        // Check slot is still available (no conflicts)
        const [h, m] = start_time.split(':').map(Number);
        const endMinutes = h * 60 + m + durationMin;
        const endH = Math.floor(endMinutes / 60) % 24;
        const endM = endMinutes % 60;
        const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

        const conflicts = await query(
            `SELECT id FROM appointments 
             WHERE professional_id = ? AND date = ? AND status NOT IN ('cancelado', 'no_show')
             AND start_time < ? AND end_time > ?`,
            [professional_id, date, endTime, start_time]
        );
        if (conflicts.length > 0) {
            return NextResponse.json({ error: 'Este horario ya no está disponible' }, { status: 409 });
        }

        // Find or create client
        let clientId = null;
        const existing = await query(
            `SELECT id FROM clients WHERE tenant_id = ? AND phone = ? LIMIT 1`,
            [tenantId, client_phone]
        );
        if (existing.length > 0) {
            clientId = existing[0].id;
        } else {
            clientId = generateId();
            await execute(
                `INSERT INTO clients (id, tenant_id, name, phone, email, source) VALUES (?, ?, ?, ?, ?, 'online')`,
                [clientId, tenantId, client_name, client_phone, client_email || null]
            );
        }

        // Build notes with custom fields if any
        let finalNotes = notes || '';
        if (custom_fields && typeof custom_fields === 'object') {
            const customLines = Object.entries(custom_fields)
                .filter(([, v]) => v)
                .map(([k, v]) => `${k}: ${v}`);
            if (customLines.length > 0) {
                finalNotes = (finalNotes ? finalNotes + '\n' : '') + customLines.join('\n');
            }
        }

        // Create appointment
        const id = generateId();
        await execute(
            `INSERT INTO appointments (id, tenant_id, client_id, professional_id, service_id, date, start_time, end_time, status, client_name, client_phone, client_email, notes, source) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reservado', ?, ?, ?, ?, 'online')`,
            [id, tenantId, clientId, professional_id, service_id, date, start_time, endTime, client_name, client_phone, client_email || null, finalNotes || null]
        );

        return NextResponse.json({
            id,
            message: 'Reserva confirmada',
            appointment: { date, start_time, end_time: endTime },
        }, { status: 201 });
    } catch (error) {
        console.error('Public booking POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Calculate available time slots for a date/service/professional
async function getAvailableSlots(tenantId, date, serviceId, professionalId, config) {
    const svc = await query(`SELECT duration_min, buffer_min FROM services WHERE id = ? AND tenant_id = ?`, [serviceId, tenantId]);
    if (svc.length === 0) return [];
    const durationMin = svc[0].duration_min;
    const bufferMin = Math.max(svc[0].buffer_min || 0, config.buffer_minutes || 0);

    const dayOfWeek = new Date(date + 'T12:00:00').getDay();

    // Determine which professionals can do this service
    let profIds = [];
    if (professionalId) {
        profIds = [professionalId];
    } else {
        // Find professionals assigned to this service
        const assigned = await query(
            `SELECT ps.professional_id FROM professional_services ps
             JOIN professionals p ON p.id = ps.professional_id
             WHERE ps.service_id = ? AND p.tenant_id = ? AND p.active = 1`,
            [serviceId, tenantId]
        );
        if (assigned.length > 0) {
            profIds = assigned.map(a => a.professional_id);
        } else {
            // If no assignments, all active professionals can do it
            const allProfs = await query(`SELECT id FROM professionals WHERE tenant_id = ? AND active = 1`, [tenantId]);
            profIds = allProfs.map(p => p.id);
        }
    }

    if (profIds.length === 0) return [];

    // Check for schedule exceptions (days off)
    const exceptions = await query(
        `SELECT professional_id FROM schedule_exceptions 
         WHERE professional_id IN (${profIds.map(() => '?').join(',')}) AND date = ? AND type = 'blocked'`,
        [...profIds, date]
    );
    const blockedProfIds = new Set(exceptions.map(e => e.professional_id));
    profIds = profIds.filter(id => !blockedProfIds.has(id));

    if (profIds.length === 0) return [];

    // Get schedules for this day
    const schedules = await query(
        `SELECT * FROM schedules 
         WHERE professional_id IN (${profIds.map(() => '?').join(',')}) AND day_of_week = ? AND active = 1`,
        [...profIds, dayOfWeek]
    );

    if (schedules.length === 0) return [];

    // Get existing appointments for these professionals on this date
    const appointments = await query(
        `SELECT professional_id, start_time, end_time FROM appointments 
         WHERE professional_id IN (${profIds.map(() => '?').join(',')}) AND date = ? AND status NOT IN ('cancelado', 'no_show')`,
        [...profIds, date]
    );

    const now = new Date();
    const minAdvanceTime = new Date(now.getTime() + (config.min_advance_hours || 1) * 60 * 60 * 1000);
    const isToday = date === now.toISOString().split('T')[0];

    const allSlots = [];
    const slotInterval = 15; // generate slots every 15 minutes

    for (const sched of schedules) {
        const profId = sched.professional_id;
        const profAppts = appointments.filter(a => a.professional_id === profId);

        // Parse schedule times
        const [startH, startM] = sched.start_time.split(':').map(Number);
        const [endH, endM] = sched.end_time.split(':').map(Number);
        const schedStart = startH * 60 + startM;
        const schedEnd = endH * 60 + endM;

        // Parse break times
        let breakStart = null, breakEnd = null;
        if (sched.break_start && sched.break_end) {
            const [bsH, bsM] = sched.break_start.split(':').map(Number);
            const [beH, beM] = sched.break_end.split(':').map(Number);
            breakStart = bsH * 60 + bsM;
            breakEnd = beH * 60 + beM;
        }

        // Generate slots
        for (let slotStart = schedStart; slotStart + durationMin <= schedEnd; slotStart += slotInterval) {
            const slotEnd = slotStart + durationMin;

            // Skip slots during break
            if (breakStart !== null && breakEnd !== null) {
                if (slotStart < breakEnd && slotEnd > breakStart) continue;
            }

            // Skip past times for today
            if (isToday) {
                const slotDate = new Date(date + 'T' + formatTime(slotStart));
                if (slotDate < minAdvanceTime) continue;
            }

            // Check conflicts with existing appointments (including buffer)
            const hasConflict = profAppts.some(appt => {
                const [aStartH, aStartM] = appt.start_time.split(':').map(Number);
                const [aEndH, aEndM] = appt.end_time.split(':').map(Number);
                const apptStart = aStartH * 60 + aStartM;
                const apptEnd = aEndH * 60 + aEndM + bufferMin;
                return slotStart < apptEnd && slotEnd > apptStart;
            });

            if (!hasConflict) {
                const timeStr = formatTime(slotStart);
                // Avoid duplicates if multiple professionals have same slot
                const existing = allSlots.find(s => s.time === timeStr && s.professional_id === profId);
                if (!existing) {
                    allSlots.push({
                        time: timeStr,
                        professional_id: profId,
                    });
                }
            }
        }
    }

    // Sort by time, then group
    allSlots.sort((a, b) => a.time.localeCompare(b.time));
    return allSlots;
}

function formatTime(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
