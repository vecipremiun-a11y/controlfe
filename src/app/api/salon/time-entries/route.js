import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, execute, queryOne } from '@/lib/db';
import { generateId } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// GET: Get time entries for a professional on a date
export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const professionalId = searchParams.get('professional_id');
        const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

        if (!professionalId) {
            return NextResponse.json({ error: 'Falta professional_id' }, { status: 400 });
        }

        const entries = await query(
            `SELECT * FROM time_entries WHERE tenant_id = ? AND professional_id = ? AND date = ? ORDER BY clock_in`,
            [user.tenantId, professionalId, date]
        );

        const totalHours = entries.reduce((sum, e) => sum + (e.total_hours || 0), 0);

        // Check if there's an open entry (no clock_out)
        const openEntry = entries.find(e => !e.clock_out);

        return NextResponse.json({ entries, totalHours, openEntry });
    } catch (error) {
        console.error('Time entries GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Clock in or clock out
export async function POST(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const body = await request.json();
        const { professional_id, action } = body; // action: 'clock_in' or 'clock_out'
        const date = new Date().toISOString().split('T')[0];
        const now = new Date().toISOString();

        if (!professional_id || !action) {
            return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
        }

        if (action === 'clock_in') {
            // Check for open entry
            const openEntry = await queryOne(
                `SELECT id FROM time_entries WHERE tenant_id = ? AND professional_id = ? AND date = ? AND clock_out IS NULL`,
                [user.tenantId, professional_id, date]
            );

            if (openEntry) {
                return NextResponse.json({ error: 'Ya tiene una entrada abierta. Debe marcar salida primero.' }, { status: 400 });
            }

            const id = generateId();
            await execute(
                `INSERT INTO time_entries (id, tenant_id, professional_id, date, clock_in) VALUES (?, ?, ?, ?, ?)`,
                [id, user.tenantId, professional_id, date, now]
            );

            return NextResponse.json({ id, message: 'Entrada registrada', clock_in: now });
        }

        if (action === 'clock_out') {
            const openEntry = await queryOne(
                `SELECT id, clock_in FROM time_entries WHERE tenant_id = ? AND professional_id = ? AND date = ? AND clock_out IS NULL`,
                [user.tenantId, professional_id, date]
            );

            if (!openEntry) {
                return NextResponse.json({ error: 'No hay entrada abierta para marcar salida.' }, { status: 400 });
            }

            // Calculate hours
            const clockIn = new Date(openEntry.clock_in);
            const clockOut = new Date(now);
            const totalHours = Math.round(((clockOut - clockIn) / (1000 * 60 * 60)) * 100) / 100;

            await execute(
                `UPDATE time_entries SET clock_out = ?, total_hours = ? WHERE id = ?`,
                [now, totalHours, openEntry.id]
            );

            return NextResponse.json({ id: openEntry.id, message: 'Salida registrada', clock_out: now, total_hours: totalHours });
        }

        return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
    } catch (error) {
        console.error('Time entries POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
