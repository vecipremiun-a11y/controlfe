import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, execute } from '@/lib/db';
import { generateId } from '@/lib/utils';

export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

        const appointments = await query(
            `SELECT a.*, s.name as service_name, s.color as service_color, s.duration_min,
              p.name as professional_name, p.color as professional_color,
              c.name as client_full_name, c.phone as client_phone_db
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.id
       LEFT JOIN professionals p ON a.professional_id = p.id
       LEFT JOIN clients c ON a.client_id = c.id
       WHERE a.tenant_id = ? AND a.date = ? AND COALESCE(a.source, 'manual') != 'walk_in'
       ORDER BY a.start_time ASC`,
            [user.tenantId, date]
        );

        return NextResponse.json({ appointments });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const body = await request.json();
        const id = generateId();

        // Try to find or create client
        let clientId = null;
        if (body.client_name) {
            const existing = await query(
                `SELECT id FROM clients WHERE tenant_id = ? AND (name = ? OR phone = ?) LIMIT 1`,
                [user.tenantId, body.client_name, body.client_phone || '']
            );
            if (existing.length > 0) {
                clientId = existing[0].id;
            } else {
                clientId = generateId();
                await execute(
                    `INSERT INTO clients (id, tenant_id, name, phone, source) VALUES (?, ?, ?, ?, 'manual')`,
                    [clientId, user.tenantId, body.client_name, body.client_phone || null]
                );
            }
        }

        // Calculate end_time if not provided
        let endTime = body.end_time;
        if (!endTime && body.start_time) {
            // Get duration from service if available
            let durationMin = 30; // default
            if (body.service_id) {
                const svc = await query(`SELECT duration_min FROM services WHERE id = ?`, [body.service_id]);
                if (svc.length > 0 && svc[0].duration_min) {
                    durationMin = svc[0].duration_min;
                }
            }
            const [h, m] = body.start_time.split(':').map(Number);
            const endMinutes = h * 60 + m + durationMin;
            const endH = Math.floor(endMinutes / 60) % 24;
            const endM = endMinutes % 60;
            endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
        }

        const status = body.status || 'reservado';

        await execute(
            `INSERT INTO appointments (id, tenant_id, branch_id, client_id, professional_id, service_id, date, start_time, end_time, status, client_name, client_phone, notes, source) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, user.tenantId, user.branchId || null, clientId, body.professional_id, body.service_id,
                body.date, body.start_time, endTime, status, body.client_name, body.client_phone || null,
                body.notes || null, body.source || 'manual']
        );

        return NextResponse.json({ id }, { status: 201 });
    } catch (error) {
        console.error('Appointment creation error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const body = await request.json();

        if (body.status) {
            await execute(
                `UPDATE appointments SET status = ?, cancel_reason = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
                [body.status, body.cancel_reason || null, id, user.tenantId]
            );

            // Update client no-show count
            if (body.status === 'no_show') {
                const apt = await query(`SELECT client_id FROM appointments WHERE id = ?`, [id]);
                if (apt[0]?.client_id) {
                    await execute(
                        `UPDATE clients SET no_show_count = no_show_count + 1 WHERE id = ?`,
                        [apt[0].client_id]
                    );
                }
            }

            // Update client visit stats on completion
            if (body.status === 'terminado') {
                const apt = await query(`SELECT client_id FROM appointments WHERE id = ?`, [id]);
                if (apt[0]?.client_id) {
                    await execute(
                        `UPDATE clients SET total_visits = total_visits + 1, last_visit = datetime('now') WHERE id = ?`,
                        [apt[0].client_id]
                    );
                }
            }
        }

        return NextResponse.json({ message: 'Cita actualizada' });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
