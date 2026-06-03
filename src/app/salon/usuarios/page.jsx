'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { Plus, Edit2, Search, Users, ShieldCheck, Power, KeyRound } from 'lucide-react';
import { ROLES, roleLabel } from '@/lib/permissions';

const EMPTY_FORM = { name: '', email: '', phone: '', role: 'vendedor', password: '', active: true };

export default function UsuariosPage() {
    const { user, addToast } = useStore();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState(null);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    useEffect(() => { loadUsers(); }, []);

    async function loadUsers() {
        try {
            const res = await fetch('/api/salon/users');
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users || []);
            } else {
                const data = await res.json().catch(() => ({}));
                addToast?.({ type: 'error', message: data.error || 'No se pudieron cargar los usuarios' });
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }

    function openNew() {
        setEditing(null);
        setForm(EMPTY_FORM);
        setShowModal(true);
    }

    function openEdit(u) {
        setEditing(u);
        setForm({ name: u.name, email: u.email, phone: u.phone || '', role: u.role, password: '', active: u.active === 1 });
        setShowModal(true);
    }

    async function handleSave(e) {
        e.preventDefault();
        setSaving(true);
        try {
            const method = editing ? 'PUT' : 'POST';
            const payload = editing
                ? { id: editing.id, name: form.name, phone: form.phone, role: form.role, active: form.active, ...(form.password ? { password: form.password } : {}) }
                : { name: form.name, email: form.email, phone: form.phone, role: form.role, password: form.password };

            const res = await fetch('/api/salon/users', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setShowModal(false);
                addToast?.({ type: 'success', message: editing ? 'Usuario actualizado' : 'Usuario creado' });
                loadUsers();
            } else {
                addToast?.({ type: 'error', message: data.error || 'Error al guardar' });
            }
        } catch (e) {
            addToast?.({ type: 'error', message: 'Error de conexión' });
        } finally {
            setSaving(false);
        }
    }

    async function toggleActive(u) {
        // Reactivar usa PUT; desactivar usa DELETE (borrado lógico)
        try {
            if (u.active === 1) {
                if (!confirm(`¿Desactivar a ${u.name}? No podrá iniciar sesión.`)) return;
                const res = await fetch(`/api/salon/users?id=${u.id}`, { method: 'DELETE' });
                const data = await res.json().catch(() => ({}));
                if (res.ok) { addToast?.({ type: 'success', message: 'Usuario desactivado' }); loadUsers(); }
                else addToast?.({ type: 'error', message: data.error || 'No se pudo desactivar' });
            } else {
                const res = await fetch('/api/salon/users', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: u.id, active: true }),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok) { addToast?.({ type: 'success', message: 'Usuario reactivado' }); loadUsers(); }
                else addToast?.({ type: 'error', message: data.error || 'No se pudo reactivar' });
            }
        } catch (e) {
            addToast?.({ type: 'error', message: 'Error de conexión' });
        }
    }

    const initials = (name) => (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const roleColor = (value) => ROLES.find(r => r.value === value)?.color || '#6B7280';

    const filtered = users.filter(u => {
        const q = search.toLowerCase();
        return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || roleLabel(u.role).toLowerCase().includes(q);
    });

    const isOwner = user?.role === 'owner';
    const isSelf = (u) => u.id === user?.id;
    const isTargetOwner = (u) => u.role === 'owner';

    if (loading) return <div className="loading-page"><div className="spinner spinner--lg" /></div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">Usuarios</h1>
                    <p className="page-header__subtitle">{users.filter(u => u.active === 1).length} activos · {users.length} en total</p>
                </div>
                <div className="page-header__actions">
                    <button className="btn btn--primary" onClick={openNew}>
                        <Plus size={18} /> Nuevo Usuario
                    </button>
                </div>
            </div>

            <div className="search-bar">
                <div className="search-bar__input" style={{ position: 'relative', flex: 1 }}>
                    <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="form-input" placeholder="Buscar por nombre, correo o rol..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '40px' }} />
                </div>
            </div>

            <div className="card">
                <div className="card__body" style={{ padding: 0 }}>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Usuario</th>
                                    <th>Correo</th>
                                    <th>Rol</th>
                                    <th>Estado</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(u => (
                                    <tr key={u.id} style={{ opacity: u.active === 1 ? 1 : 0.55 }}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: roleColor(u.role), color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', flexShrink: 0 }}>
                                                    {initials(u.name)}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>
                                                        {u.name} {isSelf(u) && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(tú)</span>}
                                                    </div>
                                                    {u.phone && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{u.phone}</div>}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                                        <td>
                                            <span className="badge" style={{ background: `${roleColor(u.role)}1A`, color: roleColor(u.role), fontWeight: 600 }}>
                                                {roleLabel(u.role)}
                                            </span>
                                        </td>
                                        <td>
                                            {u.active === 1
                                                ? <span className="badge badge--green">Activo</span>
                                                : <span className="badge" style={{ background: 'var(--gray-200)', color: 'var(--text-muted)' }}>Inactivo</span>}
                                        </td>
                                        <td>
                                            <div className="table__actions">
                                                <button className="btn btn--ghost btn--icon" onClick={() => openEdit(u)} title="Editar">
                                                    <Edit2 size={16} />
                                                </button>
                                                {/* No se puede desactivar al dueño ni a uno mismo */}
                                                {!isTargetOwner(u) && !isSelf(u) && (
                                                    <button
                                                        className="btn btn--ghost btn--icon"
                                                        onClick={() => toggleActive(u)}
                                                        title={u.active === 1 ? 'Desactivar' : 'Reactivar'}
                                                        style={{ color: u.active === 1 ? 'var(--accent-red)' : 'var(--accent-green, #10B981)' }}
                                                    >
                                                        <Power size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td colSpan="5">
                                            <div className="empty-state" style={{ padding: '40px' }}>
                                                <div className="empty-state__icon"><Users size={28} /></div>
                                                <p className="empty-state__title">Sin usuarios</p>
                                                <p className="empty-state__text">Crea cuentas para tu equipo (administrador, vendedor, bodeguero…)</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal crear/editar */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal__header">
                            <h3 className="modal__title">{editing ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>
                            <button className="modal__close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="modal__body">
                                <div className="form-group">
                                    <label className="form-label form-label--required">Nombre completo</label>
                                    <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Ej: Juan Pérez" />
                                </div>

                                <div className="form-group">
                                    <label className="form-label form-label--required">Correo electrónico</label>
                                    <input
                                        type="email"
                                        className="form-input"
                                        value={form.email}
                                        onChange={e => setForm({ ...form, email: e.target.value })}
                                        required
                                        disabled={!!editing}
                                        placeholder="correo@ejemplo.com"
                                        style={editing ? { opacity: 0.7, cursor: 'not-allowed' } : undefined}
                                    />
                                    {editing && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>El correo no se puede cambiar.</div>}
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Teléfono</label>
                                        <input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+56 9 1234 5678" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label form-label--required">Rol</label>
                                        <select
                                            className="form-input form-select"
                                            value={form.role}
                                            onChange={e => setForm({ ...form, role: e.target.value })}
                                            disabled={editing && isTargetOwner(editing)}
                                        >
                                            {ROLES.filter(r => r.value !== 'owner' || isOwner).map(r => (
                                                <option key={r.value} value={r.value}>{r.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Descripción del rol seleccionado */}
                                {(() => {
                                    const r = ROLES.find(x => x.value === form.role);
                                    return r ? (
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', background: 'var(--primary-50)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px 12px', marginBottom: '16px' }}>
                                            <ShieldCheck size={16} style={{ color: r.color, flexShrink: 0, marginTop: '2px' }} />
                                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{r.desc}</span>
                                        </div>
                                    ) : null;
                                })()}

                                <div className="form-group">
                                    <label className={`form-label ${editing ? '' : 'form-label--required'}`}>
                                        <KeyRound size={13} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                                        {editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}
                                    </label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        value={form.password}
                                        onChange={e => setForm({ ...form, password: e.target.value })}
                                        required={!editing}
                                        minLength={6}
                                        placeholder={editing ? 'Dejar en blanco para no cambiarla' : 'Mínimo 6 caracteres'}
                                    />
                                </div>

                                {editing && !isTargetOwner(editing) && !isSelf(editing) && (
                                    <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input type="checkbox" id="active" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
                                        <label htmlFor="active" style={{ margin: 0, cursor: 'pointer' }}>Cuenta activa (puede iniciar sesión)</label>
                                    </div>
                                )}
                            </div>
                            <div className="modal__footer">
                                <button type="button" className="btn btn--ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn--primary" disabled={saving}>
                                    {saving ? 'Guardando...' : (editing ? 'Guardar cambios' : 'Crear usuario')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
