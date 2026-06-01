import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, execute } from '@/lib/db';
import { generateId } from '@/lib/utils';

export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search');
        let clients;
        if (search && search.trim().length >= 2) {
            const term = `%${search.trim()}%`;
            clients = await query(
                `SELECT * FROM clients WHERE tenant_id = ? AND active = 1 AND (name LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 10`,
                [user.tenantId, term, term]
            );
        } else {
            clients = await query(
                `SELECT * FROM clients WHERE tenant_id = ? AND active = 1 ORDER BY name`,
                [user.tenantId]
            );
        }
        return NextResponse.json({ clients });
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
        await execute(
            `INSERT INTO clients (id, tenant_id, name, phone, email, gender, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, user.tenantId, body.name, body.phone || null, body.email || null, body.gender || null, body.notes || null]
        );
        return NextResponse.json({ id }, { status: 201 });
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
            `UPDATE clients SET name = ?, phone = ?, email = ?, gender = ?, notes = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
            [body.name, body.phone || null, body.email || null, body.gender || null, body.notes || null, id, user.tenantId]
        );
        return NextResponse.json({ message: 'Cliente actualizado' });
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
        await execute(`UPDATE clients SET active = 0 WHERE id = ? AND tenant_id = ?`, [id, user.tenantId]);
        return NextResponse.json({ message: 'Cliente eliminado' });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
