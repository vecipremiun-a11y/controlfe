import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { ensureChairRentTables } from '@/lib/chairRent';
import { reportDateFilter, tzOffset, tzToday } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Reporte de UTILIDAD (ganancia real del salón) por barbero y por productos.
//
// Modelos de pago del barbero (professionals.payment_mode) y cómo afecta la
// utilidad del salón sobre los SERVICIOS que generó:
//   - commission : el barbero gana commission_percent% → salón = resto.
//   - per_service: el barbero gana per_service_rate por servicio → salón = resto.
//   - salary     : sueldo fijo prorrateado por día → salón = ingreso − sueldo.
//   - mixed      : sueldo prorrateado + comisión → salón = ingreso − ambos.
//   - hourly     : per_service_rate por hora trabajada → salón = ingreso − pago.
//   - rent       : el barbero arrienda la silla y se queda con TODO el servicio;
//                  el ingreso del salón es el ARRIENDO cobrado en el período.
//
// Utilidad de productos = precio de venta − costo (products.cost).
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        await ensureChairRentTables();

        const { searchParams } = new URL(request.url);
        const range = searchParams.get('range') || 'month';
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        const localToday = tzToday();

        // Resolver el período en hora local (Chile). `offset` convierte la
        // columna UTC sales.created_at a fecha local dentro del SQL.
        let startDate, endDate, offset;
        if (from && to) {
            startDate = from <= to ? from : to;
            endDate = from <= to ? to : from;
            offset = tzOffset();
        } else {
            const r = reportDateFilter(range);
            startDate = r.dateFilter;
            endDate = null;
            offset = r.offset;
        }

        // Nº de días del período (para prorratear sueldos fijos).
        const rangeEnd = endDate || localToday;
        const days = Math.max(1, Math.floor((Date.parse(rangeEnd) - Date.parse(startDate)) / 86400000) + 1);

        // Cláusula de fecha para sales.created_at (UTC → local con offset).
        const saleDate = endDate
            ? { sql: `DATE(s.created_at, ?) BETWEEN ? AND ?`, params: [offset, startDate, endDate] }
            : { sql: `DATE(s.created_at, ?) >= ?`, params: [offset, startDate] };
        // Cláusula para columnas de fecha local (chair_rent_days.date, time_entries.date).
        const localDate = (col) => endDate
            ? { sql: `${col} BETWEEN ? AND ?`, params: [startDate, endDate] }
            : { sql: `${col} >= ?`, params: [startDate] };

        // 1) Ingreso de servicios y productos por barbero (ventas completadas).
        //    El costo del producto se toma de products.cost (× cantidad).
        const sd = saleDate;
        const itemRows = await query(
            `SELECT si.professional_id AS pid,
                    SUM(CASE WHEN si.type = 'service' THEN si.total ELSE 0 END) AS service_revenue,
                    SUM(CASE WHEN si.type = 'service' THEN si.quantity ELSE 0 END) AS service_count,
                    SUM(CASE WHEN si.type = 'product' THEN si.total ELSE 0 END) AS product_revenue,
                    SUM(CASE WHEN si.type = 'product' THEN COALESCE(pr.cost, 0) * si.quantity ELSE 0 END) AS product_cost
             FROM sale_items si
             JOIN sales s ON si.sale_id = s.id
             LEFT JOIN products pr ON pr.id = si.item_id AND si.type = 'product'
             WHERE s.tenant_id = ? AND s.status = 'completed' AND ${sd.sql}
             GROUP BY si.professional_id`,
            [user.tenantId, ...sd.params]
        );
        const revMap = {};
        for (const r of itemRows) {
            revMap[r.pid || '__none__'] = {
                service_revenue: r.service_revenue || 0,
                service_count: r.service_count || 0,
                product_revenue: r.product_revenue || 0,
                product_cost: r.product_cost || 0,
            };
        }

        // 2) Profesionales con su modelo de pago.
        const profs = await query(
            `SELECT id, name, color, avatar_url, active,
                    COALESCE(payment_mode, 'commission') AS payment_mode,
                    COALESCE(commission_percent, 0) AS commission_percent,
                    COALESCE(base_salary, 0) AS base_salary,
                    COALESCE(per_service_rate, 0) AS per_service_rate,
                    COALESCE(rent_amount, 0) AS rent_amount,
                    COALESCE(rent_frequency, 'monthly') AS rent_frequency
             FROM professionals WHERE tenant_id = ? ORDER BY sort_order, name`,
            [user.tenantId]
        );
        const profMap = {};
        for (const p of profs) profMap[p.id] = p;

        // 3) Arriendo cobrado en el período por barbero (modelo 'rent').
        const rc = localDate('date');
        const rentRows = await query(
            `SELECT professional_id AS pid, COALESCE(SUM(amount_paid), 0) AS rent_paid
             FROM chair_rent_days WHERE tenant_id = ? AND ${rc.sql} GROUP BY professional_id`,
            [user.tenantId, ...rc.params]
        );
        const rentMap = {};
        for (const r of rentRows) rentMap[r.pid] = r.rent_paid || 0;

        // 4) Horas trabajadas por barbero (modelo 'hourly').
        const tc = localDate('date');
        const hourRows = await query(
            `SELECT professional_id AS pid, COALESCE(SUM(total_hours), 0) AS hours
             FROM time_entries WHERE tenant_id = ? AND ${tc.sql} GROUP BY professional_id`,
            [user.tenantId, ...tc.params]
        );
        const hourMap = {};
        for (const r of hourRows) hourMap[r.pid] = r.hours || 0;

        const MODEL_LABEL = {
            commission: 'Comisión', rent: 'Arriendo silla', salary: 'Salario fijo',
            mixed: 'Mixto', per_service: 'Por servicio', hourly: 'Por hora',
        };

        // Conjunto de barberos a mostrar: activos + cualquiera con actividad.
        const ids = new Set();
        for (const p of profs) if (p.active) ids.add(p.id);
        for (const k of Object.keys(revMap)) if (k !== '__none__') ids.add(k);
        for (const k of Object.keys(rentMap)) ids.add(k);

        const barbers = [];
        for (const id of ids) {
            const p = profMap[id];
            if (!p) continue;
            const rev = revMap[id] || { service_revenue: 0, service_count: 0, product_revenue: 0, product_cost: 0 };
            const model = p.payment_mode;
            const svcRev = rev.service_revenue;
            const svcCount = rev.service_count;
            const pct = p.commission_percent;

            let barberPay = 0;       // lo que recibe el barbero por servicios
            let isRent = false;
            const rentIncome = rentMap[id] || 0;

            switch (model) {
                case 'commission': barberPay = svcRev * (pct / 100); break;
                case 'per_service': barberPay = p.per_service_rate * svcCount; break;
                case 'salary': barberPay = (p.base_salary / 30) * days; break;
                case 'mixed': barberPay = (p.base_salary / 30) * days + svcRev * (pct / 100); break;
                case 'hourly': barberPay = p.per_service_rate * (hourMap[id] || 0); break;
                case 'rent': isRent = true; barberPay = svcRev; break; // se queda con todo
                default: barberPay = svcRev * (pct / 100);
            }

            // Ingreso del salón y utilidad sobre los servicios de este barbero.
            const salonServiceRevenue = isRent ? rentIncome : svcRev;
            const salonServiceCost = isRent ? 0 : barberPay;
            const serviceUtility = Math.round(salonServiceRevenue - salonServiceCost);

            barbers.push({
                id, name: p.name, color: p.color, avatar_url: p.avatar_url,
                payment_mode: model,
                model_label: model === 'commission' ? `Comisión ${Math.round(pct)}%` : (MODEL_LABEL[model] || model),
                is_rent: isRent,
                service_revenue: Math.round(svcRev),
                service_count: svcCount,
                barber_pay: Math.round(barberPay),
                rent_income: Math.round(rentIncome),
                product_revenue: Math.round(rev.product_revenue),
                product_cost: Math.round(rev.product_cost),
                product_profit: Math.round(rev.product_revenue - rev.product_cost),
                service_utility: serviceUtility, // utilidad del salón por servicios/arriendo
            });
        }
        barbers.sort((a, b) => b.service_utility - a.service_utility);

        // Servicios/productos sin barbero asignado (mostrador) → salón se queda todo.
        const none = revMap['__none__'];
        const unassigned = none && (none.service_revenue > 0 || none.product_revenue > 0) ? {
            service_revenue: Math.round(none.service_revenue),
            service_count: none.service_count,
            service_utility: Math.round(none.service_revenue), // sin pago a barbero
            product_revenue: Math.round(none.product_revenue),
            product_cost: Math.round(none.product_cost),
            product_profit: Math.round(none.product_revenue - none.product_cost),
        } : null;

        // 5) Utilidad por producto (ranking).
        const products = await query(
            `SELECT si.item_name AS name, SUM(si.quantity) AS quantity,
                    SUM(si.total) AS revenue,
                    SUM(COALESCE(pr.cost, 0) * si.quantity) AS cost,
                    SUM(si.total - COALESCE(pr.cost, 0) * si.quantity) AS profit
             FROM sale_items si
             JOIN sales s ON si.sale_id = s.id
             LEFT JOIN products pr ON pr.id = si.item_id
             WHERE s.tenant_id = ? AND si.type = 'product' AND s.status = 'completed' AND ${sd.sql}
             GROUP BY si.item_id ORDER BY profit DESC`,
            [user.tenantId, ...sd.params]
        );
        const productList = products.map(p => ({
            name: p.name,
            quantity: p.quantity || 0,
            revenue: Math.round(p.revenue || 0),
            cost: Math.round(p.cost || 0),
            profit: Math.round(p.profit || 0),
            margin: p.revenue > 0 ? Math.round(((p.profit || 0) / p.revenue) * 100) : 0,
        }));

        // ── Totales del salón ──
        const allRows = [...barbers, ...(unassigned ? [unassigned] : [])];
        const serviceUtility = allRows.reduce((s, b) => s + (b.service_utility || 0), 0);
        const barberPayTotal = barbers.reduce((s, b) => s + (b.is_rent ? 0 : b.barber_pay), 0);
        const rentIncomeTotal = barbers.reduce((s, b) => s + (b.is_rent ? b.rent_income : 0), 0);
        const serviceRevenueSalon = allRows.reduce((s, b) => s + (b.is_rent ? 0 : (b.service_revenue || 0)), 0);
        const productRevenue = allRows.reduce((s, b) => s + (b.product_revenue || 0), 0);
        const productCost = allRows.reduce((s, b) => s + (b.product_cost || 0), 0);
        const productProfit = productRevenue - productCost;

        const income = serviceRevenueSalon + rentIncomeTotal + productRevenue; // entra al salón
        const totalUtility = serviceUtility + productProfit;
        const margin = income > 0 ? Math.round((totalUtility / income) * 100) : 0;

        return NextResponse.json({
            range, startDate, endDate, days,
            summary: {
                income,
                service_revenue: serviceRevenueSalon,
                rent_income: rentIncomeTotal,
                barber_pay: barberPayTotal,
                product_revenue: productRevenue,
                product_cost: productCost,
                product_profit: productProfit,
                service_utility: serviceUtility,
                total_utility: totalUtility,
                margin,
            },
            barbers,
            unassigned,
            products: productList,
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
