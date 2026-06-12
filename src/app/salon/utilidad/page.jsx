'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import {
    TrendingUp, DollarSign, Scissors, Package, Wallet, Armchair, PiggyBank,
} from 'lucide-react';

export default function UtilidadPage() {
    const { tenantCurrency } = useStore();
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
    const [dateRange, setDateRange] = useState('month');
    const [customFrom, setCustomFrom] = useState(today);
    const [customTo, setCustomTo] = useState(today);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadReport(); }, [dateRange, customFrom, customTo]);

    async function loadReport() {
        if (dateRange === 'custom' && (!customFrom || !customTo)) return;
        setLoading(true);
        try {
            const url = dateRange === 'custom'
                ? `/api/salon/reports/profit?from=${customFrom}&to=${customTo}`
                : `/api/salon/reports/profit?range=${dateRange}`;
            const res = await fetch(url);
            if (res.ok) setData(await res.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }

    const fmt = (v) => new Intl.NumberFormat('es', { style: 'currency', currency: tenantCurrency || 'CLP', minimumFractionDigits: 0 }).format(Math.round(v || 0));
    const s = data?.summary;
    const utilColor = (v) => (v > 0 ? '#059669' : v < 0 ? '#EF4444' : 'var(--text-muted)');

    const initials = (name) => (name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

    const MODEL_BADGE = {
        commission: { bg: 'rgba(108,92,231,0.10)', color: '#6C5CE7' },
        rent: { bg: 'rgba(67,56,202,0.10)', color: '#4338CA' },
        per_service: { bg: 'rgba(2,132,199,0.10)', color: '#0284C7' },
        salary: { bg: 'rgba(217,119,6,0.10)', color: '#D97706' },
        mixed: { bg: 'rgba(219,39,119,0.10)', color: '#DB2777' },
        hourly: { bg: 'rgba(13,148,136,0.10)', color: '#0D9488' },
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">Reporte de Utilidad</h1>
                    <p className="page-header__subtitle">Ganancia real del salón por barbero y por productos</p>
                </div>
                <div className="chips">
                    {[{ id: 'today', label: 'Hoy' }, { id: 'week', label: 'Semana' }, { id: 'month', label: 'Mes' }, { id: 'year', label: 'Año' }, { id: 'custom', label: 'Personalizado' }].map(r => (
                        <button key={r.id} className={`chip ${dateRange === r.id ? 'chip--active' : ''}`} onClick={() => setDateRange(r.id)}>{r.label}</button>
                    ))}
                </div>
            </div>

            {dateRange === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>
                        Desde
                        <input type="date" className="input" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)} style={{ width: 'auto' }} />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>
                        Hasta
                        <input type="date" className="input" value={customTo} min={customFrom} onChange={e => setCustomTo(e.target.value)} style={{ width: 'auto' }} />
                    </label>
                </div>
            )}

            {loading ? <div className="loading-page"><div className="spinner spinner--lg" /></div> : <>

            {/* ── Tarjetas resumen ── */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-card__header">
                        <div><div className="stat-card__value">{fmt(s?.income)}</div><div className="stat-card__label">Ingresos del Salón</div></div>
                        <div className="stat-card__icon stat-card__icon--green"><DollarSign size={22} /></div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-card__header">
                        <div><div className="stat-card__value">{fmt(s?.barber_pay)}</div><div className="stat-card__label">Pago a Barberos</div></div>
                        <div className="stat-card__icon stat-card__icon--red"><Wallet size={22} /></div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-card__header">
                        <div><div className="stat-card__value">{fmt(s?.product_cost)}</div><div className="stat-card__label">Costo de Productos</div></div>
                        <div className="stat-card__icon stat-card__icon--blue"><Package size={22} /></div>
                    </div>
                </div>
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(5,150,105,0.08), rgba(5,150,105,0.02))', borderColor: 'rgba(5,150,105,0.25)' }}>
                    <div className="stat-card__header">
                        <div>
                            <div className="stat-card__value" style={{ color: utilColor(s?.total_utility) }}>{fmt(s?.total_utility)}</div>
                            <div className="stat-card__label">Utilidad Total · margen {s?.margin || 0}%</div>
                        </div>
                        <div className="stat-card__icon stat-card__icon--green"><PiggyBank size={22} /></div>
                    </div>
                </div>
            </div>

            {/* ── Desglose de utilidad ── */}
            <div className="rgrid rgrid--3" style={{ marginBottom: '20px' }}>
                <div className="card" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '6px' }}><Scissors size={15} /> Utilidad por Servicios / Arriendo</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: utilColor(s?.service_utility) }}>{fmt(s?.service_utility)}</div>
                    {s?.rent_income > 0 && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>incluye {fmt(s?.rent_income)} de arriendo de silla</div>}
                </div>
                <div className="card" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '6px' }}><Package size={15} /> Utilidad por Productos</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: utilColor(s?.product_profit) }}>{fmt(s?.product_profit)}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>de {fmt(s?.product_revenue)} en ventas</div>
                </div>
                <div className="card" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '6px' }}><TrendingUp size={15} /> Margen del Período</div>
                    <div style={{ fontSize: '20px', fontWeight: 800 }}>{s?.margin || 0}%</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>utilidad sobre ingresos</div>
                </div>
            </div>

            {/* ── Ganancias por Barbero ── */}
            <div className="card" style={{ marginBottom: '20px' }}>
                <div className="card__header"><h3 className="card__title">💈 Ganancias por Barbero</h3></div>
                <div className="card__body" style={{ overflowX: 'auto' }}>
                    {data?.barbers?.length > 0 ? (
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Barbero</th>
                                    <th>Modelo</th>
                                    <th style={{ textAlign: 'center' }}>Serv.</th>
                                    <th style={{ textAlign: 'right' }}>Ingreso Servicios</th>
                                    <th style={{ textAlign: 'right' }}>Recibe Barbero</th>
                                    <th style={{ textAlign: 'right' }}>Productos</th>
                                    <th style={{ textAlign: 'right' }}>Utilidad Salón</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.barbers.map((b) => {
                                    const badge = MODEL_BADGE[b.payment_mode] || MODEL_BADGE.commission;
                                    return (
                                        <tr key={b.id}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: b.color || 'var(--primary-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '11px', fontWeight: 600, flexShrink: 0 }}>
                                                        {b.avatar_url ? <img src={b.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : initials(b.name)}
                                                    </div>
                                                    {b.name}
                                                </div>
                                            </td>
                                            <td>
                                                <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '6px', background: badge.bg, color: badge.color, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    {b.is_rent && <Armchair size={12} />}{b.model_label}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>{b.service_count || 0}</td>
                                            <td style={{ textAlign: 'right' }}>{fmt(b.service_revenue)}</td>
                                            <td style={{ textAlign: 'right', color: b.is_rent ? 'var(--text-muted)' : 'inherit' }}>
                                                {b.is_rent
                                                    ? <span title="El barbero arrienda la silla y se queda con sus servicios">{fmt(b.barber_pay)}</span>
                                                    : fmt(b.barber_pay)}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>{b.product_revenue > 0 ? fmt(b.product_revenue) : '—'}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: utilColor(b.service_utility) }}>
                                                {fmt(b.service_utility)}
                                                {b.is_rent && <div style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)' }}>arriendo cobrado</div>}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {data.unassigned && (
                                    <tr>
                                        <td colSpan={3} style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin barbero asignado (mostrador)</td>
                                        <td style={{ textAlign: 'right' }}>{fmt(data.unassigned.service_revenue)}</td>
                                        <td style={{ textAlign: 'right' }}>—</td>
                                        <td style={{ textAlign: 'right' }}>{data.unassigned.product_revenue > 0 ? fmt(data.unassigned.product_revenue) : '—'}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 700, color: utilColor(data.unassigned.service_utility) }}>{fmt(data.unassigned.service_utility)}</td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid var(--gray-200)', fontWeight: 700 }}>
                                    <td colSpan={3}>Totales</td>
                                    <td style={{ textAlign: 'right' }}>{fmt(s?.service_revenue)}</td>
                                    <td style={{ textAlign: 'right' }}>{fmt(s?.barber_pay)}</td>
                                    <td style={{ textAlign: 'right' }}>{fmt(s?.product_revenue)}</td>
                                    <td style={{ textAlign: 'right', color: utilColor(s?.service_utility) }}>{fmt(s?.service_utility)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    ) : <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px' }}>Sin datos en el período</p>}
                </div>
            </div>

            {/* ── Ganancias por Producto ── */}
            <div className="card">
                <div className="card__header"><h3 className="card__title">📦 Ganancias por Producto</h3></div>
                <div className="card__body" style={{ overflowX: 'auto' }}>
                    {data?.products?.length > 0 ? (
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Producto</th>
                                    <th style={{ textAlign: 'center' }}>Vendidos</th>
                                    <th style={{ textAlign: 'right' }}>Ingreso</th>
                                    <th style={{ textAlign: 'right' }}>Costo</th>
                                    <th style={{ textAlign: 'right' }}>Utilidad</th>
                                    <th style={{ textAlign: 'right' }}>Margen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.products.map((p, i) => (
                                    <tr key={i}>
                                        <td style={{ fontWeight: 700, color: 'var(--primary-600)' }}>{i + 1}</td>
                                        <td>{p.name}</td>
                                        <td style={{ textAlign: 'center' }}>{p.quantity}</td>
                                        <td style={{ textAlign: 'right' }}>{fmt(p.revenue)}</td>
                                        <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{fmt(p.cost)}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 700, color: utilColor(p.profit) }}>{fmt(p.profit)}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <span className="badge" style={{ background: p.margin >= 0 ? 'rgba(5,150,105,0.10)' : 'rgba(239,68,68,0.10)', color: p.margin >= 0 ? '#059669' : '#EF4444' }}>{p.margin}%</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid var(--gray-200)', fontWeight: 700 }}>
                                    <td colSpan={3}>Totales</td>
                                    <td style={{ textAlign: 'right' }}>{fmt(s?.product_revenue)}</td>
                                    <td style={{ textAlign: 'right' }}>{fmt(s?.product_cost)}</td>
                                    <td style={{ textAlign: 'right', color: utilColor(s?.product_profit) }}>{fmt(s?.product_profit)}</td>
                                    <td style={{ textAlign: 'right' }}>{s?.product_revenue > 0 ? Math.round((s.product_profit / s.product_revenue) * 100) : 0}%</td>
                                </tr>
                            </tfoot>
                        </table>
                    ) : <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px' }}>Sin ventas de productos en el período</p>}
                </div>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '16px', lineHeight: 1.6 }}>
                <strong>Cómo se calcula:</strong> en barberos por <em>comisión</em> el salón gana el % restante del servicio; por <em>servicio/hora/salario</em> gana el ingreso menos lo pagado al barbero; en <em>arriendo de silla</em> el barbero se queda con sus servicios y el salón gana el arriendo cobrado en el período. La utilidad de productos es el precio de venta menos el costo. Solo se consideran ventas completadas registradas en el Punto de Venta.
            </p>

            </>}
        </div>
    );
}
