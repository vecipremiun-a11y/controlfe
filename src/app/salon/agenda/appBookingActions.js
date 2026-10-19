'use client';

import { alertDialog, confirmDialog, promptDialog } from '@/lib/dialog';

// Acciones sobre reservas de la app Barber Keylut (confirmar, rechazar o
// cancelar, reasignar). Cada clic usa su propia Idempotency-Key y, si se
// reintenta tras un error de red, reutiliza la misma.
// Devuelve true si la app aceptó la acción (o ya estaba respondida: 409).
export async function appBookingAction(externalId, payload) {
    const idempotencyKey = crypto.randomUUID();
    for (;;) {
        let res;
        let data = {};
        try {
            res = await fetch(`/api/salon/app-bookings/${encodeURIComponent(externalId)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, idempotency_key: idempotencyKey }),
            });
            data = await res.json().catch(() => ({}));
        } catch {
            res = null;
        }
        if (res?.ok) return true;
        if (res?.status === 409) {
            await alertDialog({ title: 'Ya respondida', message: data.error || 'Esta reserva ya fue respondida.', tone: 'warning' });
            return true;
        }
        if (!res || data.code === 'network') {
            const retry = await confirmDialog({
                title: 'No se pudo conectar con la app',
                message: 'No se cambió nada. ¿Quieres reintentar?',
                confirmText: 'Reintentar',
                tone: 'warning',
            });
            if (retry) continue;
            return false;
        }
        await alertDialog({ title: 'La app no aceptó la acción', message: data.error || 'Inténtalo de nuevo.', tone: 'danger' });
        return false;
    }
}

// Rechazar (pendiente) o cancelar (confirmada): el motivo es obligatorio y lo ve el cliente.
export async function cancelAppBooking(externalId, { pending }) {
    const reason = await promptDialog({
        title: pending ? 'Rechazar reserva' : 'Cancelar reserva',
        message: 'Escribe el motivo. El cliente lo verá en la app.',
        placeholder: 'Ej: el barbero no está disponible a esa hora',
        confirmText: pending ? 'Rechazar' : 'Cancelar reserva',
        cancelText: 'Volver',
        tone: 'danger',
    });
    if (!reason) return false;
    return appBookingAction(externalId, { action: 'cancel', reason });
}
