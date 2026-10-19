'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Smartphone, AlertTriangle, Clock, CalendarCheck, Phone, Scissors, User, Check, X, Repeat,
    RefreshCw, Wallet, Banknote, CreditCard, Landmark, CircleAlert,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { alertDialog } from '@/lib/dialog';
import { usePolling } from '@/lib/usePolling';
import { appBookingAction, cancelAppBooking } from './appBookingActions';

const ATTENTION_LABELS = {
    barber_unavailable: 'El barbero dijo que no puede',
    unanswered: 'El barbero no respondió en 15 min',
    conflict: 'Choca con otra cita',
};

const HANDLED_SOURCE = { barber: 'barbero', app_admin: 'admin de la app', controlfe: 'ControlFe' };

const fmtMoney = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(v || 0);

// Contador de la pestaña: pendientes y todo lo que requiere atención.
export function inboxBadgeCount(items) {
    return items.filter((i) => i.status === 'reservado' || i.needsCharge || i.barberUnlinked || i.completePending).length;
}

function fmtDay(date, today) {
    if (date === today) return 'Hoy';
    return new Date(`${date}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Bandeja "Reservas de la app": responde en nombre del barbero. Al abrir trae
// las reservas desde la app (respaldo por si se perdió un webhook) y luego
// refresca cada 10 s desde la base local.
export default function AppBookingsInbox({ onChanged, onCount }) {
    const { addToast } = useStore();
    const [data, setData] = useState(null);
    const [unlinked, setUnlinked] = useState([]);
    const [refreshError, setRefreshError] = useState(null);
    const [pickedTab, setTab] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const [reassign, setReassign] = useState(null);   // { item, professionalId, confirm }
    const [charge, setCharge] = useState(null);       // { item, amount, method }

    const load = useCallback(async (refresh = false) => {
        try {
            const res = await fetch(`/api/salon/app-bookings${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
            const json = await res.json();
            if (!res.ok) return;
            setData(json);
            if (refresh) {
                setRefreshError(json.refreshError || null);
                if (json.unlinked) setUnlinked(json.unlinked);
            }
        } catch {
            if (refresh) setRefreshError('network');
        }
    }, []);

    useEffect(() => {
        load(true);
    }, [load]);
    // Una reserva nueva llega por webhook a la base: se ve en segundos.
    usePolling(() => load(false), 10000);

    const today = data?.today;
    const groups = useMemo(() => {
        const items = data?.items || [];
        const localIds = new Set(items.map((i) => i.externalId));
        const extra = unlinked.filter((u) => !localIds.has(u.externalId));
        const needsAttention = (i) => i.attention || i.needsCharge || i.barberUnlinked || i.completePending;
        const attention = [...extra, ...items.filter(needsAttention)];
        const pending = items.filter((i) => i.status === 'reservado');
        const upcoming = items.filter((i) => ['confirmado', 'en_atencion'].includes(i.status) && i.date >= (today || '') && !i.needsCharge);
        return { attention, pending, upcoming, badge: inboxBadgeCount(items) + extra.length };
    }, [data, unlinked, today]);

    // Sin pestaña elegida: "Requieren atención" si hay algo; si no, Pendientes.
    const tab = pickedTab || (groups.attention.length || !groups.pending.length ? 'attention' : 'pending');

    useEffect(() => {
        if (onCount) onCount(groups.badge);
    }, [groups, onCount]);

    const afterAction = async (ok, message) => {
        if (ok) {
            if (message) addToast({ type: 'success', message });
            await load(true);
            onChanged?.();
        }
    };

    const run = async (item, fn, message) => {
        if (busyId) return;
        setBusyId(item.externalId);
        try {
            await afterAction(await fn(), message);
        } finally {
            setBusyId(null);
        }
    };

    const confirmBooking = (item) => run(item, () => appBookingAction(item.externalId, { action: 'confirm' }), 'Reserva confirmada');
    const cancelBooking = (item) => run(item, () => cancelAppBooking(item.externalId, { pending: item.status === 'reservado' || item.externalStatus === 'pending' }),
        item.status === 'reservado' ? 'Reserva rechazada' : 'Reserva cancelada');

    const submitReassign = () => {
        const { item, professionalId, confirm } = reassign;
        setReassign(null);
        run(item, () => appBookingAction(item.externalId, { action: 'reassign', professional_id: professionalId, confirm }),
            confirm ? 'Reasignada y confirmada' : 'Reasignada: queda pendiente del nuevo barbero');
    };

    // Cobro de una cita completada en la app (el salón cobra a ese barbero).
    const submitCharge = async () => {
        const { item, amount, method } = charge;
        const total = Number(amount) || 0;
        if (total <= 0) return;
        setCharge(null);
        await run(item, async () => {
            const res = await fetch('/api/salon/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: [{
                        type: 'service', item_id: item.service.id || 'app-service', name: item.service.name,
                        quantity: 1, unit_price: total, professional_id: item.professional?.id || null,
                    }],
                    subtotal: total, tip: 0, total, payment_method: method,
                    client_name: item.client.name || null, appointment_id: item.id,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                await alertDialog({
                    title: json.code === 'NO_REGISTER' ? 'Caja cerrada' : 'No se pudo cobrar',
                    message: json.code === 'NO_REGISTER' ? 'Abre tu caja en Caja para poder cobrar.' : (json.error || 'Inténtalo de nuevo.'),
                    tone: json.code === 'NO_REGISTER' ? 'warning' : 'danger',
                });
                return false;
            }
            // Terminada en el salón: el servidor avisa a la app (/complete).
            await fetch(`/api/salon/appointments?id=${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'terminado' }),
            });
            return true;
        }, 'Cobro registrado');
    };

    if (!data) {
        return <div className="app-inbox__empty"><div className="spinner" /></div>;
    }

    const list = groups[tab];
    const tabs = [
        { key: 'attention', label: 'Requieren atención', icon: AlertTriangle, count: groups.attention.length },
        { key: 'pending', label: 'Pendientes', icon: Clock, count: groups.pending.length },
        { key: 'upcoming', label: 'Próximas', icon: CalendarCheck, count: groups.upcoming.length },
    ];

    return (
        <div className="app-inbox">
            {refreshError && (
                <div className="app-inbox__banner">
                    <CircleAlert size={16} />
                    <span>No se pudo conectar con la app. Se muestran los datos guardados.</span>
                    <button type="button" onClick={() => load(true)}><RefreshCw size={13} /> Reintentar</button>
                </div>
            )}

            <div className="app-inbox__tabs" role="tablist">
                {tabs.map((t) => {
                    const Icon = t.icon;
                    return (
                        <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
                            className={`app-inbox__tab${tab === t.key ? ' app-inbox__tab--active' : ''}${t.key === 'attention' && t.count ? ' app-inbox__tab--alert' : ''}`}
                            onClick={() => setTab(t.key)}>
                            <Icon size={15} /> {t.label}
                            <span className="app-inbox__count">{t.count}</span>
                        </button>
                    );
                })}
            </div>

            {list.length === 0 ? (
                <div className="app-inbox__empty">
                    <Smartphone size={30} />
                    <p>{tab === 'attention' ? 'Nada requiere atención.' : tab === 'pending' ? 'No hay reservas pendientes.' : 'No hay próximas reservas de la app.'}</p>
                </div>
            ) : (
                <ul className="app-inbox__list">
                    {list.map((item) => {
                        const pending = item.status === 'reservado' || (item.status === 'unlinked' && item.externalStatus === 'pending');
                        const confirmed = ['confirmado', 'en_atencion'].includes(item.status) || (item.status === 'unlinked' && item.externalStatus === 'confirmed');
                        const busy = busyId === item.externalId;
                        return (
                            <li key={item.externalId} className={`app-inbox__row${item.attention || item.needsCharge ? ' app-inbox__row--alert' : ''}`}>
                                <div className="app-inbox__when">
                                    <span className="app-inbox__day">{fmtDay(item.date, today)}</span>
                                    <span className="app-inbox__time">{item.start}–{item.end}</span>
                                </div>
                                <div className="app-inbox__info">
                                    <div className="app-inbox__client">
                                        <User size={14} /> {item.client.name || 'Cliente'}
                                        {item.client.phone && <span className="app-inbox__phone"><Phone size={12} /> {item.client.phone}</span>}
                                    </div>
                                    <div className="app-inbox__meta">
                                        <span><Scissors size={12} /> {item.service.name}</span>
                                        <span className={item.barberUnlinked ? 'app-inbox__warn' : ''}>
                                            {item.barberUnlinked
                                                ? `Barbero sin vincular: ${item.barberName || 'desconocido'}`
                                                : `Con ${item.professional?.name || item.barberName || '—'}`}
                                        </span>
                                        <span className="app-inbox__status">{statusLabel(item)}</span>
                                    </div>
                                    {(item.attention || item.needsCharge || item.completePending) && (
                                        <div className="app-inbox__flags">
                                            {item.attention && (
                                                <span className="app-inbox__flag">
                                                    <AlertTriangle size={12} /> {ATTENTION_LABELS[item.attention] || item.attention}
                                                    {item.barberReason ? `: “${item.barberReason}”` : ''}
                                                </span>
                                            )}
                                            {item.needsCharge && <span className="app-inbox__flag"><Wallet size={12} /> Completada en la app · falta cobrar</span>}
                                            {item.completePending && <span className="app-inbox__flag app-inbox__flag--muted">Pendiente de avisar a la app que terminó</span>}
                                        </div>
                                    )}
                                    {item.handledBy?.name && (
                                        <div className="app-inbox__handled">
                                            Respondió {item.handledBy.name}
                                            {HANDLED_SOURCE[item.handledBy.source] ? ` (${HANDLED_SOURCE[item.handledBy.source]})` : ''}
                                        </div>
                                    )}
                                </div>
                                <div className="app-inbox__actions">
                                    {item.needsCharge && (
                                        <button type="button" className="btn btn--sm btn--primary" disabled={busy}
                                            onClick={() => setCharge({ item, amount: String(item.service.price || ''), method: 'cash' })}>
                                            <Wallet size={14} /> Cobrar
                                        </button>
                                    )}
                                    {pending && (
                                        <button type="button" className="btn btn--sm app-inbox__btn--ok" disabled={busy} onClick={() => confirmBooking(item)}>
                                            <Check size={14} /> Confirmar
                                        </button>
                                    )}
                                    {(pending || confirmed) && !item.needsCharge && (
                                        <button type="button" className="btn btn--sm btn--outline" disabled={busy}
                                            onClick={() => setReassign({ item, professionalId: '', confirm: true })}>
                                            <Repeat size={14} /> Reasignar
                                        </button>
                                    )}
                                    {(pending || confirmed) && !item.needsCharge && (
                                        <button type="button" className="btn btn--sm app-inbox__btn--danger" disabled={busy} onClick={() => cancelBooking(item)}>
                                            <X size={14} /> {pending ? 'Rechazar' : 'Cancelar'}
                                        </button>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {reassign && (
                <div className="modal-overlay" onClick={() => setReassign(null)}>
                    <div className="modal" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal__header">
                            <h3 className="modal__title">Reasignar reserva</h3>
                            <button className="modal__close" onClick={() => setReassign(null)}>✕</button>
                        </div>
                        <div className="modal__body">
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                {reassign.item.client.name} · {fmtDay(reassign.item.date, today)} {reassign.item.start}. Elige el barbero (solo los vinculados a la app):
                            </p>
                            <div className="app-inbox__choices">
                                {(data.professionals || []).filter((p) => p.id !== reassign.item.professional?.id).map((p) => (
                                    <label key={p.id} className={`app-inbox__choice${reassign.professionalId === p.id ? ' app-inbox__choice--active' : ''}`}>
                                        <input type="radio" name="reassign" checked={reassign.professionalId === p.id}
                                            onChange={() => setReassign({ ...reassign, professionalId: p.id })} />
                                        {p.name}
                                    </label>
                                ))}
                                {(data.professionals || []).length === 0 && (
                                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No hay otros profesionales vinculados a la app.</p>
                                )}
                            </div>
                            <label className="app-inbox__check">
                                <input type="checkbox" checked={reassign.confirm} onChange={(e) => setReassign({ ...reassign, confirm: e.target.checked })} />
                                Confirmar al reasignar
                                <span>{reassign.confirm ? 'Queda confirmada con el nuevo barbero.' : 'Queda pendiente para que el nuevo barbero responda.'}</span>
                            </label>
                        </div>
                        <div className="modal__footer">
                            <button className="btn btn--outline" onClick={() => setReassign(null)}>Volver</button>
                            <button className="btn btn--primary" disabled={!reassign.professionalId} onClick={submitReassign}>Reasignar</button>
                        </div>
                    </div>
                </div>
            )}

            {charge && (
                <div className="modal-overlay" onClick={() => setCharge(null)}>
                    <div className="modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal__header">
                            <h3 className="modal__title">Cobrar reserva de la app</h3>
                            <button className="modal__close" onClick={() => setCharge(null)}>✕</button>
                        </div>
                        <div className="modal__body">
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                {charge.item.client.name} · {charge.item.service.name} con {charge.item.professional?.name}
                            </p>
                            <label className="form-label" htmlFor="app-charge-amount">Monto</label>
                            <input id="app-charge-amount" type="number" min="0" className="form-input" value={charge.amount}
                                onChange={(e) => setCharge({ ...charge, amount: e.target.value })} />
                            <div className="app-inbox__methods">
                                {[
                                    { key: 'cash', label: 'Efectivo', icon: Banknote },
                                    { key: 'card', label: 'Tarjeta', icon: CreditCard },
                                    { key: 'transfer', label: 'Transferencia', icon: Landmark },
                                ].map((m) => {
                                    const Icon = m.icon;
                                    return (
                                        <button key={m.key} type="button"
                                            className={`app-inbox__method${charge.method === m.key ? ' app-inbox__method--active' : ''}`}
                                            onClick={() => setCharge({ ...charge, method: m.key })}>
                                            <Icon size={16} /> {m.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="modal__footer">
                            <button className="btn btn--outline" onClick={() => setCharge(null)}>Volver</button>
                            <button className="btn btn--primary" disabled={!(Number(charge.amount) > 0)} onClick={submitCharge}>
                                Cobrar {fmtMoney(Number(charge.amount) || 0)}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function statusLabel(item) {
    if (item.status === 'unlinked') return item.externalStatus === 'pending' ? 'Pendiente' : 'Confirmada';
    return {
        reservado: 'Pendiente', confirmado: 'Confirmada', en_atencion: 'En atención',
        terminado: 'Terminada', cancelado: 'Cancelada', no_show: 'No asistió',
    }[item.status] || item.status;
}
