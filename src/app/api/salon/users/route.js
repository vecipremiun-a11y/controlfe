import { NextResponse } from 'next/server';
import { getCurrentUser, hashPassword } from '@/lib/auth';
import { query, queryOne, execute } from '@/lib/db';
import { generateId } from '@/lib/utils';
import { ROLES, USER_MANAGEMENT_ROLES } from '@/lib/permissions';

const VALID_ROLES = ROLES.map(r => r.value);

function canManage(user) {
    return user && USER_MANAGEMENT_ROLES.includes(user.role);
}

// Listar usuarios del salón
export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        if (!canManage(user)) return NextResponse.json({ error: 'No tienes permiso para ver usuarios' }, { status: 403 });

        const users = await query(
            `SELECT id, email, name, phone, role, active, last_login, created_at
             FROM users WHERE tenant_id = ? ORDER BY active DESC, name`,
            [user.tenantId]
        );

        return NextResponse.json({ users });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Crear usuario
export async function POST(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        if (!canManage(user)) return NextResponse.json({ error: 'No tienes permiso para crear usuarios' }, { status: 403 });

        const body = await request.json();
        const name = (body.name || '').trim();
        const email = (body.email || '').trim().toLowerCase();
        const password = body.password || '';
        const role = body.role || 'vendedor';
        const phone = (body.phone || '').trim() || null;

        if (!name || !email || !password) {
            return NextResponse.json({ error: 'Nombre, correo y contraseña son obligatorios' }, { status: 400 });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json({ error: 'Correo electrónico no válido' }, { status: 400 });
        }
        if (password.length < 6) {
            return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
        }
        if (!VALID_ROLES.includes(role)) {
            return NextResponse.json({ error: 'Rol no válido' }, { status: 400 });
        }
        // Solo el dueño puede crear otros dueños
        if (role === 'owner' && user.role !== 'owner') {
            return NextResponse.json({ error: 'Solo el dueño puede asignar el rol Dueño' }, { status: 403 });
        }

        // Email único dentro del salón
        const existing = await queryOne(
            'SELECT id FROM users WHERE email = ? AND tenant_id = ?',
            [email, user.tenantId]
        );
        if (existing) {
            return NextResponse.json({ error: 'Ya existe un usuario con ese correo' }, { status: 409 });
        }

        const id = generateId();
        const passwordHash = await hashPassword(password);
        await execute(
            `INSERT INTO users (id, tenant_id, email, password_hash, name, phone, role, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
            [id, user.tenantId, email, passwordHash, name, phone, role]
        );

        return NextResponse.json({ id, message: 'Usuario creado' });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Editar usuario
export async function PUT(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        if (!canManage(user)) return NextResponse.json({ error: 'No tienes permiso para editar usuarios' }, { status: 403 });

        const body = await request.json();
        const { id } = body;
        if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });

        const target = await queryOne('SELECT * FROM users WHERE id = ? AND tenant_id = ?', [id, user.tenantId]);
        if (!target) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

        const name = body.name !== undefined ? (body.name || '').trim() : target.name;
        const role = body.role !== undefined ? body.role : target.role;
        const phone = body.phone !== undefined ? ((body.phone || '').trim() || null) : target.phone;
        const active = body.active !== undefined ? (body.active ? 1 : 0) : target.active;

        if (!name) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
        if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: 'Rol no válido' }, { status: 400 });

        // Proteger al dueño: no se puede cambiar su rol ni desactivarlo
        if (target.role === 'owner' && (role !== 'owner' || active === 0)) {
            return NextResponse.json({ error: 'No se puede modificar el rol ni desactivar al Dueño' }, { status: 403 });
        }
        // Solo el dueño puede asignar/quitar el rol Dueño
        if (role === 'owner' && user.role !== 'owner') {
            return NextResponse.json({ error: 'Solo el dueño puede asignar el rol Dueño' }, { status: 403 });
        }

        await execute(
            `UPDATE users SET name = ?, role = ?, phone = ?, active = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
            [name, role, phone, active, id, user.tenantId]
        );

        // Cambio de contraseña opcional
        if (body.password) {
            if (body.password.length < 6) {
                return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
            }
            const passwordHash = await hashPassword(body.password);
            await execute('UPDATE users SET password_hash = ? WHERE id = ? AND tenant_id = ?', [passwordHash, id, user.tenantId]);
        }

        return NextResponse.json({ message: 'Usuario actualizado' });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Desactivar usuario (borrado lógico)
export async function DELETE(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        if (!canManage(user)) return NextResponse.json({ error: 'No tienes permiso para eliminar usuarios' }, { status: 403 });

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });

        if (id === user.id) {
            return NextResponse.json({ error: 'No puedes desactivar tu propia cuenta' }, { status: 400 });
        }

        const target = await queryOne('SELECT role FROM users WHERE id = ? AND tenant_id = ?', [id, user.tenantId]);
        if (!target) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
        if (target.role === 'owner') {
            return NextResponse.json({ error: 'No se puede desactivar al Dueño' }, { status: 403 });
        }

        await execute(
            `UPDATE users SET active = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
            [id, user.tenantId]
        );

        return NextResponse.json({ message: 'Usuario desactivado' });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
