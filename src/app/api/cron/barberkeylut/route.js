import { NextResponse } from 'next/server';
import { getConfig, syncBusy, retryPendingCompletes } from '@/lib/barberkeylut';

export const dynamic = 'force-dynamic';

// Vercel Cron diario (vercel.json): sincronización completa de la ocupación y
// reintento de citas terminadas pendientes de avisar a la app. Vercel envía
// Authorization: Bearer CRON_SECRET.
export async function GET(request) {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const cfg = getConfig();
    if (!cfg.enabled) return NextResponse.json({ ok: true, skipped: 'integration_disabled' });
    try {
        const busy = await syncBusy({ tenantId: cfg.tenantId, force: true });
        const completes = await retryPendingCompletes({ tenantId: cfg.tenantId });
        return NextResponse.json({ ok: true, busy, completes });
    } catch (e) {
        console.error('[barberkeylut] cron:', e?.code || e?.message);
        return NextResponse.json({ error: 'internal' }, { status: 500 });
    }
}
