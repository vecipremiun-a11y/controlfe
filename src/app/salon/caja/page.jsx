'use client';

import { Wallet, Plus, Clock, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';

export default function CajaPage() {
    return (
        <div>
            <div className="page-header">
                <div><h1 className="page-header__title">Caja</h1><p className="page-header__subtitle">Control de apertura y cierre de caja</p></div>
                <button className="btn btn--primary"><Plus size={18} /> Abrir Caja</button>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-card__header"><div><div className="stat-card__value">$0</div><div className="stat-card__label">Monto Apertura</div></div><div className="stat-card__icon stat-card__icon--blue"><Wallet size={22} /></div></div>
                </div>
                <div className="stat-card">
                    <div className="stat-card__header"><div><div className="stat-card__value">$0</div><div className="stat-card__label">Ingresos</div></div><div className="stat-card__icon stat-card__icon--green"><ArrowDownCircle size={22} /></div></div>
                </div>
                <div className="stat-card">
                    <div className="stat-card__header"><div><div className="stat-card__value">$0</div><div className="stat-card__label">Retiros</div></div><div className="stat-card__icon stat-card__icon--red"><ArrowUpCircle size={22} /></div></div>
                </div>
                <div className="stat-card">
                    <div className="stat-card__header"><div><div className="stat-card__value">$0</div><div className="stat-card__label">Esperado en Caja</div></div><div className="stat-card__icon"><Wallet size={22} /></div></div>
                </div>
            </div>

            <div className="card">
                <div className="card__header"><h3 className="card__title">Movimientos del Día</h3></div>
                <div className="card__body">
                    <div className="empty-state" style={{ padding: '40px' }}>
                        <div className="empty-state__icon"><Clock size={28} /></div>
                        <p className="empty-state__title">No hay caja abierta</p>
                        <p className="empty-state__text">Abre una caja para comenzar a registrar movimientos</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
