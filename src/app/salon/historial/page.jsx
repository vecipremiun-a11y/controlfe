'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { Search, Download, Send, RotateCcw, Ban, Calendar, User, FileText, Receipt } from 'lucide-react';

const STATUS_META = {
    completed: { label: 'COMPLETADA', color: '#059669', bg: 'rgba(5,150,105,0.12)' },
    voided: { label: 'ANULADA', color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
    refunded: { label: 'DEVOLUCIÓN', color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
};
const PAY_LABEL = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', mixed: 'Mixto' };

export default function HistorialPage() {
    const { user, tenantCurrency } = useStore();
    const fmt = (v) => new Intl.NumberFormat('es', { style: 'currency', currency: tenantCurrency || 'CLP', minimumFractionDigits: 0 }).format(v || 0);
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD hora local

    const [from, setFrom] = useState(today);
    const [to, setTo] = useState(today);
    const [seller, setSeller] = useState('');
    const [status, setStatus] = useState('all');
    const [q, setQ] = useState('');
    const [sellers, setSellers] = useState([]);
    const [sales, setSales] = useState([]);
    const [loading, setLoading] = useState(true);

    const [selectedId, setSelectedId] = useState(null);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [acting, setActing] = useState(false);

    const canVoid = ['owner', 'admin', 'supervisor'].includes(user?.role);

    // Fecha/hora de Chile a partir del created_at en UTC ("YYYY-MM-DD HH:MM:SS")
    const fmtDateTime = (s) => {
        if (!s) return '';
        const d = new Date(s.replace(' ', 'T') + 'Z');
        return d.toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const loadSales = useCallback(async () => {
        setLoading(true);
        try {
            const p = new URLSearchParams({ from, to, seller, status, q });
            const res = await fetch(`/api/salon/sales/history?${p.toString()}`);
            if (res.ok) {
                const d = await res.json();
                setSales(d.sales || []);
                setSellers(d.sellers || []);
                // Selecciona la primera venta si la actual ya no está en la lista
                if (d.sales?.length) {
                    if (!d.sales.find(s => s.id === selectedId)) setSelectedId(d.sales[0].id);
                } else {
                    setSelectedId(null);
                    setDetail(null);
                }
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [from, to, seller, status, q]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { loadSales(); }, [loadSales]);

    useEffect(() => {
        if (!selectedId) { setDetail(null); return; }
        let cancelled = false;
        (async () => {
            setDetailLoading(true);
            try {
                const res = await fetch(`/api/salon/sales/${selectedId}`);
                if (res.ok && !cancelled) { const d = await res.json(); setDetail(d.sale); }
            } catch (e) { console.error(e); }
            finally { if (!cancelled) setDetailLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [selectedId]);

    async function doAction(action) {
        const verb = action === 'refund' ? 'registrar la devolución de' : 'anular';
        if (!confirm(`¿Seguro que deseas ${verb} la venta #${detail.folio}? Se repondrá el stock de los productos.`)) return;
        setActing(true);
        try {
            const res = await fetch(`/api/salon/sales/${detail.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            });
            const d = await res.json();
            if (res.ok) {
                setDetail({ ...detail, status: d.status });
                setSales(sales.map(s => s.id === detail.id ? { ...s, status: d.status } : s));
            } else {
                alert(d.error || 'No se pudo completar la acción');
            }
        } catch (e) { alert('Error de conexión'); }
        finally { setActing(false); }
    }

    function receiptLines(s) {
        const lines = [];
        lines.push(`*${s.tenant_name || 'Comprobante'}*`);
        lines.push(`Boleta #${s.folio}`);
        lines.push(fmtDateTime(s.created_at));
        if (s.seller_name) lines.push(`Vendedor: ${s.seller_name}`);
        if (s.client_name) lines.push(`Cliente: ${s.client_name}`);
        lines.push('-----------------------------');
        (s.items || []).forEach(it => {
            lines.push(`${it.quantity} x ${it.item_name}  ${fmt(it.total)}`);
        });
        lines.push('-----------------------------');
        lines.push(`Subtotal: ${fmt(s.subtotal)}`);
        if (s.discount) lines.push(`Descuento: -${fmt(s.discount)}`);
        if (s.tip) lines.push(`Propina: ${fmt(s.tip)}`);
        lines.push(`*TOTAL: ${fmt(s.total)}*`);
        lines.push(`Pago: ${PAY_LABEL[s.payment_method] || s.payment_method}`);
        return lines.join('\n');
    }

    function shareWhatsApp() {
        const text = encodeURIComponent(receiptLines(detail));
        const phone = (detail.client_phone || '').replace(/\D/g, '');
        window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
    }

    function downloadPDF() {
        const s = detail;
        const rows = (s.items || []).map(it => `
            <tr>
              <td>${it.item_name}</td>
              <td style="text-align:center">${it.quantity}</td>
              <td style="text-align:right">${fmt(it.unit_price)}</td>
              <td style="text-align:right">${fmt(it.total)}</td>
            </tr>`).join('');
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Boleta #${s.folio}</title>
          <style>
            body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:32px;max-width:700px;margin:auto}
            h1{font-size:20px;margin:0} .muted{color:#666;font-size:13px}
            table{width:100%;border-collapse:collapse;margin-top:20px}
            th,td{padding:8px;border-bottom:1px solid #eee;font-size:13px}
            th{text-align:left;color:#666;font-weight:600}
            .tot{display:flex;justify-content:space-between;font-size:14px;padding:4px 0}
            .grand{font-weight:800;font-size:18px;border-top:2px solid #111;margin-top:8px;padding-top:8px}
          </style></head><body>
          <h1>${s.tenant_name || 'Comprobante'}</h1>
          <div class="muted">${[s.tenant_address, s.tenant_city].filter(Boolean).join(', ')}</div>
          <div style="margin-top:16px">
            <strong>Boleta #${s.folio}</strong><br>
            <span class="muted">${fmtDateTime(s.created_at)}${s.seller_name ? ' · Vendedor: ' + s.seller_name : ''}</span><br>
            ${s.client_name ? '<span class="muted">Cliente: ' + s.client_name + '</span>' : ''}
          </div>
          <table><thead><tr><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:right">P. Unit.</th><th style="text-align:right">Total</th></tr></thead>
          <tbody>${rows}</tbody></table>
          <div style="margin-top:16px">
            <div class="tot"><span>Subtotal</span><span>${fmt(s.subtotal)}</span></div>
            ${s.discount ? `<div class="tot"><span>Descuento</span><span>-${fmt(s.discount)}</span></div>` : ''}
            ${s.tip ? `<div class="tot"><span>Propina</span><span>${fmt(s.tip)}</span></div>` : ''}
            <div class="tot grand"><span>TOTAL</span><span>${fmt(s.total)}</span></div>
            <div class="tot"><span>Método de pago</span><span>${PAY_LABEL[s.payment_method] || s.payment_method}</span></div>
          </div>
          <script>window.onload=function(){window.print()}</script>
          </body></html>`;
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
    }

    const inputStyle = { padding: '8px 12px', fontSize: '13px' };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">Historial de Ventas</h1>
                    <p className="page-header__subtitle">Gestiona y revisa todas tus transacciones.</p>
                </div>
            </div>

            {/* Filtros */}
            <div className="card" style={{ marginBottom: '20px' }}>
                <div className="card__body" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
                        <input type="date" className="form-input" value={from} max={to} onChange={e => setFrom(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                        <input type="date" className="form-input" value={to} min={from} onChange={e => setTo(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
                    </div>
                    <select className="form-input form-select" value={seller} onChange={e => setSeller(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
                        <option value="">Todos los Vendedores</option>
                        {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select className="form-input form-select" value={status} onChange={e => setStatus(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
                        <option value="all">Todos los estados</option>
                        <option value="completed">Completadas</option>
                        <option value="voided">Anuladas</option>
                        <option value="refunded">Devoluciones</option>
                    </select>
                    <div style={{ position: 'relative', flex: 1, minWidth: '160px' }}>
                        <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input className="form-input" placeholder="N° Boleta" value={q} onChange={e => setQ(e.target.value)} style={{ ...inputStyle, paddingLeft: '34px' }} />
                    </div>
                </div>
            </div>

            <div className="rgrid rgrid--list-detail">
                {/* Lista */}
                <div className="card" style={{ maxHeight: 'calc(100vh - 280px)', display: 'flex', flexDirection: 'column' }}>
                    <div className="card__header"><h3 className="card__title">Resultados ({sales.length})</h3></div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {loading ? (
                            <div style={{ padding: '40px', textAlign: 'center' }}><div className="spinner" /></div>
                        ) : sales.length === 0 ? (
                            <p style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>Sin ventas en este filtro</p>
                        ) : sales.map(s => {
                            const meta = STATUS_META[s.status] || STATUS_META.completed;
                            const active = s.id === selectedId;
                            return (
                                <div key={s.id} onClick={() => setSelectedId(s.id)}
                                    style={{
                                        padding: '14px 18px', cursor: 'pointer', borderBottom: '1px solid var(--gray-100)',
                                        borderLeft: `3px solid ${active ? 'var(--primary-500)' : 'transparent'}`,
                                        background: active ? 'var(--primary-50)' : 'white',
                                    }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <span style={{ fontWeight: 700, fontSize: '13px' }}>#{s.folio}</span>
                                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', color: meta.color, background: meta.bg }}>{meta.label}</span>
                                    </div>
                                    <div style={{ fontWeight: 700, color: 'var(--primary-700)', fontSize: '16px' }}>{fmt(s.total)}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{fmtDateTime(s.created_at)}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Detalle */}
                <div className="card" style={{ minHeight: '400px' }}>
                    {detailLoading ? (
                        <div style={{ padding: '60px', textAlign: 'center' }}><div className="spinner spinner--lg" /></div>
                    ) : !detail ? (
                        <div style={{ padding: '80px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Receipt size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                            <p>Selecciona una venta para ver el detalle</p>
                        </div>
                    ) : (() => {
                        const meta = STATUS_META[detail.status] || STATUS_META.completed;
                        return (
                            <div className="card__body">
                                {/* Encabezado */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                                    <div>
                                        <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0 }}>Venta #{detail.folio}</h2>
                                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                            {fmtDateTime(detail.created_at)}{detail.seller_name ? ` · Vendedor: ${detail.seller_name}` : ''}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--primary-700)' }}>{fmt(detail.total)}</div>
                                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', color: meta.color, background: meta.bg }}>{meta.label}</span>
                                    </div>
                                </div>

                                {/* Acciones */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '18px 0' }}>
                                    <button className="btn btn--outline btn--sm" onClick={downloadPDF}><Download size={15} /> Descargar PDF</button>
                                    <button className="btn btn--outline btn--sm" onClick={shareWhatsApp} style={{ color: '#16a34a', borderColor: '#16a34a' }}><Send size={15} /> Compartir WhatsApp</button>
                                    {canVoid && detail.status === 'completed' && (
                                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                                            <button className="btn btn--outline btn--sm" disabled={acting} onClick={() => doAction('refund')} style={{ color: '#D97706', borderColor: '#D97706' }}><RotateCcw size={15} /> Devolución</button>
                                            <button className="btn btn--outline btn--sm" disabled={acting} onClick={() => doAction('void')} style={{ color: '#DC2626', borderColor: '#DC2626' }}><Ban size={15} /> Anular Venta</button>
                                        </div>
                                    )}
                                </div>

                                {/* Productos */}
                                <table className="table">
                                    <thead><tr><th>Producto</th><th style={{ textAlign: 'center' }}>Cantidad</th><th style={{ textAlign: 'right' }}>Precio Unit.</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
                                    <tbody>
                                        {(detail.items || []).map(it => (
                                            <tr key={it.id}>
                                                <td style={{ fontWeight: 600 }}>{it.item_name}</td>
                                                <td style={{ textAlign: 'center' }}><span className="badge badge--purple">{it.quantity} {it.type === 'product' ? 'Und' : ''}</span></td>
                                                <td style={{ textAlign: 'right' }}>{fmt(it.unit_price)}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(it.total)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {/* Totales + Pago */}
                                <div className="rgrid rgrid--totals" style={{ marginTop: '20px' }}>
                                    <div />
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '14px' }}><span style={{ color: 'var(--text-muted)' }}>Subtotal</span><span>{fmt(detail.subtotal)}</span></div>
                                        {detail.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '14px' }}><span style={{ color: 'var(--text-muted)' }}>Descuento</span><span>-{fmt(detail.discount)}</span></div>}
                                        {detail.tip > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '14px' }}><span style={{ color: 'var(--text-muted)' }}>Propina</span><span>{fmt(detail.tip)}</span></div>}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '2px solid var(--gray-200)', marginTop: '6px', fontWeight: 800, fontSize: '18px' }}><span>Total</span><span>{fmt(detail.total)}</span></div>

                                        <div style={{ marginTop: '16px', padding: '14px', background: 'var(--gray-50)', borderRadius: 'var(--radius-sm)' }}>
                                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px', marginBottom: '8px' }}>INFORMACIÓN DE PAGO</div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '2px 0' }}><span style={{ color: 'var(--text-muted)' }}>Método</span><span>{PAY_LABEL[detail.payment_method] || detail.payment_method}</span></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '2px 0' }}><span style={{ color: 'var(--text-muted)' }}>Pagado</span><span>{fmt(detail.total)}</span></div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '2px 0' }}><span style={{ color: 'var(--text-muted)' }}>Vuelto</span><span>{fmt(0)}</span></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
}
