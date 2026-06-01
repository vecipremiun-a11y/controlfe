'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { Plus, Edit2, Trash2, Search, Clock, DollarSign, Scissors } from 'lucide-react';

export default function ServiciosPage() {
    const { user, tenantCurrency } = useStore();
    const [services, setServices] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingService, setEditingService] = useState(null);
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [form, setForm] = useState({
        name: '', duration_min: 30, price: '', category_id: '', description: '', color: '#6C5CE7', buffer_min: 0, is_combo: false, combo_items: []
    });

    useEffect(() => { loadServices(); }, []);

    async function loadServices() {
        try {
            const res = await fetch('/api/salon/services');
            if (res.ok) {
                const data = await res.json();
                setServices(data.services || []);
                setCategories(data.categories || []);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }

    function openNew() {
        setEditingService(null);
        setForm({ name: '', duration_min: 30, price: '', category_id: '', description: '', color: '#6C5CE7', buffer_min: 0, is_combo: false, combo_items: [] });
        setShowModal(true);
    }

    function openEdit(svc) {
        setEditingService(svc);

        let parsedComboItems = [];
        try {
            if (svc.combo_items) {
                parsedComboItems = typeof svc.combo_items === 'string' ? JSON.parse(svc.combo_items) : svc.combo_items;
            }
        } catch (e) {
            console.error('Error parsing combo items:', e);
        }

        setForm({
            name: svc.name, duration_min: svc.duration_min, price: svc.price,
            category_id: svc.category_id || '', description: svc.description || '',
            color: svc.color || '#6C5CE7', buffer_min: svc.buffer_min || 0,
            is_combo: Boolean(svc.is_combo), combo_items: parsedComboItems
        });
        setShowModal(true);
    }

    async function handleSave(e) {
        e.preventDefault();
        const method = editingService ? 'PUT' : 'POST';
        const url = editingService ? `/api/salon/services?id=${editingService.id}` : '/api/salon/services';
        try {
            const res = await fetch(url, {
                method, headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            if (res.ok) {
                setShowModal(false);
                loadServices();
            }
        } catch (e) { console.error(e); }
    }

    async function handleDelete(id) {
        if (!confirm('¿Estás seguro de eliminar este servicio?')) return;
        try {
            await fetch(`/api/salon/services?id=${id}`, { method: 'DELETE' });
            loadServices();
        } catch (e) { console.error(e); }
    }

    const filtered = services.filter(s => {
        const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
        const matchCategory = !filterCategory || s.category_id === filterCategory;
        return matchSearch && matchCategory;
    });

    if (loading) return <div className="loading-page"><div className="spinner spinner--lg" /></div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">Servicios</h1>
                    <p className="page-header__subtitle">{services.length} servicios configurados</p>
                </div>
                <div className="page-header__actions">
                    <button className="btn btn--primary" onClick={openNew}>
                        <Plus size={18} /> Nuevo Servicio
                    </button>
                </div>
            </div>

            <div className="search-bar">
                <div className="search-bar__input" style={{ position: 'relative', flex: 1 }}>
                    <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="form-input" placeholder="Buscar servicios..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '40px' }} />
                </div>
                <select className="form-input form-select" style={{ width: '200px' }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                    <option value="">Todas las categorías</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>

            <div className="card">
                <div className="card__body" style={{ padding: 0 }}>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>Servicio</th>
                                    <th>Categoría</th>
                                    <th>Duración</th>
                                    <th>Precio</th>
                                    <th>Buffer</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(svc => (
                                    <tr key={svc.id}>
                                        <td>
                                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: svc.color || 'var(--primary-500)' }} />
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{svc.name}</div>
                                            {svc.description && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{svc.description}</div>}
                                        </td>
                                        <td>
                                            <span className="badge badge--purple">{svc.category_name || '—'}</span>
                                            {svc.is_combo === 1 && <span className="badge badge--green" style={{ marginLeft: '4px' }}>Paquete</span>}
                                        </td>
                                        <td>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={14} style={{ color: 'var(--text-muted)' }} /> {svc.duration_min} min
                                            </span>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>
                                            {new Intl.NumberFormat('es', { style: 'currency', currency: tenantCurrency || 'USD', minimumFractionDigits: 0 }).format(svc.price)}
                                        </td>
                                        <td style={{ color: 'var(--text-muted)' }}>{svc.buffer_min > 0 ? `${svc.buffer_min} min` : '—'}</td>
                                        <td>
                                            <div className="table__actions">
                                                <button className="btn btn--ghost btn--icon" onClick={() => openEdit(svc)} title="Editar">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button className="btn btn--ghost btn--icon" onClick={() => handleDelete(svc.id)} title="Eliminar" style={{ color: 'var(--accent-red)' }}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan="7">
                                            <div className="empty-state" style={{ padding: '40px' }}>
                                                <div className="empty-state__icon"><Scissors size={28} /></div>
                                                <p className="empty-state__title">Sin servicios</p>
                                                <p className="empty-state__text">Agrega tu primer servicio para comenzar</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal__header">
                            <h3 className="modal__title">{editingService ? 'Editar Servicio' : 'Nuevo Servicio'}</h3>
                            <button className="modal__close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="modal__body">
                                <div className="form-group">
                                    <label className="form-label form-label--required">Nombre</label>
                                    <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Ej: Corte Clásico" />
                                </div>

                                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                    <input type="checkbox" id="is_combo" checked={form.is_combo} onChange={e => setForm({ ...form, is_combo: e.target.checked })} />
                                    <label htmlFor="is_combo" style={{ margin: 0, cursor: 'pointer' }}>Es un paquete/combo (incluye varios servicios)</label>
                                </div>

                                {form.is_combo && (
                                    <div className="form-group" style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '16px' }}>
                                        <label className="form-label form-label--required">Servicios incluidos en el paquete</label>
                                        <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                            {services.filter(s => !s.is_combo && s.id !== editingService?.id).map(s => {
                                                const isSelected = form.combo_items.includes(s.id);
                                                return (
                                                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 0' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={(e) => {
                                                                if (e.target.checked) setForm({ ...form, combo_items: [...form.combo_items, s.id] });
                                                                else setForm({ ...form, combo_items: form.combo_items.filter(id => id !== s.id) });
                                                            }}
                                                        />
                                                        <span>{s.name} ({new Intl.NumberFormat('es', { style: 'currency', currency: tenantCurrency || 'USD', minimumFractionDigits: 0 }).format(s.price)})</span>
                                                    </label>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label form-label--required">Duración (min)</label>
                                        <input type="number" className="form-input" value={form.duration_min} onChange={e => setForm({ ...form, duration_min: parseInt(e.target.value) || 0 })} required min="5" step="5" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label form-label--required">Precio</label>
                                        <input type="number" className="form-input" value={form.price} onChange={e => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} required min="0" step="0.01" />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Categoría</label>
                                        <select className="form-input form-select" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                                            <option value="">Sin categoría</option>
                                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Buffer entre citas (min)</label>
                                        <input type="number" className="form-input" value={form.buffer_min} onChange={e => setForm({ ...form, buffer_min: parseInt(e.target.value) || 0 })} min="0" step="5" />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Color</label>
                                        <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} style={{ width: '60px', height: '38px', border: 'none', cursor: 'pointer' }} />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Descripción</label>
                                    <textarea className="form-input form-textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descripción opcional..." />
                                </div>
                            </div>
                            <div className="modal__footer">
                                <button type="button" className="btn btn--outline" onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn--primary">{editingService ? 'Guardar Cambios' : 'Crear Servicio'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
