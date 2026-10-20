'use client';

import { useMemo, useRef, useState } from 'react';
import {
    CalendarCheck, CalendarClock, Clock, Globe, Smartphone, Search, Scissors, Phone, Check, X, Repeat,
    PlayCircle, Wallet, AlertTriangle, ShoppingCart, StickyNote, Inbox,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { alertDialog, confirmDialog } from '@/lib/dialog';
import { appBookingAction, cancelAppBooking } from '../agenda/appBookingActions';

const ATTENTION_LABELS = {
    barber_unavailable: 'El barbero dijo que no puede',
    unanswered: 'El barbero no respondió en 15 min',
    conflict: 'Choca con otra cita',
};

const STATUS = {
    reservado: { label: 'Por confirmar', tone: 'pending' },
    confirmado: { label: 'Confirmada', tone: 'confirmed' },
    en_atencion: { label: 'En atención', tone: 'serving' },
};

const SOURCE = {
    online: { label: 'Online', icon: Globe },
    app: { label: 'App', icon: Smartphone },
};

const VIEWS = [
    { key: 'pending', label: 'Por confirmar', icon: Clock },
    { key: 'today', label: 'Hoy', icon: CalendarCheck },
    { key: 'upcoming', label: 'Próximas', icon: CalendarClock },
    { key: 'all', label: 'Todas', icon: Inbox },
];

// Reserva recién llegada (últimos 30 min): se marca como "Nueva".
const NEW_MS = 30 * 60 * 1000;

function dayLabel(date, today) {
    const d = new Date(`${date}T12:00:00`);
    const long = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
    if (date === today) return `Hoy · ${long}`;
    const tomorrow = new Date(`${today}T12:00:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date === tomorrow.toISOString().slice(0, 10)) return `Mañana · ${long}`;
    if (date < today) return `Atrasada · ${long}`;
    return long.charAt(0).toUpperCase() + long.slice(1);
}

const needsAttention = (i) => !!(i.attention || i.needsCharge || i.barberUnlinked || i.completePending);

// Punto de Venta → Reservas: reservas web y de la app Barber Keylut en un solo
// lugar. Se confirman, rechazan, marcan como llegadas o se cargan al carrito
// para cobrarlas. Las de la app se responden a través de la app (el cliente
// recibe el aviso allá).
export default function ReservationsPanel({ data, onChanged, onCharge, inCartIds = [], fmt }) {
    const { addToast } = useStore();
    const [pickedView, setView] = useState(null);
    const [source, setSource] = useState('all');
    const [search, setSearch] = useState('');
    // Reservas con una acción en curso (cada tarjeta se bloquea por separado).
    const busyRef = useRef(new Set());
    const [busyIds, setBusyIds] = useState(() => new Set());
    const [reassign, setReassign] = useState(null); // { item, professionalId, confirm }
    const [nowMs] = useState(() => Date.now());

    const today = data?.today || '';
    const app = data?.app || { enabled: false, canAct: false, professionals: [] };

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (data?.items || []).filter((i) => {
            if (source !== 'all' && i.source !== source) return false;
            if (!q) return true;
            return [i.client?.name, i.client?.phone, i.service?.name, i.professional?.name]
                .some((v) => v && String(v).toLowerCase().includes(q));
        });
    }, [data, source, search]);

    const groups = useMemo(() => ({
        pending: filtered.filter((i) => i.status === 'reservado'),
        today: filtered.filter((i) => i.date <= today),
        upcoming: filtered.filter((i) => i.date > today),
        all: filtered,
    }), [filtered, today]);

    // Sin vista elegida: las por confirmar si hay; si no, las de hoy.
    const view = pickedView || (groups.pending.length ? 'pending' : 'today');
    const list = groups[view];
    const attentionCount = filtered.filter(needsAttention).length;

    const byDay = useMemo(() => {
        const map = new Map();
        for (const item of list) {
            if (!map.has(item.date)) map.set(item.date, []);
            map.get(item.date).push(item);
        }
        return [...map.entries()];
    }, [list]);

    const run = async (item, fn, message) => {
        const key = item.id || item.externalId;
        if (busyRef.current.has(key)) return;
        busyRef.current.add(key);
        setBusyIds(new Set(busyRef.current));
        try {
            if (await fn()) {
                if (message) addToast({ type: 'success', message });
                await onChanged();
            }
        } finally {
            busyRef.current.delete(key);
            setBusyIds(new Set(busyRef.current));
        }
    };

    // Reservas web: cambio de estado directo en ControlFe.
    const setStatus = async (item, status) => {
        const res = await fetch(`/api/salon/appointments?id=${item.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        }).catch(() => null);
        if (res?.ok) return true;
        const err = res ? await res.json().catch(() => ({})) : {};
        await alertDialog({
            title: 'No se pudo actualizar la reserva',
            message: err.error || 'Revisa tu conexión e inténtalo de nuevo.',
            tone: 'danger',
        });
        return false;
    };

    const confirmBooking = (item) => run(item, () => (item.source === 'app'
        ? appBookingAction(item.externalId, { action: 'confirm' })
        : setStatus(item, 'confirmado')), 'Reserva confirmada');

    const cancelBooking = (item) => {
        const pending = item.status === 'reservado';
        return run(item, async () => {
            if (item.source === 'app') return cancelAppBooking(item.externalId, { pending });
            const ok = await confirmDialog({
                title: pending ? 'Rechazar reserva' : 'Cancelar reserva',
                message: `${item.client?.name || 'Cliente'} · ${dayLabel(item.date, today)} a las ${item.start}. El horario quedará libre.`,
                confirmText: pending ? 'Rechazar' : 'Cancelar reserva',
                cancelText: 'Volver',
                tone: 'danger',
            });
            return ok && setStatus(item, 'cancelado');
        }, pending ? 'Reserva rechazada' : 'Reserva cancelada');
    };

    const markArrived = (item) => run(item, () => setStatus(item, 'en_atencion'),
        `${item.client?.name || 'El cliente'} está en atención`);

    const submitReassign = () => {
        const { item, professionalId, confirm } = reassign;
        setReassign(null);
        run(item, () => appBookingAction(item.externalId, { action: 'reassign', professional_id: professionalId, confirm }),
            confirm ? 'Reasignada y confirmada' : 'Reasignada: queda pendiente del nuevo barbero');
    };

    if (!data) {
        return <div className="resv__loading"><div className="spinner" /></div>;
    }

    const counts = { pending: groups.pending.length, today: groups.today.length, upcoming: groups.upcoming.length, all: groups.all.length };
    const emptyText = {
        pending: 'No hay reservas por confirmar.',
        today: 'No hay reservas para hoy.',
        upcoming: 'No hay reservas próximas.',
        all: 'No hay reservas abiertas.',
    }[view];

    return (
        <div className="resv">
            <div className="resv__toolbar">
                <div className="resv__views" role="tablist">
                    {VIEWS.map((v) => {
                        const Icon = v.icon;
                        return (
                            <button key={v.key} type="button" role="tab" aria-selected={view === v.key}
                                className={`resv__view${view === v.key ? ' resv__view--active' : ''}${v.key === 'pending' && counts.pending ? ' resv__view--alert' : ''}`}
                                onClick={() => setView(v.key)}>
                                <Icon size={14} /> {v.label}
                                <span className="resv__view-count">{counts[v.key]}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="resv__filters">
                    {app.enabled && (
                        <div className="resv__sources">
                            {[{ key: 'all', label: 'Todas' }, { key: 'online', label: 'Online', icon: Globe }, { key: 'app', label: 'App', icon: Smartphone }].map((s) => {
                                const Icon = s.icon;
                                return (
                                    <button key={s.key} type="button"
                                        className={`resv__source${source === s.key ? ' resv__source--active' : ''}`}
                                        onClick={() => setSource(s.key)}>
                                        {Icon && <Icon size={13} />} {s.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    <div className="resv__search">
                        <Search size={15} />
                        <input placeholder="Buscar cliente o barbero…" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                </div>
            </div>

            {attentionCount > 0 && (
                <div className="resv__banner">
                    <AlertTriangle size={16} />
                    <span>{attentionCount === 1 ? '1 reserva requiere atención' : `${attentionCount} reservas requieren atención`}: están marcadas en rojo.</span>
                </div>
            )}

            <div className="resv__list">
                {byDay.length === 0 ? (
                    <div className="resv__empty">
                        <CalendarCheck size={34} />
                        <p>{emptyText}</p>
                        <span>Las reservas de tu página web{app.enabled ? ' y de la app Barber Keylut' : ''} aparecen aquí en segundos.</span>
                    </div>
                ) : byDay.map(([date, items]) => (
                    <section key={date} className="resv__day">
                        <h3 className="resv__day-title">
                            {dayLabel(date, today)}
                            <span>{items.length}</span>
                        </h3>
                        {items.map((item) => {
                            const key = item.id || item.externalId;
                            const busy = busyIds.has(key);
                            const st = STATUS[item.status] || { label: item.status, tone: 'confirmed' };
                            const src = SOURCE[item.source] || SOURCE.online;
                            const SrcIcon = src.icon;
                            const isApp = item.source === 'app';
                            const canAct = !isApp || app.canAct;
                            const pending = item.status === 'reservado';
                            const confirmed = item.status === 'confirmado';
                            const isNew = item.createdAt && nowMs - Date.parse(item.createdAt) < NEW_MS;
                            const inCart = inCartIds.includes(item.id);
                            const canCharge = !pending && (item.needsCharge || item.status === 'en_atencion' || (confirmed && item.date <= today));
                            const alert = needsAttention(item);
                            return (
                                <article key={key} className={`resv-card resv-card--${alert ? 'alert' : st.tone}${inCart ? ' resv-card--in-cart' : ''}`}>
                                    <div className="resv-card__time">
                                        <strong>{item.start}</strong>
                                        <span>{item.end}</span>
                                    </div>
                                    <div className="resv-card__body">
                                        <div className="resv-card__head">
                                            <span className="resv-card__client">{item.client?.name || 'Cliente'}</span>
                                            <span className={`resv-chip resv-chip--${item.source}`}><SrcIcon size={12} /> {src.label}</span>
                                            <span className={`resv-chip resv-chip--${item.needsCharge ? 'charge' : st.tone}`}>
                                                {item.needsCharge ? 'Falta cobrar' : st.label}
                                            </span>
                                            {isNew && <span className="resv-chip resv-chip--new">Nueva</span>}
                                        </div>
                                        <div className="resv-card__meta">
                                            <span><Scissors size={13} /> {item.service?.name}{item.service?.price ? ` · ${fmt(item.service.price)}` : ''}</span>
                                            <span className="resv-card__barber">
                                                <i style={{ background: item.professional?.color || 'var(--primary-400)' }} />
                                                {item.professional?.name || item.barberName || 'Sin barbero'}
                                            </span>
                                            {item.client?.phone && (
                                                <a href={`tel:${item.client.phone}`} className="resv-card__phone"><Phone size={13} /> {item.client.phone}</a>
                                            )}
                                        </div>
                                        {(item.attention || item.needsCharge || item.barberUnlinked || item.completePending) && (
                                            <div className="resv-card__flags">
                                                {item.attention && (
                                                    <span className="resv-card__flag">
                                                        <AlertTriangle size={12} /> {ATTENTION_LABELS[item.attention] || item.attention}
                                                        {item.barberReason ? `: “${item.barberReason}”` : ''}
                                                    </span>
                                                )}
                                                {item.needsCharge && <span className="resv-card__flag"><Wallet size={12} /> Completada en la app: falta cobrarla</span>}
                                                {item.barberUnlinked && <span className="resv-card__flag">Barbero de la app sin vincular: {item.barberName || '—'}</span>}
                                                {item.completePending && <span className="resv-card__flag resv-card__flag--muted">Pendiente de avisar a la app que terminó</span>}
                                            </div>
                                        )}
                                        {item.notes && (
                                            <div className="resv-card__notes"><StickyNote size={12} /> {item.notes}</div>
                                        )}
                                        {isApp && item.handledBy?.name && (
                                            <div className="resv-card__handled">Respondió {item.handledBy.name}</div>
                                        )}
                                    </div>
                                    <div className="resv-card__actions">
                                        {inCart ? (
                                            <span className="resv-card__in-cart"><ShoppingCart size={14} /> En el carrito</span>
                                        ) : canCharge && (item.professional?.salonCollects === false ? (
                                            // Barbero que cobra sus servicios: el salón no cobra la reserva.
                                            <span className="resv-card__collects" title="Su consumo, si lo hay, se cobra desde su cuenta en Barbershop">
                                                Lo cobra {item.professional.name}
                                            </span>
                                        ) : (
                                            <button type="button" className="resv-btn resv-btn--primary" disabled={busy} onClick={() => onCharge(item)}>
                                                <Wallet size={14} /> Cobrar
                                            </button>
                                        ))}
                                        {pending && canAct && (
                                            <button type="button" className="resv-btn resv-btn--ok" disabled={busy} onClick={() => confirmBooking(item)}>
                                                <Check size={14} /> Confirmar
                                            </button>
                                        )}
                                        {confirmed && item.date === today && !item.needsCharge && (
                                            <button type="button" className="resv-btn resv-btn--soft" disabled={busy} onClick={() => markArrived(item)}
                                                title="El cliente llegó: pasa a En atención y se ve en Barbershop">
                                                <PlayCircle size={14} /> Llegó
                                            </button>
                                        )}
                                        {isApp && app.canAct && (pending || confirmed) && !item.needsCharge && (
                                            <button type="button" className="resv-btn resv-btn--ghost" disabled={busy}
                                                onClick={() => setReassign({ item, professionalId: '', confirm: true })}>
                                                <Repeat size={14} /> Cambiar barbero
                                            </button>
                                        )}
                                        {canAct && (pending || confirmed) && !item.needsCharge && (
                                            <button type="button" className="resv-btn resv-btn--danger" disabled={busy} onClick={() => cancelBooking(item)}>
                                                <X size={14} /> {pending ? 'Rechazar' : 'Cancelar'}
                                            </button>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </section>
                ))}
            </div>

            {reassign && (
                <div className="modal-overlay" onClick={() => setReassign(null)}>
                    <div className="modal" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal__header">
                            <h3 className="modal__title">Cambiar barbero</h3>
                            <button className="modal__close" onClick={() => setReassign(null)}>✕</button>
                        </div>
                        <div className="modal__body">
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                {reassign.item.client?.name} · {dayLabel(reassign.item.date, today)} a las {reassign.item.start}. Elige el barbero (solo los vinculados a la app):
                            </p>
                            <div className="app-inbox__choices">
                                {app.professionals.filter((p) => p.id !== reassign.item.professional?.id).map((p) => (
                                    <label key={p.id} className={`app-inbox__choice${reassign.professionalId === p.id ? ' app-inbox__choice--active' : ''}`}>
                                        <input type="radio" name="resv-reassign" checked={reassign.professionalId === p.id}
                                            onChange={() => setReassign({ ...reassign, professionalId: p.id })} />
                                        {p.name}
                                    </label>
                                ))}
                                {app.professionals.filter((p) => p.id !== reassign.item.professional?.id).length === 0 && (
                                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No hay otros barberos vinculados a la app.</p>
                                )}
                            </div>
                            <label className="app-inbox__check">
                                <input type="checkbox" checked={reassign.confirm} onChange={(e) => setReassign({ ...reassign, confirm: e.target.checked })} />
                                Confirmar al cambiar
                                <span>{reassign.confirm ? 'Queda confirmada con el nuevo barbero.' : 'Queda pendiente para que el nuevo barbero responda.'}</span>
                            </label>
                        </div>
                        <div className="modal__footer">
                            <button className="btn btn--outline" onClick={() => setReassign(null)}>Volver</button>
                            <button className="btn btn--primary" disabled={!reassign.professionalId} onClick={submitReassign}>Cambiar barbero</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
