'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import {
    DollarSign,
    Calendar,
    TrendingUp,
    Users,
    Package,
    Clock,
    AlertTriangle,
    ArrowUpRight,
    ArrowDownRight,
    Scissors,
} from 'lucide-react';

export default function SalonDashboard() {
    const { user, tenantCurrency } = useStore();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [todayAppointments, setTodayAppointments] = useState([]);

    useEffect(() => {
        loadDashboard();
    }, []);

    async function loadDashboard() {
        try {
            const res = await fetch('/api/salon/dashboard');
            if (res.ok) {
                const data = await res.json();
                setStats(data.stats);
                setTodayAppointments(data.todayAppointments || []);
            }
        } catch (e) {
            console.error('Error loading dashboard:', e);
        } finally {
            setLoading(false);
        }
    }

    const kpis = [
        {
            label: 'Ventas Hoy',
            value: stats?.salesToday ?? 0,
            format: 'currency',
            change: stats?.salesChange ?? 0,
            icon: DollarSign,
            iconClass: 'stat-card__icon--green',
        },
        {
            label: 'Reservas Hoy',
            value: stats?.appointmentsToday ?? 0,
            change: stats?.appointmentsChange ?? 0,
            icon: Calendar,
            iconClass: '',
        },
        {
            label: 'Clientes Nuevos',
            value: stats?.newClientsMonth ?? 0,
            sublabel: 'Este mes',
            change: stats?.clientsChange ?? 0,
            icon: Users,
            iconClass: 'stat-card__icon--blue',
        },
        {
            label: 'Ticket Promedio',
            value: stats?.avgTicket ?? 0,
            format: 'currency',
            change: stats?.ticketChange ?? 0,
            icon: TrendingUp,
            iconClass: 'stat-card__icon--orange',
        },
    ];

    const formatValue = (val, fmt) => {
        if (fmt === 'currency') {
            return new Intl.NumberFormat('es', {
                style: 'currency',
                currency: tenantCurrency || 'USD',
                minimumFractionDigits: 0,
            }).format(val);
        }
        return val;
    };

    if (loading) {
        return (
            <div className="loading-page">
                <div className="spinner spinner--lg" />
                <p>Cargando dashboard...</p>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <div className="page-header__left">
                    <h1 className="page-header__title">
                        ¡Hola, {user?.name?.split(' ')[0]}! 👋
                    </h1>
                    <p className="page-header__subtitle">
                        Aquí está el resumen de tu salón hoy
                    </p>
                </div>
                <div className="page-header__actions">
                    <button className="btn btn--secondary btn--sm">
                        <Calendar size={16} /> Exportar
                    </button>
                    <button className="btn btn--primary btn--sm" onClick={() => window.location.href = '/salon/pos'}>
                        <DollarSign size={16} /> Nueva Venta
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="stats-grid">
                {kpis.map((kpi, i) => {
                    const Icon = kpi.icon;
                    return (
                        <div className="stat-card" key={i}>
                            <div className="stat-card__header">
                                <div>
                                    <div className="stat-card__value">
                                        {formatValue(kpi.value, kpi.format)}
                                    </div>
                                    <div className="stat-card__label">
                                        {kpi.label}
                                        {kpi.sublabel && <span style={{ display: 'block', fontSize: '11px' }}>{kpi.sublabel}</span>}
                                    </div>
                                </div>
                                <div className={`stat-card__icon ${kpi.iconClass}`}>
                                    <Icon size={22} />
                                </div>
                            </div>
                            {kpi.change !== undefined && (
                                <div className={`stat-card__change ${kpi.change >= 0 ? 'stat-card__change--up' : 'stat-card__change--down'}`}>
                                    {kpi.change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                    {Math.abs(kpi.change).toFixed(1)}% vs ayer
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Two column layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '20px' }}>
                {/* Today's Appointments */}
                <div className="card">
                    <div className="card__header">
                        <h3 className="card__title">📅 Citas de Hoy</h3>
                        <a href="/salon/agenda" className="btn btn--ghost btn--sm">Ver Agenda</a>
                    </div>
                    <div className="card__body">
                        {todayAppointments.length === 0 ? (
                            <div className="empty-state" style={{ padding: '40px 20px' }}>
                                <div className="empty-state__icon">
                                    <Calendar size={28} />
                                </div>
                                <p className="empty-state__title">Sin citas hoy</p>
                                <p className="empty-state__text">No hay reservas programadas para hoy.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {todayAppointments.map((apt, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '12px',
                                            borderRadius: 'var(--radius-sm)',
                                            background: 'var(--gray-50)',
                                            transition: 'background 150ms',
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--primary-50)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--gray-50)'}
                                    >
                                        <div style={{
                                            width: '4px',
                                            height: '40px',
                                            borderRadius: '4px',
                                            background: apt.color || 'var(--primary-500)',
                                        }} />
                                        <div style={{
                                            width: '50px',
                                            textAlign: 'center',
                                        }}>
                                            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                {apt.start_time}
                                            </div>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '14px', fontWeight: 600 }}>{apt.client_name || 'Cliente'}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{apt.service_name} · {apt.professional_name}</div>
                                        </div>
                                        <span className={`badge badge--${apt.status === 'confirmado' ? 'green' : apt.status === 'reservado' ? 'purple' : apt.status === 'en_atencion' ? 'orange' : 'gray'}`}>
                                            {apt.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right side: Quick info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Low Stock Alert */}
                    <div className="card">
                        <div className="card__header">
                            <h3 className="card__title">⚠️ Stock Bajo</h3>
                        </div>
                        <div className="card__body">
                            {stats?.lowStockProducts?.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {stats.lowStockProducts.map((p, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                                            <div>
                                                <div style={{ fontSize: '14px', fontWeight: 500 }}>{p.name}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Mín: {p.min_stock}</div>
                                            </div>
                                            <span className="badge badge--red">{p.stock} uds</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
                                    Todo en orden 👍
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Top Services */}
                    <div className="card">
                        <div className="card__header">
                            <h3 className="card__title">🏆 Top Servicios</h3>
                            <span className="text-sm text-muted">Este mes</span>
                        </div>
                        <div className="card__body">
                            {stats?.topServices?.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {stats.topServices.map((svc, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: 'var(--radius-sm)',
                                                background: 'var(--primary-50)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '13px',
                                                fontWeight: 700,
                                                color: 'var(--primary-600)',
                                            }}>
                                                {i + 1}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '14px', fontWeight: 500 }}>{svc.name}</div>
                                            </div>
                                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {svc.count}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
                                    Sin datos aún
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
