'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import {
    Wallet, Plus, Clock, ArrowDownCircle, ArrowUpCircle, X, Lock,
    Check, Banknote, CreditCard, Landmark, Coins, ArrowRight, History,
} from 'lucide-react';

const MOVEMENT_TYPES = [
    { value: 'income', label: 'Ingreso', desc: 'Entra efectivo a la caja', sign: 1, color: '#059669' },
    { value: 'expense', label: 'Gasto', desc: 'Pago / compra desde la caja', sign: -1, color: '#EF4444' },
    { value: 'withdrawal', label: 'Retiro', desc: 'Sacas efectivo de la caja', sign: -1, color: '#D97706' },
    { value: 'deposit', label: 'Depósito', desc: 'Agregas efectivo (fondo)', sign: 1, color: '#2563EB' },
];

export default function CajaPage() {
    const { tenantCurrency, addToast } = useStore();
    const fmt = (v) => new Intl.NumberFormat('es', { style: 'currency', currency: tenantCurrency || 'CLP', minimumFractionDigits: 0 }).format(Math.round(v || 0));
    // created_at/opened_at vienen en UTC con espacio ("YYYY-MM-DD HH:MM:SS").
    // Normaliza a ISO UTC para que el navegador lo muestre en hora local.
    const dt = (s) => new Date((s || '').replace(' ', 'T') + 'Z');

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Apertura
    const [opening, setOpening] = useState('');
    // Modal movimiento
    const [movModal, setMovModal] = useState(false);
    const [movType, setMovType] = useState('expense');
    const [movAmount, setMovAmount] = useState('');
    const [movDesc, setMovDesc] = useState('');
    // Modal cierre
    const [closeModal, setCloseModal] = useState(false);
    const [actualAmount, setActualAmount] = useState('');
    const [closeNotes, setCloseNotes] = useState('');
    const [closeResult, setCloseResult] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/salon/cash-register', { cache: 'no-store' });
            if (res.ok) setData(await res.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const reg = data?.register;
    const sum = data?.summary;
    const sbm = data?.salesByMethod;

    async function post(body) {
        const res = await fetch('/api/salon/cash-register', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        return { ok: res.ok, json };
    }

    async function openCaja() {
        setSubmitting(true);
        const { ok, json } = await post({ action: 'open', opening_amount: parseFloat(opening) || 0 });
        setSubmitting(false);
        if (ok) { setOpening(''); addToast?.({ type: 'success', message: 'Caja abierta' }); load(); }
        else addToast?.({ type: 'error', message: json.error || 'Error' });
    }

    async function addMovement() {
        const amount = parseFloat(movAmount) || 0;
        if (amount <= 0) { addToast?.({ type: 'error', message: 'Ingresa un monto válido' }); return; }
        setSubmitting(true);
        const { ok, json } = await post({ action: 'movement', type: movType, amount, description: movDesc || null });
        setSubmitting(false);
        if (ok) {
            addToast?.({ type: 'success', message: 'Movimiento registrado' });
            setMovModal(false); setMovAmount(''); setMovDesc(''); setMovType('expense');
            load();
        } else addToast?.({ type: 'error', message: json.error || 'Error' });
    }

    async function closeCaja() {
        setSubmitting(true);
        const { ok, json } = await post({ action: 'close', actual_amount: parseFloat(actualAmount) || 0, notes: closeNotes || null });
        setSubmitting(false);
        if (ok) {
            setCloseResult(json.close);
            setCloseModal(false);
            setActualAmount(''); setCloseNotes('');
            load();
        } else addToast?.({ type: 'error', message: json.error || 'Error' });
    }

    const expected = sum?.expected || 0;
    const counted = parseFloat(actualAmount);
    const liveDiff = isNaN(counted) ? null : Math.round((counted - expected));

    if (loading) return <div className="loading-page"><div className="spinner spinner--lg" /></div>;

    // ── Resultado de cierre (después de cerrar) ──
    if (closeResult) {
        const diff = closeResult.difference;
        return (
            <div>
                <div className="page-header">
                    <div><h1 className="page-header__title">Caja Cerrada</h1><p className="page-header__subtitle">Resumen del cuadre de efectivo</p></div>
                </div>
                <div className="card" style={{ maxWidth: '480px', margin: '0 auto' }}>
                    <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '28px' }}>
                        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
                            <div style={{ width: '56px', height: '56px', borderRadius: '50%', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: diff === 0 ? 'rgba(5,150,105,0.10)' : 'rgba(239,68,68,0.10)', color: diff === 0 ? '#059669' : '#EF4444' }}>
                                {diff === 0 ? <Check size={28} /> : <Wallet size={28} />}
                            </div>
                            <h3 style={{ margin: 0, fontWeight: 800 }}>
                                {diff === 0 ? 'Caja cuadrada ✓' : diff > 0 ? `Sobrante de ${fmt(diff)}` : `Faltante de ${fmt(Math.abs(diff))}`}
                            </h3>
                        </div>
                        {[
                            ['Apertura', fmt(closeResult.opening)],
                            ['Ingresos en efectivo', fmt(closeResult.cashIn)],
                            ['Egresos / retiros', fmt(closeResult.cashOut)],
                            ['Esperado en caja', fmt(closeResult.expected)],
                            ['Contado (real)', fmt(closeResult.actual)],
                        ].map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', paddingBottom: '8px', borderBottom: '1px solid var(--gray-100)' }}>
                                <span style={{ color: 'var(--text-muted)' }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span>
                            </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 800 }}>
                            <span>Diferencia</span>
                            <span style={{ color: diff === 0 ? '#059669' : '#EF4444' }}>{diff > 0 ? '+' : ''}{fmt(diff)}</span>
                        </div>
                        <button className="btn btn--primary btn--block" onClick={() => setCloseResult(null)} style={{ marginTop: '8px' }}>
                            Entendido
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Sin caja abierta → apertura + historial ──
    if (!reg) {
        return (
            <div>
                <div className="page-header">
                    <div><h1 className="page-header__title">Caja</h1><p className="page-header__subtitle">Control de apertura y cierre de caja</p></div>
                </div>

                <div className="card" style={{ maxWidth: '440px', margin: '0 auto 24px' }}>
                    <div className="card__body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '28px', textAlign: 'center' }}>
                        <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(108,92,231,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6C5CE7' }}><Lock size={28} /></div>
                        <div>
                            <h2 style={{ fontSize: '19px', fontWeight: 800, margin: 0 }}>No tienes una caja abierta</h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px' }}>Abre tu caja con el efectivo inicial para empezar a registrar ventas y movimientos.</p>
                        </div>
                        <div style={{ width: '100%', textAlign: 'left' }}>
                            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Monto inicial (efectivo)</label>
                            <input type="number" min="0" value={opening} onChange={e => setOpening(e.target.value)} onKeyDown={e => e.key === 'Enter' && openCaja()} placeholder="0"
                                style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '20px', fontWeight: 700, textAlign: 'center' }} />
                        </div>
                        <button className="btn btn--primary btn--block btn--lg" onClick={openCaja} disabled={submitting}>
                            {submitting ? <div className="spinner spinner--sm" /> : <>Abrir Caja <ArrowRight size={18} /></>}
                        </button>
                    </div>
                </div>

                {data?.closings?.length > 0 && (
                    <div className="card">
                        <div className="card__header"><h3 className="card__title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><History size={18} /> Cierres recientes</h3></div>
                        <div className="card__body" style={{ overflowX: 'auto' }}>
                            <table className="table">
                                <thead><tr><th>Apertura</th><th>Cierre</th><th style={{ textAlign: 'right' }}>Apertura</th><th style={{ textAlign: 'right' }}>Esperado</th><th style={{ textAlign: 'right' }}>Contado</th><th style={{ textAlign: 'right' }}>Diferencia</th></tr></thead>
                                <tbody>
                                    {data.closings.map(c => (
                                        <tr key={c.id}>
                                            <td>{dt(c.opened_at).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                                            <td>{c.closed_at ? dt(c.closed_at).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                            <td style={{ textAlign: 'right' }}>{fmt(c.opening_amount)}</td>
                                            <td style={{ textAlign: 'right' }}>{fmt(c.expected_amount)}</td>
                                            <td style={{ textAlign: 'right' }}>{fmt(c.actual_amount)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: c.difference === 0 ? '#059669' : '#EF4444' }}>{c.difference > 0 ? '+' : ''}{fmt(c.difference)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ── Caja abierta ──
    const openedAt = dt(reg.opened_at);
    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">Caja</h1>
                    <p className="page-header__subtitle">Abierta el {openedAt.toLocaleString('es', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}{reg.user_name ? ` · ${reg.user_name}` : ''}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn--ghost" onClick={() => { setMovType('expense'); setMovModal(true); }}><Plus size={18} /> Movimiento</button>
                    <button className="btn btn--primary" onClick={() => { setCloseResult(null); setActualAmount(''); setCloseNotes(''); setCloseModal(true); }} style={{ background: '#DC2626' }}><Lock size={16} /> Cerrar Caja</button>
                </div>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-card__header"><div><div className="stat-card__value">{fmt(sum?.opening)}</div><div className="stat-card__label">Monto Apertura</div></div><div className="stat-card__icon stat-card__icon--blue"><Wallet size={22} /></div></div>
                </div>
                <div className="stat-card">
                    <div className="stat-card__header"><div><div className="stat-card__value" style={{ color: '#059669' }}>{fmt(sum?.cashIn)}</div><div className="stat-card__label">Ingresos en Efectivo</div></div><div className="stat-card__icon stat-card__icon--green"><ArrowDownCircle size={22} /></div></div>
                </div>
                <div className="stat-card">
                    <div className="stat-card__header"><div><div className="stat-card__value" style={{ color: '#EF4444' }}>{fmt(sum?.cashOut)}</div><div className="stat-card__label">Egresos / Retiros</div></div><div className="stat-card__icon stat-card__icon--red"><ArrowUpCircle size={22} /></div></div>
                </div>
                <div className="stat-card" style={{ borderColor: 'rgba(108,92,231,0.3)' }}>
                    <div className="stat-card__header"><div><div className="stat-card__value" style={{ color: 'var(--primary-700)' }}>{fmt(sum?.expected)}</div><div className="stat-card__label">Esperado en Caja</div></div><div className="stat-card__icon"><Wallet size={22} /></div></div>
                </div>
            </div>

            {/* Ventas por método de pago */}
            <div className="card" style={{ marginBottom: '20px' }}>
                <div className="card__header"><h3 className="card__title">Ventas de esta caja por método</h3><span className="badge badge--purple">{sbm?.count || 0} ventas</span></div>
                <div className="card__body">
                    <div className="rgrid rgrid--4">
                        {[
                            { k: 'cash', label: 'Efectivo', icon: Banknote, color: '#22C55E' },
                            { k: 'card', label: 'Tarjeta', icon: CreditCard, color: '#3B82F6' },
                            { k: 'transfer', label: 'Transferencia', icon: Landmark, color: '#A855F7' },
                            { k: 'mixed', label: 'Mixto', icon: Coins, color: '#EC4899' },
                        ].map(m => (
                            <div key={m.k} style={{ padding: '14px', borderRadius: '10px', background: 'var(--gray-50)', textAlign: 'center' }}>
                                <m.icon size={18} style={{ color: m.color }} />
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0' }}>{m.label}</div>
                                <div style={{ fontWeight: 700 }}>{fmt(sbm?.[m.k])}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Movimientos */}
            <div className="card">
                <div className="card__header"><h3 className="card__title">Movimientos de Efectivo</h3></div>
                <div className="card__body">
                    {data?.movements?.length > 0 ? (
                        <table className="table">
                            <thead><tr><th>Hora</th><th>Tipo</th><th>Detalle</th><th style={{ textAlign: 'right' }}>Monto</th></tr></thead>
                            <tbody>
                                {data.movements.map(m => {
                                    const t = MOVEMENT_TYPES.find(x => x.value === m.type) || MOVEMENT_TYPES[0];
                                    return (
                                        <tr key={m.id}>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{dt(m.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</td>
                                            <td><span className="badge" style={{ background: `${t.color}1A`, color: t.color }}>{t.label}</span></td>
                                            <td style={{ fontSize: '13px' }}>{m.description || (m.reference_type === 'sale' ? 'Venta' : m.reference_type === 'rent' ? 'Arriendo' : '—')}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: t.sign > 0 ? '#059669' : '#EF4444' }}>{t.sign > 0 ? '+' : '−'}{fmt(m.amount)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : (
                        <div className="empty-state" style={{ padding: '40px' }}>
                            <div className="empty-state__icon"><Clock size={28} /></div>
                            <p className="empty-state__title">Sin movimientos aún</p>
                            <p className="empty-state__text">Las ventas en efectivo y los cobros aparecerán aquí.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal: registrar movimiento */}
            {movModal && (
                <div className="barbershop__modal-overlay" onClick={() => !submitting && setMovModal(false)}>
                    <div className="checkin-modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
                        <div className="checkin-modal__header">
                            <h2 className="checkin-modal__title">Registrar movimiento</h2>
                            <button className="checkin-modal__close" onClick={() => setMovModal(false)}><X size={20} /></button>
                        </div>
                        <div className="checkin-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                {MOVEMENT_TYPES.map(t => (
                                    <button key={t.value} onClick={() => setMovType(t.value)}
                                        style={{ padding: '10px', borderRadius: '10px', textAlign: 'left', cursor: 'pointer', border: movType === t.value ? `2px solid ${t.color}` : '1px solid #D1D5DB', background: movType === t.value ? `${t.color}0F` : '#fff' }}>
                                        <div style={{ fontWeight: 700, fontSize: '13px', color: movType === t.value ? t.color : '#374151' }}>{t.label}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.desc}</div>
                                    </button>
                                ))}
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Monto</label>
                                <input type="number" min="0" value={movAmount} onChange={e => setMovAmount(e.target.value)} autoFocus
                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '20px', fontWeight: 700, textAlign: 'center' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Detalle (opcional)</label>
                                <input type="text" value={movDesc} onChange={e => setMovDesc(e.target.value)} placeholder="Ej: compra de insumos, retiro a banco..."
                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '13px' }} />
                            </div>
                        </div>
                        <div className="checkin-modal__footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button className="btn btn--ghost" onClick={() => setMovModal(false)} disabled={submitting}>Cancelar</button>
                            <button className="btn btn--primary" onClick={addMovement} disabled={submitting || !movAmount}>
                                {submitting ? <div className="spinner spinner--sm" /> : <><Check size={16} /> Registrar</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: cerrar caja */}
            {closeModal && (
                <div className="barbershop__modal-overlay" onClick={() => !submitting && setCloseModal(false)}>
                    <div className="checkin-modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
                        <div className="checkin-modal__header">
                            <h2 className="checkin-modal__title">Cerrar caja</h2>
                            <button className="checkin-modal__close" onClick={() => setCloseModal(false)}><X size={20} /></button>
                        </div>
                        <div className="checkin-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ padding: '14px', borderRadius: '10px', background: 'var(--gray-50)', display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Efectivo esperado en caja</span>
                                <strong style={{ fontSize: '16px' }}>{fmt(expected)}</strong>
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>¿Cuánto efectivo contaste?</label>
                                <input type="number" min="0" value={actualAmount} onChange={e => setActualAmount(e.target.value)} autoFocus placeholder="0"
                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '22px', fontWeight: 700, textAlign: 'center' }} />
                            </div>
                            {liveDiff !== null && (
                                <div style={{ padding: '12px', borderRadius: '10px', textAlign: 'center', fontWeight: 700, background: liveDiff === 0 ? 'rgba(5,150,105,0.08)' : 'rgba(239,68,68,0.08)', color: liveDiff === 0 ? '#059669' : '#EF4444' }}>
                                    {liveDiff === 0 ? 'Cuadra exacto ✓' : liveDiff > 0 ? `Sobran ${fmt(liveDiff)}` : `Faltan ${fmt(Math.abs(liveDiff))}`}
                                </div>
                            )}
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Nota de cierre (opcional)</label>
                                <input type="text" value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="Observaciones del turno..."
                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '13px' }} />
                            </div>
                        </div>
                        <div className="checkin-modal__footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button className="btn btn--ghost" onClick={() => setCloseModal(false)} disabled={submitting}>Cancelar</button>
                            <button className="btn btn--primary" onClick={closeCaja} disabled={submitting || actualAmount === ''} style={{ background: '#DC2626' }}>
                                {submitting ? <div className="spinner spinner--sm" /> : <><Lock size={16} /> Cerrar caja</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
