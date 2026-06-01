'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Plus, Edit2, Trash2, Search, Clock, Calendar, UserCog, X, Upload,
    DollarSign, Shield, Phone, CreditCard, Briefcase, ChevronRight,
    Home, Percent, Wallet, Zap, CalendarOff, Check, AlertCircle, Camera,
    User, Scissors, CheckSquare, Square,
} from 'lucide-react';

const PAYMENT_MODES = [
    { value: 'commission', label: 'Comisión', icon: Percent, desc: 'El negocio se queda con % de cada servicio', color: '#8B5CF6' },
    { value: 'rent', label: 'Arriendo', icon: Home, desc: 'Pago fijo (diario, semanal o mensual)', color: '#F59E0B' },
    { value: 'salary', label: 'Sueldo Fijo', icon: Wallet, desc: 'Pago mensual independiente de ventas', color: '#3B82F6' },
    { value: 'mixed', label: 'Mixto', icon: Zap, desc: 'Sueldo base + comisión por servicio', color: '#10B981' },
    { value: 'per_service', label: 'Por Servicio', icon: Briefcase, desc: 'Se paga por trabajo realizado', color: '#EF4444' },
];

const RENT_FREQUENCIES = [
    { value: 'daily', label: 'Diario' },
    { value: 'weekly', label: 'Semanal' },
    { value: 'monthly', label: 'Mensual' },
];

const ACCESS_ROLES = [
    { value: 'own_agenda', label: 'Solo su agenda', desc: 'Ve únicamente sus citas' },
    { value: 'all_agendas', label: 'Todas las agendas', desc: 'Ve la agenda de todos' },
    { value: 'admin', label: 'Administrador', desc: 'Acceso total al sistema' },
];

const DAYS_OF_WEEK = [
    { value: 0, label: 'Domingo', short: 'Dom' },
    { value: 1, label: 'Lunes', short: 'Lun' },
    { value: 2, label: 'Martes', short: 'Mar' },
    { value: 3, label: 'Miércoles', short: 'Mié' },
    { value: 4, label: 'Jueves', short: 'Jue' },
    { value: 5, label: 'Viernes', short: 'Vie' },
    { value: 6, label: 'Sábado', short: 'Sáb' },
];

const COLORS = ['#6C5CE7', '#00B894', '#E17055', '#FDCB6E', '#00CEC9', '#A29BFE', '#FD79A8', '#636E72'];

export default function PersonalPage() {
    const [professionals, setProfessionals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingProf, setEditingProf] = useState(null);
    const [activeTab, setActiveTab] = useState('info');
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [avatarFile, setAvatarFile] = useState(null);
    const fileInputRef = useRef(null);

    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [scheduleProf, setScheduleProf] = useState(null);
    const [scheduleData, setScheduleData] = useState([]);

    const [showDaysOffModal, setShowDaysOffModal] = useState(false);
    const [daysOffProf, setDaysOffProf] = useState(null);
    const [daysOffData, setDaysOffData] = useState([]);
    const [newDayOff, setNewDayOff] = useState({ date: '', reason: '' });

    const [allServices, setAllServices] = useState([]);
    const [selectedServiceIds, setSelectedServiceIds] = useState([]);
    const [serviceSearch, setServiceSearch] = useState('');

    const [form, setForm] = useState({
        name: '', phone: '', email: '', color: '#6C5CE7',
        commission_percent: '50', rut: '',
        payment_mode: 'commission', base_salary: '', per_service_rate: '',
        rent_amount: '', rent_frequency: 'monthly',
        pay_frequency: 'daily', pay_day: '',
        access_role: 'own_agenda', country_code: '+56',
    });

    useEffect(() => { loadData(); loadServices(); }, []);

    async function loadData() {
        try {
            const res = await fetch('/api/salon/professionals');
            if (res.ok) { const data = await res.json(); setProfessionals(data.professionals || []); }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }

    async function loadServices() {
        try {
            const res = await fetch('/api/salon/services');
            if (res.ok) { const data = await res.json(); setAllServices(data.services || []); }
        } catch (e) { console.error(e); }
    }

    function openNew() {
        setEditingProf(null);
        setForm({
            name: '', phone: '', email: '', color: '#6C5CE7',
            commission_percent: '50', rut: '',
            payment_mode: 'commission', base_salary: '', per_service_rate: '',
            rent_amount: '', rent_frequency: 'monthly',
            pay_frequency: 'daily', pay_day: '',
            access_role: 'own_agenda', country_code: '+56',
        });
        setAvatarPreview(null);
        setAvatarFile(null);
        setSelectedServiceIds([]);
        setServiceSearch('');
        setActiveTab('info');
        setShowModal(true);
    }

    function openEdit(p) {
        setEditingProf(p);
        setForm({
            name: p.name, phone: p.phone || '', email: p.email || '',
            color: p.color || '#6C5CE7',
            commission_percent: p.commission_percent?.toString() || '50',
            rut: p.rut || '',
            payment_mode: p.payment_mode || 'commission',
            base_salary: p.base_salary?.toString() || '',
            per_service_rate: p.per_service_rate?.toString() || '',
            rent_amount: p.rent_amount?.toString() || '',
            rent_frequency: p.rent_frequency || 'monthly',
            pay_frequency: p.pay_frequency || 'daily',
            pay_day: p.pay_day || '',
            access_role: p.access_role || 'own_agenda',
            country_code: p.country_code || '+56',
        });
        setAvatarPreview(p.avatar_url || null);
        setAvatarFile(null);
        setSelectedServiceIds((p.services || []).map(s => s.service_id));
        setServiceSearch('');
        setActiveTab('info');
        setShowModal(true);
    }

    function openSchedule(p) {
        setScheduleProf(p);
        const existingSchedules = p.schedules || [];
        const data = DAYS_OF_WEEK.map(day => {
            const existing = existingSchedules.find(s => s.day_of_week === day.value);
            return {
                day: day.value, label: day.label, short: day.short,
                enabled: !!existing,
                start_time: existing?.start_time || '09:00',
                end_time: existing?.end_time || '18:00',
                break_start: existing?.break_start || '13:00',
                break_end: existing?.break_end || '14:00',
            };
        });
        setScheduleData(data);
        setShowScheduleModal(true);
    }

    function openDaysOff(p) {
        setDaysOffProf(p);
        setDaysOffData(p.exceptions || []);
        setNewDayOff({ date: '', reason: '' });
        setShowDaysOffModal(true);
    }

    function handleAvatarChange(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { alert('La imagen no debe superar 2MB'); return; }
        setAvatarFile(file);
        const reader = new FileReader();
        reader.onload = (ev) => setAvatarPreview(ev.target.result);
        reader.readAsDataURL(file);
    }

    async function handleSave(e) {
        e.preventDefault();
        const method = editingProf ? 'PUT' : 'POST';
        const url = editingProf ? `/api/salon/professionals?id=${editingProf.id}` : '/api/salon/professionals';
        const formData = new FormData();
        Object.entries(form).forEach(([k, v]) => formData.append(k, v));
        formData.append('service_ids', JSON.stringify(selectedServiceIds));
        if (avatarFile) formData.append('avatar', avatarFile);
        try {
            const res = await fetch(url, { method, body: formData });
            if (res.ok) { setShowModal(false); loadData(); }
            else { const err = await res.json().catch(() => ({})); alert(`Error: ${err.error || 'No se pudo guardar'}`); }
        } catch (e) { console.error(e); alert('Error de conexión'); }
    }

    async function handleSaveSchedule() {
        if (!scheduleProf) return;
        try {
            const formData = new FormData();
            formData.append('name', scheduleProf.name);
            formData.append('schedules', JSON.stringify(scheduleData));
            const res = await fetch(`/api/salon/professionals?id=${scheduleProf.id}`, { method: 'PUT', body: formData });
            if (res.ok) { setShowScheduleModal(false); loadData(); }
        } catch (e) { console.error(e); }
    }

    async function handleSaveDaysOff() {
        if (!daysOffProf) return;
        try {
            const formData = new FormData();
            formData.append('name', daysOffProf.name);
            formData.append('exceptions', JSON.stringify(daysOffData));
            const res = await fetch(`/api/salon/professionals?id=${daysOffProf.id}`, { method: 'PUT', body: formData });
            if (res.ok) { setShowDaysOffModal(false); loadData(); }
        } catch (e) { console.error(e); }
    }

    function addDayOff() {
        if (!newDayOff.date) return;
        setDaysOffData(prev => [...prev, { date: newDayOff.date, reason: newDayOff.reason, type: 'blocked' }]);
        setNewDayOff({ date: '', reason: '' });
    }

    function removeDayOff(idx) {
        setDaysOffData(prev => prev.filter((_, i) => i !== idx));
    }

    async function handleDelete(id) {
        if (!confirm('¿Eliminar este profesional?')) return;
        await fetch(`/api/salon/professionals?id=${id}`, { method: 'DELETE' });
        loadData();
    }

    const getInitials = (name) => {
        if (!name) return '??';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const fmt = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(v || 0);

    if (loading) return <div className="loading-page"><div className="spinner spinner--lg" /></div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-header__title">Personal</h1>
                    <p className="page-header__subtitle">{professionals.length} profesionales registrados</p>
                </div>
                <button className="btn btn--primary" onClick={openNew}><Plus size={18} /> Nuevo Profesional</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
                {professionals.map(p => {
                    const mode = PAYMENT_MODES.find(m => m.value === (p.payment_mode || 'commission'));
                    const ModeIcon = mode?.icon || Percent;
                    return (
                        <div className="card" key={p.id} style={{ cursor: 'pointer', overflow: 'hidden' }} onClick={() => openEdit(p)}>
                            <div className="card__body" style={{ padding: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                                    <div style={{
                                        width: '56px', height: '56px', borderRadius: '50%',
                                        background: p.avatar_url ? 'none' : (p.color || 'var(--primary-500)'),
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'white', fontWeight: 700, fontSize: '18px',
                                        overflow: 'hidden', flexShrink: 0,
                                        border: `3px solid ${p.color || 'var(--primary-500)'}`,
                                    }}>
                                        {p.avatar_url ? (
                                            <img src={p.avatar_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : getInitials(p.name)}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: '16px' }}>{p.name}</div>
                                        {p.phone && <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Phone size={12} /> {p.country_code || '+56'} {p.phone}
                                        </div>}
                                        {p.rut && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>RUT: {p.rut}</div>}
                                    </div>
                                    <span className={`badge badge--${p.active ? 'green' : 'gray'}`}>
                                        {p.active ? 'Activo' : 'Inactivo'}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                        padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                                        background: `${mode?.color || '#8B5CF6'}15`, color: mode?.color || '#8B5CF6',
                                        border: `1px solid ${mode?.color || '#8B5CF6'}30`,
                                    }}>
                                        <ModeIcon size={13} />
                                        {mode?.label || 'Comisión'}
                                        {(p.payment_mode || 'commission') === 'commission' && ` ${p.commission_percent || 50}%`}
                                        {p.payment_mode === 'rent' && ` ${fmt(p.rent_amount)}`}
                                        {p.payment_mode === 'salary' && ` ${fmt(p.base_salary)}`}
                                        {p.payment_mode === 'mixed' && ` ${fmt(p.base_salary)} + ${p.commission_percent || 0}%`}
                                        {p.payment_mode === 'per_service' && ` ${fmt(p.per_service_rate)}/srv`}
                                    </span>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                                        background: 'var(--gray-100)', color: 'var(--text-secondary)',
                                    }}>
                                        <Shield size={12} />
                                        {ACCESS_ROLES.find(r => r.value === (p.access_role || 'own_agenda'))?.label}
                                    </span>
                                </div>

                                {(p.services || []).length > 0 && (
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                        {(p.services || []).slice(0, 3).map(s => (
                                            <span key={s.service_id} style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 500,
                                                background: `${s.service_color || '#6C5CE7'}12`, color: s.service_color || '#6C5CE7',
                                                border: `1px solid ${s.service_color || '#6C5CE7'}25`,
                                            }}>
                                                <Scissors size={10} /> {s.service_name}
                                            </span>
                                        ))}
                                        {(p.services || []).length > 3 && (
                                            <span style={{
                                                padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                                background: 'var(--gray-100)', color: 'var(--text-muted)',
                                            }}>+{p.services.length - 3} más</span>
                                        )}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Calendar size={14} /> {p.appointments_count || 0} citas este mes
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Scissors size={14} /> {(p.services || []).length} servicios
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                                    <button className="btn btn--ghost btn--sm" onClick={(e) => { e.stopPropagation(); openSchedule(p); }}>
                                        <Clock size={14} /> Horario
                                    </button>
                                    <button className="btn btn--ghost btn--sm" onClick={(e) => { e.stopPropagation(); openDaysOff(p); }}>
                                        <CalendarOff size={14} /> Libres
                                    </button>
                                    <button className="btn btn--ghost btn--sm" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>
                                        <Edit2 size={14} /> Editar
                                    </button>
                                    <button className="btn btn--ghost btn--sm" onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} style={{ color: 'var(--accent-red)' }}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {professionals.length === 0 && (
                    <div className="card" style={{ gridColumn: '1 / -1' }}>
                        <div className="card__body">
                            <div className="empty-state">
                                <div className="empty-state__icon"><UserCog size={28} /></div>
                                <p className="empty-state__title">Sin profesionales</p>
                                <p className="empty-state__text">Agrega tu equipo para comenzar a agendar citas</p>
                                <button className="btn btn--primary" onClick={openNew}><Plus size={16} /> Agregar Profesional</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ======== MAIN EDIT/CREATE MODAL ======== */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal__header">
                            <h3 className="modal__title">{editingProf ? 'Editar Profesional' : 'Nuevo Profesional'}</h3>
                            <button className="modal__close" onClick={() => setShowModal(false)}>✕</button>
                        </div>

                        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '0 24px', gap: '0' }}>
                            {[
                                { key: 'info', label: 'Información', icon: User },
                                { key: 'services', label: 'Servicios', icon: Scissors },
                                { key: 'payment', label: 'Compensación', icon: DollarSign },
                                { key: 'permissions', label: 'Permisos', icon: Shield },
                            ].map(tab => {
                                const TabIcon = tab.icon;
                                return (
                                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            padding: '12px 16px', border: 'none', background: 'none',
                                            fontSize: '13px', fontWeight: activeTab === tab.key ? 700 : 500,
                                            color: activeTab === tab.key ? 'var(--primary-600)' : 'var(--text-secondary)',
                                            borderBottom: activeTab === tab.key ? '2px solid var(--primary-600)' : '2px solid transparent',
                                            cursor: 'pointer', transition: 'all 150ms', fontFamily: 'inherit',
                                        }}>
                                        <TabIcon size={15} /> {tab.label}
                                    </button>
                                );
                            })}
                        </div>

                        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                            <div className="modal__body" style={{ overflow: 'auto', flex: 1 }}>

                                {activeTab === 'info' && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                                            <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => fileInputRef.current?.click()}>
                                                <div style={{
                                                    width: '80px', height: '80px', borderRadius: '50%',
                                                    background: avatarPreview ? 'none' : (form.color || '#6C5CE7'),
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: 'white', fontWeight: 700, fontSize: '24px',
                                                    overflow: 'hidden', border: `3px solid ${form.color || '#6C5CE7'}`,
                                                }}>
                                                    {avatarPreview ? (
                                                        <img src={avatarPreview} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : getInitials(form.name)}
                                                </div>
                                                <div style={{
                                                    position: 'absolute', bottom: 0, right: 0,
                                                    width: '28px', height: '28px', borderRadius: '50%',
                                                    background: 'var(--primary-500)', display: 'flex',
                                                    alignItems: 'center', justifyContent: 'center',
                                                    border: '2px solid white',
                                                }}>
                                                    <Camera size={13} color="white" />
                                                </div>
                                                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                                                    style={{ display: 'none' }} onChange={handleAvatarChange} />
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label form-label--required">Nombre Completo</label>
                                            <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Ej: Ana García López" />
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label">RUT / Documento de Identidad</label>
                                            <input className="form-input" value={form.rut} onChange={e => setForm({ ...form, rut: e.target.value })} placeholder="Ej: 12.345.678-9" />
                                        </div>

                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="form-label">Teléfono</label>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <select className="form-input" value={form.country_code}
                                                        onChange={e => setForm({ ...form, country_code: e.target.value })}
                                                        style={{ width: '110px', flexShrink: 0 }}>
                                                        <option value="+56">🇨🇱 +56</option>
                                                        <option value="+1">🇺🇸 +1</option>
                                                        <option value="+52">🇲🇽 +52</option>
                                                        <option value="+57">🇨🇴 +57</option>
                                                        <option value="+54">🇦🇷 +54</option>
                                                        <option value="+51">🇵🇪 +51</option>
                                                        <option value="+55">🇧🇷 +55</option>
                                                        <option value="+34">🇪🇸 +34</option>
                                                        <option value="+58">🇻🇪 +58</option>
                                                        <option value="+593">🇪🇨 +593</option>
                                                        <option value="+1809">🇩🇴 +1809</option>
                                                    </select>
                                                    <input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="9 1234 5678" style={{ flex: 1 }} />
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Email</label>
                                                <input type="email" className="form-input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="ana@email.com" />
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label">Color</label>
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                {COLORS.map(c => (
                                                    <button type="button" key={c} onClick={() => setForm({ ...form, color: c })}
                                                        style={{
                                                            width: '36px', height: '36px', borderRadius: '50%', background: c,
                                                            border: form.color === c ? '3px solid var(--text-primary)' : '3px solid transparent',
                                                            cursor: 'pointer', transition: 'border 150ms',
                                                        }} />
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}

                                {activeTab === 'services' && (
                                    <>
                                        <div className="form-group">
                                            <label className="form-label" style={{ marginBottom: '8px' }}>Servicios que ofrece este profesional</label>
                                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                                                Selecciona los servicios que este profesional puede realizar. ({selectedServiceIds.length} seleccionados)
                                            </p>
                                            <div style={{ position: 'relative', marginBottom: '12px' }}>
                                                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                                <input className="form-input" placeholder="Buscar servicio..."
                                                    value={serviceSearch} onChange={e => setServiceSearch(e.target.value)}
                                                    style={{ paddingLeft: '36px' }} />
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                                            <button type="button" className="btn btn--ghost btn--sm"
                                                onClick={() => setSelectedServiceIds(allServices.filter(s => s.active).map(s => s.id))}>
                                                <CheckSquare size={14} /> Todos
                                            </button>
                                            <button type="button" className="btn btn--ghost btn--sm"
                                                onClick={() => setSelectedServiceIds([])}>
                                                <Square size={14} /> Ninguno
                                            </button>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {allServices
                                                .filter(s => s.active)
                                                .filter(s => !serviceSearch || s.name.toLowerCase().includes(serviceSearch.toLowerCase()))
                                                .map(svc => {
                                                    const isSelected = selectedServiceIds.includes(svc.id);
                                                    return (
                                                        <label key={svc.id}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: '12px',
                                                                padding: '10px 14px', borderRadius: '10px', cursor: 'pointer',
                                                                border: `2px solid ${isSelected ? (svc.color || 'var(--primary-500)') : 'var(--border-color)'}`,
                                                                background: isSelected ? `${svc.color || '#6C5CE7'}08` : 'white',
                                                                transition: 'all 150ms',
                                                            }}>
                                                            <input type="checkbox" checked={isSelected}
                                                                onChange={() => {
                                                                    setSelectedServiceIds(prev =>
                                                                        isSelected ? prev.filter(id => id !== svc.id) : [...prev, svc.id]
                                                                    );
                                                                }}
                                                                style={{ display: 'none' }} />
                                                            <div style={{
                                                                width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0,
                                                                border: `2px solid ${isSelected ? (svc.color || 'var(--primary-500)') : 'var(--gray-300)'}`,
                                                                background: isSelected ? (svc.color || 'var(--primary-500)') : 'white',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                transition: 'all 150ms',
                                                            }}>
                                                                {isSelected && <Check size={13} color="white" />}
                                                            </div>
                                                            <div style={{
                                                                width: '8px', height: '8px', borderRadius: '50%',
                                                                background: svc.color || '#6C5CE7', flexShrink: 0,
                                                            }} />
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ fontWeight: 600, fontSize: '14px' }}>{svc.name}</div>
                                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                                    {svc.duration_min} min — {fmt(svc.price)}
                                                                    {svc.category_name && ` — ${svc.category_name}`}
                                                                </div>
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                            {allServices.filter(s => s.active).length === 0 && (
                                                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                                                    <Scissors size={28} style={{ marginBottom: '8px', opacity: 0.3 }} />
                                                    <p style={{ fontSize: '14px' }}>No hay servicios creados aún</p>
                                                    <p style={{ fontSize: '12px' }}>Crea servicios en la sección Servicios primero</p>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}

                                {activeTab === 'payment' && (
                                    <>
                                        <div className="form-group">
                                            <label className="form-label form-label--required" style={{ marginBottom: '12px' }}>Modo de Trabajo</label>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                                                {PAYMENT_MODES.map(mode => {
                                                    const MIcon = mode.icon;
                                                    const isActive = form.payment_mode === mode.value;
                                                    return (
                                                        <button type="button" key={mode.value}
                                                            onClick={() => setForm({ ...form, payment_mode: mode.value })}
                                                            style={{
                                                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                                                                padding: '16px 10px', border: `2px solid ${isActive ? mode.color : 'var(--border-color)'}`,
                                                                borderRadius: '12px', cursor: 'pointer', transition: 'all 200ms',
                                                                background: isActive ? `${mode.color}10` : 'white', fontFamily: 'inherit',
                                                            }}>
                                                            <div style={{
                                                                width: '40px', height: '40px', borderRadius: '50%',
                                                                background: isActive ? `${mode.color}20` : 'var(--gray-100)',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                color: isActive ? mode.color : 'var(--text-muted)',
                                                            }}>
                                                                <MIcon size={20} />
                                                            </div>
                                                            <span style={{ fontSize: '13px', fontWeight: 700, color: isActive ? mode.color : 'var(--text-primary)' }}>{mode.label}</span>
                                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.3 }}>{mode.desc}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {(form.payment_mode === 'commission' || form.payment_mode === 'mixed') && (
                                            <div className="form-group">
                                                <label className="form-label form-label--required">Comisión del profesional (%)</label>
                                                <input type="number" step="0.1" min="0" max="100" className="form-input"
                                                    value={form.commission_percent}
                                                    onChange={e => setForm({ ...form, commission_percent: e.target.value })}
                                                    placeholder="Ej: 60 (el profesional gana 60%, local 40%)" />
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                    Profesional: {form.commission_percent || 0}% — Local: {100 - (parseFloat(form.commission_percent) || 0)}%
                                                </div>
                                            </div>
                                        )}

                                        {(form.payment_mode === 'salary' || form.payment_mode === 'mixed') && (
                                            <div className="form-group">
                                                <label className="form-label form-label--required">Sueldo Base Mensual (CLP)</label>
                                                <input type="number" min="0" className="form-input"
                                                    value={form.base_salary}
                                                    onChange={e => setForm({ ...form, base_salary: e.target.value })}
                                                    placeholder="Ej: 300000" />
                                            </div>
                                        )}

                                        {form.payment_mode === 'rent' && (
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label className="form-label form-label--required">Monto de Arriendo (CLP)</label>
                                                    <input type="number" min="0" className="form-input"
                                                        value={form.rent_amount}
                                                        onChange={e => setForm({ ...form, rent_amount: e.target.value })}
                                                        placeholder="Ej: 200000" />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label form-label--required">Frecuencia</label>
                                                    <select className="form-input" value={form.rent_frequency}
                                                        onChange={e => setForm({ ...form, rent_frequency: e.target.value })}>
                                                        {RENT_FREQUENCIES.map(f => (
                                                            <option key={f.value} value={f.value}>{f.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        )}

                                        {form.payment_mode === 'per_service' && (
                                            <div className="form-group">
                                                <label className="form-label form-label--required">Tarifa por Servicio (CLP)</label>
                                                <input type="number" min="0" className="form-input"
                                                    value={form.per_service_rate}
                                                    onChange={e => setForm({ ...form, per_service_rate: e.target.value })}
                                                    placeholder="Ej: 3000" />
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                    Monto fijo que se paga al profesional por cada servicio realizado
                                                </div>
                                            </div>
                                        )}

                                        {/* Pay frequency */}
                                        <div className="form-group" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                                            <label className="form-label">Frecuencia de Pago</label>
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                {[
                                                    { value: 'daily', label: 'Diario' },
                                                    { value: 'weekly', label: 'Semanal' },
                                                    { value: 'biweekly', label: 'Quincenal' },
                                                    { value: 'monthly', label: 'Mensual' },
                                                ].map(opt => (
                                                    <button
                                                        key={opt.value}
                                                        type="button"
                                                        onClick={() => setForm({ ...form, pay_frequency: opt.value })}
                                                        style={{
                                                            padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                                                            border: form.pay_frequency === opt.value ? '2px solid var(--primary-500)' : '1px solid var(--border-color)',
                                                            background: form.pay_frequency === opt.value ? 'rgba(108,92,231,0.08)' : 'transparent',
                                                            color: form.pay_frequency === opt.value ? 'var(--primary-500)' : 'var(--text-secondary)',
                                                        }}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                Define cuándo se liquida el balance acumulado del profesional
                                            </div>
                                        </div>

                                        {(form.pay_frequency === 'weekly' || form.pay_frequency === 'biweekly') && (
                                            <div className="form-group">
                                                <label className="form-label">Día de Pago</label>
                                                <select className="form-input" value={form.pay_day} onChange={e => setForm({ ...form, pay_day: e.target.value })}>
                                                    <option value="">Seleccionar día...</option>
                                                    {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(d => (
                                                        <option key={d} value={d}>{d}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {form.pay_frequency === 'monthly' && (
                                            <div className="form-group">
                                                <label className="form-label">Día del Mes para Pago</label>
                                                <input type="number" min="1" max="31" className="form-input"
                                                    value={form.pay_day}
                                                    onChange={e => setForm({ ...form, pay_day: e.target.value })}
                                                    placeholder="Ej: 15" />
                                            </div>
                                        )}
                                    </>
                                )}

                                {activeTab === 'permissions' && (
                                    <div className="form-group">
                                        <label className="form-label" style={{ marginBottom: '12px' }}>Permisos de Acceso</label>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {ACCESS_ROLES.map(role => (
                                                <label key={role.value}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '14px',
                                                        padding: '14px 16px', borderRadius: '12px', cursor: 'pointer',
                                                        border: `2px solid ${form.access_role === role.value ? 'var(--primary-500)' : 'var(--border-color)'}`,
                                                        background: form.access_role === role.value ? 'var(--primary-50)' : 'white',
                                                        transition: 'all 150ms',
                                                    }}>
                                                    <input type="radio" name="access_role" value={role.value}
                                                        checked={form.access_role === role.value}
                                                        onChange={() => setForm({ ...form, access_role: role.value })}
                                                        style={{ display: 'none' }} />
                                                    <div style={{
                                                        width: '20px', height: '20px', borderRadius: '50%',
                                                        border: `2px solid ${form.access_role === role.value ? 'var(--primary-500)' : 'var(--gray-300)'}`,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        background: form.access_role === role.value ? 'var(--primary-500)' : 'white',
                                                        transition: 'all 150ms', flexShrink: 0,
                                                    }}>
                                                        {form.access_role === role.value && <Check size={12} color="white" />}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{role.label}</div>
                                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{role.desc}</div>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="modal__footer">
                                <button type="button" className="btn btn--outline" onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn--primary">{editingProf ? 'Guardar Cambios' : 'Crear Profesional'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ======== SCHEDULE MODAL ======== */}
            {showScheduleModal && scheduleProf && (
                <div className="modal-overlay" onClick={() => setShowScheduleModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                        <div className="modal__header">
                            <h3 className="modal__title">Horario de {scheduleProf.name}</h3>
                            <button className="modal__close" onClick={() => setShowScheduleModal(false)}>✕</button>
                        </div>
                        <div className="modal__body" style={{ maxHeight: '60vh', overflow: 'auto' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {scheduleData.map((day, idx) => (
                                    <div key={day.day} style={{
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        padding: '12px 14px', borderRadius: '10px',
                                        background: day.enabled ? 'var(--primary-50)' : 'var(--gray-50)',
                                        border: `1px solid ${day.enabled ? 'var(--primary-200)' : 'var(--border-color)'}`,
                                        transition: 'all 150ms',
                                    }}>
                                        <button type="button"
                                            onClick={() => {
                                                const copy = [...scheduleData];
                                                copy[idx].enabled = !copy[idx].enabled;
                                                setScheduleData(copy);
                                            }}
                                            style={{
                                                width: '40px', height: '22px', borderRadius: '11px',
                                                background: day.enabled ? 'var(--primary-500)' : 'var(--gray-300)',
                                                border: 'none', cursor: 'pointer', position: 'relative',
                                                transition: 'background 150ms', flexShrink: 0,
                                            }}>
                                            <div style={{
                                                position: 'absolute', top: '2px',
                                                left: day.enabled ? '20px' : '2px',
                                                width: '18px', height: '18px', borderRadius: '50%',
                                                background: 'white', transition: 'left 150ms',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                            }} />
                                        </button>
                                        <span style={{ width: '80px', fontWeight: 600, fontSize: '14px', color: day.enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                            {day.label}
                                        </span>
                                        {day.enabled ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, flexWrap: 'wrap' }}>
                                                <input type="time" value={day.start_time}
                                                    onChange={e => { const c = [...scheduleData]; c[idx].start_time = e.target.value; setScheduleData(c); }}
                                                    className="form-input" style={{ width: '110px', padding: '6px 8px', fontSize: '13px' }} />
                                                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>a</span>
                                                <input type="time" value={day.end_time}
                                                    onChange={e => { const c = [...scheduleData]; c[idx].end_time = e.target.value; setScheduleData(c); }}
                                                    className="form-input" style={{ width: '110px', padding: '6px 8px', fontSize: '13px' }} />
                                                <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '8px' }}>Descanso:</span>
                                                <input type="time" value={day.break_start}
                                                    onChange={e => { const c = [...scheduleData]; c[idx].break_start = e.target.value; setScheduleData(c); }}
                                                    className="form-input" style={{ width: '100px', padding: '6px 8px', fontSize: '13px' }} />
                                                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>-</span>
                                                <input type="time" value={day.break_end}
                                                    onChange={e => { const c = [...scheduleData]; c[idx].break_end = e.target.value; setScheduleData(c); }}
                                                    className="form-input" style={{ width: '100px', padding: '6px 8px', fontSize: '13px' }} />
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Libre</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="modal__footer">
                            <button type="button" className="btn btn--outline" onClick={() => setShowScheduleModal(false)}>Cancelar</button>
                            <button type="button" className="btn btn--primary" onClick={handleSaveSchedule}>Guardar Horario</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ======== DAYS OFF MODAL ======== */}
            {showDaysOffModal && daysOffProf && (
                <div className="modal-overlay" onClick={() => setShowDaysOffModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                        <div className="modal__header">
                            <h3 className="modal__title">Días Libres — {daysOffProf.name}</h3>
                            <button className="modal__close" onClick={() => setShowDaysOffModal(false)}>✕</button>
                        </div>
                        <div className="modal__body" style={{ maxHeight: '60vh', overflow: 'auto' }}>
                            <div style={{
                                display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '20px',
                                padding: '16px', background: 'var(--gray-50)', borderRadius: '12px',
                                border: '1px solid var(--border-color)',
                            }}>
                                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                    <label className="form-label" style={{ fontSize: '12px' }}>Fecha</label>
                                    <input type="date" className="form-input" value={newDayOff.date}
                                        onChange={e => setNewDayOff({ ...newDayOff, date: e.target.value })}
                                        min={new Date().toISOString().split('T')[0]}
                                        style={{ fontSize: '13px' }} />
                                </div>
                                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                    <label className="form-label" style={{ fontSize: '12px' }}>Motivo (opcional)</label>
                                    <input className="form-input" value={newDayOff.reason}
                                        onChange={e => setNewDayOff({ ...newDayOff, reason: e.target.value })}
                                        placeholder="Ej: Vacaciones" style={{ fontSize: '13px' }} />
                                </div>
                                <button type="button" className="btn btn--primary btn--sm" onClick={addDayOff}
                                    disabled={!newDayOff.date} style={{ flexShrink: 0 }}>
                                    <Plus size={16} />
                                </button>
                            </div>

                            {daysOffData.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                                    <CalendarOff size={32} style={{ marginBottom: '8px', opacity: 0.3 }} />
                                    <p style={{ fontSize: '14px' }}>Sin días libres programados</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {daysOffData.sort((a, b) => a.date.localeCompare(b.date)).map((exc, idx) => (
                                        <div key={idx} style={{
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            padding: '10px 14px', borderRadius: '8px',
                                            background: 'white', border: '1px solid var(--border-color)',
                                        }}>
                                            <CalendarOff size={16} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '14px' }}>
                                                    {new Date(exc.date + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                                                </div>
                                                {exc.reason && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{exc.reason}</div>}
                                            </div>
                                            <button type="button" onClick={() => removeDayOff(idx)}
                                                style={{
                                                    width: '28px', height: '28px', borderRadius: '6px',
                                                    border: 'none', background: 'rgba(239,68,68,0.1)',
                                                    color: '#EF4444', cursor: 'pointer', display: 'flex',
                                                    alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="modal__footer">
                            <button type="button" className="btn btn--outline" onClick={() => setShowDaysOffModal(false)}>Cancelar</button>
                            <button type="button" className="btn btn--primary" onClick={handleSaveDaysOff}>Guardar Días Libres</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
