'use client';

import { useEffect, useState } from 'react';
import { ClipboardList, Scissors, Timer, UserPlus, X, Check } from 'lucide-react';
import { alertDialog, confirmDialog } from '@/lib/dialog';

const initials = (name) => (name || '?').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

function waitedMinutes(iso, now) {
    const mins = Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
    return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

// "Agregar a una cuenta": elige al cliente (en atención, en espera o con una
// cuenta abierta) y anota en su cuenta lo que está en el carrito.
// items: líneas sueltas del carrito (las que no vienen de una cuenta).
export default function AccountPickerModal({ items, fmt, onClose, onDone }) {
    const [data, setData] = useState(null);
    const [newName, setNewName] = useState('');
    const [saving, setSaving] = useState(false);
    const [now] = useState(() => Date.now());

    useEffect(() => {
        fetch('/api/salon/tabs', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then(setData)
            .catch(() => setData({ error: true, waiting: [], inService: [], pending: [] }));
    }, []);

    const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

    // barber: { name, salonCollects } de quien lo atiende (solo en atención).
    const add = async (target, clientName, barber = null) => {
        if (saving) return;
        // Un servicio anotado es un servicio extra de su barbero: si ese barbero
        // cobra sus servicios, el local no lo cobra.
        const services = items.filter((i) => i.type === 'service');
        if (barber && barber.salonCollects === false && services.length) {
            const ok = await confirmDialog({
                title: `${barber.name} cobra sus servicios`,
                message: `${services.map((s) => s.name).join(', ')} quedará anotado como servicio extra de ${barber.name}: lo cobra él, no el local. Los productos sí se cobran como consumo.`,
                confirmText: 'Anotar igual',
                cancelText: 'Volver',
                tone: 'warning',
            });
            if (!ok) return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/salon/tabs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'add',
                    target,
                    items: items.map((i) => ({ type: i.type, item_id: i.item_id, name: i.name, quantity: i.quantity, unit_price: i.unit_price })),
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                await alertDialog({ title: 'No se pudo anotar', message: json.error || 'Inténtalo de nuevo.', tone: 'danger' });
                return;
            }
            onDone({ clientName: json.clientName || clientName });
        } catch {
            await alertDialog({ title: 'Error de conexión', message: 'Revisa tu conexión e inténtalo de nuevo.', tone: 'danger' });
        } finally {
            setSaving(false);
        }
    };

    const empty = data && !data.inService.length && !data.waiting.length && !data.pending.length;

    return (
        <div className="modal-overlay" onClick={() => !saving && onClose()}>
            <div className="modal acct-picker" onClick={(e) => e.stopPropagation()}>
                <div className="modal__header">
                    <h3 className="modal__title"><ClipboardList size={18} /> Agregar a una cuenta</h3>
                    <button className="modal__close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
                </div>
                <div className="modal__body">
                    <div className="acct-picker__summary">
                        <span>{items.length === 1 ? items[0].name : `${items.length} productos o servicios`}</span>
                        <strong>{fmt(total)}</strong>
                    </div>
                    <p className="acct-picker__hint">Elige a quién se le anota. Se cobra después: con su servicio o aparte.</p>

                    {!data ? (
                        <div className="acct-picker__loading"><div className="spinner" /></div>
                    ) : (
                        <>
                            {data.error && <p className="acct-picker__error">No se pudieron cargar los clientes de Barbershop.</p>}
                            {data.inService.length > 0 && (
                                <section>
                                    <h4 className="acct-picker__group">En atención</h4>
                                    {data.inService.map((c) => (
                                        <button key={c.appointmentId} type="button" className="acct-picker__row" disabled={saving}
                                            onClick={() => add({ appointment_id: c.appointmentId }, c.clientName, c.professional)}>
                                            <span className="acct-picker__avatar" style={{ borderColor: c.professional?.color || 'var(--primary-400)' }}>{initials(c.clientName)}</span>
                                            <span className="acct-picker__info">
                                                <strong>{c.clientName}</strong>
                                                <span>
                                                    <Scissors size={12} /> {c.serviceName} · con {c.professional?.name || '—'}
                                                    {c.professional?.salonCollects === false && <em className="acct-picker__collects">cobra sus servicios</em>}
                                                </span>
                                            </span>
                                            {c.account?.total ? <span className="acct-picker__owed">{fmt(c.account.total)}</span> : null}
                                        </button>
                                    ))}
                                </section>
                            )}
                            {data.waiting.length > 0 && (
                                <section>
                                    <h4 className="acct-picker__group">En espera</h4>
                                    {data.waiting.map((c) => (
                                        <button key={c.waitlistId} type="button" className="acct-picker__row" disabled={saving}
                                            onClick={() => add({ waitlist_id: c.waitlistId }, c.clientName)}>
                                            <span className="acct-picker__avatar acct-picker__avatar--waiting">{initials(c.clientName)}</span>
                                            <span className="acct-picker__info">
                                                <strong>{c.clientName}</strong>
                                                <span><Timer size={12} /> Espera hace {waitedMinutes(c.since, now)}{c.serviceName ? ` · ${c.serviceName}` : ''}</span>
                                            </span>
                                            {c.account?.total ? <span className="acct-picker__owed">{fmt(c.account.total)}</span> : null}
                                        </button>
                                    ))}
                                </section>
                            )}
                            {data.pending.length > 0 && (
                                <section>
                                    <h4 className="acct-picker__group">Cuentas abiertas</h4>
                                    {data.pending.map((c) => (
                                        <button key={c.tabId} type="button" className="acct-picker__row" disabled={saving}
                                            onClick={() => add({ tab_id: c.tabId }, c.clientName)}>
                                            <span className="acct-picker__avatar acct-picker__avatar--open">{initials(c.clientName)}</span>
                                            <span className="acct-picker__info">
                                                <strong>{c.clientName}</strong>
                                                <span><ClipboardList size={12} /> Ya no está en espera ni en atención</span>
                                            </span>
                                            <span className="acct-picker__owed">{fmt(c.account.total)}</span>
                                        </button>
                                    ))}
                                </section>
                            )}
                            {empty && <p className="acct-picker__empty">No hay clientes en espera ni en atención.</p>}

                            <section>
                                <h4 className="acct-picker__group">Otro cliente</h4>
                                <form className="acct-picker__new" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) add({ new_client_name: newName.trim() }, newName.trim()); }}>
                                    <UserPlus size={16} />
                                    <input className="form-input" placeholder="Nombre (ej. el papá que acompaña)" value={newName}
                                        onChange={(e) => setNewName(e.target.value)} maxLength={60} />
                                    <button type="submit" className="btn btn--primary btn--sm" disabled={!newName.trim() || saving}>
                                        <Check size={14} /> Abrir cuenta
                                    </button>
                                </form>
                            </section>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
