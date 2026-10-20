'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import {
    Plus, Minus, Search, ShoppingCart, CreditCard, Banknote, Landmark, Coins, DollarSign, X,
    Scissors, ShoppingBag, Armchair, CalendarCheck, ClipboardList,
} from 'lucide-react';
import { alertDialog } from '@/lib/dialog';
import { canAccess } from '@/lib/permissions';
import { usePolling } from '@/lib/usePolling';
import SaleReceiptModal from '@/components/SaleReceiptModal';
import BarbershopBoard from '../barbershop/BarbershopBoard';
import ReservationsPanel from './ReservationsPanel';
import AccountPickerModal from './AccountPickerModal';
import AccountModal from './AccountModal';

// Pestañas de Punto de Venta. Barbershop y Reservas solo para los roles que
// tienen acceso a esas secciones.
const POS_TABS = [
    { key: 'services', label: 'Servicios', icon: Scissors },
    { key: 'products', label: 'Productos', icon: ShoppingBag },
    { key: 'barbershop', label: 'Barbershop', icon: Armchair, requires: '/salon/barbershop', live: true },
    { key: 'reservas', label: 'Reservas', icon: CalendarCheck, requires: '/salon/agenda' },
];

export default function POSPage() {
    const { user, tenantCurrency, addToast } = useStore();
    const fmt = (v) => new Intl.NumberFormat('es', { style: 'currency', currency: tenantCurrency || 'USD', minimumFractionDigits: 0 }).format(v);
    const [services, setServices] = useState([]);
    const [products, setProducts] = useState([]);
    const [clients, setClients] = useState([]);
    const [professionals, setProfessionals] = useState([]);
    const [cart, setCart] = useState([]);
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState('services');
    const [loading, setLoading] = useState(true);
    const [clientName, setClientName] = useState('');
    const [professionalId, setProfessionalId] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [tip, setTip] = useState(0);
    const [discount, setDiscount] = useState(0);
    const [showCheckout, setShowCheckout] = useState(false);
    // Modal de método de pago (incluye pago mixto)
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [mixedMode, setMixedMode] = useState(false);
    const [mixedAmounts, setMixedAmounts] = useState({ cash: '', card: '', transfer: '' });
    // Sub-vista de efectivo: capturar monto recibido para calcular el vuelto.
    const [cashMode, setCashMode] = useState(false);
    const [cashReceived, setCashReceived] = useState('');
    const [checkingOut, setCheckingOut] = useState(false);
    // En móvil el carrito se muestra como panel inferior deslizante
    const [showCartMobile, setShowCartMobile] = useState(false);
    // Cuentas de clientes cargadas en el carrito (una o varias: ej. un padre que
    // paga lo de sus hijos). Cada línea que viene de una cuenta lleva su linkKey.
    const [links, setLinks] = useState([]);   // [{ key, clientName, label, appointmentId }]
    const [reservations, setReservations] = useState(null);
    const [showPicker, setShowPicker] = useState(false);
    const [accountTarget, setAccountTarget] = useState(null);
    const [receipt, setReceipt] = useState(null);
    // Avisa a Barbershop que refresque (se cobró o se anotó algo).
    const [boardSignal, setBoardSignal] = useState(0);

    const tabs = POS_TABS.filter(t => !t.requires || canAccess(user?.role, t.requires));
    const canReservations = tabs.some(t => t.key === 'reservas');

    useEffect(() => { loadData(); }, []);

    // ?tab=barbershop | reservas | products abre esa pestaña (enlaces y recarga).
    useEffect(() => {
        const wanted = new URLSearchParams(window.location.search).get('tab');
        if (wanted && POS_TABS.some(t => t.key === wanted)) setTab(wanted);
    }, []);

    function changeTab(key) {
        setTab(key);
        setSearch('');
        const url = key === 'services' ? window.location.pathname : `${window.location.pathname}?tab=${key}`;
        window.history.replaceState(null, '', url);
    }

    // Reservas web y de la app: se consultan siempre (contador de la pestaña).
    const loadReservations = useCallback(async () => {
        try {
            const res = await fetch('/api/salon/reservations', { cache: 'no-store' });
            if (res.ok) setReservations(await res.json());
        } catch { /* sin conexión: se reintenta en la próxima consulta */ }
    }, []);
    useEffect(() => {
        if (canReservations) loadReservations();
    }, [canReservations, loadReservations]);
    usePolling(loadReservations, tab === 'reservas' ? 10000 : 20000, canReservations);
    const reservationsBadge = (reservations?.items || [])
        .filter(i => i.status === 'reservado' || i.needsCharge || i.attention).length;

    async function loadData() {
        try {
            const [svcsRes, prodsRes, clientsRes, profsRes] = await Promise.all([
                fetch('/api/salon/services'),
                fetch('/api/salon/products'),
                fetch('/api/salon/clients'),
                fetch('/api/salon/professionals'),
            ]);
            if (svcsRes.ok) { const d = await svcsRes.json(); setServices(d.services || []); }
            if (prodsRes.ok) { const d = await prodsRes.json(); setProducts(d.products || []); }
            if (clientsRes.ok) { const d = await clientsRes.json(); setClients(d.clients || []); }
            if (profsRes.ok) { const d = await profsRes.json(); setProfessionals(d.professionals || []); }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }

    const newLineId = () => crypto.randomUUID();

    // Líneas sueltas: lo que se agregó desde Servicios o Productos (no viene de
    // una cuenta). Son las que se pueden anotar en la cuenta de un cliente.
    const looseItems = cart.filter(c => !c.linkKey);

    function addToCart(item, type) {
        const existing = cart.find(c => !c.linkKey && c.item_id === item.id && c.type === type);
        if (existing) {
            setCart(cart.map(c => c.id === existing.id ? { ...c, quantity: c.quantity + 1 } : c));
        } else {
            setCart([...cart, {
                id: newLineId(), item_id: item.id, type, name: item.name,
                unit_price: item.price, quantity: 1, total: item.price,
            }]);
        }
    }

    function updateQty(id, delta) {
        setCart(cart.map(c => {
            // Lo anotado en una cuenta se cobra tal como se anotó.
            if (c.id === id && !c.tab_item_id) {
                const newQty = Math.max(1, c.quantity + delta);
                return { ...c, quantity: newQty, total: newQty * c.unit_price };
            }
            return c;
        }));
    }

    function removeFromCart(id) {
        const removed = cart.find(c => c.id === id);
        const rest = cart.filter(c => c.id !== id);
        setCart(rest);
        if (removed?.linkKey && !rest.some(c => c.linkKey === removed.linkKey)) {
            setLinks(prev => prev.filter(l => l.key !== removed.linkKey));
        }
    }

    function unlinkAccount(key) {
        setCart(prev => prev.filter(c => c.linkKey !== key));
        setLinks(prev => prev.filter(l => l.key !== key));
    }

    // Carga la cuenta de un cliente en el carrito: su servicio (si le
    // corresponde cobrarlo al salón y se pidió) y lo que tiene anotado. Se suma
    // a lo que ya haya en el carrito, así se pueden cobrar varias cuentas juntas.
    // target: { appointmentId } | { waitlistId } | { tabId }
    async function loadAccount(target, { includeService = true, label = null } = {}) {
        const qs = target.appointmentId ? `appointment=${target.appointmentId}`
            : target.waitlistId ? `waitlist=${target.waitlistId}` : `tab=${target.tabId}`;
        let detail;
        try {
            const res = await fetch(`/api/salon/tabs?${qs}`, { cache: 'no-store' });
            detail = await res.json();
            if (!res.ok) throw new Error(detail.error);
        } catch (e) {
            alertDialog({ title: 'No se pudo cargar la cuenta', message: e.message || 'Revisa tu conexión e inténtalo de nuevo.', tone: 'danger' });
            return;
        }
        if (links.some(l => l.key === detail.key)) {
            addToast({ type: 'info', message: `La cuenta de ${detail.clientName} ya está en el carrito` });
            setShowCartMobile(true);
            return;
        }
        const withService = includeService && detail.serviceChargeable;
        const withExtras = includeService && detail.extrasChargeable;
        // Servicios y consumo van al barbero que lo atiende solo si el salón
        // cobra sus servicios (así se hacía en Barbershop); si no, es venta del local.
        const barber = detail.appointmentId && detail.professional?.salonCollects ? detail.professional.id : null;
        const lines = [];
        if (withService) {
            for (const s of detail.services) {
                lines.push({
                    id: newLineId(), item_id: s.item_id, type: 'service', name: s.name, unit_price: s.price, quantity: 1,
                    professional_id: s.professional_id, appointment_id: detail.appointmentId, linkKey: detail.key,
                });
            }
        }
        // Servicios extra que hizo el barbero (anotados en la cuenta).
        if (withExtras) {
            for (const i of detail.extraServices) {
                lines.push({
                    id: newLineId(), item_id: i.itemId, type: 'service', name: i.name, unit_price: i.unitPrice, quantity: i.quantity,
                    professional_id: barber, tab_item_id: i.id, linkKey: detail.key, extra: true,
                });
            }
        }
        for (const i of detail.products) {
            lines.push({
                id: newLineId(), item_id: i.itemId, type: 'product', name: i.name, unit_price: i.unitPrice, quantity: i.quantity,
                professional_id: barber, tab_item_id: i.id, linkKey: detail.key,
            });
        }
        if (!lines.length) {
            alertDialog({
                title: 'Nada que cobrar',
                message: detail.professional && !detail.professional.salonCollects
                    ? `El servicio lo cobra ${detail.professional.name} y ${detail.clientName} no tiene consumo anotado.`
                    : `${detail.clientName} no tiene nada pendiente por cobrar.`,
                tone: 'warning',
            });
            return;
        }
        const anyService = withService || withExtras;
        const what = anyService ? (detail.products.length ? 'Servicio + consumo' : 'Servicio') : 'Consumo';
        setCart(prev => [...prev, ...lines]);
        setLinks(prev => [...prev, {
            key: detail.key, clientName: detail.clientName,
            label: label || `${what}${detail.professional?.name && anyService ? ` · ${detail.professional.name}` : ''}`,
            appointmentId: withService ? detail.appointmentId : null,
        }]);
        setClientName(prev => prev || detail.clientName);
        if (withService && detail.professional?.id) setProfessionalId(prev => prev || detail.professional.id);
        setShowCartMobile(true);
        addToast({ type: 'success', message: links.length ? `Se sumó la cuenta de ${detail.clientName}` : `Cuenta de ${detail.clientName} lista para cobrar` });
    }

    // Cobrar una reserva (web o app): igual que una cuenta, con su servicio.
    function chargeReservation(item) {
        return loadAccount({ appointmentId: item.id }, {
            label: `Reserva ${item.source === 'app' ? 'de la app' : 'online'} · ${item.start}`,
        });
    }

    function refreshAfterChange() {
        setBoardSignal(n => n + 1);
        if (canReservations) loadReservations();
    }

    const subtotal = cart.reduce((sum, c) => sum + c.quantity * c.unit_price, 0);
    const discountAmount = (subtotal * discount) / 100;
    const total = subtotal - discountAmount + tip;

    const filteredItems = tab === 'services'
        ? services.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
        : products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

    async function handleCheckout(method = paymentMethod, details = null) {
        if (cart.length === 0) return;
        setCheckingOut(true);
        try {
            const res = await fetch('/api/salon/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_name: clientName,
                    professional_id: professionalId,
                    // Lo que viene de una cuenta ya trae su barbero (o ninguno); lo suelto va al elegido arriba.
                    items: cart.map(c => ({ ...c, professional_id: c.linkKey ? (c.professional_id || null) : (professionalId || null) })),
                    payment_method: method,
                    payment_details: details,
                    tip, discount: discountAmount, subtotal, total,
                    appointment_id: links.find(l => l.appointmentId)?.appointmentId || null,
                }),
            });
            if (res.ok) {
                const { sale } = await res.json().catch(() => ({}));
                // Citas cobradas: quedan terminadas (si es de la app, el servidor le avisa).
                const finished = links.filter(l => l.appointmentId).map(l => l.appointmentId);
                Promise.all(finished.map(id => fetch(`/api/salon/appointments?id=${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'terminado' }),
                }).catch(() => {}))).finally(refreshAfterChange);
                setLinks([]);
                setCart([]);
                setClientName('');
                setTip(0);
                setDiscount(0);
                setShowCheckout(false);
                setShowPaymentModal(false);
                setMixedMode(false);
                setMixedAmounts({ cash: '', card: '', transfer: '' });
                setCashMode(false);
                setCashReceived('');
                setShowCartMobile(false);
                addToast({ type: 'success', message: 'Venta registrada en tu caja' });
                if (sale) setReceipt(sale);
            } else {
                const err = await res.json().catch(() => ({}));
                // Otra caja ya cobró parte de una cuenta del carrito.
                if (res.status === 409 && err.code === 'TAB_CHANGED') {
                    alertDialog({ title: 'La cuenta cambió', message: `${err.error} Quita la cuenta del carrito y vuelve a cargarla.`, tone: 'warning' });
                    refreshAfterChange();
                    return;
                }
                // Sin caja abierta: avisar y recargar para mostrar el bloqueo de caja.
                if (res.status === 409 && err.code === 'NO_REGISTER') {
                    await alertDialog({ title: 'Caja cerrada', message: err.error || 'Debes abrir una caja antes de vender.', tone: 'warning' });
                    window.location.reload();
                    return;
                }
                alertDialog({ title: 'No se pudo completar la venta', message: err.error || 'Inténtalo de nuevo.', tone: 'danger' });
            }
        } catch (e) { console.error(e); alertDialog({ title: 'Error de conexión', message: 'Revisa tu conexión a internet e inténtalo de nuevo.', tone: 'danger' }); }
        finally { setCheckingOut(false); }
    }

    if (loading) return <div className="loading-page"><div className="spinner spinner--lg" /></div>;

    const header = (
        <div className="pos-head">
            <h1 className="page-header__title">Punto de Venta</h1>
            <div className="pos-tabs" role="tablist">
                {tabs.map(t => {
                    const Icon = t.icon;
                    const count = t.key === 'reservas' ? reservationsBadge : 0;
                    return (
                        <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
                            className={`pos-tab${tab === t.key ? ' pos-tab--active' : ''}`} onClick={() => changeTab(t.key)}>
                            <Icon size={16} />
                            <span>{t.label}</span>
                            {t.live && <span className="pos-tab__live" title="En vivo" />}
                            {count > 0 && <span className="pos-tab__badge">{count}</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    const linesOf = (key) => cart.filter(c => c.linkKey === key);
    const proName = (id) => professionals.find(p => p.id === id)?.name;

    return (
        <div className="pos-layout">
            {/* Left: Items */}
            <div className={`pos-items${tab === 'barbershop' ? ' pos-items--board' : ''}`}>
                {header}

                {tab === 'barbershop' ? (
                    <BarbershopBoard
                        onCharge={(target) => loadAccount(target, { includeService: true })}
                        onOpenAccount={setAccountTarget}
                        reloadSignal={boardSignal}
                    />
                ) : tab === 'reservas' ? (
                    <ReservationsPanel data={reservations} onChanged={loadReservations} onCharge={chargeReservation}
                        inCartIds={cart.map(c => c.appointment_id).filter(Boolean)} fmt={fmt} />
                ) : (
                <>
                <div style={{ position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="form-input" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '40px' }} />
                </div>

                <div className="pos-grid">
                    {filteredItems.map(item => (
                        <div key={item.id} className="card" onClick={() => addToCart(item, tab === 'services' ? 'service' : 'product')}
                            style={{ cursor: 'pointer', transition: 'all 150ms', display: 'flex', flexDirection: 'column' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary-400)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.transform = 'none'; }}>
                            <div className="card__body" style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ width: '100%', height: 'clamp(110px, 14vw, 160px)', borderRadius: '16px', overflow: 'hidden', marginBottom: '12px', background: 'rgba(243,244,246,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    {item.image_url ? (
                                        <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5', fontSize: '24px', fontWeight: 700 }}>
                                            {item.name?.charAt(0) || '?'}
                                        </div>
                                    )}
                                </div>
                                <div style={{ textAlign: 'center', marginBottom: 'auto' }}>
                                    <div style={{ fontWeight: 700, fontSize: '15px', lineHeight: 1.3 }}>{item.name}</div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '12px', gap: '8px', flexShrink: 0 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Precio</span>
                                        <span style={{ fontWeight: 700, color: 'var(--primary-600)', whiteSpace: 'nowrap' }}>{fmt(item.price)}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 0, textAlign: 'right' }}>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Existencias</span>
                                        <span style={{ fontWeight: 700, color: item.stock !== undefined && item.stock <= 0 ? 'var(--accent-red)' : 'var(--text-title)' }}>{item.stock !== undefined ? item.stock : '—'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                </>
                )}
            </div>

            {/* Backdrop del carrito en móvil */}
            {showCartMobile && <div className="pos-cart__backdrop" onClick={() => setShowCartMobile(false)} />}

            {/* Right: Cart */}
            <div className={`pos-cart ${showCartMobile ? 'pos-cart--open' : ''}`}>
                <div className="card__header">
                    <h3 className="card__title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ShoppingCart size={18} /> Carrito
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="badge badge--purple">{cart.length}</span>
                        <button className="pos-cart__close header__icon-btn" onClick={() => setShowCartMobile(false)} aria-label="Cerrar carrito" style={{ width: '32px', height: '32px' }}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="card__body" style={{ flex: 1, overflow: 'auto', padding: '12px 24px' }}>
                    {/* Client */}
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                        <input className="form-input" placeholder="Cliente (opcional)" value={clientName} onChange={e => setClientName(e.target.value)} list="pos-clients" style={{ fontSize: '13px' }} />
                        <datalist id="pos-clients">
                            {clients.map(c => <option key={c.id} value={c.name} />)}
                        </datalist>
                    </div>

                    <div className="form-group" style={{ marginBottom: '12px' }}>
                        <select className="form-input form-select" value={professionalId} onChange={e => setProfessionalId(e.target.value)} style={{ fontSize: '13px' }}>
                            <option value="">Profesional (opcional)</option>
                            {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>

                    {/* Cart items: primero cada cuenta cargada, después lo suelto */}
                    {cart.length === 0 ? (
                        <div className="pos-cart__empty">
                            <ShoppingCart size={32} />
                            <p>Carrito vacío</p>
                            <span>Agrega servicios o productos, o envía a cobro desde Barbershop o Reservas.</span>
                        </div>
                    ) : (
                        <div className="pos-cart__lines">
                            {links.map(link => (
                                <div key={link.key} className="pos-cart__account">
                                    <div className="pos-cart__account-head">
                                        <ClipboardList size={16} />
                                        <div className="pos-cart__account-info">
                                            <strong>{link.clientName}</strong>
                                            <span>{link.label}</span>
                                        </div>
                                        <button type="button" onClick={() => unlinkAccount(link.key)}
                                            aria-label={`Quitar la cuenta de ${link.clientName} del carrito`} title="Quitar del carrito (la cuenta sigue abierta)">
                                            <X size={14} />
                                        </button>
                                    </div>
                                    {linesOf(link.key).map(item => (
                                        <div key={item.id} className="pos-cart__line pos-cart__line--account">
                                            <div className="pos-cart__line-info">
                                                <span className="pos-cart__line-name">
                                                    {item.type === 'service' ? <Scissors size={12} /> : <ShoppingBag size={12} />} {item.name}
                                                </span>
                                                <span className="pos-cart__line-meta">
                                                    {item.type === 'service'
                                                        ? `${item.extra ? 'Servicio extra' : 'Servicio'}${proName(item.professional_id) ? ` · ${proName(item.professional_id)}` : ''}`
                                                        : 'Consumo anotado'}
                                                    {item.quantity > 1 ? ` · ${item.quantity} × ${fmt(item.unit_price)}` : ''}
                                                </span>
                                            </div>
                                            <span className="pos-cart__line-total">{fmt(item.quantity * item.unit_price)}</span>
                                            <button className="pos-cart__line-remove" onClick={() => removeFromCart(item.id)}
                                                aria-label={`Quitar ${item.name}`} title="No cobrar ahora (sigue en la cuenta)">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ))}
                            {looseItems.map(item => (
                                <div key={item.id} className="pos-cart__line">
                                    <div className="pos-cart__line-info">
                                        <span className="pos-cart__line-name">{item.name}</span>
                                        <span className="pos-cart__line-meta">{fmt(item.unit_price)} c/u</span>
                                    </div>
                                    <div className="pos-cart__qty">
                                        <button className="btn btn--ghost btn--icon" onClick={() => updateQty(item.id, -1)} aria-label="Menos"><Minus size={12} /></button>
                                        <span>{item.quantity}</span>
                                        <button className="btn btn--ghost btn--icon" onClick={() => updateQty(item.id, 1)} aria-label="Más"><Plus size={12} /></button>
                                    </div>
                                    <span className="pos-cart__line-total">{fmt(item.quantity * item.unit_price)}</span>
                                    <button className="pos-cart__line-remove" onClick={() => removeFromCart(item.id)} aria-label={`Quitar ${item.name}`}>
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Totals (siempre visibles) */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                            <span>Subtotal</span>
                            <span>{fmt(subtotal)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '13px', minWidth: '70px' }}>Descuento %</span>
                            <input type="number" className="form-input" value={discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} min="0" max="100" style={{ width: '70px', padding: '4px 8px', fontSize: '13px' }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '13px', minWidth: '70px' }}>Propina</span>
                            <input type="number" className="form-input" value={tip} onChange={e => setTip(parseFloat(e.target.value) || 0)} min="0" style={{ width: '70px', padding: '4px 8px', fontSize: '13px' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '18px', marginBottom: '12px', color: 'var(--primary-700)' }}>
                            <span>Total</span>
                            <span>{fmt(total)}</span>
                        </div>

                        <button className="btn btn--primary btn--block btn--lg" disabled={checkingOut || cart.length === 0}
                            onClick={() => { setMixedMode(false); setMixedAmounts({ cash: '', card: '', transfer: '' }); setCashMode(false); setCashReceived(''); setShowPaymentModal(true); }}>
                            <DollarSign size={18} /> {checkingOut ? 'Procesando...' : `Cobrar ${fmt(total)}`}
                        </button>
                        {/* Lo suelto del carrito se anota en la cuenta de un cliente y se cobra después */}
                        <button className="btn btn--outline btn--block pos-cart__to-account" disabled={checkingOut || looseItems.length === 0}
                            onClick={() => setShowPicker(true)}
                            title={looseItems.length ? 'Anotar en la cuenta de un cliente para cobrarlo después' : 'Agrega productos o servicios al carrito'}>
                            <ClipboardList size={16} /> Agregar a una cuenta
                        </button>
                    </div>
            </div>

            {/* Botón flotante del carrito (solo móvil) */}
            {!showCartMobile && (
                <button className="pos-cart-fab" onClick={() => setShowCartMobile(true)}>
                    <span className="pos-cart-fab__label">
                        <ShoppingCart size={18} />
                        Ver carrito
                        <span className="pos-cart-fab__count">{cart.length}</span>
                    </span>
                    <span>{fmt(total)}</span>
                </button>
            )}

            {/* Modal de método de pago */}
            {showPaymentModal && (
                <div className="pay-modal__overlay" onClick={() => !checkingOut && setShowPaymentModal(false)}>
                    <div className="pay-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="pay-modal__header">
                            <h3>Seleccionar método de pago</h3>
                            <button onClick={() => !checkingOut && setShowPaymentModal(false)} disabled={checkingOut}>
                                <X size={20} />
                            </button>
                        </div>

                        <p className="pay-modal__subtitle">
                            Elige cómo quieres procesar el pago por <strong>{fmt(total)}</strong>
                        </p>

                        {cashMode ? (
                            <div className="pay-modal__mixed">
                                <div className="pay-modal__mixed-row">
                                    <span className="pay-modal__mixed-icon" style={{ color: '#22C55E', background: '#22C55E1A' }}>
                                        <Banknote size={18} />
                                    </span>
                                    <span className="pay-modal__mixed-label">Recibido</span>
                                    <input type="number" min="0" autoFocus value={cashReceived}
                                        onChange={(e) => setCashReceived(e.target.value)} placeholder="0" />
                                </div>
                                {(() => {
                                    const received = parseFloat(cashReceived) || 0;
                                    const change = received - total;
                                    const enough = received >= total;
                                    return (
                                        <>
                                            <div className={`pay-modal__mixed-balance ${enough ? 'pay-modal__mixed-balance--ok' : ''}`}>
                                                <span>{enough ? 'Vuelto a entregar' : 'Falta'}</span>
                                                <strong>{fmt(Math.abs(change))}</strong>
                                            </div>
                                            <div className="pay-modal__mixed-actions">
                                                <button className="pay-modal__back-btn" onClick={() => setCashMode(false)} disabled={checkingOut}>
                                                    Volver
                                                </button>
                                                <button className="pay-modal__confirm-btn" disabled={!enough || checkingOut}
                                                    onClick={() => handleCheckout('cash', { cash: total, received })}>
                                                    {checkingOut ? 'Procesando...' : `Cobrar ${fmt(total)}`}
                                                </button>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        ) : !mixedMode ? (
                            <div className="pay-modal__grid">
                                {[
                                    { key: 'cash', icon: Banknote, label: 'Efectivo', desc: 'Pago en efectivo', color: '#22C55E' },
                                    { key: 'card', icon: CreditCard, label: 'Tarjeta', desc: 'Débito o crédito', color: '#3B82F6' },
                                    { key: 'transfer', icon: Landmark, label: 'Transferencia', desc: 'Transferencia bancaria', color: '#A855F7' },
                                    { key: 'mixed', icon: Coins, label: 'Pago Mixto', desc: 'Combinar métodos', color: '#EC4899' },
                                ].map(pm => (
                                    <button
                                        key={pm.key}
                                        className="pay-modal__option"
                                        disabled={checkingOut}
                                        onClick={() => {
                                            if (pm.key === 'mixed') { setMixedMode(true); return; }
                                            if (pm.key === 'cash') { setPaymentMethod('cash'); setCashReceived(String(Math.round(total))); setCashMode(true); return; }
                                            setPaymentMethod(pm.key);
                                            handleCheckout(pm.key);
                                        }}
                                    >
                                        <span className="pay-modal__option-icon" style={{ color: pm.color, background: `${pm.color}1A` }}>
                                            <pm.icon size={26} />
                                        </span>
                                        <span className="pay-modal__option-label">{pm.label}</span>
                                        <span className="pay-modal__option-desc">{pm.desc}</span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="pay-modal__mixed">
                                {[
                                    { key: 'cash', icon: Banknote, label: 'Efectivo', color: '#22C55E' },
                                    { key: 'card', icon: CreditCard, label: 'Tarjeta', color: '#3B82F6' },
                                    { key: 'transfer', icon: Landmark, label: 'Transferencia', color: '#A855F7' },
                                ].map(pm => (
                                    <div key={pm.key} className="pay-modal__mixed-row">
                                        <span className="pay-modal__mixed-icon" style={{ color: pm.color, background: `${pm.color}1A` }}>
                                            <pm.icon size={18} />
                                        </span>
                                        <span className="pay-modal__mixed-label">{pm.label}</span>
                                        <input
                                            type="number"
                                            min="0"
                                            placeholder="0"
                                            value={mixedAmounts[pm.key]}
                                            onChange={(e) => setMixedAmounts(prev => ({ ...prev, [pm.key]: e.target.value }))}
                                        />
                                    </div>
                                ))}

                                {(() => {
                                    const sum = ['cash', 'card', 'transfer'].reduce((a, k) => a + (parseFloat(mixedAmounts[k]) || 0), 0);
                                    const diff = total - sum;
                                    const ok = Math.abs(diff) < 0.01;
                                    return (
                                        <>
                                            <div className={`pay-modal__mixed-balance ${ok ? 'pay-modal__mixed-balance--ok' : ''}`}>
                                                <span>{ok ? 'Cuadra con el total' : diff > 0 ? 'Falta por asignar' : 'Excede el total'}</span>
                                                <strong>{fmt(Math.abs(diff))}</strong>
                                            </div>
                                            <div className="pay-modal__mixed-actions">
                                                <button className="pay-modal__back-btn" onClick={() => setMixedMode(false)} disabled={checkingOut}>
                                                    Volver
                                                </button>
                                                <button
                                                    className="pay-modal__confirm-btn"
                                                    disabled={!ok || checkingOut}
                                                    onClick={() => { setPaymentMethod('mixed'); handleCheckout('mixed', { cash: parseFloat(mixedAmounts.cash) || 0, card: parseFloat(mixedAmounts.card) || 0, transfer: parseFloat(mixedAmounts.transfer) || 0 }); }}
                                                >
                                                    {checkingOut ? 'Procesando...' : `Cobrar ${fmt(total)}`}
                                                </button>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showPicker && (
                <AccountPickerModal
                    items={looseItems}
                    fmt={fmt}
                    onClose={() => setShowPicker(false)}
                    onDone={({ clientName: who }) => {
                        setShowPicker(false);
                        setCart(prev => prev.filter(c => c.linkKey));
                        addToast({ type: 'success', message: `Anotado en la cuenta de ${who}` });
                        refreshAfterChange();
                    }}
                />
            )}

            {accountTarget && (
                <AccountModal
                    target={accountTarget}
                    fmt={fmt}
                    onClose={() => setAccountTarget(null)}
                    onCharge={(target, opts) => loadAccount(target, opts)}
                    onChanged={refreshAfterChange}
                />
            )}

            {receipt && (
                <SaleReceiptModal sale={receipt} currency={receipt.tenant_currency || tenantCurrency} onClose={() => setReceipt(null)} />
            )}
        </div>
    );
}
