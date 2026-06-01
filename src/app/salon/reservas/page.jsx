'use client';

import { useState, useEffect } from 'react';
import { Link2, Copy, ExternalLink, Check, Plus, Trash2, GripVertical, ToggleLeft, ToggleRight } from 'lucide-react';

const MIN_ADVANCE_OPTIONS = [
    { value: 1, label: '1 hora' },
    { value: 2, label: '2 horas' },
    { value: 4, label: '4 horas' },
    { value: 24, label: '24 horas' },
];

const MAX_ADVANCE_OPTIONS = [
    { value: 7, label: '1 semana' },
    { value: 14, label: '2 semanas' },
    { value: 30, label: '1 mes' },
    { value: 90, label: '3 meses' },
];

const BUFFER_OPTIONS = [
    { value: 0, label: 'Sin buffer' },
    { value: 5, label: '5 minutos' },
    { value: 10, label: '10 minutos' },
    { value: 15, label: '15 minutos' },
];

const FIELD_TYPES = [
    { value: 'text', label: 'Texto' },
    { value: 'email', label: 'Email' },
    { value: 'tel', label: 'Teléfono' },
    { value: 'number', label: 'Número' },
    { value: 'textarea', label: 'Texto largo' },
    { value: 'select', label: 'Selección' },
];

const DEFAULT_FIELDS = [
    { id: 'name', label: 'Nombre', type: 'text', required: true, enabled: true, fixed: true },
    { id: 'phone', label: 'Teléfono', type: 'tel', required: true, enabled: true, fixed: true },
    { id: 'email', label: 'Email', type: 'email', required: false, enabled: true, fixed: false },
    { id: 'notes', label: 'Notas / Comentarios', type: 'textarea', required: false, enabled: true, fixed: false },
];

export default function ReservasOnlinePage() {
    const [tenantSlug, setTenantSlug] = useState('');
    const [config, setConfig] = useState({
        min_advance_hours: 1,
        max_advance_days: 30,
        buffer_minutes: 0,
    });
    const [fields, setFields] = useState(DEFAULT_FIELDS);
    const [saved, setSaved] = useState(false);
    const [fieldsSaved, setFieldsSaved] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showAddField, setShowAddField] = useState(false);
    const [newField, setNewField] = useState({ label: '', type: 'text', required: false, options: '' });

    useEffect(() => {
        fetch('/api/salon/config')
            .then(r => r.json())
            .then(data => {
                if (data.config) {
                    setTenantSlug(data.config.slug || 'mi-salon');
                    try {
                        const parsed = JSON.parse(data.config.config || '{}');
                        if (parsed.min_advance_hours) setConfig(prev => ({ ...prev, min_advance_hours: parsed.min_advance_hours }));
                        if (parsed.max_advance_days) setConfig(prev => ({ ...prev, max_advance_days: parsed.max_advance_days }));
                        if (parsed.buffer_minutes !== undefined) setConfig(prev => ({ ...prev, buffer_minutes: parsed.buffer_minutes }));
                        if (parsed.booking_fields) setFields(parsed.booking_fields);
                    } catch {}
                }
            })
            .catch(() => {});
    }, []);

    const bookingUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/reservar/${tenantSlug}`;

    function copyLink() {
        navigator.clipboard.writeText(bookingUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    async function saveConfig() {
        try {
            const res = await fetch('/api/salon/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ booking_config: config }),
            });
            if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
        } catch {}
    }

    async function saveFields() {
        try {
            const res = await fetch('/api/salon/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ booking_config: { booking_fields: fields } }),
            });
            if (res.ok) { setFieldsSaved(true); setTimeout(() => setFieldsSaved(false), 2000); }
        } catch {}
    }

    function toggleField(id, prop) {
        setFields(prev => prev.map(f => f.id === id ? { ...f, [prop]: !f[prop] } : f));
    }

    function removeField(id) {
        setFields(prev => prev.filter(f => f.id !== id));
    }

    function addCustomField() {
        if (!newField.label.trim()) return;
        const id = 'custom_' + Date.now();
        const field = {
            id,
            label: newField.label.trim(),
            type: newField.type,
            required: newField.required,
            enabled: true,
            fixed: false,
        };
        if (newField.type === 'select' && newField.options.trim()) {
            field.options = newField.options.split(',').map(o => o.trim()).filter(Boolean);
        }
        setFields(prev => [...prev, field]);
        setNewField({ label: '', type: 'text', required: false, options: '' });
        setShowAddField(false);
    }

    return (
        <div>
            <div className="page-header">
                <div><h1 className="page-header__title">Reservas Online</h1><p className="page-header__subtitle">Configura tu página de reservas y comparte el link con tus clientes</p></div>
            </div>

            {/* Link section */}
            <div className="card mb-lg">
                <div className="card__body">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1 }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>🔗 Tu Link de Reservas</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Comparte este link en tus redes sociales, WhatsApp, o imprimelo con QR</p>
                        </div>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
                            background: 'var(--primary-50)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--primary-300)',
                        }}>
                            <Link2 size={16} style={{ color: 'var(--primary-600)' }} />
                            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary-700)' }}>{bookingUrl}</span>
                        </div>
                        <button className="btn btn--primary btn--sm" onClick={copyLink}>
                            {copied ? <><Check size={14} /> Copiado!</> : <><Copy size={14} /> Copiar</>}
                        </button>
                        <a href={`/reservar/${tenantSlug}`} target="_blank" className="btn btn--outline btn--sm">
                            <ExternalLink size={14} /> Vista previa
                        </a>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Config card */}
                <div className="card">
                    <div className="card__header"><h3 className="card__title">⚙️ Configuración de Reservas</h3></div>
                    <div className="card__body">
                        <div className="form-group">
                            <label className="form-label">Anticipación mínima</label>
                            <select className="form-input form-select" value={config.min_advance_hours}
                                onChange={e => setConfig({ ...config, min_advance_hours: parseInt(e.target.value) })}>
                                {MIN_ADVANCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <p className="form-hint">Tiempo mínimo antes de la cita para permitir reservas</p>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Anticipación máxima</label>
                            <select className="form-input form-select" value={config.max_advance_days}
                                onChange={e => setConfig({ ...config, max_advance_days: parseInt(e.target.value) })}>
                                {MAX_ADVANCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Buffer entre citas</label>
                            <select className="form-input form-select" value={config.buffer_minutes}
                                onChange={e => setConfig({ ...config, buffer_minutes: parseInt(e.target.value) })}>
                                {BUFFER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <button className="btn btn--primary btn--sm mt-md" onClick={saveConfig}>
                            {saved ? <><Check size={14} /> Guardado!</> : 'Guardar Configuración'}
                        </button>
                    </div>
                </div>

                {/* Form fields card */}
                <div className="card">
                    <div className="card__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h3 className="card__title">📋 Campos del Formulario</h3>
                        <button className="btn btn--outline btn--sm" onClick={() => setShowAddField(true)}>
                            <Plus size={14} /> Agregar campo
                        </button>
                    </div>
                    <div className="card__body">
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                            Configura qué información pides a tus clientes al reservar.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {fields.map(field => (
                                <div key={field.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '10px 14px', background: field.enabled ? 'var(--gray-50)' : 'var(--gray-100)',
                                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)',
                                    opacity: field.enabled ? 1 : 0.5,
                                    transition: 'all 150ms',
                                }}>
                                    {/* Toggle */}
                                    <button onClick={() => !field.fixed && toggleField(field.id, 'enabled')}
                                        style={{ background: 'none', border: 'none', cursor: field.fixed ? 'default' : 'pointer', padding: 0, display: 'flex' }}
                                        title={field.fixed ? 'Campo obligatorio del sistema' : (field.enabled ? 'Desactivar' : 'Activar')}>
                                        {field.enabled
                                            ? <ToggleRight size={22} style={{ color: 'var(--primary-500)' }} />
                                            : <ToggleLeft size={22} style={{ color: 'var(--text-muted)' }} />}
                                    </button>

                                    {/* Label & type */}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{field.label}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                            {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
                                            {field.options?.length > 0 && ` · ${field.options.length} opciones`}
                                        </div>
                                    </div>

                                    {/* Required toggle */}
                                    {field.enabled && (
                                        <button
                                            onClick={() => !field.fixed && toggleField(field.id, 'required')}
                                            className={`badge ${field.required ? 'badge--purple' : 'badge--gray'}`}
                                            style={{
                                                cursor: field.fixed ? 'default' : 'pointer',
                                                border: 'none', fontSize: '11px', fontWeight: 600,
                                            }}
                                            title={field.fixed ? 'Campo siempre obligatorio' : 'Click para cambiar'}>
                                            {field.required ? 'Requerido' : 'Opcional'}
                                        </button>
                                    )}

                                    {/* Delete */}
                                    {!field.fixed && (
                                        <button onClick={() => removeField(field.id)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)' }}
                                            title="Eliminar campo">
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Add field inline form */}
                        {showAddField && (
                            <div style={{
                                marginTop: '14px', padding: '16px', background: 'var(--primary-50)',
                                borderRadius: 'var(--radius-sm)', border: '1px solid var(--primary-200)',
                            }}>
                                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px' }}>Nuevo campo personalizado</div>
                                <div className="form-row">
                                    <div className="form-group" style={{ flex: 2 }}>
                                        <label className="form-label">Nombre del campo</label>
                                        <input className="form-input" placeholder="Ej: RUT, Dirección, Referido por..."
                                            value={newField.label} onChange={e => setNewField({ ...newField, label: e.target.value })} />
                                    </div>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label className="form-label">Tipo</label>
                                        <select className="form-input form-select" value={newField.type}
                                            onChange={e => setNewField({ ...newField, type: e.target.value })}>
                                            {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                                {newField.type === 'select' && (
                                    <div className="form-group">
                                        <label className="form-label">Opciones (separadas por coma)</label>
                                        <input className="form-input" placeholder="Opción 1, Opción 2, Opción 3"
                                            value={newField.options} onChange={e => setNewField({ ...newField, options: e.target.value })} />
                                    </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={newField.required}
                                            onChange={e => setNewField({ ...newField, required: e.target.checked })} />
                                        Obligatorio
                                    </label>
                                    <div style={{ flex: 1 }} />
                                    <button className="btn btn--ghost btn--sm" onClick={() => setShowAddField(false)}>Cancelar</button>
                                    <button className="btn btn--primary btn--sm" onClick={addCustomField}
                                        disabled={!newField.label.trim()}>Agregar</button>
                                </div>
                            </div>
                        )}

                        <button className="btn btn--primary btn--sm mt-md" onClick={saveFields} style={{ width: '100%' }}>
                            {fieldsSaved ? <><Check size={14} /> Campos guardados!</> : 'Guardar Campos'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
