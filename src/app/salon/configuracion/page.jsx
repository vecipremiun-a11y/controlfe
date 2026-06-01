'use client';

import { useState, useEffect, useRef } from 'react';
import { Building2, CreditCard, Printer, Palette, Link2, Save, CheckCircle, Upload, Trash2, Clock, Calendar, MessageSquare, Settings2 } from 'lucide-react';

const CURRENCIES = [
    { code: 'DOP', symbol: 'RD$', name: 'Peso Dominicano', country: '🇩🇴' },
    { code: 'USD', symbol: '$', name: 'Dólar Estadounidense', country: '🇺🇸' },
    { code: 'EUR', symbol: '€', name: 'Euro', country: '🇪🇺' },
    { code: 'CLP', symbol: '$', name: 'Peso Chileno', country: '🇨🇱' },
    { code: 'PEN', symbol: 'S/', name: 'Sol Peruano', country: '🇵🇪' },
    { code: 'ARS', symbol: '$', name: 'Peso Argentino', country: '🇦🇷' },
    { code: 'COP', symbol: '$', name: 'Peso Colombiano', country: '🇨🇴' },
    { code: 'BRL', symbol: 'R$', name: 'Real Brasileño', country: '🇧🇷' },
    { code: 'UYU', symbol: '$U', name: 'Peso Uruguayo', country: '🇺🇾' },
    { code: 'PYG', symbol: '₲', name: 'Guaraní Paraguayo', country: '🇵🇾' },
    { code: 'BOB', symbol: 'Bs', name: 'Boliviano', country: '🇧🇴' },
    { code: 'VES', symbol: 'Bs.D', name: 'Bolívar Venezolano', country: '🇻🇪' },
    { code: 'GYD', symbol: '$', name: 'Dólar Guyanés', country: '🇬🇾' },
    { code: 'SRD', symbol: '$', name: 'Dólar Surinamés', country: '🇸🇷' },
    { code: 'MXN', symbol: '$', name: 'Peso Mexicano', country: '🇲🇽' },
    { code: 'PAB', symbol: 'B/.', name: 'Balboa Panameño', country: '🇵🇦' },
    { code: 'CRC', symbol: '₡', name: 'Colón Costarricense', country: '🇨🇷' },
    { code: 'GTQ', symbol: 'Q', name: 'Quetzal Guatemalteco', country: '🇬🇹' },
    { code: 'HNL', symbol: 'L', name: 'Lempira Hondureño', country: '🇭🇳' },
    { code: 'NIO', symbol: 'C$', name: 'Córdoba Nicaragüense', country: '🇳🇮' },
];

const TIMEZONES = [
    'America/Santo_Domingo', 'America/Santiago', 'America/Lima', 'America/Argentina/Buenos_Aires',
    'America/Bogota', 'America/Sao_Paulo', 'America/Montevideo', 'America/Asuncion',
    'America/La_Paz', 'America/Caracas', 'America/Guayaquil', 'America/Mexico_City',
    'America/Panama', 'America/Costa_Rica', 'America/Guatemala', 'America/Tegucigalpa',
    'America/Managua', 'America/New_York', 'America/Chicago', 'America/Los_Angeles',
];

const SECTIONS = [
    { id: 'datos', icon: Building2, label: 'Datos del Salón' },
    { id: 'operacion', icon: Settings2, label: 'Operación' },
    { id: 'pagos', icon: CreditCard, label: 'Métodos de Pago' },
    { id: 'impresion', icon: Printer, label: 'Impresión' },
    { id: 'integraciones', icon: Link2, label: 'Integraciones' },
    { id: 'personalizacion', icon: Palette, label: 'Personalización' },
];

export default function ConfiguracionPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [activeSection, setActiveSection] = useState('datos');
    const [logoUrl, setLogoUrl] = useState(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const logoInputRef = useRef(null);
    const [form, setForm] = useState({
        name: '', phone: '', address: '', email: '', timezone: 'America/Santo_Domingo', currency: 'DOP',
    });
    const [bookingConfig, setBookingConfig] = useState({
        payment_methods: { cash: true, card: false, transfer: false },
    });
    const [assignMode, setAssignMode] = useState('least_busy');

    useEffect(() => { loadConfig(); }, []);

    async function loadConfig() {
        try {
            const res = await fetch('/api/salon/config');
            if (res.ok) {
                const data = await res.json();
                if (data.config) {
                    setForm({
                        name: data.config.name || '',
                        phone: data.config.phone || '',
                        address: data.config.address || '',
                        email: data.config.email || '',
                        timezone: data.config.timezone || 'America/Santo_Domingo',
                        currency: data.config.currency || 'DOP',
                    });
                    setLogoUrl(data.config.logo_url || null);
                    try {
                        const cfg = JSON.parse(data.config.config || '{}');
                        if (cfg.payment_methods) {
                            setBookingConfig(prev => ({ ...prev, payment_methods: cfg.payment_methods }));
                        }
                        if (cfg.assign_mode) {
                            setAssignMode(cfg.assign_mode);
                        }
                    } catch {}
                }
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }

    async function handleSave() {
        setSaving(true);
        setSaved(false);
        try {
            const res = await fetch('/api/salon/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            }
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    }

    async function handleSaveBookingConfig() {
        setSaving(true);
        setSaved(false);
        try {
            const res = await fetch('/api/salon/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ booking_config: bookingConfig }),
            });
            if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            }
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    }

    async function handleSaveOperationConfig() {
        setSaving(true);
        setSaved(false);
        try {
            const res = await fetch('/api/salon/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ booking_config: { assign_mode: assignMode } }),
            });
            if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            }
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    }

    async function handleLogoUpload(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingLogo(true);
        try {
            const formData = new FormData();
            formData.append('logo', file);
            const res = await fetch('/api/salon/config', { method: 'POST', body: formData });
            if (res.ok) {
                const data = await res.json();
                setLogoUrl(data.logo_url + '?t=' + Date.now());
            } else {
                const err = await res.json();
                alert(err.error || 'Error al subir logo');
            }
        } catch (e) { console.error(e); }
        finally {
            setUploadingLogo(false);
            if (logoInputRef.current) logoInputRef.current.value = '';
        }
    }

    const selectedCurrency = CURRENCIES.find(c => c.code === form.currency);
    const initials = form.name ? form.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() : 'SP';

    if (loading) return <div className="loading-page"><div className="spinner spinner--lg" /></div>;

    return (
        <div>
            <div className="page-header">
                <div><h1 className="page-header__title">Configuración</h1><p className="page-header__subtitle">Personaliza tu salón</p></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '20px' }}>
                <div className="card" style={{ height: 'fit-content', position: 'sticky', top: '20px' }}>
                    <div className="card__body" style={{ padding: '8px' }}>
                        {SECTIONS.map((item) => (
                            <button
                                key={item.id}
                                className={`sidebar__link ${activeSection === item.id ? 'sidebar__link--active' : ''}`}
                                onClick={() => setActiveSection(item.id)}
                            >
                                <item.icon size={18} /> {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* ========== DATOS DEL SALÓN ========== */}
                    {activeSection === 'datos' && (
                        <div className="card">
                            <div className="card__header"><h3 className="card__title"><Building2 size={20} /> Datos del Salón</h3></div>
                            <div className="card__body">
                                {/* Logo */}
                                <div className="form-group" style={{ marginBottom: '24px' }}>
                                    <label className="form-label">Logo del Salón</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        {logoUrl ? (
                                            <img
                                                src={logoUrl}
                                                alt="Logo"
                                                style={{ width: '80px', height: '80px', borderRadius: 'var(--radius-md)', objectFit: 'cover', border: '2px solid var(--border-primary)' }}
                                            />
                                        ) : (
                                            <div style={{ width: '80px', height: '80px', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, var(--primary-400), var(--primary-600))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '24px' }}>
                                                {initials}
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <input
                                                ref={logoInputRef}
                                                type="file"
                                                accept="image/jpeg,image/png,image/webp"
                                                style={{ display: 'none' }}
                                                onChange={handleLogoUpload}
                                            />
                                            <button
                                                className="btn btn--outline btn--sm"
                                                onClick={() => logoInputRef.current?.click()}
                                                disabled={uploadingLogo}
                                            >
                                                <Upload size={14} /> {uploadingLogo ? 'Subiendo...' : 'Subir Logo'}
                                            </button>
                                            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>
                                                JPG, PNG o WebP. Máximo 2MB.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Nombre del Salón</label>
                                        <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Teléfono</label>
                                        <input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Dirección</label>
                                    <input className="form-input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Email</label>
                                        <input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Zona Horaria</label>
                                        <select className="form-input form-select" value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })}>
                                            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace('America/', '').replace(/_/g, ' ')}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label form-label--required">Moneda</label>
                                        <select
                                            className="form-input form-select"
                                            value={form.currency}
                                            onChange={e => setForm({ ...form, currency: e.target.value })}
                                        >
                                            {CURRENCIES.map(c => (
                                                <option key={c.code} value={c.code}>
                                                    {c.country} {c.code} - {c.name} ({c.symbol})
                                                </option>
                                            ))}
                                        </select>
                                        {selectedCurrency && (
                                            <p className="form-hint">
                                                Todos los precios, ventas y reportes se mostrarán en <strong>{selectedCurrency.name}</strong> ({selectedCurrency.symbol})
                                            </p>
                                        )}
                                    </div>
                                    <div className="form-group" />
                                </div>

                                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
                                    {saved && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-green)', fontSize: '14px', fontWeight: 600, animation: 'fadeIn 0.3s ease' }}>
                                            <CheckCircle size={16} /> Cambios guardados
                                        </span>
                                    )}
                                    <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
                                        <Save size={16} /> {saving ? 'Guardando...' : 'Guardar Cambios'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== OPERACIÓN ========== */}
                    {activeSection === 'operacion' && (
                        <div className="card">
                            <div className="card__header"><h3 className="card__title"><Settings2 size={20} /> Configuración de Operación</h3></div>
                            <div className="card__body">
                                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                                    Configura cómo se asignan los clientes a los profesionales en la vista Barbershop Live.
                                </p>

                                <div className="form-group">
                                    <label className="form-label">Modo de Auto-Asignación</label>
                                    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
                                        Define el criterio para elegir a qué profesional se le asigna el siguiente cliente cuando presionas &quot;Auto-Asignar&quot;.
                                    </p>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {[
                                            {
                                                value: 'least_busy',
                                                label: 'Menos cortes del día',
                                                desc: 'Prioriza al profesional que menos servicios ha realizado hoy. Distribuye el trabajo equitativamente.',
                                            },
                                            {
                                                value: 'round_robin',
                                                label: 'Por turno (orden de llegada)',
                                                desc: 'Asigna al profesional que más tiempo lleva esperando desde su último servicio. Respeta el orden de turnos.',
                                            },
                                        ].map(opt => (
                                            <label
                                                key={opt.value}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'flex-start',
                                                    gap: '12px',
                                                    padding: '14px',
                                                    borderRadius: 'var(--radius-md)',
                                                    border: `2px solid ${assignMode === opt.value ? 'var(--primary-500)' : 'var(--border-primary)'}`,
                                                    background: assignMode === opt.value ? 'var(--primary-50, #f0f0ff)' : '#fff',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                }}
                                            >
                                                <input
                                                    type="radio"
                                                    name="assign_mode"
                                                    value={opt.value}
                                                    checked={assignMode === opt.value}
                                                    onChange={() => setAssignMode(opt.value)}
                                                    style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: 'var(--primary-500)' }}
                                                />
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '2px' }}>{opt.label}</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{opt.desc}</div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
                                    {saved && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-green)', fontSize: '14px', fontWeight: 600, animation: 'fadeIn 0.3s ease' }}>
                                            <CheckCircle size={16} /> Cambios guardados
                                        </span>
                                    )}
                                    <button className="btn btn--primary" onClick={handleSaveOperationConfig} disabled={saving}>
                                        <Save size={16} /> {saving ? 'Guardando...' : 'Guardar Cambios'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== MÉTODOS DE PAGO ========== */}
                    {activeSection === 'pagos' && (
                        <div className="card">
                            <div className="card__header"><h3 className="card__title"><CreditCard size={20} /> Métodos de Pago</h3></div>
                            <div className="card__body">
                                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                                    Configura los métodos de pago que aceptas en tu salón.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {[
                                        { key: 'cash', label: 'Efectivo', desc: 'Pagos en efectivo en el local' },
                                        { key: 'card', label: 'Tarjeta', desc: 'Tarjeta de débito o crédito' },
                                        { key: 'transfer', label: 'Transferencia', desc: 'Transferencia bancaria o depósito' },
                                    ].map(method => (
                                        <label
                                            key={method.key}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)',
                                                cursor: 'pointer',
                                                background: bookingConfig.payment_methods?.[method.key] ? 'var(--primary-50)' : 'transparent',
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '14px' }}>{method.label}</div>
                                                <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{method.desc}</div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={!!bookingConfig.payment_methods?.[method.key]}
                                                onChange={e => setBookingConfig({
                                                    ...bookingConfig,
                                                    payment_methods: { ...bookingConfig.payment_methods, [method.key]: e.target.checked }
                                                })}
                                                style={{ width: '20px', height: '20px', accentColor: 'var(--primary-500)' }}
                                            />
                                        </label>
                                    ))}
                                </div>

                                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
                                    {saved && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-green)', fontSize: '14px', fontWeight: 600 }}>
                                            <CheckCircle size={16} /> Cambios guardados
                                        </span>
                                    )}
                                    <button className="btn btn--primary" onClick={handleSaveBookingConfig} disabled={saving}>
                                        <Save size={16} /> {saving ? 'Guardando...' : 'Guardar Cambios'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== IMPRESIÓN ========== */}
                    {activeSection === 'impresion' && (
                        <div className="card">
                            <div className="card__header"><h3 className="card__title"><Printer size={20} /> Impresión</h3></div>
                            <div className="card__body">
                                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                                    Configura las opciones de impresión de tickets y recibos.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div className="form-group">
                                        <label className="form-label">Encabezado del Ticket</label>
                                        <input className="form-input" placeholder="Ej: ¡Gracias por tu visita!" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Pie del Ticket</label>
                                        <input className="form-input" placeholder="Ej: Síguenos en @tusalon" />
                                    </div>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                                        <input type="checkbox" defaultChecked style={{ width: '18px', height: '18px', accentColor: 'var(--primary-500)' }} />
                                        Mostrar logo en tickets
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                                        <input type="checkbox" defaultChecked style={{ width: '18px', height: '18px', accentColor: 'var(--primary-500)' }} />
                                        Imprimir automáticamente al completar venta
                                    </label>
                                </div>

                                <div style={{ marginTop: '20px', padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', textAlign: 'center' }}>
                                    <Printer size={32} style={{ color: 'var(--text-tertiary)', marginBottom: '8px' }} />
                                    <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: 0 }}>Próximamente: conexión con impresoras térmicas</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== INTEGRACIONES ========== */}
                    {activeSection === 'integraciones' && (
                        <div className="card">
                            <div className="card__header"><h3 className="card__title"><Link2 size={20} /> Integraciones</h3></div>
                            <div className="card__body">
                                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                                    Conecta herramientas externas con tu salón.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {[
                                        { name: 'WhatsApp Business', desc: 'Envía recordatorios y confirmaciones automáticas', status: 'Próximamente', icon: MessageSquare },
                                        { name: 'Google Calendar', desc: 'Sincroniza las citas con tu calendario', status: 'Próximamente', icon: Calendar },
                                    ].map(integration => (
                                        <div
                                            key={integration.name}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)',
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <integration.icon size={20} style={{ color: 'var(--text-secondary)' }} />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{integration.name}</div>
                                                    <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{integration.desc}</div>
                                                </div>
                                            </div>
                                            <span className="badge badge--neutral">{integration.status}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========== PERSONALIZACIÓN ========== */}
                    {activeSection === 'personalizacion' && (
                        <div className="card">
                            <div className="card__header"><h3 className="card__title"><Palette size={20} /> Personalización</h3></div>
                            <div className="card__body">
                                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                                    Personaliza la apariencia de tu página de reservas pública.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div className="form-group">
                                        <label className="form-label">Mensaje de Bienvenida</label>
                                        <input className="form-input" placeholder="Ej: ¡Bienvenido a nuestro salón!" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Descripción</label>
                                        <textarea className="form-input" rows={3} placeholder="Describe brevemente tu salón..." style={{ resize: 'vertical' }} />
                                    </div>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                                        <input type="checkbox" defaultChecked style={{ width: '18px', height: '18px', accentColor: 'var(--primary-500)' }} />
                                        Mostrar precios en la página de reservas
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                                        <input type="checkbox" defaultChecked style={{ width: '18px', height: '18px', accentColor: 'var(--primary-500)' }} />
                                        Permitir seleccionar profesional
                                    </label>
                                </div>

                                <div style={{ marginTop: '20px', padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', textAlign: 'center' }}>
                                    <Palette size={32} style={{ color: 'var(--text-tertiary)', marginBottom: '8px' }} />
                                    <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: 0 }}>Próximamente: temas de color personalizados</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
