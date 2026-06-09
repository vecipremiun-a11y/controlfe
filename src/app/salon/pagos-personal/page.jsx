'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import {
    DollarSign, Calendar, ChevronLeft, ChevronRight, X, Check, Clock,
    AlertCircle, Users, TrendingUp, CreditCard, Banknote, ArrowLeftRight,
    Search, Filter, Eye, Wallet, History, ArrowDown, ArrowUp, FileText,
} from 'lucide-react';

const PAYMENT_MODEL_LABELS = {
    commission: { label: 'Comisión', color: '#8B5CF6' },
    rent: { label: 'Arriendo', color: '#F59E0B' },
    salary: { label: 'Sueldo Fijo', color: '#3B82F6' },
    mixed: { label: 'Mixto', color: '#10B981' },
    per_service: { label: 'Por Servicio', color: '#EF4444' },
};

const STATUS_STYLES = {
    paid: { label: 'Pagado', color: '#059669', bg: 'rgba(16,185,129,0.1)', icon: Check },
    partial: { label: 'Parcial', color: '#D97706', bg: 'rgba(245,158,11,0.1)', icon: Clock },
    pending: { label: 'Pendiente', color: '#EF4444', bg: 'rgba(239,68,68,0.1)', icon: AlertCircle },
    waived: { label: 'Exonerado', color: '#6B7280', bg: 'rgba(107,114,128,0.1)', icon: X },
};

const MOVEMENT_STYLES = {
    earning: { label: 'Comisión', color: '#059669', bg: 'rgba(16,185,129,0.08)', icon: ArrowUp },
    advance: { label: 'Adelanto', color: '#D97706', bg: 'rgba(245,158,11,0.08)', icon: ArrowDown },
    settlement: { label: 'Liquidación', color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', icon: Check },
    adjustment: { label: 'Ajuste', color: '#6B7280', bg: 'rgba(107,114,128,0.08)', icon: FileText },
};

const PAY_FREQ_LABELS = {
    daily: 'Diario',
    weekly: 'Semanal',
    biweekly: 'Quincenal',
    monthly: 'Mensual',
};

export default function PagosPersonalPage() {
    const { tenantCurrency, addToast } = useStore();
    const [view, setView] = useState('balances'); // 'balances' | 'daily' | 'monthly'
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [dailyClosings, setDailyClosings] = useState([]);
    const [monthlySummary, setMonthlySummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Balances view state
    const [balancesData, setBalancesData] = useState({ movements: [], balances: [] });
    const [selectedProfForHistory, setSelectedProfForHistory] = useState(null);
    const [profMovements, setProfMovements] = useState([]);
    const [loadingMovements, setLoadingMovements] = useState(false);

    // Advance modal
    const [showAdvanceModal, setShowAdvanceModal] = useState(false);
    const [advanceProf, setAdvanceProf] = useState(null);
    const [advanceAmount, setAdvanceAmount] = useState('');
    const [advanceMethod, setAdvanceMethod] = useState('cash');
    const [advanceNotes, setAdvanceNotes] = useState('');
    const [submittingAdvance, setSubmittingAdvance] = useState(false);

    // Settlement modal
    const [showSettlementModal, setShowSettlementModal] = useState(false);
    const [settlementProf, setSettlementProf] = useState(null);
    const [settlementMethod, setSettlementMethod] = useState('cash');
    const [settlementNotes, setSettlementNotes] = useState('');
    const [submittingSettlement, setSubmittingSettlement] = useState(false);

    // Payment modal (existing daily closings)
    const [showPayModal, setShowPayModal] = useState(false);
    const [payClosing, setPayClosing] = useState(null);
    const [payAmount, setPayAmount] = useState('');
    const [payMethod, setPayMethod] = useState('cash');
    const [payNotes, setPayNotes] = useState('');
    const [submittingPay, setSubmittingPay] = useState(false);

    // Detail modal
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [detailData, setDetailData] = useState(null);

    const fmt = useCallback((v) =>
        new Intl.NumberFormat('es', {
            style: 'currency',
            currency: tenantCurrency || 'CLP',
            minimumFractionDigits: 0,
        }).format(v || 0)
    , [tenantCurrency]);

    const loadDailyData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/salon/daily-closings?date=${selectedDate}`);
            if (res.ok) {
                const data = await res.json();
                setDailyClosings(data.closings || []);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [selectedDate]);

    const loadMonthlyData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/salon/daily-closings/summary?month=${selectedMonth}`);
            if (res.ok) {
                const data = await res.json();
                setMonthlySummary(data);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [selectedMonth]);

    const loadBalancesData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/salon/professional-movements?limit=50');
            if (res.ok) {
                const data = await res.json();
                setBalancesData(data);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    const loadProfMovements = async (profId) => {
        setSelectedProfForHistory(profId);
        setLoadingMovements(true);
        try {
            const res = await fetch(`/api/salon/professional-movements?professional_id=${profId}&limit=50`);
            if (res.ok) {
                const data = await res.json();
                setProfMovements(data.movements || []);
            }
        } catch (e) { console.error(e); }
        finally { setLoadingMovements(false); }
    };

    useEffect(() => {
        if (view === 'daily') loadDailyData();
        else if (view === 'monthly') loadMonthlyData();
        else loadBalancesData();
    }, [view, loadDailyData, loadMonthlyData, loadBalancesData]);

    // Advance handler
    const handleSubmitAdvance = async () => {
        const amount = parseFloat(advanceAmount);
        if (!amount || amount <= 0) return;
        setSubmittingAdvance(true);
        try {
            const res = await fetch('/api/salon/professional-movements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    professional_id: advanceProf.id,
                    amount,
                    payment_method: advanceMethod,
                    notes: advanceNotes || null,
                }),
            });
            if (res.ok) {
                const result = await res.json();
                addToast({ type: 'success', message: `Adelanto de ${fmt(amount)} registrado` });
                setShowAdvanceModal(false);
                loadBalancesData();
                if (selectedProfForHistory === advanceProf.id) loadProfMovements(advanceProf.id);
            } else {
                const err = await res.json();
                addToast({ type: 'error', message: err.error || 'Error' });
            }
        } catch (e) { console.error(e); addToast({ type: 'error', message: 'Error de conexión' }); }
        finally { setSubmittingAdvance(false); }
    };

    // Settlement handler
    const handleSubmitSettlement = async () => {
        if (!settlementProf) return;
        setSubmittingSettlement(true);
        try {
            const res = await fetch('/api/salon/professional-movements/settlement', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    professional_id: settlementProf.id,
                    payment_method: settlementMethod,
                    notes: settlementNotes || null,
                }),
            });
            if (res.ok) {
                const result = await res.json();
                addToast({ type: 'success', message: `Liquidación de ${fmt(result.amount)} completada` });
                setShowSettlementModal(false);
                loadBalancesData();
                if (selectedProfForHistory === settlementProf.id) loadProfMovements(settlementProf.id);
            } else {
                const err = await res.json();
                addToast({ type: 'error', message: err.error || 'Error' });
            }
        } catch (e) { console.error(e); addToast({ type: 'error', message: 'Error de conexión' }); }
        finally { setSubmittingSettlement(false); }
    };

    const handleRegisterPayment = async () => {
        if (!payClosing || !payAmount || parseFloat(payAmount) <= 0) return;
        setSubmittingPay(true);
        try {
            const res = await fetch('/api/salon/daily-closings/payments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    closing_id: payClosing.id,
                    amount: parseFloat(payAmount),
                    payment_method: payMethod,
                    notes: payNotes || null,
                }),
            });
            if (res.ok) {
                setShowPayModal(false);
                if (view === 'daily') loadDailyData();
                else loadMonthlyData();
            }
        } catch (e) { console.error(e); }
        finally { setSubmittingPay(false); }
    };

    const openPayModal = (closing) => {
        setPayClosing(closing);
        setPayAmount(String(Math.round(((closing.amount_owed || 0) - (closing.amount_paid || 0)) * 100) / 100));
        setPayMethod('cash');
        setPayNotes('');
        setShowPayModal(true);
    };

    const openDetailModal = async (closingId) => {
        try {
            const res = await fetch(`/api/salon/daily-closings/payments?closing_id=${closingId}`);
            if (res.ok) {
                const data = await res.json();
                setDetailData(data);
                setShowDetailModal(true);
            }
        } catch (e) { console.error(e); }
    };

    const changeDate = (delta) => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + delta);
        setSelectedDate(d.toISOString().split('T')[0]);
    };

    const changeMonth = (delta) => {
        const [y, m] = selectedMonth.split('-').map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        setSelectedMonth(d.toISOString().slice(0, 7));
    };

    const filteredClosings = dailyClosings.filter(c =>
        !searchTerm || c.professional_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Monthly calendar data
    const getMonthDays = () => {
        const [y, m] = selectedMonth.split('-').map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        return Array.from({ length: daysInMonth }, (_, i) => i + 1);
    };

    const getDayStatus = (profId, day) => {
        if (!monthlySummary?.daily) return null;
        const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
        return monthlySummary.daily.find(d => d.professional_id === profId && d.date === dateStr);
    };

    const totalDebt = view === 'daily'
        ? filteredClosings.reduce((s, c) => s + Math.max(0, (c.amount_owed || 0) - (c.amount_paid || 0)), 0)
        : (monthlySummary?.summary || []).reduce((s, p) => s + (p.accumulated_debt || 0), 0);

    const totalPaid = view === 'daily'
        ? filteredClosings.reduce((s, c) => s + (c.amount_paid || 0), 0)
        : (monthlySummary?.summary || []).reduce((s, p) => s + (p.total_paid || 0), 0);

    const totalOwed = view === 'daily'
        ? filteredClosings.reduce((s, c) => s + (c.amount_owed || 0), 0)
        : (monthlySummary?.summary || []).reduce((s, p) => s + (p.total_owed || 0), 0);

    return (
        <div className="pagos-personal">
            {/* Header */}
            <div className="pagos-personal__header">
                <div className="pagos-personal__title-row">
                    <h1 className="pagos-personal__title">
                        <DollarSign size={24} />
                        Pagos Personal
                    </h1>
                    <div className="pagos-personal__view-toggle">
                        <button
                            className={`pagos-personal__view-btn ${view === 'balances' ? 'pagos-personal__view-btn--active' : ''}`}
                            onClick={() => setView('balances')}
                        >
                            <Wallet size={16} /> Balances
                        </button>
                        <button
                            className={`pagos-personal__view-btn ${view === 'daily' ? 'pagos-personal__view-btn--active' : ''}`}
                            onClick={() => setView('daily')}
                        >
                            <Calendar size={16} /> Diario
                        </button>
                        <button
                            className={`pagos-personal__view-btn ${view === 'monthly' ? 'pagos-personal__view-btn--active' : ''}`}
                            onClick={() => setView('monthly')}
                        >
                            <TrendingUp size={16} /> Mensual
                        </button>
                    </div>
                </div>

                {/* Date Navigation - only for daily/monthly */}
                {view !== 'balances' && (
                    <div className="pagos-personal__date-nav">
                        <button className="btn btn--ghost btn--icon" onClick={() => view === 'daily' ? changeDate(-1) : changeMonth(-1)}>
                            <ChevronLeft size={20} />
                        </button>
                        <span className="pagos-personal__date-label">
                            {view === 'daily'
                                ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                                : new Date(selectedMonth + '-15').toLocaleDateString('es', { month: 'long', year: 'numeric' })
                            }
                        </span>
                        <button className="btn btn--ghost btn--icon" onClick={() => view === 'daily' ? changeDate(1) : changeMonth(1)}>
                            <ChevronRight size={20} />
                        </button>
                    </div>
                )}

                {/* Summary Cards - for daily/monthly */}
                {view !== 'balances' && (
                    <div className="pagos-personal__summary">
                        <div className="pagos-personal__stat-card">
                            <div className="pagos-personal__stat-label">Total a Pagar</div>
                            <div className="pagos-personal__stat-value" style={{ color: '#3B82F6' }}>{fmt(totalOwed)}</div>
                        </div>
                        <div className="pagos-personal__stat-card">
                            <div className="pagos-personal__stat-label">Total Pagado</div>
                            <div className="pagos-personal__stat-value" style={{ color: '#059669' }}>{fmt(totalPaid)}</div>
                        </div>
                        <div className="pagos-personal__stat-card">
                            <div className="pagos-personal__stat-label">{view === 'monthly' ? 'Deuda Acumulada' : 'Pendiente'}</div>
                            <div className="pagos-personal__stat-value" style={{ color: totalDebt > 0 ? '#EF4444' : '#059669' }}>{fmt(totalDebt)}</div>
                        </div>
                    </div>
                )}

                {/* Summary Cards - for balances */}
                {view === 'balances' && (
                    <div className="pagos-personal__summary">
                        <div className="pagos-personal__stat-card">
                            <div className="pagos-personal__stat-label">Profesionales Activos</div>
                            <div className="pagos-personal__stat-value" style={{ color: '#6C5CE7' }}>{balancesData.balances?.length || 0}</div>
                        </div>
                        <div className="pagos-personal__stat-card">
                            <div className="pagos-personal__stat-label">Balance Total Acumulado</div>
                            <div className="pagos-personal__stat-value" style={{ color: '#059669' }}>{fmt((balancesData.balances || []).reduce((s, b) => s + (b.running_balance || 0), 0))}</div>
                        </div>
                        <div className="pagos-personal__stat-card">
                            <div className="pagos-personal__stat-label">Pendientes de Liquidar</div>
                            <div className="pagos-personal__stat-value" style={{ color: '#D97706' }}>{(balancesData.balances || []).filter(b => (b.running_balance || 0) > 0).length}</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Content */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                    <div className="spinner spinner--md" />
                </div>
            ) : view === 'balances' ? (
                /* ========= BALANCES VIEW ========= */
                <div className="pagos-personal__daily">
                    {(!balancesData.balances || balancesData.balances.length === 0) ? (
                        <div className="pagos-personal__empty">
                            <Wallet size={40} />
                            <p>No hay profesionales activos</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {balancesData.balances.map(prof => {
                                const balance = prof.running_balance || 0;
                                const isSelected = selectedProfForHistory === prof.id;
                                return (
                                    <div key={prof.id} style={{ background: '#fff', borderRadius: '14px', border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', padding: '16px', gap: '12px' }}>
                                            <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: prof.color || '#6C5CE7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '16px', fontWeight: 700, flexShrink: 0 }}>
                                                {prof.avatar_url ? <img src={prof.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (prof.name || '?')[0].toUpperCase()}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 700, fontSize: '15px' }}>{prof.name}</div>
                                                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                                                    Pago: {PAY_FREQ_LABELS[prof.pay_frequency] || 'Diario'}
                                                    {prof.pay_day ? ` — ${prof.pay_day}` : ''}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right', marginRight: '8px' }}>
                                                <div style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>Balance</div>
                                                <div style={{ fontSize: '22px', fontWeight: 800, color: balance > 0 ? '#059669' : balance < 0 ? '#EF4444' : '#6B7280' }}>
                                                    {fmt(balance)}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                                <button
                                                    onClick={() => { setAdvanceProf(prof); setAdvanceAmount(''); setAdvanceMethod('cash'); setAdvanceNotes(''); setShowAdvanceModal(true); }}
                                                    style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: '1px solid #FDE68A', background: 'rgba(245,158,11,0.08)', color: '#D97706', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    <Banknote size={14} /> Adelanto
                                                </button>
                                                {balance > 0 && (
                                                    <button
                                                        onClick={() => { setSettlementProf(prof); setSettlementMethod('cash'); setSettlementNotes(''); setShowSettlementModal(true); }}
                                                        style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: '1px solid #A7F3D0', background: 'rgba(16,185,129,0.08)', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                    >
                                                        <Check size={14} /> Liquidar
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => isSelected ? setSelectedProfForHistory(null) : loadProfMovements(prof.id)}
                                                    style={{ padding: '8px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', border: '1px solid #D1D5DB', background: isSelected ? 'rgba(108,92,231,0.08)' : '#fff', color: isSelected ? '#6C5CE7' : '#6B7280' }}
                                                    title="Ver historial"
                                                >
                                                    <History size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Movement history panel */}
                                        {isSelected && (
                                            <div style={{ borderTop: '1px solid #E5E7EB', padding: '12px 16px', background: '#FAFBFC' }}>
                                                <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: '8px' }}>Últimos Movimientos</h4>
                                                {loadingMovements ? (
                                                    <div style={{ display: 'flex', justifyContent: 'center', padding: '12px' }}><div className="spinner spinner--sm" /></div>
                                                ) : profMovements.length === 0 ? (
                                                    <div style={{ color: '#9CA3AF', fontSize: '13px', textAlign: 'center', padding: '12px' }}>Sin movimientos registrados</div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '250px', overflowY: 'auto' }}>
                                                        {profMovements.map(m => {
                                                            const ms = MOVEMENT_STYLES[m.type] || MOVEMENT_STYLES.adjustment;
                                                            return (
                                                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: '#fff', borderRadius: '8px', border: '1px solid #F3F4F6', fontSize: '13px' }}>
                                                                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: ms.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ms.color, flexShrink: 0 }}>
                                                                        <ms.icon size={14} />
                                                                    </div>
                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                        <div style={{ fontWeight: 600, color: '#374151' }}>{ms.label}</div>
                                                                        <div style={{ fontSize: '11px', color: '#9CA3AF' }}>
                                                                            {m.date} {m.payment_method ? `· ${m.payment_method === 'cash' ? 'Efectivo' : m.payment_method === 'card' ? 'Tarjeta' : 'Transfer.'}` : ''}
                                                                            {m.notes ? ` · ${m.notes}` : ''}
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                                        <div style={{ fontWeight: 700, color: m.type === 'earning' ? '#059669' : m.type === 'advance' ? '#D97706' : '#3B82F6' }}>
                                                                            {m.type === 'advance' ? '-' : '+'}{fmt(m.amount)}
                                                                        </div>
                                                                        <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Bal: {fmt(m.balance_after)}</div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : view === 'daily' ? (
                /* ========= DAILY VIEW ========= */
                <div className="pagos-personal__daily">
                    <div className="pagos-personal__search">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Buscar profesional..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {filteredClosings.length === 0 ? (
                        <div className="pagos-personal__empty">
                            <Calendar size={40} />
                            <p>No hay cierres registrados para este día</p>
                            <span>Los cierres se generan desde el botón "Corte del Día" en Barbershop</span>
                        </div>
                    ) : (
                        <div className="pagos-personal__table-wrap">
                            <table className="pagos-personal__table">
                                <thead>
                                    <tr>
                                        <th>Profesional</th>
                                        <th>Modelo</th>
                                        <th>Servicios</th>
                                        <th>Ingreso</th>
                                        <th>Debe</th>
                                        <th>Pagado</th>
                                        <th>Estado</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredClosings.map(c => {
                                        const remaining = Math.max(0, (c.amount_owed || 0) - (c.amount_paid || 0));
                                        const st = STATUS_STYLES[c.payment_status] || STATUS_STYLES.pending;
                                        const model = PAYMENT_MODEL_LABELS[c.payment_model] || PAYMENT_MODEL_LABELS.commission;
                                        return (
                                            <tr key={c.id}>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: c.color || '#6C5CE7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
                                                            {c.avatar_url ? <img src={c.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (c.professional_name || '?')[0].toUpperCase()}
                                                        </div>
                                                        <span style={{ fontWeight: 600 }}>{c.professional_name}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span style={{ fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: model.color + '15', color: model.color }}>
                                                        {model.label}
                                                    </span>
                                                </td>
                                                <td>{c.total_services}</td>
                                                <td>{fmt(c.total_revenue)}</td>
                                                <td style={{ fontWeight: 600 }}>{fmt(c.amount_owed)}</td>
                                                <td style={{ fontWeight: 600, color: '#059669' }}>{fmt(c.amount_paid)}</td>
                                                <td>
                                                    <span style={{ fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', background: st.bg, color: st.color, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                        <st.icon size={12} /> {st.label}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '4px' }}>
                                                        {c.payment_status !== 'paid' && (
                                                            <button
                                                                className="btn btn--sm btn--primary"
                                                                onClick={() => openPayModal(c)}
                                                                style={{ fontSize: '12px', padding: '4px 10px' }}
                                                            >
                                                                <DollarSign size={12} /> Pagar
                                                            </button>
                                                        )}
                                                        <button
                                                            className="btn btn--sm btn--ghost"
                                                            onClick={() => openDetailModal(c.id)}
                                                            style={{ fontSize: '12px', padding: '4px 10px' }}
                                                        >
                                                            <Eye size={12} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : (
                /* ========= MONTHLY VIEW ========= */
                <div className="pagos-personal__monthly">
                    {/* Summary per professional */}
                    <div className="pagos-personal__prof-cards">
                        {(monthlySummary?.summary || []).map(prof => {
                            const model = PAYMENT_MODEL_LABELS[prof.payment_mode] || PAYMENT_MODEL_LABELS.commission;
                            return (
                                <div key={prof.professional_id} className="pagos-personal__prof-card">
                                    <div className="pagos-personal__prof-card-header">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: prof.color || '#6C5CE7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px', fontWeight: 700, flexShrink: 0 }}>
                                                {prof.avatar_url ? <img src={prof.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (prof.professional_name || '?')[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '15px' }}>{prof.professional_name}</div>
                                                <span style={{ fontSize: '11px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px', background: model.color + '15', color: model.color }}>{model.label}</span>
                                            </div>
                                        </div>
                                        {prof.accumulated_debt > 0 && (
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '11px', color: '#EF4444', fontWeight: 600 }}>DEUDA TOTAL</div>
                                                <div style={{ fontSize: '18px', fontWeight: 800, color: '#EF4444' }}>{fmt(prof.accumulated_debt)}</div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="pagos-personal__prof-stats">
                                        <div>
                                            <span className="pagos-personal__mini-label">Días</span>
                                            <span className="pagos-personal__mini-value">{prof.days_worked}</span>
                                        </div>
                                        <div>
                                            <span className="pagos-personal__mini-label">Servicios</span>
                                            <span className="pagos-personal__mini-value">{prof.total_services}</span>
                                        </div>
                                        <div>
                                            <span className="pagos-personal__mini-label">Ingreso</span>
                                            <span className="pagos-personal__mini-value">{fmt(prof.total_revenue)}</span>
                                        </div>
                                        <div>
                                            <span className="pagos-personal__mini-label">Debe</span>
                                            <span className="pagos-personal__mini-value" style={{ color: '#3B82F6' }}>{fmt(prof.total_owed)}</span>
                                        </div>
                                        <div>
                                            <span className="pagos-personal__mini-label">Pagado</span>
                                            <span className="pagos-personal__mini-value" style={{ color: '#059669' }}>{fmt(prof.total_paid)}</span>
                                        </div>
                                    </div>

                                    {/* Mini calendar */}
                                    <div className="pagos-personal__mini-calendar">
                                        {getMonthDays().map(day => {
                                            const entry = getDayStatus(prof.professional_id, day);
                                            const bg = !entry ? '#F3F4F6'
                                                : entry.payment_status === 'paid' ? '#D1FAE5'
                                                    : entry.payment_status === 'partial' ? '#FEF3C7'
                                                        : '#FEE2E2';
                                            const color = !entry ? '#9CA3AF'
                                                : entry.payment_status === 'paid' ? '#059669'
                                                    : entry.payment_status === 'partial' ? '#D97706'
                                                        : '#EF4444';
                                            return (
                                                <div
                                                    key={day}
                                                    className="pagos-personal__calendar-day"
                                                    style={{ background: bg, color, cursor: entry ? 'pointer' : 'default' }}
                                                    title={entry ? `${entry.payment_status} — Debe: ${entry.amount_owed}, Pagado: ${entry.amount_paid}` : 'Sin cierre'}
                                                    onClick={() => {
                                                        if (entry) {
                                                            setSelectedDate(`${selectedMonth}-${String(day).padStart(2, '0')}`);
                                                            setView('daily');
                                                        }
                                                    }}
                                                >
                                                    {day}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}

                        {(!monthlySummary?.summary || monthlySummary.summary.length === 0) && (
                            <div className="pagos-personal__empty">
                                <Users size={40} />
                                <p>No hay datos para este mes</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ======== PAYMENT MODAL ======== */}
            {showPayModal && payClosing && (
                <div className="barbershop__modal-overlay" onClick={() => !submittingPay && setShowPayModal(false)}>
                    <div className="checkin-modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
                        <div className="checkin-modal__header">
                            <div>
                                <h2 className="checkin-modal__title">Registrar Pago</h2>
                                <p className="checkin-modal__subtitle">{payClosing.professional_name} — {payClosing.date}</p>
                            </div>
                            <button className="checkin-modal__close" onClick={() => setShowPayModal(false)}><X size={20} /></button>
                        </div>
                        <div className="checkin-modal__body">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div style={{ background: '#F9FAFB', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase' }}>Debe</div>
                                        <div style={{ fontSize: '20px', fontWeight: 700 }}>{fmt(payClosing.amount_owed)}</div>
                                    </div>
                                    <div style={{ background: '#F9FAFB', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '11px', color: '#6B7280', textTransform: 'uppercase' }}>Ya Pagado</div>
                                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#059669' }}>{fmt(payClosing.amount_paid)}</div>
                                    </div>
                                </div>

                                <div>
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Monto a Pagar</label>
                                    <input
                                        type="number"
                                        value={payAmount}
                                        onChange={e => setPayAmount(e.target.value)}
                                        style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '18px', fontWeight: 700 }}
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Método de Pago</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {[['cash', 'Efectivo', Banknote], ['card', 'Tarjeta', CreditCard], ['transfer', 'Transfer.', ArrowLeftRight]].map(([val, label, Icon]) => (
                                            <button
                                                key={val}
                                                onClick={() => setPayMethod(val)}
                                                style={{
                                                    flex: 1, padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                                    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                                                    border: payMethod === val ? '2px solid #6C5CE7' : '1px solid #D1D5DB',
                                                    background: payMethod === val ? 'rgba(108,92,231,0.08)' : '#fff',
                                                    color: payMethod === val ? '#6C5CE7' : '#6B7280',
                                                }}
                                            >
                                                <Icon size={14} /> {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Notas (opcional)</label>
                                    <input
                                        type="text"
                                        value={payNotes}
                                        onChange={e => setPayNotes(e.target.value)}
                                        placeholder="Ej: pago parcial, paga resto mañana..."
                                        style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '13px' }}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="checkin-modal__footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button className="btn btn--ghost" onClick={() => setShowPayModal(false)}>Cancelar</button>
                            <button
                                className="btn btn--primary"
                                onClick={handleRegisterPayment}
                                disabled={submittingPay || !payAmount || parseFloat(payAmount) <= 0}
                                style={{ background: '#059669' }}
                            >
                                {submittingPay ? <div className="spinner spinner--sm" /> : <><Check size={16} /> Confirmar Pago</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ======== DETAIL MODAL ======== */}
            {showDetailModal && detailData && (
                <div className="barbershop__modal-overlay" onClick={() => setShowDetailModal(false)}>
                    <div className="checkin-modal" style={{ maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
                        <div className="checkin-modal__header">
                            <div>
                                <h2 className="checkin-modal__title">Detalle de Cierre</h2>
                                <p className="checkin-modal__subtitle">{detailData.closing?.professional_name} — {detailData.closing?.date}</p>
                            </div>
                            <button className="checkin-modal__close" onClick={() => setShowDetailModal(false)}><X size={20} /></button>
                        </div>
                        <div className="checkin-modal__body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                            {detailData.closing && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                                        <div style={{ background: '#F9FAFB', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase' }}>Servicios</div>
                                            <div style={{ fontSize: '18px', fontWeight: 700 }}>{detailData.closing.total_services}</div>
                                        </div>
                                        <div style={{ background: '#F9FAFB', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase' }}>Ingreso</div>
                                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#059669' }}>{fmt(detailData.closing.total_revenue)}</div>
                                        </div>
                                        <div style={{ background: '#F9FAFB', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase' }}>Debe</div>
                                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#3B82F6' }}>{fmt(detailData.closing.amount_owed)}</div>
                                        </div>
                                    </div>

                                    <div style={{ background: 'rgba(59,130,246,0.06)', padding: '14px', borderRadius: '10px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                                            <span>Total Pagado</span>
                                            <span style={{ fontWeight: 700, color: '#059669' }}>{fmt(detailData.closing.amount_paid)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                                            <span>Restante</span>
                                            <span style={{ fontWeight: 700, color: '#EF4444' }}>{fmt(Math.max(0, (detailData.closing.amount_owed || 0) - (detailData.closing.amount_paid || 0)))}</span>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '8px' }}>Historial de Pagos</h4>
                                        {(!detailData.payments || detailData.payments.length === 0) ? (
                                            <div style={{ color: '#9CA3AF', fontSize: '13px', textAlign: 'center', padding: '16px' }}>Sin pagos registrados</div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {detailData.payments.map(p => (
                                                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#F9FAFB', borderRadius: '8px', fontSize: '13px' }}>
                                                        <div>
                                                            <div style={{ fontWeight: 600 }}>{fmt(p.amount)}</div>
                                                            <div style={{ color: '#9CA3AF', fontSize: '11px' }}>
                                                                {p.payment_method === 'cash' ? 'Efectivo' : p.payment_method === 'card' ? 'Tarjeta' : 'Transferencia'}
                                                                {p.notes ? ` — ${p.notes}` : ''}
                                                            </div>
                                                        </div>
                                                        <div style={{ color: '#9CA3AF', fontSize: '11px' }}>
                                                            {new Date(p.created_at).toLocaleString('es', { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="checkin-modal__footer" style={{ textAlign: 'right' }}>
                            <button className="btn btn--ghost" onClick={() => setShowDetailModal(false)}>Cerrar</button>
                            {detailData.closing?.payment_status !== 'paid' && (
                                <button className="btn btn--primary" onClick={() => { setShowDetailModal(false); openPayModal(detailData.closing); }} style={{ marginLeft: '8px', background: '#059669' }}>
                                    <DollarSign size={14} /> Registrar Pago
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ======== ADVANCE MODAL ======== */}
            {showAdvanceModal && advanceProf && (
                <div className="barbershop__modal-overlay" onClick={() => !submittingAdvance && setShowAdvanceModal(false)}>
                    <div className="checkin-modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                        <div className="checkin-modal__header">
                            <div>
                                <h2 className="checkin-modal__title">Registrar Adelanto</h2>
                                <p className="checkin-modal__subtitle">{advanceProf.name} — Balance: {fmt(advanceProf.running_balance || 0)}</p>
                            </div>
                            <button className="checkin-modal__close" onClick={() => setShowAdvanceModal(false)}><X size={20} /></button>
                        </div>
                        <div className="checkin-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Monto del Adelanto</label>
                                <input
                                    type="number"
                                    value={advanceAmount}
                                    onChange={e => setAdvanceAmount(e.target.value)}
                                    placeholder="0"
                                    min="0"
                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '20px', fontWeight: 700, textAlign: 'center' }}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Método de Pago</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {[['cash', 'Efectivo', Banknote], ['card', 'Tarjeta', CreditCard], ['transfer', 'Transfer.', ArrowLeftRight]].map(([val, label, Icon]) => (
                                        <button
                                            key={val}
                                            onClick={() => setAdvanceMethod(val)}
                                            style={{
                                                flex: 1, padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                                                border: advanceMethod === val ? '2px solid #D97706' : '1px solid #D1D5DB',
                                                background: advanceMethod === val ? 'rgba(245,158,11,0.08)' : '#fff',
                                                color: advanceMethod === val ? '#D97706' : '#6B7280',
                                            }}
                                        >
                                            <Icon size={14} /> {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Nota (opcional)</label>
                                <input
                                    type="text" value={advanceNotes} onChange={e => setAdvanceNotes(e.target.value)}
                                    placeholder="Ej: almuerzo, transporte..."
                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '13px' }}
                                />
                            </div>
                            {parseFloat(advanceAmount) > 0 && (
                                <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', fontSize: '13px', color: '#92400E' }}>
                                    Nuevo balance: <strong>{fmt((advanceProf.running_balance || 0) - parseFloat(advanceAmount))}</strong>
                                </div>
                            )}
                        </div>
                        <div className="checkin-modal__footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button className="btn btn--ghost" onClick={() => setShowAdvanceModal(false)} disabled={submittingAdvance}>Cancelar</button>
                            <button
                                className="btn btn--primary"
                                onClick={handleSubmitAdvance}
                                disabled={submittingAdvance || !advanceAmount || parseFloat(advanceAmount) <= 0}
                                style={{ background: '#D97706' }}
                            >
                                {submittingAdvance ? <div className="spinner spinner--sm" /> : <><Banknote size={16} /> Registrar</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ======== SETTLEMENT MODAL ======== */}
            {showSettlementModal && settlementProf && (
                <div className="barbershop__modal-overlay" onClick={() => !submittingSettlement && setShowSettlementModal(false)}>
                    <div className="checkin-modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
                        <div className="checkin-modal__header">
                            <div>
                                <h2 className="checkin-modal__title">Liquidar a {settlementProf.name}</h2>
                                <p className="checkin-modal__subtitle">Se pagará el balance completo acumulado</p>
                            </div>
                            <button className="checkin-modal__close" onClick={() => setShowSettlementModal(false)}><X size={20} /></button>
                        </div>
                        <div className="checkin-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ background: 'rgba(16,185,129,0.06)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.2)', textAlign: 'center' }}>
                                <div style={{ fontSize: '12px', color: '#059669', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Monto a Liquidar</div>
                                <div style={{ fontSize: '32px', fontWeight: 800, color: '#059669' }}>{fmt(settlementProf.running_balance || 0)}</div>
                                <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>Balance se reiniciará a $0</div>
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Método de Pago</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {[['cash', 'Efectivo', Banknote], ['card', 'Tarjeta', CreditCard], ['transfer', 'Transfer.', ArrowLeftRight]].map(([val, label, Icon]) => (
                                        <button
                                            key={val}
                                            onClick={() => setSettlementMethod(val)}
                                            style={{
                                                flex: 1, padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                                                border: settlementMethod === val ? '2px solid #059669' : '1px solid #D1D5DB',
                                                background: settlementMethod === val ? 'rgba(16,185,129,0.08)' : '#fff',
                                                color: settlementMethod === val ? '#059669' : '#6B7280',
                                            }}
                                        >
                                            <Icon size={14} /> {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Nota (opcional)</label>
                                <input
                                    type="text" value={settlementNotes} onChange={e => setSettlementNotes(e.target.value)}
                                    placeholder="Ej: pago semanal, liquidación quincenal..."
                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '13px' }}
                                />
                            </div>
                        </div>
                        <div className="checkin-modal__footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button className="btn btn--ghost" onClick={() => setShowSettlementModal(false)} disabled={submittingSettlement}>Cancelar</button>
                            <button
                                className="btn btn--primary"
                                onClick={handleSubmitSettlement}
                                disabled={submittingSettlement || (settlementProf.running_balance || 0) <= 0}
                                style={{ background: '#059669' }}
                            >
                                {submittingSettlement ? <div className="spinner spinner--sm" /> : <><Check size={16} /> Confirmar Liquidación</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
