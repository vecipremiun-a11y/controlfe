import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { queryOne } from '@/lib/db';

export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user) {
            return NextResponse.json({ user: null }, { status: 401 });
        }

        // Refresh tenant currency/timezone from DB (in case config changed)
        if (user.tenantId) {
            const tenant = await queryOne(
                'SELECT name, currency, timezone, logo_url FROM tenants WHERE id = ?',
                [user.tenantId]
            );
            if (tenant) {
                user.tenantName = tenant.name || user.tenantName;
                user.currency = tenant.currency || 'DOP';
                user.timezone = tenant.timezone || 'America/Santo_Domingo';
                user.tenantLogoUrl = tenant.logo_url || null;
            }
        }

        return NextResponse.json({ user });
    } catch {
        return NextResponse.json({ user: null }, { status: 401 });
    }
}
