'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { Plus, Edit2, Trash2, Search, Package, AlertTriangle } from 'lucide-react';

export default function ProductosPage() {
    const { user, tenantCurrency } = useStore();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState({ name: '', sku: '', cost: '', price: '', stock: 0, min_stock: 5, description: '' });
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        try {
            const res = await fetch('/api/salon/products');
            if (res.ok) { const d = await res.json(); setProducts(d.products || []); }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }

    function openNew() {
        setEditing(null);
        setForm({ name: '', sku: '', cost: '', price: '', stock: 0, min_stock: 5, description: '' });
        setImageFile(null);
        setImagePreview(null);
        setShowModal(true);
    }

    function openEdit(p) {
        setEditing(p);
        setForm({ name: p.name, sku: p.sku || '', cost: p.cost || '', price: p.price, stock: p.stock || 0, min_stock: p.min_stock || 5, description: p.description || '' });
        setImageFile(null);
        setImagePreview(p.image_url || null);
        setShowModal(true);
    }

    async function handleSave(e) {
        e.preventDefault();
        const method = editing ? 'PUT' : 'POST';
        const url = editing ? `/api/salon/products?id=${editing.id}` : '/api/salon/products';

        const formData = new FormData();
        formData.append('name', form.name);
        formData.append('sku', form.sku || '');
        formData.append('cost', form.cost || '0');
        formData.append('price', form.price || '0');
        formData.append('stock', form.stock || '0');
        formData.append('min_stock', form.min_stock || '5');
        formData.append('description', form.description || '');
        if (imageFile) {
            formData.append('image', imageFile);
        }

        const res = await fetch(url, { method, body: formData });
        if (res.ok) {
            setShowModal(false);
            loadData();
        }
    }

    async function handleDelete(id) {
        if (!confirm('¿Eliminar?')) return;
        await fetch(`/api/salon/products?id=${id}`, { method: 'DELETE' });
        loadData();
    }

    const fmt = (v) => new Intl.NumberFormat('es', { style: 'currency', currency: tenantCurrency || 'USD', minimumFractionDigits: 0 }).format(v);
    const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku && p.sku.includes(search)));

    if (loading) return <div className="loading-page"><div className="spinner spinner--lg" /></div>;

    return (
        <div>
            <div className="page-header">
                <div><h1 className="page-header__title">Productos e Inventario</h1><p className="page-header__subtitle">{products.length} productos</p></div>
                <button className="btn btn--primary" onClick={openNew}><Plus size={18} /> Nuevo Producto</button>
            </div>
            <div className="search-bar">
                <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="form-input" placeholder="Buscar por nombre o SKU..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '40px' }} />
                </div>
            </div>
            <div className="card">
                <div className="card__body" style={{ padding: 0 }}>
                    <table className="table">
                        <thead>
                            <tr><th>Producto</th><th>SKU</th><th>Costo</th><th>Precio</th><th>Margen</th><th>Existencias</th><th>Acciones</th></tr>
                        </thead>
                        <tbody>
                            {filtered.map(p => {
                                const margin = p.cost > 0 ? (((p.price - p.cost) / p.price) * 100).toFixed(0) : '—';
                                const lowStock = p.stock <= p.min_stock;
                                return (
                                    <tr key={p.id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                {p.image_url ? (
                                                    <img src={p.image_url} alt={p.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                                                ) : (
                                                    <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5', fontWeight: 700 }}>{p.name?.charAt(0) || '?'}</div>
                                                )}
                                                <div style={{ fontWeight: 600 }}>{p.name}</div>
                                            </div>
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '13px' }}>{p.sku || '—'}</td>
                                        <td>{p.cost ? fmt(p.cost) : '—'}</td>
                                        <td style={{ fontWeight: 600 }}>{fmt(p.price)}</td>
                                        <td>{margin !== '—' ? <span className="badge badge--green">{margin}%</span> : '—'}</td>
                                        <td>
                                            <span className={`badge ${lowStock ? 'badge--red' : 'badge--green'}`} style={{ display: 'flex', alignItems: 'center', gap: '4px', width: 'fit-content' }}>
                                                {lowStock && <AlertTriangle size={12} />} {p.stock}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="table__actions">
                                                <button className="btn btn--ghost btn--icon" onClick={() => openEdit(p)}><Edit2 size={16} /></button>
                                                <button className="btn btn--ghost btn--icon" onClick={() => handleDelete(p.id)} style={{ color: 'var(--accent-red)' }}><Trash2 size={16} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filtered.length === 0 && <tr><td colSpan="7"><div className="empty-state" style={{ padding: '40px' }}><div className="empty-state__icon"><Package size={28} /></div><p className="empty-state__title">Sin productos</p></div></td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal__header">
                            <h3 className="modal__title">{editing ? 'Editar Producto' : 'Nuevo Producto'}</h3>
                            <button className="modal__close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="modal__body">
                                <div className="form-row">
                                    <div className="form-group"><label className="form-label form-label--required">Nombre</label><input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                                    <div className="form-group"><label className="form-label">SKU</label><input className="form-input" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} /></div>
                                </div>
                                <div className="form-row--3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                    <div className="form-group"><label className="form-label">Costo</label><input type="number" className="form-input" value={form.cost} onChange={e => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })} min="0" step="0.01" /></div>
                                    <div className="form-group"><label className="form-label form-label--required">Precio</label><input type="number" className="form-input" value={form.price} onChange={e => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} required min="0" step="0.01" /></div>
                                    <div className="form-group"><label className="form-label">Existencias</label><input type="number" className="form-input" value={form.stock} onChange={e => setForm({ ...form, stock: parseInt(e.target.value) || 0 })} min="0" /></div>
                                </div>
                                <div className="form-group"><label className="form-label">Existencias mínimas</label><input type="number" className="form-input" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: parseInt(e.target.value) || 0 })} min="0" /></div>
                                <div className="form-group">
                                    <label className="form-label">Imagen</label>
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        className="form-input"
                                        onChange={e => {
                                            const file = e.target.files?.[0] || null;
                                            setImageFile(file);
                                            setImagePreview(file ? URL.createObjectURL(file) : null);
                                        }}
                                    />
                                    {imagePreview && (
                                        <div style={{ marginTop: '10px' }}>
                                            <img src={imagePreview} alt="Vista previa" style={{ maxWidth: '160px', maxHeight: '120px', objectFit: 'cover', borderRadius: '8px' }} />
                                        </div>
                                    )}
                                </div>
                                <div className="form-group"><label className="form-label">Descripción</label><textarea className="form-input form-textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
                            </div>
                            <div className="modal__footer">
                                <button type="button" className="btn btn--outline" onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn--primary">{editing ? 'Guardar' : 'Crear'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
