import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, execute } from '@/lib/db';
import { generateId } from '@/lib/utils';

export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const services = await query(
            `SELECT s.*, sc.name as category_name 
       FROM services s 
       LEFT JOIN service_categories sc ON s.category_id = sc.id 
       WHERE s.tenant_id = ? AND s.active = 1 
       ORDER BY s.sort_order, s.name`,
            [user.tenantId]
        );

        const categories = await query(
            `SELECT * FROM service_categories WHERE tenant_id = ? ORDER BY name`,
            [user.tenantId]
        );

        return NextResponse.json({ services, categories });
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
            `INSERT INTO services (id, tenant_id, name, duration_min, price, category_id, description, color, buffer_min, is_combo, combo_items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, user.tenantId, body.name, body.duration_min, body.price, body.category_id || null, body.description || '', body.color || '#6C5CE7', body.buffer_min || 0, body.is_combo ? 1 : 0, JSON.stringify(body.combo_items || [])]
        );

        return NextResponse.json({ id, message: 'Servicio creado' }, { status: 201 });
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
            `UPDATE services SET name = ?, duration_min = ?, price = ?, category_id = ?, description = ?, color = ?, buffer_min = ?, is_combo = ?, combo_items = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
            [body.name, body.duration_min, body.price, body.category_id || null, body.description || '', body.color || '#6C5CE7', body.buffer_min || 0, body.is_combo ? 1 : 0, JSON.stringify(body.combo_items || []), id, user.tenantId]
        );

        return NextResponse.json({ message: 'Servicio actualizado' });
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

        await execute(
            `UPDATE services SET active = 0 WHERE id = ? AND tenant_id = ?`,
            [id, user.tenantId]
        );

        return NextResponse.json({ message: 'Servicio eliminado' });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
