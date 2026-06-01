'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { Plus, Edit2, Trash2, Search, Phone, Mail, Calendar, Users } from 'lucide-react';

export default function ClientesPage() {
    const { user, tenantCurrency } = useStore();
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '', gender: '' });

    useEffect(() => { loadClients(); }, []);

    async function loadClients() {
        try {
            const res = await fetch('/api/salon/clients');
            if (res.ok) { const data = await res.json(); setClients(data.clients || []); }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }

    function openNew() {
        setEditingClient(null);
        setForm({ name: '', phone: '', email: '', notes: '', gender: '' });
        setShowModal(true);
    }

    function openEdit(client) {
        setEditingClient(client);
        setForm({ name: client.name, phone: client.phone || '', email: client.email || '', notes: client.notes || '', gender: client.gender || '' });
        setShowModal(true);
    }

    async function handleSave(e) {
        e.preventDefault();
        const method = editingClient ? 'PUT' : 'POST';
        const url = editingClient ? `/api/salon/clients?id=${editingClient.id}` : '/api/salon/clients';
        try {
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
            if (res.ok) { setShowModal(false); loadClients(); }
        } catch (e) { console.error(e); }
    }

    async function handleDelete(id) {
        if (!confirm('¿Eliminar este cliente?')) return;
        await fetch(`/api/salon/clients?id=${id}`, { method: 'DELETE' });
        loadClients();
    }

    const filtered = clients.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.phone && c.phone.includes(search)) ||
        (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
    );

    if (loading) return <div className="loading-page"><div className="spinner spinner--lg" /></div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">Clientes</h1>
                    <p className="page-header__subtitle">{clients.length} clientes registrados</p>
                </div>
                <div className="page-header__actions">
                    <button className="btn btn--primary" onClick={openNew}><Plus size={18} /> Nuevo Cliente</button>
                </div>
            </div>

            <div className="search-bar">
                <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="form-input" placeholder="Buscar por nombre, teléfono o email..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '40px' }} />
                </div>
            </div>

            <div className="card">
                <div className="card__body" style={{ padding: 0 }}>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Cliente</th>
                                    <th>Teléfono</th>
                                    <th>Email</th>
                                    <th>Visitas</th>
                                    <th>Total Gastado</th>
                                    <th>Última Visita</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(c => (
                                    <tr key={c.id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{
                                                    width: '36px', height: '36px', borderRadius: '50%',
                                                    background: 'linear-gradient(135deg, var(--primary-400), var(--primary-600))',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: 'white', fontWeight: 600, fontSize: '13px',
                                                }}>
                                                    {c.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                                                    {c.no_show_count > 0 && <span className="badge badge--red" style={{ fontSize: '10px' }}>No-show: {c.no_show_count}</span>}
                                                </div>
                                            </div>
                                        </td>
                                        <td>{c.phone || '—'}</td>
                                        <td style={{ color: 'var(--text-muted)' }}>{c.email || '—'}</td>
                                        <td><span className="badge badge--purple">{c.total_visits || 0}</span></td>
                                        <td style={{ fontWeight: 600 }}>
                                            {c.total_spent ? new Intl.NumberFormat('es', { style: 'currency', currency: tenantCurrency || 'USD', minimumFractionDigits: 0 }).format(c.total_spent) : '$0'}
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{c.last_visit || '—'}</td>
                                        <td>
                                            <div className="table__actions">
                                                <button className="btn btn--ghost btn--icon" onClick={() => openEdit(c)}><Edit2 size={16} /></button>
                                                <button className="btn btn--ghost btn--icon" onClick={() => handleDelete(c.id)} style={{ color: 'var(--accent-red)' }}><Trash2 size={16} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr><td colSpan="7">
                                        <div className="empty-state" style={{ padding: '40px' }}>
                                            <div className="empty-state__icon"><Users size={28} /></div>
                                            <p className="empty-state__title">Sin clientes</p>
                                            <p className="empty-state__text">Los clientes se agregan automáticamente al hacer reservas, o puedes agregarlos manualmente.</p>
                                        </div>
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal__header">
                            <h3 className="modal__title">{editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
                            <button className="modal__close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="modal__body">
                                <div className="form-group">
                                    <label className="form-label form-label--required">Nombre Completo</label>
                                    <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Nombre del cliente" />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Teléfono</label>
                                        <input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="809-555-0000" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Email</label>
                                        <input type="email" className="form-input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="correo@ejemplo.com" />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Género</label>
                                    <select className="form-input form-select" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                                        <option value="">Seleccionar</option>
                                        <option value="M">Masculino</option>
                                        <option value="F">Femenino</option>
                                        <option value="O">Otro</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Notas</label>
                                    <textarea className="form-input form-textarea" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Preferencias, alergias, notas importantes..." />
                                </div>
                            </div>
                            <div className="modal__footer">
                                <button type="button" className="btn btn--outline" onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn--primary">{editingClient ? 'Guardar' : 'Crear Cliente'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
