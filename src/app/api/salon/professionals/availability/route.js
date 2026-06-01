import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { execute } from '@/lib/db';

export async function PUT(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user || !user.tenantId) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const body = await request.json();
        const { id, is_available } = body;

        if (!id || typeof is_available === 'undefined') {
            return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
        }

        const isAvailableInt = is_available ? 1 : 0;

        await execute(
            `UPDATE professionals SET is_available = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
            [isAvailableInt, id, user.tenantId]
        );

        return NextResponse.json({ message: 'Disponibilidad actualizada', is_available: isAvailableInt });
    } catch (error) {
        console.error('API Error toggling availability:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
