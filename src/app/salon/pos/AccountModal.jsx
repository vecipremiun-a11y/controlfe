'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Scissors, ShoppingBag, X, Trash2, Wallet, Info } from 'lucide-react';
import { alertDialog, confirmDialog } from '@/lib/dialog';

const STATE_LABEL = {
    waiting: 'En espera',
    in_service: 'En atención',
    booked: 'Reserva',
    done: 'Ya terminó su servicio',
    account: 'Cuenta abierta',
};

const fmtTime = (iso) => (iso
    ? new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Santiago' })
    : '');

// Cuenta de un cliente: su servicio (con los servicios extra que le hizo el
// barbero) y lo que fue consumiendo. Desde aquí se cobra (pasa al carrito) o
// se quita lo anotado por error.
//   onCharge(target, { includeService })   carga la cuenta en el carrito
export default function AccountModal({ target, fmt, onClose, onCharge, onChanged }) {
    const [detail, setDetail] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        const qs = target.appointmentId ? `appointment=${target.appointmentId}`
            : target.waitlistId ? `waitlist=${target.waitlistId}` : `tab=${target.tabId}`;
        try {
            const res = await fetch(`/api/salon/tabs?${qs}`, { cache: 'no-store' });
            const json = await res.json();
            setDetail(res.ok ? json : { error: json.error || 'No se pudo cargar la cuenta' });
        } catch {
            setDetail({ error: 'Revisa tu conexión e inténtalo de nuevo.' });
        }
    }, [target]);

    useEffect(() => { load(); }, [load]);

    const removeItem = async (item) => {
        if (busy) return;
        const ok = await confirmDialog({
            title: 'Quitar de la cuenta',
            message: `${item.quantity > 1 ? `${item.quantity} × ` : ''}${item.name} se quitará de la cuenta de ${detail.clientName}.`,
            confirmText: 'Quitar',
            cancelText: 'Volver',
            tone: 'danger',
        });
        if (!ok) return;
        setBusy(true);
        try {
            const res = await fetch('/api/salon/tabs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'remove', item_id: item.id }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) await alertDialog({ title: 'No se pudo quitar', message: json.error || 'Inténtalo de nuevo.', tone: 'warning' });
            await load();
            onChanged?.();
        } finally {
            setBusy(false);
        }
    };

    const charge = (includeService) => {
        onCharge(target, { includeService });
        onClose();
    };

    if (!detail) {
        return (
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal acct-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="acct-picker__loading"><div className="spinner" /></div>
                </div>
            </div>
        );
    }

    const services = detail.services || [];
    const extras = detail.extraServices || [];
    const products = detail.products || [];
    const hasProducts = products.length > 0;
    const collects = detail.professional ? detail.professional.salonCollects : true;
    // Lo de servicio que cobra el local ahora (principal y/o extras).
    const serviceDue = (detail.serviceChargeable ? detail.servicesTotal : 0) + (detail.extrasChargeable ? detail.extrasTotal : 0);
    const anyServiceDue = detail.serviceChargeable || detail.extrasChargeable;
    const total = serviceDue + detail.productsTotal;

    // Nota sobre los servicios según quién los cobra y en qué estado está.
    let serviceNote = null;
    if (services.length || extras.length) {
        if (!collects) serviceNote = `Los servicios los cobra ${detail.professional.name}: el local cobra solo el consumo`;
        else if (detail.state === 'waiting') serviceNote = 'Se cobran al terminar el servicio';
        else if (detail.serviceCharged && !detail.extrasChargeable) serviceNote = 'Servicio ya cobrado';
        else if (detail.serviceCharged) serviceNote = 'El servicio principal ya se cobró; falta el extra';
        else if (!anyServiceDue) serviceNote = 'No se cobra desde aquí';
    }

    return (
        <div className="modal-overlay" onClick={() => !busy && onClose()}>
            <div className="modal acct-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal__header">
                    <div>
                        <h3 className="modal__title"><ClipboardList size={18} /> Cuenta de {detail.clientName || 'cliente'}</h3>
                        {!detail.error && (
                            <p className="acct-modal__state">
                                {STATE_LABEL[detail.state] || ''}
                                {detail.professional?.name && detail.state !== 'account' ? ` · con ${detail.professional.name}` : ''}
                            </p>
                        )}
                    </div>
                    <button className="modal__close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
                </div>
                <div className="modal__body">
                    {detail.error ? (
                        <p className="acct-picker__error">{detail.error}</p>
                    ) : (
                        <>
                            {(services.length > 0 || extras.length > 0) && (
                                <section className="acct-modal__section">
                                    <h4 className="acct-picker__group">Servicio</h4>
                                    {services.map((s, i) => (
                                        <div key={`s-${i}`} className={`acct-modal__line${detail.serviceChargeable ? '' : ' acct-modal__line--muted'}`}>
                                            <span className="acct-modal__icon"><Scissors size={14} /></span>
                                            <span className="acct-modal__name">{s.name}</span>
                                            <span className="acct-modal__price">{fmt(s.price)}</span>
                                        </div>
                                    ))}
                                    {extras.map((item) => (
                                        <div key={item.id} className={`acct-modal__line${detail.extrasChargeable ? '' : ' acct-modal__line--muted'}`}>
                                            <span className="acct-modal__icon"><Scissors size={14} /></span>
                                            <span className="acct-modal__name">
                                                <span>{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ''} <em className="acct-modal__tag">Extra</em></span>
                                                <small>{fmtTime(item.addedAt)}{item.addedBy ? ` · ${item.addedBy}` : ''}</small>
                                            </span>
                                            <span className="acct-modal__price">{fmt(item.quantity * item.unitPrice)}</span>
                                            <button type="button" className="acct-modal__remove" disabled={busy} onClick={() => removeItem(item)}
                                                title="Quitar de la cuenta" aria-label={`Quitar ${item.name}`}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    {serviceNote && <p className="acct-modal__note"><Info size={13} /> {serviceNote}</p>}
                                </section>
                            )}

                            <section className="acct-modal__section">
                                <h4 className="acct-picker__group">Consumo</h4>
                                {!hasProducts ? (
                                    <p className="acct-modal__empty">Sin consumo anotado. Agrega productos al carrito y usa «Agregar a una cuenta».</p>
                                ) : products.map((item) => (
                                    <div key={item.id} className="acct-modal__line">
                                        <span className="acct-modal__icon"><ShoppingBag size={14} /></span>
                                        <span className="acct-modal__name">
                                            {item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ''}
                                            <small>{fmtTime(item.addedAt)}{item.addedBy ? ` · ${item.addedBy}` : ''}</small>
                                        </span>
                                        <span className="acct-modal__price">{fmt(item.quantity * item.unitPrice)}</span>
                                        <button type="button" className="acct-modal__remove" disabled={busy} onClick={() => removeItem(item)}
                                            title="Quitar de la cuenta" aria-label={`Quitar ${item.name}`}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </section>

                            <div className="acct-modal__total">
                                <span>{anyServiceDue ? 'Total a cobrar' : 'Consumo por cobrar'}</span>
                                <strong>{fmt(total)}</strong>
                            </div>
                        </>
                    )}
                </div>
                {!detail.error && (
                    <div className="modal__footer acct-modal__footer">
                        <button className="btn btn--outline" onClick={onClose}>Cerrar</button>
                        {anyServiceDue && hasProducts && (
                            <button className="btn btn--outline" onClick={() => charge(false)} title="Cobra solo lo consumido; los servicios quedan para después">
                                Solo consumo
                            </button>
                        )}
                        <button className="btn btn--primary" disabled={!(hasProducts || anyServiceDue)} onClick={() => charge(true)}>
                            <Wallet size={16} /> {anyServiceDue ? (hasProducts ? 'Cobrar servicio + consumo' : 'Cobrar servicio') : 'Cobrar consumo'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
