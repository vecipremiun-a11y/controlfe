import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canAccess } from '@/lib/permissions';
import { getAccountsOverview, getAccountDetail, addToAccount, removeAccountItem, TabError } from '@/lib/tabs';

export const dynamic = 'force-dynamic';

// Cuentas de clientes en Barbershop (ver src/lib/tabs.js).
//   GET                         clientes a los que se puede anotar consumo
//   GET ?tab= | ?waitlist= | ?appointment=   detalle de una cuenta
//   POST { action: 'add', target, items }   anotar en una cuenta
//   POST { action: 'remove', item_id }      quitar una anotación
async function authorize(request) {
    const user = await getCurrentUser(request);
    if (!user?.tenantId) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    if (!canAccess(user.role, '/salon/pos')) return { error: NextResponse.json({ error: 'Sin permiso' }, { status: 403 }) };
    return { user };
}

function fail(e, label) {
    if (e instanceof TabError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    console.error(`Tabs ${label} error:`, e?.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
}

export async function GET(request) {
    const { user, error } = await authorize(request);
    if (error) return error;
    try {
        const { searchParams } = new URL(request.url);
        const target = {
            tabId: searchParams.get('tab') || null,
            waitlistId: searchParams.get('waitlist') || null,
            appointmentId: searchParams.get('appointment') || null,
        };
        if (target.tabId || target.waitlistId || target.appointmentId) {
            return NextResponse.json(await getAccountDetail({ tenantId: user.tenantId, target }));
        }
        return NextResponse.json(await getAccountsOverview({ tenantId: user.tenantId }));
    } catch (e) {
        return fail(e, 'GET');
    }
}

export async function POST(request) {
    const { user, error } = await authorize(request);
    if (error) return error;
    try {
        const body = await request.json();
        if (body.action === 'add') {
            const target = {
                tabId: body.target?.tab_id || null,
                waitlistId: body.target?.waitlist_id || null,
                appointmentId: body.target?.appointment_id || null,
                newClientName: body.target?.new_client_name || null,
            };
            return NextResponse.json(await addToAccount({ tenantId: user.tenantId, user, target, items: body.items }));
        }
        if (body.action === 'remove') {
            return NextResponse.json(await removeAccountItem({ tenantId: user.tenantId, itemId: body.item_id }));
        }
        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    } catch (e) {
        return fail(e, 'POST');
    }
}
