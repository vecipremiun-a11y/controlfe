'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { BarChart3, TrendingUp, Users, Calendar, DollarSign, Scissors, Package } from 'lucide-react';

export default function ReportesPage() {
    const { user, tenantCurrency } = useStore();
    const [dateRange, setDateRange] = useState('month');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadReport(); }, [dateRange]);

    async function loadReport() {
        setLoading(true);
        try {
            const res = await fetch(`/api/salon/reports?range=${dateRange}`);
            if (res.ok) { const d = await res.json(); setData(d); }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }

    const fmt = (v) => new Intl.NumberFormat('es', { style: 'currency', currency: tenantCurrency || 'USD', minimumFractionDigits: 0 }).format(v || 0);

    if (loading) return <div className="loading-page"><div className="spinner spinner--lg" /></div>;

    return (
        <div>
            <div className="page-header">
                <div><h1 className="page-header__title">Reportes</h1><p className="page-header__subtitle">Análisis de rendimiento de tu salón</p></div>
                <div className="chips">
                    {[{ id: 'today', label: 'Hoy' }, { id: 'week', label: 'Semana' }, { id: 'month', label: 'Mes' }, { id: 'year', label: 'Año' }].map(r => (
                        <button key={r.id} className={`chip ${dateRange === r.id ? 'chip--active' : ''}`} onClick={() => setDateRange(r.id)}>{r.label}</button>
                    ))}
                </div>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-card__header"><div><div className="stat-card__value">{fmt(data?.totalSales)}</div><div className="stat-card__label">Ventas Totales</div></div><div className="stat-card__icon stat-card__icon--green"><DollarSign size={22} /></div></div>
                </div>
                <div className="stat-card">
                    <div className="stat-card__header"><div><div className="stat-card__value">{data?.totalAppointments || 0}</div><div className="stat-card__label">Total Citas</div></div><div className="stat-card__icon"><Calendar size={22} /></div></div>
                </div>
                <div className="stat-card">
                    <div className="stat-card__header"><div><div className="stat-card__value">{fmt(data?.avgTicket)}</div><div className="stat-card__label">Ticket Promedio</div></div><div className="stat-card__icon stat-card__icon--blue"><TrendingUp size={22} /></div></div>
                </div>
                <div className="stat-card">
                    <div className="stat-card__header"><div><div className="stat-card__value">{data?.noShowRate || 0}%</div><div className="stat-card__label">Tasa No-Show</div></div><div className="stat-card__icon stat-card__icon--red"><Users size={22} /></div></div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div className="card">
                    <div className="card__header"><h3 className="card__title">🏆 Top Servicios</h3></div>
                    <div className="card__body">
                        {data?.topServices?.length > 0 ? (
                            <table className="table">
                                <thead><tr><th>#</th><th>Servicio</th><th>Cantidad</th><th>Ingreso</th></tr></thead>
                                <tbody>
                                    {data.topServices.map((s, i) => (
                                        <tr key={i}><td style={{ fontWeight: 700, color: 'var(--primary-600)' }}>{i + 1}</td><td>{s.name}</td><td><span className="badge badge--purple">{s.count}</span></td><td style={{ fontWeight: 600 }}>{fmt(s.revenue)}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px' }}>Sin datos</p>}
                    </div>
                </div>

                <div className="card">
                    <div className="card__header"><h3 className="card__title">👤 Rendimiento Profesionales</h3></div>
                    <div className="card__body">
                        {data?.professionalStats?.length > 0 ? (
                            <table className="table">
                                <thead><tr><th>Profesional</th><th>Citas</th><th>Ingreso</th><th>Ocupación</th></tr></thead>
                                <tbody>
                                    {data.professionalStats.map((p, i) => (
                                        <tr key={i}>
                                            <td style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: p.color || 'var(--primary-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '11px', fontWeight: 600 }}>
                                                    {p.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                                </div>
                                                {p.name}
                                            </td>
                                            <td>{p.appointments}</td>
                                            <td style={{ fontWeight: 600 }}>{fmt(p.revenue)}</td>
                                            <td><div style={{ background: 'var(--gray-100)', borderRadius: 'var(--radius-full)', height: '6px', width: '80px' }}><div style={{ background: 'var(--primary-500)', borderRadius: 'var(--radius-full)', height: '100%', width: `${Math.min(p.occupancy || 0, 100)}%` }} /></div></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px' }}>Sin datos</p>}
                    </div>
                </div>

                <div className="card">
                    <div className="card__header"><h3 className="card__title">📦 Top Productos</h3></div>
                    <div className="card__body">
                        {data?.topProducts?.length > 0 ? (
                            <table className="table">
                                <thead><tr><th>#</th><th>Producto</th><th>Vendidos</th><th>Ingreso</th></tr></thead>
                                <tbody>
                                    {data.topProducts.map((p, i) => (
                                        <tr key={i}><td style={{ fontWeight: 700, color: 'var(--primary-600)' }}>{i + 1}</td><td>{p.name}</td><td>{p.quantity}</td><td style={{ fontWeight: 600 }}>{fmt(p.revenue)}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px' }}>Sin datos</p>}
                    </div>
                </div>

                <div className="card">
                    <div className="card__header"><h3 className="card__title">📊 Clientes</h3></div>
                    <div className="card__body">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                                <span>Clientes nuevos</span><span className="badge badge--green">{data?.newClients || 0}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                                <span>Clientes recurrentes</span><span className="badge badge--blue">{data?.recurringClients || 0}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                                <span>No vuelven hace 45+ días</span><span className="badge badge--orange">{data?.lostClients || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
