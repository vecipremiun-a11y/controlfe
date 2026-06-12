'use client';

import { MessageSquare, Send, Clock, CheckCircle, AlertCircle } from 'lucide-react';

export default function MarketingPage() {
    const templates = [
        { name: 'Confirmación de Reserva', type: 'confirmation', status: 'active' },
        { name: 'Recordatorio 24h', type: 'reminder_24h', status: 'active' },
        { name: 'Recordatorio 2h', type: 'reminder_2h', status: 'active' },
        { name: 'Gracias por tu visita', type: 'thanks', status: 'active' },
    ];

    return (
        <div>
            <div className="page-header">
                <div><h1 className="page-header__title">Marketing & WhatsApp</h1><p className="page-header__subtitle">Mantén a tus clientes informados y comprometidos</p></div>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-card__header"><div><div className="stat-card__value">0</div><div className="stat-card__label">Mensajes Enviados</div></div><div className="stat-card__icon stat-card__icon--green"><Send size={22} /></div></div>
                </div>
                <div className="stat-card">
                    <div className="stat-card__header"><div><div className="stat-card__value">0</div><div className="stat-card__label">Pendientes</div></div><div className="stat-card__icon stat-card__icon--orange"><Clock size={22} /></div></div>
                </div>
                <div className="stat-card">
                    <div className="stat-card__header"><div><div className="stat-card__value">{templates.length}</div><div className="stat-card__label">Plantillas Activas</div></div><div className="stat-card__icon"><MessageSquare size={22} /></div></div>
                </div>
            </div>

            <div className="rgrid rgrid--2">
                <div className="card">
                    <div className="card__header"><h3 className="card__title">📝 Plantillas WhatsApp</h3></div>
                    <div className="card__body">
                        {templates.map((t, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < templates.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <CheckCircle size={16} style={{ color: 'var(--accent-green)' }} />
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{t.name}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t.type}</div>
                                    </div>
                                </div>
                                <span className="badge badge--green">Activa</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="card">
                    <div className="card__header"><h3 className="card__title">📢 Campañas</h3></div>
                    <div className="card__body">
                        <div className="empty-state" style={{ padding: '40px' }}>
                            <div className="empty-state__icon"><MessageSquare size={28} /></div>
                            <p className="empty-state__title">Sin campañas</p>
                            <p className="empty-state__text">Crea tu primera campaña de WhatsApp para llegar a tus clientes</p>
                            <button className="btn btn--primary btn--sm">Crear Campaña</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
