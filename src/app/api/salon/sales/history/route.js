import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { tzOffset, tzToday } from '@/lib/utils';

// Listado de ventas para el Historial, con filtros por rango de fecha
// (en hora de Chile), vendedor, estado y N° de boleta (folio).
export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const today = tzToday();
        const from = searchParams.get('from') || today;
        const to = searchParams.get('to') || today;
        const seller = searchParams.get('seller') || '';
        const status = searchParams.get('status') || 'all';
        const q = (searchParams.get('q') || '').trim();
        const offset = tzOffset();

        const where = [`s.tenant_id = ?`];
        const params = [user.tenantId];

        if (q) {
            // Búsqueda por N° de boleta (folio = rowid)
            where.push(`s.rowid = ?`);
            params.push(Number(q.replace(/\D/g, '')) || -1);
        } else {
            // Rango de fechas en hora local (created_at se guarda en UTC)
            where.push(`DATE(s.created_at, ?) BETWEEN ? AND ?`);
            params.push(offset, from <= to ? from : to, from <= to ? to : from);
        }
        if (seller) { where.push(`s.user_id = ?`); params.push(seller); }
        if (status !== 'all') { where.push(`s.status = ?`); params.push(status); }

        const rows = await query(
            `SELECT s.rowid AS folio, s.id, s.total, s.subtotal, s.discount, s.tip,
                    s.status, s.payment_method, s.created_at,
                    c.name AS client_name, u.name AS seller_name
             FROM sales s
             LEFT JOIN clients c ON s.client_id = c.id
             LEFT JOIN users u ON s.user_id = u.id
             WHERE ${where.join(' AND ')}
             ORDER BY s.rowid DESC
             LIMIT 300`,
            params
        );

        const sales = rows.map(r => ({ ...r, folio: Number(r.folio) }));

        // Vendedores que tienen ventas (para el filtro)
        const sellers = await query(
            `SELECT DISTINCT u.id, u.name FROM sales s
             JOIN users u ON s.user_id = u.id
             WHERE s.tenant_id = ? ORDER BY u.name`,
            [user.tenantId]
        );

        return NextResponse.json({ sales, sellers });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
