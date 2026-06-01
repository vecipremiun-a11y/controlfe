import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, execute } from '@/lib/db';
import { generateId } from '@/lib/utils';

export async function POST(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const body = await request.json();
        const id = generateId();

        await execute(
            `INSERT INTO waitlist (id, tenant_id, client_id, client_name, client_phone, service_id, professional_id, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'waiting')`,
            [id, user.tenantId, body.client_id || null, body.client_name, body.client_phone || null, body.service_id || null, body.professional_id || null, body.notes || null]
        );

        return NextResponse.json({ id }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const waitlist = await query(
            `SELECT w.*, s.name as service_name FROM waitlist w LEFT JOIN services s ON w.service_id = s.id WHERE w.tenant_id = ? AND w.status = 'waiting' ORDER BY w.created_at ASC`,
            [user.tenantId]
        );

        return NextResponse.json({ waitlist });
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
        const body = await request.json();

        await execute(
            `UPDATE waitlist SET service_id = ?, professional_id = ?, notes = ? WHERE id = ? AND tenant_id = ? AND status = 'waiting'`,
            [body.service_id || null, body.professional_id || null, body.notes || null, id, user.tenantId]
        );

        return NextResponse.json({ message: 'Actualizado' });
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
        const reason = searchParams.get('reason');
        const validStatuses = ['waiting', 'notified', 'booked', 'expired'];
        const finalStatus = validStatuses.includes(reason) ? reason : 'expired';

        console.log('--- ATTEMPTING DELETE WAITLIST ---');
        console.log({ reason: finalStatus, id, tenantId: user.tenantId });

        await execute(
            `UPDATE waitlist SET status = ? WHERE id = ? AND tenant_id = ?`,
            [finalStatus, id, user.tenantId]
        );

        return NextResponse.json({ message: 'Removido de lista de espera' });
    } catch (error) {
        console.error('Waitlist DELETE Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
