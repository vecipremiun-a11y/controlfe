import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, execute } from '@/lib/db';
import { generateId } from '@/lib/utils';

export async function POST(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const body = await request.json();
        const saleId = generateId();

        // Find or create client
        let clientId = null;
        if (body.client_name) {
            const existing = await query(
                `SELECT id FROM clients WHERE tenant_id = ? AND name = ? LIMIT 1`,
                [user.tenantId, body.client_name]
            );
            clientId = existing[0]?.id || null;
        }

        // Create sale
        await execute(
            `INSERT INTO sales (id, tenant_id, branch_id, client_id, user_id, subtotal, discount, tip, total, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [saleId, user.tenantId, user.branchId || null, clientId, user.id, body.subtotal, body.discount || 0, body.tip || 0, body.total, body.payment_method || 'cash']
        );

        // Create sale items and update stock
        for (const item of body.items) {
            await execute(
                `INSERT INTO sale_items (id, sale_id, type, item_id, item_name, quantity, unit_price, discount, total, professional_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [generateId(), saleId, item.type, item.item_id, item.name, item.quantity, item.unit_price, 0, item.quantity * item.unit_price, item.professional_id || null]
            );

            // Update product stock
            if (item.type === 'product') {
                await execute(
                    `UPDATE products SET stock = stock - ? WHERE id = ? AND tenant_id = ?`,
                    [item.quantity, item.item_id, user.tenantId]
                );
                // Record inventory movement
                await execute(
                    `INSERT INTO inventory_movements (id, tenant_id, product_id, type, quantity, reference_id, created_by) VALUES (?, ?, ?, 'sale', ?, ?, ?)`,
                    [generateId(), user.tenantId, item.item_id, -item.quantity, saleId, user.id]
                );
            }
        }

        // Update client stats
        if (clientId) {
            await execute(
                `UPDATE clients SET total_spent = total_spent + ?, total_visits = total_visits + 1, last_visit = datetime('now') WHERE id = ?`,
                [body.total, clientId]
            );
        }

        // Fetch the created sale with items for receipt
        const [sale] = await query(
            `SELECT s.*, c.name as client_name, u.name as user_name,
                    t.name as tenant_name, t.phone as tenant_phone, t.email as tenant_email,
                    t.address as tenant_address, t.city as tenant_city, t.logo_url as tenant_logo,
                    t.currency as tenant_currency
             FROM sales s
             LEFT JOIN clients c ON s.client_id = c.id
             LEFT JOIN users u ON s.user_id = u.id
             LEFT JOIN tenants t ON s.tenant_id = t.id
             WHERE s.id = ?`,
            [saleId]
        );
        const saleItems = await query(
            `SELECT si.*, p.name as professional_name
             FROM sale_items si
             LEFT JOIN professionals p ON si.professional_id = p.id
             WHERE si.sale_id = ?`,
            [saleId]
        );

        return NextResponse.json({ id: saleId, sale: { ...sale, items: saleItems } }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const sales = await query(
            `SELECT s.*, c.name as client_name, u.name as user_name 
       FROM sales s 
       LEFT JOIN clients c ON s.client_id = c.id 
       LEFT JOIN users u ON s.user_id = u.id 
       WHERE s.tenant_id = ? 
       ORDER BY s.created_at DESC 
       LIMIT 50`,
            [user.tenantId]
        );

        return NextResponse.json({ sales });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
