import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query, execute } from '@/lib/db';
import { generateId } from '@/lib/utils';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

async function saveProductImage(file, productId) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        throw new Error('Formato no válido. Usa JPG, PNG o WebP');
    }
    if (buffer.length > 2 * 1024 * 1024) {
        throw new Error('La imagen no debe superar 2MB');
    }
    const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
    const filename = `${productId}.${ext}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'products');
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);
    return `/uploads/products/${filename}`;
}

export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        const products = await query(
            `SELECT p.*, pc.name as category_name FROM products p LEFT JOIN product_categories pc ON p.category_id = pc.id WHERE p.tenant_id = ? AND p.active = 1 ORDER BY p.name`,
            [user.tenantId]
        );
        return NextResponse.json({ products });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const contentType = request.headers.get('content-type') || '';
        let body = {};
        let imageFile = null;

        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            imageFile = formData.get('image');
            body = Object.fromEntries(formData.entries());
        } else {
            body = await request.json();
        }

        const id = generateId();
        let imageUrl = null;
        if (imageFile && typeof imageFile !== 'string') {
            imageUrl = await saveProductImage(imageFile, id);
        }

        await execute(
            `INSERT INTO products (id, tenant_id, sku, name, description, cost, price, stock, min_stock, category_id, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, user.tenantId, body.sku || null, body.name, body.description || null, parseFloat(body.cost) || 0, parseFloat(body.price) || 0, parseInt(body.stock) || 0, parseInt(body.min_stock) || 5, body.category_id || null, imageUrl]
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

        const contentType = request.headers.get('content-type') || '';
        let body = {};
        let imageFile = null;

        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            imageFile = formData.get('image');
            body = Object.fromEntries(formData.entries());
        } else {
            body = await request.json();
        }

        let imageUrl = null;
        if (imageFile && typeof imageFile !== 'string') {
            imageUrl = await saveProductImage(imageFile, id);
        }

        const queryStr = imageUrl
            ? `UPDATE products SET name = ?, sku = ?, description = ?, cost = ?, price = ?, stock = ?, min_stock = ?, image_url = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
            : `UPDATE products SET name = ?, sku = ?, description = ?, cost = ?, price = ?, stock = ?, min_stock = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`;

        const params = imageUrl
            ? [body.name, body.sku || null, body.description || null, parseFloat(body.cost) || 0, parseFloat(body.price) || 0, parseInt(body.stock) || 0, parseInt(body.min_stock) || 5, imageUrl, id, user.tenantId]
            : [body.name, body.sku || null, body.description || null, parseFloat(body.cost) || 0, parseFloat(body.price) || 0, parseInt(body.stock) || 0, parseInt(body.min_stock) || 5, id, user.tenantId];

        await execute(queryStr, params);
        return NextResponse.json({ message: 'Producto actualizado' });
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
        await execute(`UPDATE products SET active = 0 WHERE id = ? AND tenant_id = ?`, [id, user.tenantId]);
        return NextResponse.json({ message: 'Producto eliminado' });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
