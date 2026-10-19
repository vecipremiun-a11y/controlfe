import { NextResponse, after } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
    getTurnState, getTurnLog, markArrival, markLeave, assignFromWaitlist,
    requestBarber, undoAssignment, TurnError,
} from '@/lib/turnQueue';
import { isEnabledFor, pushOccupancyForAppointment } from '@/lib/barberkeylut';

export const dynamic = 'force-dynamic';

// GET: fila de turnos del día (?log=1 incluye el registro de eventos).
export async function GET(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const state = await getTurnState(user.tenantId);
        const log = searchParams.get('log') ? await getTurnLog(user.tenantId, { date: state.date }) : undefined;
        return NextResponse.json({ ...state, log });
    } catch (error) {
        console.error('Turns GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: { action, ... } — cada acción corre en su propia transacción.
//  arrive / leave       { professional_id }
//  assign               { professional_id?, waitlist_id?, force? }
//  request              { professional_id, client_name, client_phone?, client_id?, service_ids[] }
//  undo                 { appointment_id }
export async function POST(request) {
    try {
        const user = await getCurrentUser(request);
        if (!user?.tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const body = await request.json();
        const base = { tenantId: user.tenantId, userId: user.id };
        let result;
        switch (body.action) {
            case 'arrive':
                result = await markArrival({ ...base, professionalId: body.professional_id });
                break;
            case 'leave':
                result = await markLeave({ ...base, professionalId: body.professional_id });
                break;
            case 'assign':
                result = await assignFromWaitlist({
                    ...base, branchId: user.branchId, professionalId: body.professional_id || null,
                    waitlistId: body.waitlist_id || null, force: !!body.force,
                });
                break;
            case 'request':
                result = await requestBarber({
                    ...base, branchId: user.branchId, professionalId: body.professional_id,
                    clientName: body.client_name, clientPhone: body.client_phone || null,
                    clientId: body.client_id || null, serviceIds: body.service_ids || [],
                });
                break;
            case 'undo':
                result = await undoAssignment({ ...base, appointmentId: body.appointment_id });
                break;
            default:
                return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
        }
        // La atención sin cita también ocupa al barbero en la app Barber Keylut.
        const touched = result?.appointmentId || (body.action === 'undo' ? body.appointment_id : null);
        if (touched && isEnabledFor(user.tenantId)) after(() => pushOccupancyForAppointment(touched));
        return NextResponse.json(result);
    } catch (error) {
        if (error instanceof TurnError) {
            return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
        }
        console.error('Turns POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
