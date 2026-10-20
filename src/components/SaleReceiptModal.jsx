'use client';

import { Receipt, Phone, X } from 'lucide-react';

// created_at viene de SQLite en UTC y sin zona: se muestra en hora de Chile.
function saleTime(createdAt) {
    const raw = String(createdAt || '');
    const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`);
    const opts = { timeZone: 'America/Santiago' };
    return {
        date: d.toLocaleDateString('es-CL', opts),
        time: d.toLocaleTimeString('es-CL', { ...opts, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    };
}

// Boleta de una venta recién cerrada: imprimir (58 mm) o enviar por WhatsApp.
// sale: respuesta de POST /api/salon/sales (con items y datos del local).
export default function SaleReceiptModal({ sale, currency, onClose }) {
    if (!sale) return null;
    const when = saleTime(sale.created_at);
    const fmt = (v) => new Intl.NumberFormat('es', { style: 'currency', currency: currency || 'CLP', minimumFractionDigits: 0 }).format(v);
    return (
        <div className="barbershop__modal-overlay" onClick={() => onClose()}>
            <div className="receipt-modal" onClick={(e) => e.stopPropagation()}>
                <div className="receipt-modal__actions">
                    <button className="receipt-modal__action-btn" onClick={() => {
                        const r = sale;
                        const cur = currency || 'CLP';
                        const fmtP = (v) => new Intl.NumberFormat('es', { style: 'currency', currency: cur, minimumFractionDigits: 0 }).format(v);
                        const payLabel = r.payment_method === 'cash' ? 'Efectivo' : r.payment_method === 'card' ? 'Tarjeta' : r.payment_method === 'mixed' ? 'Mixto' : 'Transfer.';
                        const dateStr = when.date;
                        const timeStr = when.time;
                        const prof = r.items?.[0]?.professional_name || r.user_name || '';
                        const logoTag = r.tenant_logo ? `<img src="${r.tenant_logo}" style="max-width:100px;max-height:36px;display:block;margin:0 auto 4px">` : '';
                        const itemsHtml = (r.items || []).map(i => {
                            const name = i.item_name.length > 20 ? i.item_name.substring(0, 20) + '..' : i.item_name;
                            return `<tr><td>${name} x${i.quantity}</td><td style="text-align:right;white-space:nowrap">${fmtP(i.total)}</td></tr>`;
                        }).join('');
                        const w = window.open('', '_blank', 'width=260,height=500');
                        w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Boleta</title>
<style>@page{size:58mm auto;margin:0}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Courier New',monospace;font-size:11px;width:48mm;margin:0 auto;padding:2mm 1mm;color:#000;line-height:1.3}
.c{text-align:center}.d{border-top:1px dashed #000;margin:3px 0}.sn{font-size:13px;font-weight:bold;margin:2px 0}
.inf{font-size:9px;color:#333}table{width:100%;border-collapse:collapse}td{padding:1px 0;font-size:11px;vertical-align:top}
.tl{font-size:14px;font-weight:bold;border-top:1px solid #000;padding-top:3px;margin-top:2px}.ft{font-size:9px;text-align:center;margin-top:6px;color:#555}
</style></head><body>
<div class="c">${logoTag}<div class="sn">${r.tenant_name || 'Boleta'}</div>
${r.tenant_address ? `<div class="inf">${r.tenant_address}${r.tenant_city ? ', ' + r.tenant_city : ''}</div>` : ''}
${r.tenant_phone ? `<div class="inf">Tel: ${r.tenant_phone}</div>` : ''}
${r.tenant_email ? `<div class="inf">${r.tenant_email}</div>` : ''}</div>
<div class="d"></div>
<table><tr><td>Fecha:</td><td style="text-align:right">${dateStr} ${timeStr}</td></tr>
${r.client_name ? `<tr><td>Cliente:</td><td style="text-align:right">${r.client_name}</td></tr>` : ''}
${prof ? `<tr><td>Atendió:</td><td style="text-align:right">${prof}</td></tr>` : ''}</table>
<div class="d"></div><table>${itemsHtml}</table><div class="d"></div>
<table><tr><td>Subtotal</td><td style="text-align:right">${fmtP(r.subtotal)}</td></tr>
${r.tip > 0 ? `<tr><td>Propina</td><td style="text-align:right">${fmtP(r.tip)}</td></tr>` : ''}</table>
<div class="tl c">${fmtP(r.total)}</div>
<div style="text-align:center;font-size:10px;margin-top:2px">${payLabel}</div>
<div class="d"></div><div class="ft">¡Gracias por su visita!</div>
</body></html>`);
                        w.document.close();
                        w.onload = () => { w.focus(); w.print(); };
                        w.onafterprint = () => w.close();
                    }}>
                        <Receipt size={16} />
                        Imprimir
                    </button>
                    <button className="receipt-modal__action-btn receipt-modal__action-btn--whatsapp" onClick={() => {
                        const r = sale;
                        const itemLines = (r.items || []).map(i => `  ${i.item_name} x${i.quantity} — ${fmt(i.total)}`).join('\n');
                        const payLabel = r.payment_method === 'cash' ? 'Efectivo' : r.payment_method === 'card' ? 'Tarjeta' : r.payment_method === 'mixed' ? 'Mixto' : 'Transferencia';
                        const text = encodeURIComponent(
                            `*${r.tenant_name || 'Boleta de Venta'}*\n` +
                            (r.tenant_address ? `📍 ${r.tenant_address}${r.tenant_city ? ', ' + r.tenant_city : ''}\n` : '') +
                            (r.tenant_phone ? `📞 ${r.tenant_phone}\n` : '') +
                            `\n📅 ${when.date} ${when.time}\n` +
                            (r.client_name ? `👤 ${r.client_name}\n` : '') +
                            `\n--- Detalle ---\n${itemLines}\n` +
                            `\nSubtotal: ${fmt(r.subtotal)}` +
                            (r.tip > 0 ? `\nPropina: ${fmt(r.tip)}` : '') +
                            `\n*TOTAL: ${fmt(r.total)}*` +
                            `\n💳 ${payLabel}` +
                            `\n\n¡Gracias por su visita!`
                        );
                        const phoneClean = r.client_phone ? r.client_phone.replace(/\D/g, '') : '';
                        const waUrl = phoneClean ? `https://wa.me/${phoneClean}?text=${text}` : `https://wa.me/?text=${text}`;
                        window.open(waUrl, '_blank');
                    }}>
                        <Phone size={16} />
                        WhatsApp
                    </button>
                    <button className="receipt-modal__close-btn" onClick={() => onClose()}>
                        <X size={18} />
                    </button>
                </div>

                <div id="receipt-print-area" className="receipt-modal__body">
                    {sale.tenant_logo && (
                        <img src={sale.tenant_logo} alt="" className="receipt-modal__logo" />
                    )}
                    <div className="receipt-modal__header">
                        <h2>{sale.tenant_name || 'Boleta de Venta'}</h2>
                        {sale.tenant_address && <p>{sale.tenant_address}{sale.tenant_city ? `, ${sale.tenant_city}` : ''}</p>}
                        {sale.tenant_phone && <p>Tel: {sale.tenant_phone}</p>}
                        {sale.tenant_email && <p>{sale.tenant_email}</p>}
                    </div>
                    <div className="receipt-modal__divider" />
                    <div className="receipt-modal__meta">
                        <div className="receipt-modal__meta-row">
                            <span>Fecha:</span>
                            <span>{when.date} {when.time}</span>
                        </div>
                        {sale.client_name && (
                            <div className="receipt-modal__meta-row">
                                <span>Cliente:</span>
                                <span>{sale.client_name}</span>
                            </div>
                        )}
                        <div className="receipt-modal__meta-row">
                            <span>Atendido por:</span>
                            <span>{sale.items?.[0]?.professional_name || sale.user_name || '-'}</span>
                        </div>
                    </div>
                    <div className="receipt-modal__divider" />
                    <div className="receipt-modal__items">
                        {(sale.items || []).map((item, idx) => (
                            <div key={idx} className="receipt-modal__item-row">
                                <span className="receipt-modal__item-name">{item.item_name} x{item.quantity}</span>
                                <span className="receipt-modal__item-price">{fmt(item.total)}</span>
                            </div>
                        ))}
                    </div>
                    <div className="receipt-modal__divider" />
                    <div className="receipt-modal__totals">
                        <div className="receipt-modal__total-row">
                            <span>Subtotal</span>
                            <span>{fmt(sale.subtotal)}</span>
                        </div>
                        {sale.tip > 0 && (
                            <div className="receipt-modal__total-row">
                                <span>Propina</span>
                                <span>{fmt(sale.tip)}</span>
                            </div>
                        )}
                        <div className="receipt-modal__total-row receipt-modal__total-row--grand">
                            <span>TOTAL</span>
                            <span>{fmt(sale.total)}</span>
                        </div>
                        <div className="receipt-modal__total-row">
                            <span>Método de pago</span>
                            <span>{sale.payment_method === 'cash' ? 'Efectivo' : sale.payment_method === 'card' ? 'Tarjeta' : sale.payment_method === 'mixed' ? 'Mixto' : 'Transferencia'}</span>
                        </div>
                    </div>
                    <div className="receipt-modal__divider" />
                    <div className="receipt-modal__footer-msg">
                        <p>¡Gracias por su visita!</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
