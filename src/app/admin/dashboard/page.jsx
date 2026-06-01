'use client';

import { useState, useEffect } from 'react';
import {
    Building2,
    Users,
    DollarSign,
    TrendingUp,
    ArrowUpRight,
    Calendar,
} from 'lucide-react';

export default function AdminDashboard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStats();
    }, []);

    async function loadStats() {
        try {
            const res = await fetch('/api/admin/dashboard');
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return <div className="loading-page"><div className="spinner spinner--lg" /></div>;
    }

    const kpis = [
        { label: 'Salones Activos', value: stats?.activeTenants ?? 0, icon: Building2, iconClass: '' },
        { label: 'Nuevos Este Mes', value: stats?.newTenantsMonth ?? 0, icon: TrendingUp, iconClass: 'stat-card__icon--green' },
        { label: 'MRR', value: stats?.mrr ?? 0, icon: DollarSign, iconClass: 'stat-card__icon--blue', format: 'currency' },
        { label: 'Reservas Totales', value: stats?.totalAppointments ?? 0, icon: Calendar, iconClass: 'stat-card__icon--orange' },
    ];

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">Dashboard SaaS</h1>
                    <p className="page-header__subtitle">Vista general de la plataforma</p>
                </div>
            </div>

            <div className="stats-grid">
                {kpis.map((kpi, i) => {
                    const Icon = kpi.icon;
                    return (
                        <div className="stat-card" key={i}>
                            <div className="stat-card__header">
                                <div>
                                    <div className="stat-card__value">
                                        {kpi.format === 'currency'
                                            ? new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(kpi.value)
                                            : kpi.value}
                                    </div>
                                    <div className="stat-card__label">{kpi.label}</div>
                                </div>
                                <div className={`stat-card__icon ${kpi.iconClass}`}>
                                    <Icon size={22} />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Recent Tenants */}
            <div className="card">
                <div className="card__header">
                    <h3 className="card__title">Salones Recientes</h3>
                </div>
                <div className="card__body">
                    {stats?.recentTenants?.length > 0 ? (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Salón</th>
                                        <th>Plan</th>
                                        <th>Estado</th>
                                        <th>Creado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.recentTenants.map((t, i) => (
                                        <tr key={i}>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>{t.name}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t.slug}</div>
                                            </td>
                                            <td><span className="badge badge--purple">{t.plan_name || 'Sin plan'}</span></td>
                                            <td>
                                                <span className={`badge badge--${t.status === 'activo' ? 'green' : 'red'}`}>
                                                    {t.status}
                                                </span>
                                            </td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{t.created_at?.split('T')[0]}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0' }}>No hay salones registrados</p>
                    )}
                </div>
            </div>
        </div>
    );
}
