'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { Plus, Minus, Trash2, Search, ShoppingCart, CreditCard, Banknote, ArrowLeftRight, DollarSign, X } from 'lucide-react';

export default function POSPage() {
    const { user, tenantCurrency } = useStore();
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

    useEffect(() => { loadData(); }, []);

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

    function addToCart(item, type) {
        const existing = cart.find(c => c.item_id === item.id && c.type === type);
        if (existing) {
            setCart(cart.map(c => c.item_id === item.id && c.type === type ? { ...c, quantity: c.quantity + 1 } : c));
        } else {
            setCart([...cart, {
                id: Date.now(), item_id: item.id, type, name: item.name,
                unit_price: item.price, quantity: 1, total: item.price,
            }]);
        }
    }

    function updateQty(id, delta) {
        setCart(cart.map(c => {
            if (c.id === id) {
                const newQty = Math.max(1, c.quantity + delta);
                return { ...c, quantity: newQty, total: newQty * c.unit_price };
            }
            return c;
        }));
    }

    function removeFromCart(id) { setCart(cart.filter(c => c.id !== id)); }

    const subtotal = cart.reduce((sum, c) => sum + c.quantity * c.unit_price, 0);
    const discountAmount = (subtotal * discount) / 100;
    const total = subtotal - discountAmount + tip;

    const filteredItems = tab === 'services'
        ? services.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
        : products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

    async function handleCheckout() {
        try {
            const res = await fetch('/api/salon/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_name: clientName,
                    professional_id: professionalId,
                    items: cart.map(c => ({ ...c, professional_id: professionalId })),
                    payment_method: paymentMethod,
                    tip, discount: discountAmount, subtotal, total,
                }),
            });
            if (res.ok) {
                setCart([]);
                setClientName('');
                setTip(0);
                setDiscount(0);
                setShowCheckout(false);
                alert('¡Venta completada!');
            }
        } catch (e) { console.error(e); }
    }

    if (loading) return <div className="loading-page"><div className="spinner spinner--lg" /></div>;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', height: 'calc(100vh - 64px)', width: 'calc(100vw - var(--sidebar-width))', margin: '-28px', overflow: 'hidden', transition: 'width var(--transition-normal)' }}>
            {/* Left: Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px', overflow: 'hidden' }}>
                <div className="page-header" style={{ marginBottom: 0 }}>
                    <h1 className="page-header__title">Punto de Venta</h1>
                </div>

                <div className="tabs" style={{ marginBottom: 0 }}>
                    <button className={`tab ${tab === 'services' ? 'tab--active' : ''}`} onClick={() => setTab('services')}>Servicios</button>
                    <button className={`tab ${tab === 'products' ? 'tab--active' : ''}`} onClick={() => setTab('products')}>Productos</button>
                </div>

                <div style={{ position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="form-input" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '40px' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', overflow: 'auto', flex: 1, alignContent: 'start' }}>
                    {filteredItems.map(item => (
                        <div key={item.id} className="card" onClick={() => addToCart(item, tab === 'services' ? 'service' : 'product')}
                            style={{ cursor: 'pointer', transition: 'all 150ms', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary-400)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.transform = 'none'; }}>
                            <div className="card__body" style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <div style={{ width: '100%', aspectRatio: '1 / 1', maxHeight: '170px', borderRadius: '16px', overflow: 'hidden', marginBottom: '12px', background: 'rgba(243,244,246,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '16px', gap: '8px' }}>
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
            </div>

            {/* Right: Cart */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid var(--border-color)', background: 'white' }}>
                <div className="card__header">
                    <h3 className="card__title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ShoppingCart size={18} /> Carrito
                    </h3>
                    <span className="badge badge--purple">{cart.length}</span>
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

                    {/* Cart items */}
                    {cart.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                            <ShoppingCart size={32} style={{ opacity: 0.3 }} />
                            <p style={{ marginTop: '8px', fontSize: '14px' }}>Carrito vacío</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {cart.map(item => (
                                <div key={item.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '10px', background: 'var(--gray-50)', borderRadius: 'var(--radius-sm)',
                                }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{item.name}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                            {fmt(item.unit_price)} c/u
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <button className="btn btn--ghost btn--icon" style={{ width: '24px', height: '24px' }} onClick={() => updateQty(item.id, -1)}><Minus size={12} /></button>
                                        <span style={{ fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>{item.quantity}</span>
                                        <button className="btn btn--ghost btn--icon" style={{ width: '24px', height: '24px' }} onClick={() => updateQty(item.id, 1)}><Plus size={12} /></button>
                                    </div>
                                    <span style={{ fontWeight: 700, fontSize: '13px', minWidth: '60px', textAlign: 'right' }}>
                                        {fmt(item.quantity * item.unit_price)}
                                    </span>
                                    <button onClick={() => removeFromCart(item.id)} style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '2px' }}>
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Totals */}
                {cart.length > 0 && (
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

                        {/* Payment method */}
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                            {[
                                { id: 'cash', label: 'Efectivo', icon: Banknote },
                                { id: 'card', label: 'Tarjeta', icon: CreditCard },
                                { id: 'transfer', label: 'Transfer.', icon: ArrowLeftRight },
                            ].map(pm => (
                                <button key={pm.id} className={`btn btn--sm ${paymentMethod === pm.id ? 'btn--primary' : 'btn--outline'}`}
                                    onClick={() => setPaymentMethod(pm.id)} style={{ flex: 1, fontSize: '12px', padding: '8px 4px' }}>
                                    <pm.icon size={14} /> {pm.label}
                                </button>
                            ))}
                        </div>

                        <button className="btn btn--primary btn--block btn--lg" onClick={handleCheckout}>
                            <DollarSign size={18} /> Cobrar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
