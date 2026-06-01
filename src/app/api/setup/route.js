import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { SCHEMA_STATEMENTS } from '@/lib/schema';
import { hashPassword } from '@/lib/auth';
import { generateId } from '@/lib/utils';

export async function POST(request) {
    try {
        // Simple secret check to prevent unauthorized setup
        const { secret } = await request.json();
        if (secret !== 'setup-salon-saas-2024') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const db = getDb();

        // Create all tables
        for (const sql of SCHEMA_STATEMENTS) {
            await db.execute(sql);
        }

        // Seed plans
        const plans = [
            {
                id: generateId(),
                name: 'Starter',
                slug: 'starter',
                max_branches: 1,
                max_users: 3,
                max_bookings_month: -1,
                whatsapp_auto: 0,
                advanced_reports: 0,
                campaigns: 0,
                price_monthly: 29.99,
                price_yearly: 299.99,
            },
            {
                id: generateId(),
                name: 'Pro',
                slug: 'pro',
                max_branches: 3,
                max_users: 10,
                max_bookings_month: -1,
                whatsapp_auto: 1,
                advanced_reports: 1,
                campaigns: 1,
                price_monthly: 59.99,
                price_yearly: 599.99,
            },
            {
                id: generateId(),
                name: 'Business',
                slug: 'business',
                max_branches: -1,
                max_users: -1,
                max_bookings_month: -1,
                whatsapp_auto: 1,
                advanced_reports: 1,
                campaigns: 1,
                price_monthly: 99.99,
                price_yearly: 999.99,
            },
        ];

        for (const plan of plans) {
            await db.execute({
                sql: `INSERT OR IGNORE INTO plans (id, name, slug, max_branches, max_users, max_bookings_month, whatsapp_auto, advanced_reports, campaigns, price_monthly, price_yearly) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [plan.id, plan.name, plan.slug, plan.max_branches, plan.max_users, plan.max_bookings_month, plan.whatsapp_auto, plan.advanced_reports, plan.campaigns, plan.price_monthly, plan.price_yearly],
            });
        }

        // Seed super admin
        const adminId = generateId();
        const adminHash = await hashPassword('admin123');
        await db.execute({
            sql: `INSERT OR IGNORE INTO saas_users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)`,
            args: [adminId, 'admin@salonpro.com', adminHash, 'Super Admin', 'super_admin'],
        });

        // Seed demo tenant
        const tenantId = generateId();
        const proplanRow = await db.execute({ sql: "SELECT id FROM plans WHERE slug = 'starter' LIMIT 1", args: [] });
        const planId = proplanRow.rows[0]?.id;

        await db.execute({
            sql: `INSERT OR IGNORE INTO tenants (id, name, slug, phone, email, plan_id, status, onboarding_completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [tenantId, 'Salón Demo', 'salon-demo', '809-555-0100', 'demo@salon.com', planId, 'activo', 1],
        });

        // Seed branch for demo tenant
        const branchId = generateId();
        await db.execute({
            sql: `INSERT OR IGNORE INTO branches (id, tenant_id, name, address, phone, is_main) VALUES (?, ?, ?, ?, ?, ?)`,
            args: [branchId, tenantId, 'Sucursal Principal', 'Calle Principal #100', '809-555-0100', 1],
        });

        // Seed owner user for demo tenant
        const ownerId = generateId();
        const ownerHash = await hashPassword('demo123');
        await db.execute({
            sql: `INSERT OR IGNORE INTO users (id, tenant_id, branch_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [ownerId, tenantId, branchId, 'owner@salon.com', ownerHash, 'Carlos Rodríguez', 'owner'],
        });

        // Seed some services
        const serviceCategories = [
            { id: generateId(), name: 'Cortes' },
            { id: generateId(), name: 'Barba' },
            { id: generateId(), name: 'Tratamientos' },
        ];

        for (const cat of serviceCategories) {
            await db.execute({
                sql: `INSERT OR IGNORE INTO service_categories (id, tenant_id, name) VALUES (?, ?, ?)`,
                args: [cat.id, tenantId, cat.name],
            });
        }

        const services = [
            { name: 'Corte Clásico', duration: 30, price: 500, category: serviceCategories[0].id, color: '#6C5CE7' },
            { name: 'Corte + Barba', duration: 45, price: 800, category: serviceCategories[0].id, color: '#00B894' },
            { name: 'Corte Infantil', duration: 25, price: 350, category: serviceCategories[0].id, color: '#FDCB6E' },
            { name: 'Afeitado Clásico', duration: 20, price: 400, category: serviceCategories[1].id, color: '#E17055' },
            { name: 'Perfilado de Barba', duration: 15, price: 300, category: serviceCategories[1].id, color: '#00CEC9' },
            { name: 'Tratamiento Capilar', duration: 40, price: 1200, category: serviceCategories[2].id, color: '#A29BFE' },
            { name: 'Keratina', duration: 90, price: 2500, category: serviceCategories[2].id, color: '#FD79A8' },
        ];

        for (const svc of services) {
            await db.execute({
                sql: `INSERT OR IGNORE INTO services (id, tenant_id, category_id, name, duration_min, price, color) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                args: [generateId(), tenantId, svc.category, svc.name, svc.duration, svc.price, svc.color],
            });
        }

        // Seed some professionals
        const professionals = [
            { name: 'Miguel Ángel', phone: '809-555-0101', color: '#6C5CE7' },
            { name: 'José Ramírez', phone: '809-555-0102', color: '#00B894' },
            { name: 'Ana García', phone: '809-555-0103', color: '#E17055' },
        ];

        for (const prof of professionals) {
            const profId = generateId();
            await db.execute({
                sql: `INSERT OR IGNORE INTO professionals (id, tenant_id, branch_id, name, phone, color) VALUES (?, ?, ?, ?, ?, ?)`,
                args: [profId, tenantId, branchId, prof.name, prof.phone, prof.color],
            });

            // Add schedules (Mon-Sat 9am-6pm)
            for (let day = 1; day <= 6; day++) {
                await db.execute({
                    sql: `INSERT OR IGNORE INTO schedules (id, professional_id, day_of_week, start_time, end_time, break_start, break_end) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    args: [generateId(), profId, day, '09:00', '18:00', '12:00', '13:00'],
                });
            }
        }

        // Seed some clients
        const clients = [
            { name: 'Pedro Martínez', phone: '809-555-0201', email: 'pedro@email.com' },
            { name: 'María López', phone: '809-555-0202', email: 'maria@email.com' },
            { name: 'Juan Pérez', phone: '809-555-0203', email: 'juan@email.com' },
            { name: 'Laura Sánchez', phone: '809-555-0204', email: 'laura@email.com' },
            { name: 'Roberto Díaz', phone: '809-555-0205', email: 'roberto@email.com' },
        ];

        for (const client of clients) {
            await db.execute({
                sql: `INSERT OR IGNORE INTO clients (id, tenant_id, name, phone, email) VALUES (?, ?, ?, ?, ?)`,
                args: [generateId(), tenantId, client.name, client.phone, client.email],
            });
        }

        // Seed WhatsApp templates
        const templates = [
            {
                name: 'Confirmación de Reserva',
                type: 'confirmation',
                content: '¡Hola {{nombre}}! Tu cita ha sido confirmada para el {{fecha}} a las {{hora}} con {{profesional}}. Servicio: {{servicio}}. ¡Te esperamos! 💇',
            },
            {
                name: 'Recordatorio 24h',
                type: 'reminder_24h',
                content: '¡Hola {{nombre}}! Te recordamos que mañana tienes una cita a las {{hora}} con {{profesional}}. Si necesitas reagendar: {{link}}',
            },
            {
                name: 'Recordatorio 2h',
                type: 'reminder_2h',
                content: '¡{{nombre}}, tu cita es en 2 horas! A las {{hora}} con {{profesional}}. ¡Te esperamos! ✂️',
            },
            {
                name: 'Gracias por tu visita',
                type: 'thanks',
                content: '¡Gracias por visitarnos, {{nombre}}! Esperamos que hayas disfrutado tu {{servicio}}. Déjanos tu reseña: {{link_resena}} ⭐',
            },
        ];

        for (const tpl of templates) {
            await db.execute({
                sql: `INSERT OR IGNORE INTO whatsapp_templates (id, tenant_id, name, type, content, is_global) VALUES (?, ?, ?, ?, ?, ?)`,
                args: [generateId(), null, tpl.name, tpl.type, tpl.content, 1],
            });
        }

        return NextResponse.json({
            message: 'Setup completado exitosamente',
            credentials: {
                saas_admin: { email: 'admin@salonpro.com', password: 'admin123' },
                salon_owner: { email: 'owner@salon.com', password: 'demo123' },
            },
        });
    } catch (error) {
        console.error('Setup error:', error);
        return NextResponse.json(
            { error: 'Error en setup: ' + error.message },
            { status: 500 }
        );
    }
}
