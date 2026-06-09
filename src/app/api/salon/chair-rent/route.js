import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { ensureChairRentTables } from '@/lib/chairRent';
import { tzToday } from '@/lib/utils';

// Días que cubre cada frecuencia de arriendo (para llevar el monto a un
// equivalente diario que se controla en la grilla del mes).
function periodDays(freq, daysInMonth) {
    switch (freq) {
        case 'daily': return 1;
        case 'weekly': return 7;
        case 'biweekly': return 15;
        case 'monthly':
        default: return daysInMonth;
    }
}

// Listado de profesionales en modo "arriendo" (clasificados en Personal) con
// el equivalente diario de su arriendo y los pagos del mes solicitado.
export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        await ensureChairRentTables();

        const { searchParams } = new URL(request.url);
        const today = tzToday();
        const month = searchParams.get('month') || today.slice(0, 7); // YYYY-MM
        const [y, m] = month.split('-').map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        const monthStart = `${month}-01`;
        const monthEnd = `${month}-${String(daysInMonth).padStart(2, '0')}`;

        // Días transcurridos del mes (para calcular la deuda acumulada)
        let elapsed;
        const curMonth = today.slice(0, 7);
        if (month < curMonth) elapsed = daysInMonth;
        else if (month > curMonth) elapsed = 0;
        else elapsed = Number(today.slice(8, 10));

        // Solo profesionales clasificados como "arriendo" en Personal
        const profs = await query(
            `SELECT id, name, color, avatar_url,
                    COALESCE(rent_amount, 0) AS rent_amount,
                    COALESCE(rent_frequency, 'monthly') AS rent_frequency
             FROM professionals
             WHERE tenant_id = ? AND active = 1 AND payment_mode = 'rent'
             ORDER BY sort_order, name`,
            [user.tenantId]
        );

        const records = await query(
            `SELECT professional_id, date, amount_due, amount_paid, status
             FROM chair_rent_days
             WHERE tenant_id = ? AND date BETWEEN ? AND ?`,
            [user.tenantId, monthStart, monthEnd]
        );

        const byProf = {};
        for (const r of records) {
            (byProf[r.professional_id] ||= []).push({
                date: r.date, amount_due: r.amount_due, amount_paid: r.amount_paid,
                status: r.status || 'normal',
            });
        }

        const professionals = profs.map(p => {
            const dailyDue = Math.round((p.rent_amount || 0) / periodDays(p.rent_frequency, daysInMonth));
            const days = byProf[p.id] || [];
            // Días marcados como "no se cobra" (descanso / no vino) que ya
            // transcurrieron: se descuentan de los días cobrables del mes.
            const offElapsed = days.filter(d =>
                (d.status === 'off' || d.status === 'absent') && Number(d.date.slice(8, 10)) <= elapsed
            ).length;
            const chargeableDays = Math.max(0, elapsed - offElapsed);
            const totalPaid = days.reduce((s, d) => s + (d.amount_paid || 0), 0);
            const totalDue = dailyDue * chargeableDays;
            const debt = Math.max(0, totalDue - totalPaid);
            return {
                id: p.id, name: p.name, color: p.color, avatar_url: p.avatar_url,
                daily_amount: dailyDue,
                rent_amount: p.rent_amount, rent_frequency: p.rent_frequency,
                days,
                summary: { due_days: chargeableDays, off_days: offElapsed, total_due: totalDue, total_paid: totalPaid, debt },
            };
        });

        return NextResponse.json({ month, today, daysInMonth, professionals });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
