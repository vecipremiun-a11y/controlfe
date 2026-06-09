import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, queryOne, execute } from '@/lib/db';

const VOID_ROLES = ['owner', 'admin', 'supervisor'];

// Detalle completo de una venta (con ítems e info para el comprobante).
export async function GET(request, { params }) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        const { id } = await params;

        const sale = await queryOne(
            `SELECT s.rowid AS folio, s.*, c.name AS client_name, c.phone AS client_phone,
                    u.name AS seller_name,
                    t.name AS tenant_name, t.phone AS tenant_phone, t.address AS tenant_address,
                    t.city AS tenant_city, t.currency AS tenant_currency
             FROM sales s
             LEFT JOIN clients c ON s.client_id = c.id
             LEFT JOIN users u ON s.user_id = u.id
             LEFT JOIN tenants t ON s.tenant_id = t.id
             WHERE s.id = ? AND s.tenant_id = ?`,
            [id, user.tenantId]
        );
        if (!sale) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });

        const items = await query(
            `SELECT si.*, p.name AS professional_name
             FROM sale_items si
             LEFT JOIN professionals p ON si.professional_id = p.id
             WHERE si.sale_id = ?`,
            [id]
        );

        return NextResponse.json({ sale: { ...sale, folio: Number(sale.folio), items } });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Anular venta o registrar devolución. Devuelve el stock de los productos
// y marca la venta como 'voided' (anulada) o 'refunded' (devolución).
export async function PATCH(request, { params }) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        if (!VOID_ROLES.includes(user.role)) {
            return NextResponse.json({ error: 'No tienes permiso para anular o devolver ventas' }, { status: 403 });
        }
        const { id } = await params;
        const { action } = await request.json();
        const newStatus = action === 'refund' ? 'refunded' : 'voided';

        const sale = await queryOne(
            `SELECT id, status FROM sales WHERE id = ? AND tenant_id = ?`,
            [id, user.tenantId]
        );
        if (!sale) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
        if (sale.status !== 'completed') {
            return NextResponse.json({ error: 'Esta venta ya no está activa' }, { status: 400 });
        }

        // Reponer stock de los productos vendidos
        const items = await query(
            `SELECT item_id, quantity, type FROM sale_items WHERE sale_id = ?`, [id]
        );
        for (const it of items) {
            if (it.type === 'product') {
                await execute(
                    `UPDATE products SET stock = stock + ? WHERE id = ? AND tenant_id = ?`,
                    [it.quantity, it.item_id, user.tenantId]
                );
            }
        }

        await execute(`UPDATE sales SET status = ? WHERE id = ?`, [newStatus, id]);

        return NextResponse.json({ ok: true, status: newStatus });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
