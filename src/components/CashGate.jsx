'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { Lock, Wallet, ArrowRight } from 'lucide-react';

// Envuelve el contenido de las secciones de OPERACIONES. Si el usuario no tiene
// una caja abierta, muestra una ventana por encima (modal) con el formulario de
// apertura y deja la página de fondo borrosa. Una caja por usuario.
export default function CashGate({ children }) {
    const { tenantCurrency } = useStore();
    const fmt = (v) => new Intl.NumberFormat('es', { style: 'currency', currency: tenantCurrency || 'CLP', minimumFractionDigits: 0 }).format(v || 0);

    const [status, setStatus] = useState('loading'); // loading | open | closed
    const [opening, setOpening] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const check = useCallback(async () => {
        try {
            const res = await fetch('/api/salon/cash-register', { cache: 'no-store' });
            if (res.ok) {
                const d = await res.json();
                setStatus(d.register ? 'open' : 'closed');
            } else setStatus('closed');
        } catch { setStatus('closed'); }
    }, []);

    useEffect(() => { check(); }, [check]);

    const openCaja = async () => {
        setSubmitting(true); setError('');
        try {
            const res = await fetch('/api/salon/cash-register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'open', opening_amount: parseFloat(opening) || 0 }),
            });
            if (res.ok) { setStatus('open'); }
            else { const e = await res.json().catch(() => ({})); setError(e.error || 'No se pudo abrir la caja'); }
        } catch { setError('Error de conexión'); }
        finally { setSubmitting(false); }
    };

    // La página siempre se renderiza detrás; el overlay aparece encima cuando
    // la caja no está abierta (o mientras se verifica), dejándola borrosa.
    return (
        <>
            {children}
            {status !== 'open' && (
                <div className="cash-gate__overlay">
                    {status === 'loading' ? (
                        <div className="spinner spinner--lg" />
                    ) : (
                        <div className="cash-gate__modal">
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '32px 28px', textAlign: 'center' }}>
                                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(108,92,231,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6C5CE7' }}>
                                    <Lock size={30} />
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>Abre tu caja para continuar</h2>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px', lineHeight: 1.5 }}>
                                        Para usar las secciones de Operaciones necesitas una caja abierta. Así quedan registrados todos tus cobros y movimientos de efectivo.
                                    </p>
                                </div>

                                <div style={{ width: '100%', textAlign: 'left' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>
                                        Monto inicial en caja (efectivo)
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <Wallet size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        <input
                                            type="number" min="0" autoFocus value={opening}
                                            onChange={e => setOpening(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && openCaja()}
                                            placeholder="0"
                                            style={{ width: '100%', padding: '12px 14px 12px 42px', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '20px', fontWeight: 700 }}
                                        />
                                    </div>
                                    {opening !== '' && (
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>Apertura: {fmt(parseFloat(opening) || 0)}</p>
                                    )}
                                </div>

                                {error && <div style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', color: '#DC2626', fontSize: '13px' }}>{error}</div>}

                                <button className="btn btn--primary btn--block btn--lg" onClick={openCaja} disabled={submitting} style={{ marginTop: '4px' }}>
                                    {submitting ? <div className="spinner spinner--sm" /> : <>Abrir Caja <ArrowRight size={18} /></>}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
