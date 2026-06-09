'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import {
    Armchair, ChevronLeft, ChevronRight, X, Check,
    Banknote, CreditCard, ArrowLeftRight,
} from 'lucide-react';

const FREQ_LABEL = { daily: 'día', weekly: 'semana', biweekly: 'quincena', monthly: 'mes' };

export default function ArriendoPage() {
    const { user, tenantCurrency, addToast } = useStore();
    const isAdmin = ['owner', 'admin'].includes(user?.role);
    const fmt = useCallback((v) =>
        new Intl.NumberFormat('es', { style: 'currency', currency: tenantCurrency || 'CLP', minimumFractionDigits: 0 }).format(v || 0)
    , [tenantCurrency]);

    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [rentData, setRentData] = useState(null); // { month, today, daysInMonth, professionals }
    const [loading, setLoading] = useState(true);

    // Modal de abono
    const [payModal, setPayModal] = useState(null); // { prof, day, dateStr, due, paid, remaining }
    const [payAmount, setPayAmount] = useState('');
    const [payMethod, setPayMethod] = useState('cash');
    const [payNotes, setPayNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const loadRentData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/salon/chair-rent?month=${selectedMonth}`);
            if (res.ok) setRentData(await res.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [selectedMonth]);

    useEffect(() => { loadRentData(); }, [loadRentData]);

    const changeMonth = (delta) => {
        const [y, m] = selectedMonth.split('-').map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        setSelectedMonth(d.toISOString().slice(0, 7));
    };

    // Estado/color de un día según lo pagado vs. lo que se debe.
    const dayState = (prof, day) => {
        const dateStr = `${rentData.month}-${String(day).padStart(2, '0')}`;
        const daily = prof.daily_amount || 0;
        const rec = (prof.days || []).find(d => d.date === dateStr);
        const paid = rec?.amount_paid || 0;
        const due = rec?.amount_due ?? daily;
        let status = 'none';
        if (daily <= 0) status = 'none';
        else if (dateStr > rentData.today) status = 'future';
        else if (due > 0 && paid >= due) status = 'paid';
        else if (paid > 0) status = 'partial';
        else status = 'debt';
        return { dateStr, daily, paid, due, remaining: Math.max(0, due - paid), status };
    };

    const openPay = (prof, day) => {
        const st = dayState(prof, day);
        if (st.daily <= 0) { addToast?.({ type: 'error', message: 'Define el monto de arriendo en Personal' }); return; }
        const fullyPaid = st.paid > 0 && st.remaining <= 0;
        setPayModal({ prof, day, ...st, fullyPaid });
        // Día pagado + admin → corregir el total (precargar lo pagado). Si no, abonar el resto.
        setPayAmount(String((fullyPaid && isAdmin) ? st.paid : (st.remaining || st.due || '')));
        setPayMethod('cash');
        setPayNotes('');
    };

    // mode: 'add' (abono, suma), 'set' (corregir total, admin), 'void' (anular = 0, admin)
    const submitPay = async (mode = 'add') => {
        if (!payModal) return;
        const set = mode !== 'add';
        const amount = mode === 'void' ? 0 : parseFloat(payAmount);
        if (mode !== 'void' && (!amount || amount <= 0)) return;
        if (mode === 'void' && !confirm('¿Anular el pago de este día? El monto volverá a 0 y quedará como no pagado.')) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/salon/chair-rent/payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    professional_id: payModal.prof.id,
                    date: payModal.dateStr,
                    amount,
                    set,
                    payment_method: mode === 'void' ? null : payMethod,
                    notes: mode === 'void' ? 'Pago anulado' : (payNotes || null),
                }),
            });
            if (res.ok) {
                const msg = mode === 'void' ? 'Pago anulado' : mode === 'set' ? 'Pago corregido' : `Abono de ${fmt(amount)} registrado`;
                addToast?.({ type: 'success', message: msg });
                setPayModal(null);
                loadRentData();
            } else {
                const err = await res.json();
                addToast?.({ type: 'error', message: err.error || 'Error' });
            }
        } catch (e) { addToast?.({ type: 'error', message: 'Error de conexión' }); }
        finally { setSubmitting(false); }
    };

    // Totales del mes
    const totals = (rentData?.professionals || []).reduce((acc, p) => {
        acc.due += p.summary?.total_due || 0;
        acc.paid += p.summary?.total_paid || 0;
        acc.debt += p.summary?.debt || 0;
        return acc;
    }, { due: 0, paid: 0, debt: 0 });

    return (
        <div className="pagos-personal">
            <div className="pagos-personal__header">
                <div className="pagos-personal__title-row">
                    <h1 className="pagos-personal__title">
                        <Armchair size={24} />
                        Arriendo de Sillón
                    </h1>
                </div>

                <div className="pagos-personal__date-nav">
                    <button className="btn btn--ghost btn--icon" onClick={() => changeMonth(-1)}><ChevronLeft size={20} /></button>
                    <span className="pagos-personal__date-label">
                        {new Date(selectedMonth + '-15').toLocaleDateString('es', { month: 'long', year: 'numeric' })}
                    </span>
                    <button className="btn btn--ghost btn--icon" onClick={() => changeMonth(1)}><ChevronRight size={20} /></button>
                </div>

                <div className="pagos-personal__summary">
                    <div className="pagos-personal__stat-card">
                        <div className="pagos-personal__stat-label">Total a Pagar</div>
                        <div className="pagos-personal__stat-value" style={{ color: '#3B82F6' }}>{fmt(totals.due)}</div>
                    </div>
                    <div className="pagos-personal__stat-card">
                        <div className="pagos-personal__stat-label">Total Pagado</div>
                        <div className="pagos-personal__stat-value" style={{ color: '#059669' }}>{fmt(totals.paid)}</div>
                    </div>
                    <div className="pagos-personal__stat-card">
                        <div className="pagos-personal__stat-label">Deuda Acumulada</div>
                        <div className="pagos-personal__stat-value" style={{ color: totals.debt > 0 ? '#EF4444' : '#059669' }}>{fmt(totals.debt)}</div>
                    </div>
                </div>
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                    <div className="spinner spinner--md" />
                </div>
            ) : (
                <div className="pagos-personal__monthly">
                    <div className="pagos-personal__prof-cards">
                        {(rentData?.professionals || []).map(prof => {
                            const daily = prof.daily_amount || 0;
                            const s = prof.summary || {};
                            return (
                                <div key={prof.id} className="pagos-personal__prof-card">
                                    <div className="pagos-personal__prof-card-header">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: prof.color || '#6C5CE7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px', fontWeight: 700, flexShrink: 0 }}>
                                                {prof.avatar_url ? <img src={prof.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (prof.name || '?')[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '15px' }}>{prof.name}</div>
                                                <span style={{ fontSize: '11px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px', background: 'rgba(245,158,11,0.12)', color: '#D97706' }}>
                                                    {prof.rent_amount > 0
                                                        ? `Arriendo ${fmt(prof.rent_amount)}/${FREQ_LABEL[prof.rent_frequency] || 'mes'} · ${fmt(daily)}/día`
                                                        : 'Define el monto en Personal'}
                                                </span>
                                            </div>
                                        </div>
                                        {s.debt > 0 && (
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '11px', color: '#EF4444', fontWeight: 600 }}>DEUDA TOTAL</div>
                                                <div style={{ fontSize: '18px', fontWeight: 800, color: '#EF4444' }}>{fmt(s.debt)}</div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="pagos-personal__prof-stats">
                                        <div>
                                            <span className="pagos-personal__mini-label">Días</span>
                                            <span className="pagos-personal__mini-value">{s.due_days || 0}</span>
                                        </div>
                                        <div>
                                            <span className="pagos-personal__mini-label">Debe</span>
                                            <span className="pagos-personal__mini-value" style={{ color: '#3B82F6' }}>{fmt(s.total_due)}</span>
                                        </div>
                                        <div>
                                            <span className="pagos-personal__mini-label">Pagado</span>
                                            <span className="pagos-personal__mini-value" style={{ color: '#059669' }}>{fmt(s.total_paid)}</span>
                                        </div>
                                    </div>

                                    {daily <= 0 ? (
                                        <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: '#9CA3AF' }}>
                                            Sin monto de arriendo. Edítalo en <strong>Personal</strong>.
                                        </div>
                                    ) : (
                                        <div className="pagos-personal__mini-calendar">
                                            {Array.from({ length: rentData.daysInMonth }, (_, i) => i + 1).map(day => {
                                                const st = dayState(prof, day);
                                                const palette = {
                                                    paid: { bg: '#D1FAE5', color: '#059669' },
                                                    partial: { bg: '#FEF3C7', color: '#D97706' },
                                                    debt: { bg: '#FEE2E2', color: '#EF4444' },
                                                    future: { bg: '#F3F4F6', color: '#9CA3AF' },
                                                    none: { bg: '#F3F4F6', color: '#9CA3AF' },
                                                }[st.status];
                                                const title = st.status === 'paid' ? `Pagado: ${fmt(st.paid)}`
                                                    : st.status === 'partial' ? `Abonado ${fmt(st.paid)} — falta ${fmt(st.remaining)}`
                                                        : st.status === 'debt' ? `Deuda: ${fmt(st.due)}`
                                                            : st.status === 'future' ? 'Día futuro' : 'Sin arriendo';
                                                return (
                                                    <div
                                                        key={day}
                                                        className="pagos-personal__calendar-day"
                                                        style={{ background: palette.bg, color: palette.color, cursor: 'pointer', fontWeight: st.status === 'debt' ? 700 : 600 }}
                                                        title={title}
                                                        onClick={() => openPay(prof, day)}
                                                    >
                                                        {day}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {(!rentData?.professionals || rentData.professionals.length === 0) && (
                            <div className="pagos-personal__empty">
                                <Armchair size={40} />
                                <p>No hay personal en modo arriendo</p>
                                <span>Clasifica al profesional como "Arriendo" en la sección Personal para que aparezca aquí.</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ======== MODAL: REGISTRAR ABONO DEL DÍA ======== */}
            {payModal && (
                <div className="barbershop__modal-overlay" onClick={() => !submitting && setPayModal(null)}>
                    <div className="checkin-modal" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
                        <div className="checkin-modal__header">
                            <div>
                                <h2 className="checkin-modal__title">Arriendo — Día {payModal.day}</h2>
                                <p className="checkin-modal__subtitle">{payModal.prof.name} · {new Date(payModal.dateStr + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                            </div>
                            <button className="checkin-modal__close" onClick={() => setPayModal(null)}><X size={20} /></button>
                        </div>
                        <div className="checkin-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                                <div style={{ background: '#F9FAFB', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase' }}>Arriendo</div>
                                    <div style={{ fontSize: '17px', fontWeight: 700 }}>{fmt(payModal.due)}</div>
                                </div>
                                <div style={{ background: '#F9FAFB', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase' }}>Abonado</div>
                                    <div style={{ fontSize: '17px', fontWeight: 700, color: '#059669' }}>{fmt(payModal.paid)}</div>
                                </div>
                                <div style={{ background: payModal.remaining > 0 ? 'rgba(239,68,68,0.06)' : '#F9FAFB', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase' }}>Falta</div>
                                    <div style={{ fontSize: '17px', fontWeight: 700, color: payModal.remaining > 0 ? '#EF4444' : '#059669' }}>{fmt(payModal.remaining)}</div>
                                </div>
                            </div>

                            {payModal.fullyPaid && !isAdmin ? (
                                <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(16,185,129,0.08)', color: '#059669', fontSize: '14px', fontWeight: 600, textAlign: 'center' }}>
                                    Este día ya está pagado completo.
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>
                                            {payModal.fullyPaid && isAdmin ? 'Corregir monto pagado (admin)' : 'Monto a abonar'}
                                        </label>
                                        <input
                                            type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} min="0" autoFocus
                                            style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '20px', fontWeight: 700, textAlign: 'center' }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Método de pago</label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {[['cash', 'Efectivo', Banknote], ['card', 'Tarjeta', CreditCard], ['transfer', 'Transfer.', ArrowLeftRight]].map(([val, label, Icon]) => (
                                                <button key={val} onClick={() => setPayMethod(val)}
                                                    style={{
                                                        flex: 1, padding: '10px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                                        fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                                                        border: payMethod === val ? '2px solid #6C5CE7' : '1px solid #D1D5DB',
                                                        background: payMethod === val ? 'rgba(108,92,231,0.08)' : '#fff',
                                                        color: payMethod === val ? '#6C5CE7' : '#6B7280',
                                                    }}>
                                                    <Icon size={14} /> {label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Nota (opcional)</label>
                                        <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)}
                                            placeholder="Ej: abono parcial, paga resto mañana..."
                                            style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '13px' }} />
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="checkin-modal__footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                            {isAdmin && payModal.paid > 0 && (
                                <button className="btn btn--ghost" onClick={() => submitPay('void')} disabled={submitting} style={{ color: '#DC2626', marginRight: 'auto' }}>
                                    Anular pago
                                </button>
                            )}
                            <button className="btn btn--ghost" onClick={() => setPayModal(null)} disabled={submitting}>
                                {payModal.fullyPaid && !isAdmin ? 'Cerrar' : 'Cancelar'}
                            </button>
                            {!(payModal.fullyPaid && !isAdmin) && (
                                <button className="btn btn--primary" onClick={() => submitPay(payModal.fullyPaid && isAdmin ? 'set' : 'add')} disabled={submitting || !payAmount || parseFloat(payAmount) <= 0} style={{ background: '#059669' }}>
                                    {submitting ? <div className="spinner spinner--sm" /> : <><Check size={16} /> {payModal.fullyPaid && isAdmin ? 'Guardar cambios' : 'Registrar abono'}</>}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
