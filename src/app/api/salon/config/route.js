import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, execute } from '@/lib/db';
import { uploadImage } from '@/lib/upload';

export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const tenant = await query(
            `SELECT * FROM tenants WHERE id = ?`,
            [user.tenantId]
        );

        if (tenant.length === 0) {
            return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
        }

        return NextResponse.json({ config: tenant[0] });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const body = await request.json();

        // If updating booking config only
        if (body.booking_config) {
            // Merge with existing config
            const tenant = await query(`SELECT config FROM tenants WHERE id = ?`, [user.tenantId]);
            let existingConfig = {};
            try { existingConfig = JSON.parse(tenant[0]?.config || '{}'); } catch {}
            const mergedConfig = { ...existingConfig, ...body.booking_config };
            await execute(
                `UPDATE tenants SET config = ?, updated_at = datetime('now') WHERE id = ?`,
                [JSON.stringify(mergedConfig), user.tenantId]
            );
            return NextResponse.json({ message: 'Configuración de reservas actualizada' });
        }

        await execute(
            `UPDATE tenants SET 
        name = ?, 
        phone = ?, 
        address = ?, 
        email = ?, 
        timezone = ?, 
        currency = ?,
        updated_at = datetime('now')
      WHERE id = ?`,
            [
                body.name,
                body.phone || null,
                body.address || null,
                body.email || null,
                body.timezone || 'America/Santo_Domingo',
                body.currency || 'DOP',
                user.tenantId,
            ]
        );

        return NextResponse.json({ message: 'Configuración actualizada' });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const formData = await request.formData();
        const file = formData.get('logo');

        if (!file || typeof file === 'string') {
            return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 });
        }

        const logoUrl = await uploadImage(file, 'logos', `logo-${user.tenantId}`);
        await execute(
            `UPDATE tenants SET logo_url = ?, updated_at = datetime('now') WHERE id = ?`,
            [logoUrl, user.tenantId]
        );

        return NextResponse.json({ logo_url: logoUrl });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
