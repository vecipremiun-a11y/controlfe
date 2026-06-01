'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    ChevronLeft, ChevronRight, Plus, Clock, User, Phone, X,
    CheckCircle, AlertCircle, XCircle, PlayCircle, Eye, Scissors,
    Calendar, MapPin, MessageSquare, Edit2, Trash2, Check,
} from 'lucide-react';

const HOUR_HEIGHT = 72; // px per hour
const START_HOUR = 7;
const END_HOUR = 21;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const SLOT_INTERVAL = 15; // minutes

const STATUS_MAP = {
    reservado: { label: 'Reservado', color: '#8B5CF6', bg: '#F5F3FF', icon: Clock },
    confirmado: { label: 'Confirmado', color: '#3B82F6', bg: '#EFF6FF', icon: CheckCircle },
    en_atencion: { label: 'En atención', color: '#F59E0B', bg: '#FFFBEB', icon: PlayCircle },
    terminado: { label: 'Terminado', color: '#10B981', bg: '#ECFDF5', icon: Check },
    no_show: { label: 'No Show', color: '#EF4444', bg: '#FEF2F2', icon: XCircle },
    cancelado: { label: 'Cancelado', color: '#9CA3AF', bg: '#F9FAFB', icon: XCircle },
};

const STATUS_TRANSITIONS = {
    reservado: ['confirmado', 'cancelado'],
    confirmado: ['en_atencion', 'cancelado'],
    en_atencion: ['terminado'],
    terminado: [],
    no_show: [],
    cancelado: [],
};

function timeToMinutes(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function minutesToTime(m) {
    const h = Math.floor(m / 60) % 24;
    const mins = m % 60;
    return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function getInitials(name) {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function AgendaPage() {
    const [view, setView] = useState('day');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [appointments, setAppointments] = useState([]);
    const [professionals, setProfessionals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [services, setServices] = useState([]);
    const [clients, setClients] = useState([]);

    // New appointment modal
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({
        client_name: '', client_phone: '', professional_id: '', service_id: '',
        date: '', start_time: '09:00', notes: '',
    });

    // Appointment detail panel
    const [selectedApt, setSelectedApt] = useState(null);

    // Current time indicator
    const [now, setNow] = useState(new Date());
    const gridRef = useRef(null);

    // Update time every minute
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Scroll to current hour on load
    useEffect(() => {
        if (!loading && gridRef.current) {
            const nowMinutes = now.getHours() * 60 + now.getMinutes();
            const scrollPos = ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT - 100;
            gridRef.current.scrollTop = Math.max(0, scrollPos);
        }
    }, [loading]);

    useEffect(() => { loadData(); }, [currentDate, view]);

    async function loadData() {
        setLoading(true);
        const dateStr = currentDate.toISOString().split('T')[0];
        try {
            const [aptsRes, profsRes, svcsRes, clientsRes] = await Promise.all([
                fetch(`/api/salon/appointments?date=${dateStr}`),
                fetch('/api/salon/professionals'),
                fetch('/api/salon/services'),
                fetch('/api/salon/clients'),
            ]);
            if (aptsRes.ok) { const d = await aptsRes.json(); setAppointments(d.appointments || []); }
            if (profsRes.ok) { const d = await profsRes.json(); setProfessionals(d.professionals || []); }
            if (svcsRes.ok) { const d = await svcsRes.json(); setServices(d.services || []); }
            if (clientsRes.ok) { const d = await clientsRes.json(); setClients(d.clients || []); }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }

    function navigate(dir) {
        const d = new Date(currentDate);
        d.setDate(d.getDate() + dir);
        setCurrentDate(d);
    }

    function goToday() { setCurrentDate(new Date()); }

    function openNewModal(profId, time) {
        setForm({
            client_name: '', client_phone: '', professional_id: profId || '',
            service_id: '', date: currentDate.toISOString().split('T')[0],
            start_time: time || '09:00', notes: '',
        });
        setShowModal(true);
    }

    function handleCellClick(profId, hour, quarter) {
        const mins = hour * 60 + quarter * 15;
        openNewModal(profId, minutesToTime(mins));
    }

    async function handleCreateAppointment(e) {
        e.preventDefault();
        try {
            const res = await fetch('/api/salon/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    date: form.date || currentDate.toISOString().split('T')[0],
                }),
            });
            if (res.ok) {
                setShowModal(false);
                loadData();
            } else {
                const err = await res.json().catch(() => ({}));
                alert(err.error || 'Error al crear la cita');
            }
        } catch (e) { console.error(e); alert('Error de conexión'); }
    }

    async function updateStatus(aptId, newStatus) {
        try {
            const res = await fetch(`/api/salon/appointments?id=${aptId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                loadData();
                setSelectedApt(prev => prev ? { ...prev, status: newStatus } : null);
            }
        } catch (e) { console.error(e); }
    }

    // Check if today
    const isToday = currentDate.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nowTop = ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;

    const dateStr = currentDate.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Generate time slots for the form dropdown
    const timeSlots = useMemo(() => {
        const slots = [];
        for (let m = START_HOUR * 60; m < END_HOUR * 60; m += SLOT_INTERVAL) {
            slots.push(minutesToTime(m));
        }
        return slots;
    }, []);

    // Count stats
    const totalApts = appointments.filter(a => a.status !== 'cancelado').length;
    const confirmedApts = appointments.filter(a => a.status === 'confirmado' || a.status === 'en_atencion').length;
    const completedApts = appointments.filter(a => a.status === 'terminado').length;

    const fmt = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(v || 0);

    if (loading) return <div className="loading-page"><div className="spinner spinner--lg" /></div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div className="page-header" style={{ marginBottom: '12px' }}>
                <div>
                    <h1 className="page-header__title">Agenda</h1>
                    <p className="page-header__subtitle" style={{ textTransform: 'capitalize' }}>{dateStr}</p>
                </div>
                <div className="page-header__actions">
                    <div style={{ display: 'flex', gap: '0', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                        {[{ key: 'day', label: 'Día' }, { key: 'week', label: 'Semana' }].map(v => (
                            <button key={v.key} className={`btn btn--sm ${view === v.key ? 'btn--primary' : 'btn--ghost'}`}
                                style={{ borderRadius: 0 }} onClick={() => setView(v.key)}>
                                {v.label}
                            </button>
                        ))}
                    </div>
                    <button className="btn btn--primary" onClick={() => openNewModal('', '')}>
                        <Plus size={18} /> Nueva Cita
                    </button>
                </div>
            </div>

            {/* Navigation + Stats */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button className="btn btn--outline btn--sm" onClick={() => navigate(-1)} style={{ padding: '6px 10px' }}><ChevronLeft size={18} /></button>
                    <button className={`btn btn--sm ${isToday ? 'btn--primary' : 'btn--secondary'}`} onClick={goToday}>Hoy</button>
                    <button className="btn btn--outline btn--sm" onClick={() => navigate(1)} style={{ padding: '6px 10px' }}><ChevronRight size={18} /></button>
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-muted)' }}><strong style={{ color: 'var(--text-primary)' }}>{totalApts}</strong> citas</span>
                    <span style={{ color: 'var(--text-muted)' }}><strong style={{ color: '#3B82F6' }}>{confirmedApts}</strong> confirmadas</span>
                    <span style={{ color: 'var(--text-muted)' }}><strong style={{ color: '#10B981' }}>{completedApts}</strong> terminadas</span>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ overflow: 'auto', flex: 1, position: 'relative' }} ref={gridRef}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: `56px repeat(${professionals.length || 1}, minmax(160px, 1fr))`,
                        minWidth: `${56 + professionals.length * 160}px`,
                    }}>
                        {/* Sticky Header */}
                        <div style={{
                            position: 'sticky', top: 0, zIndex: 20,
                            display: 'contents',
                        }}>
                            <div style={{
                                position: 'sticky', top: 0, zIndex: 21,
                                padding: '10px 8px', background: 'var(--gray-50)',
                                borderBottom: '2px solid var(--primary-200)',
                                borderRight: '1px solid var(--border-color)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                            </div>
                            {professionals.map(p => (
                                <div key={p.id} style={{
                                    position: 'sticky', top: 0, zIndex: 21,
                                    padding: '10px 12px', background: 'var(--gray-50)',
                                    borderBottom: '2px solid var(--primary-200)',
                                    borderRight: '1px solid var(--border-color)',
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                }}>
                                    <div style={{
                                        width: '34px', height: '34px', borderRadius: '50%',
                                        background: p.avatar_url ? 'none' : (p.color || 'var(--primary-500)'),
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'white', fontWeight: 700, fontSize: '12px',
                                        overflow: 'hidden', flexShrink: 0,
                                        border: `2px solid ${p.color || 'var(--primary-500)'}`,
                                    }}>
                                        {p.avatar_url ? (
                                            <img src={p.avatar_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : getInitials(p.name)}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '13px', lineHeight: 1.2 }}>{p.name}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                            {appointments.filter(a => a.professional_id === p.id && a.status !== 'cancelado').length} citas
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Time rows */}
                        {HOURS.map(hour => (
                            <div key={`row-${hour}`} style={{ display: 'contents' }}>
                                {/* Hour label */}
                                <div style={{
                                    padding: '0 6px', borderRight: '1px solid var(--border-color)',
                                    borderBottom: '1px solid var(--gray-100)', height: `${HOUR_HEIGHT}px`,
                                    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                                    paddingTop: '2px',
                                }}>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                                        {`${String(hour).padStart(2, '0')}:00`}
                                    </span>
                                </div>

                                {/* Professional columns */}
                                {professionals.map(p => {
                                    // Get appointments that START in this hour block
                                    const hourAppts = appointments.filter(a => {
                                        if (a.professional_id !== p.id) return false;
                                        const startMins = timeToMinutes(a.start_time);
                                        return startMins >= hour * 60 && startMins < (hour + 1) * 60;
                                    });

                                    return (
                                        <div key={`${hour}-${p.id}`} style={{
                                            borderRight: '1px solid var(--border-color)',
                                            borderBottom: '1px solid var(--gray-100)',
                                            height: `${HOUR_HEIGHT}px`,
                                            position: 'relative',
                                        }}>
                                            {/* Quarter-hour lines */}
                                            <div style={{ position: 'absolute', top: `${HOUR_HEIGHT * 0.25}px`, left: 0, right: 0, borderTop: '1px dashed var(--gray-100)' }} />
                                            <div style={{ position: 'absolute', top: `${HOUR_HEIGHT * 0.5}px`, left: 0, right: 0, borderTop: '1px dotted var(--gray-200)' }} />
                                            <div style={{ position: 'absolute', top: `${HOUR_HEIGHT * 0.75}px`, left: 0, right: 0, borderTop: '1px dashed var(--gray-100)' }} />

                                            {/* Clickable quarters for creating appointments */}
                                            {[0, 1, 2, 3].map(q => (
                                                <div key={q}
                                                    onClick={() => handleCellClick(p.id, hour, q)}
                                                    style={{
                                                        position: 'absolute', top: `${q * HOUR_HEIGHT / 4}px`,
                                                        left: 0, right: 0, height: `${HOUR_HEIGHT / 4}px`,
                                                        cursor: 'pointer', zIndex: 1,
                                                    }}
                                                    title={`${minutesToTime(hour * 60 + q * 15)} — Click para nueva cita`}
                                                />
                                            ))}

                                            {/* Appointment blocks */}
                                            {hourAppts.map(apt => {
                                                const startMins = timeToMinutes(apt.start_time);
                                                const endMins = timeToMinutes(apt.end_time);
                                                const duration = endMins - startMins;
                                                const topOffset = ((startMins - hour * 60) / 60) * HOUR_HEIGHT;
                                                const blockHeight = Math.max((duration / 60) * HOUR_HEIGHT - 2, 24);
                                                const status = STATUS_MAP[apt.status] || STATUS_MAP.reservado;
                                                const isSmall = duration <= 20;

                                                return (
                                                    <div key={apt.id} onClick={(e) => { e.stopPropagation(); setSelectedApt(apt); }}
                                                        style={{
                                                            position: 'absolute', top: `${topOffset}px`,
                                                            left: '3px', right: '3px', height: `${blockHeight}px`,
                                                            background: `linear-gradient(135deg, ${status.color}dd, ${status.color}bb)`,
                                                            borderRadius: '6px', padding: isSmall ? '2px 8px' : '5px 8px',
                                                            cursor: 'pointer', zIndex: 10, overflow: 'hidden',
                                                            borderLeft: `3px solid ${status.color}`,
                                                            boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                                                            transition: 'transform 100ms, box-shadow 100ms',
                                                            display: 'flex', flexDirection: 'column', justifyContent: isSmall ? 'center' : 'flex-start',
                                                        }}
                                                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.2)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)'; }}
                                                    >
                                                        {isSmall ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span style={{ color: 'white', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {apt.client_name || 'Cliente'} · {apt.service_name || ''}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div style={{ color: 'white', fontSize: '12px', fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {apt.client_name || 'Cliente'}
                                                                </div>
                                                                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '11px', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {apt.service_name || 'Servicio'}
                                                                </div>
                                                                {!isSmall && duration >= 40 && (
                                                                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px', marginTop: '2px' }}>
                                                                        {apt.start_time} - {apt.end_time} · {duration}min
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    {/* Current time indicator */}
                    {isToday && nowTop > 0 && nowTop < (END_HOUR - START_HOUR) * HOUR_HEIGHT && (
                        <div style={{
                            position: 'absolute', top: `${nowTop + 44}px`,
                            left: '56px', right: 0, zIndex: 15,
                            display: 'flex', alignItems: 'center', pointerEvents: 'none',
                        }}>
                            <div style={{
                                width: '10px', height: '10px', borderRadius: '50%',
                                background: '#EF4444', marginLeft: '-5px',
                            }} />
                            <div style={{
                                flex: 1, height: '2px',
                                background: '#EF4444',
                            }} />
                        </div>
                    )}
                </div>
            </div>

            {/* ======== APPOINTMENT DETAIL PANEL ======== */}
            {selectedApt && (
                <div className="modal-overlay" onClick={() => setSelectedApt(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
                        <div className="modal__header">
                            <h3 className="modal__title">Detalle de Cita</h3>
                            <button className="modal__close" onClick={() => setSelectedApt(null)}>✕</button>
                        </div>
                        <div className="modal__body">
                            {/* Status badge */}
                            {(() => {
                                const st = STATUS_MAP[selectedApt.status] || STATUS_MAP.reservado;
                                const StIcon = st.icon;
                                return (
                                    <div style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '6px 14px', borderRadius: '20px', marginBottom: '18px',
                                        background: st.bg, color: st.color, fontWeight: 700, fontSize: '13px',
                                        border: `1px solid ${st.color}30`,
                                    }}>
                                        <StIcon size={15} /> {st.label}
                                    </div>
                                );
                            })()}

                            {/* Client info */}
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                    <div style={{
                                        width: '40px', height: '40px', borderRadius: '50%',
                                        background: 'var(--primary-100)', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center',
                                        color: 'var(--primary-600)', fontWeight: 700, fontSize: '14px',
                                    }}>
                                        {getInitials(selectedApt.client_name)}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '16px' }}>{selectedApt.client_name || 'Cliente'}</div>
                                        {selectedApt.client_phone && (
                                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Phone size={12} /> {selectedApt.client_phone}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Details grid */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px',
                                padding: '16px', background: 'var(--gray-50)', borderRadius: '12px',
                                marginBottom: '16px',
                            }}>
                                <div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Servicio</div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: selectedApt.service_color || '#6C5CE7' }} />
                                        {selectedApt.service_name || 'N/A'}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Profesional</div>
                                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{selectedApt.professional_name || 'N/A'}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Horario</div>
                                    <div style={{ fontSize: '14px', fontWeight: 600 }}>
                                        {selectedApt.start_time} - {selectedApt.end_time}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Duración</div>
                                    <div style={{ fontSize: '14px', fontWeight: 600 }}>
                                        {timeToMinutes(selectedApt.end_time) - timeToMinutes(selectedApt.start_time)} min
                                    </div>
                                </div>
                                {selectedApt.source && (
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Origen</div>
                                        <div style={{ fontSize: '14px', fontWeight: 600, textTransform: 'capitalize' }}>{selectedApt.source}</div>
                                    </div>
                                )}
                            </div>

                            {selectedApt.notes && (
                                <div style={{ padding: '12px 16px', background: '#FFFBEB', borderRadius: '10px', marginBottom: '16px', border: '1px solid #FDE68A' }}>
                                    <div style={{ fontSize: '11px', color: '#92400E', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Notas</div>
                                    <div style={{ fontSize: '13px', color: '#78350F' }}>{selectedApt.notes}</div>
                                </div>
                            )}

                            {/* Status actions */}
                            {STATUS_TRANSITIONS[selectedApt.status]?.length > 0 && (
                                <div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Cambiar Estado</div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {STATUS_TRANSITIONS[selectedApt.status].map(nextStatus => {
                                            const st = STATUS_MAP[nextStatus];
                                            const StIcon = st.icon;
                                            return (
                                                <button key={nextStatus}
                                                    className="btn btn--sm"
                                                    style={{
                                                        background: st.bg, color: st.color, border: `1px solid ${st.color}30`,
                                                        fontWeight: 600,
                                                    }}
                                                    onClick={() => updateStatus(selectedApt.id, nextStatus)}>
                                                    <StIcon size={14} /> {st.label}
                                                </button>
                                            );
                                        })}
                                        {selectedApt.status !== 'no_show' && selectedApt.status !== 'terminado' && selectedApt.status !== 'cancelado' && (
                                            <button className="btn btn--sm"
                                                style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA', fontWeight: 600 }}
                                                onClick={() => updateStatus(selectedApt.id, 'no_show')}>
                                                <XCircle size={14} /> No Show
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="modal__footer" style={{ justifyContent: 'space-between' }}>
                            <button className="btn btn--outline" onClick={() => setSelectedApt(null)}>Cerrar</button>
                            {selectedApt.client_phone && (
                                <a
                                    href={(() => {
                                        const phone = (selectedApt.client_phone || '').replace(/[^0-9+]/g, '').replace(/^\+/, '');
                                        const dateFormatted = selectedApt.date
                                            ? new Date(selectedApt.date + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
                                            : '';
                                        const msg = `Hola *${selectedApt.client_name}* 👋\n\n` +
                                            `Te confirmamos tu cita:\n` +
                                            `✂️ *${selectedApt.service_name}*\n` +
                                            `👤 Con: *${selectedApt.professional_name}*\n` +
                                            `📅 ${dateFormatted}\n` +
                                            `🕐 ${selectedApt.start_time} - ${selectedApt.end_time}\n\n` +
                                            `¡Te esperamos! 😊`;
                                        return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
                                    })()}
                                    target="_blank" rel="noopener noreferrer"
                                    className="btn btn--sm"
                                    style={{
                                        background: '#25D366', color: 'white', border: 'none',
                                        fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
                                    }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                    </svg>
                                    Enviar WhatsApp
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ======== NEW APPOINTMENT MODAL ======== */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '540px' }}>
                        <div className="modal__header">
                            <h3 className="modal__title">Nueva Cita</h3>
                            <button className="modal__close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleCreateAppointment}>
                            <div className="modal__body">
                                {/* Client */}
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label form-label--required">Cliente</label>
                                        <input className="form-input" value={form.client_name}
                                            onChange={e => {
                                                setForm({ ...form, client_name: e.target.value });
                                                const match = clients.find(c => c.name === e.target.value);
                                                if (match?.phone) setForm(f => ({ ...f, client_name: e.target.value, client_phone: match.phone }));
                                            }}
                                            required placeholder="Nombre del cliente" list="clients-list" />
                                        <datalist id="clients-list">
                                            {clients.map(c => <option key={c.id} value={c.name}>{c.phone}</option>)}
                                        </datalist>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Teléfono</label>
                                        <input className="form-input" value={form.client_phone}
                                            onChange={e => setForm({ ...form, client_phone: e.target.value })}
                                            placeholder="+56 9 1234 5678" />
                                    </div>
                                </div>

                                {/* Service & Professional */}
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label form-label--required">Servicio</label>
                                        <select className="form-input form-select" value={form.service_id}
                                            onChange={e => setForm({ ...form, service_id: e.target.value })} required>
                                            <option value="">Seleccionar servicio</option>
                                            {services.filter(s => s.active).map(s => (
                                                <option key={s.id} value={s.id}>
                                                    {s.name} ({s.duration_min}min — {fmt(s.price)})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label form-label--required">Profesional</label>
                                        <select className="form-input form-select" value={form.professional_id}
                                            onChange={e => setForm({ ...form, professional_id: e.target.value })} required>
                                            <option value="">Seleccionar</option>
                                            {professionals.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Date & Time */}
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label form-label--required">Fecha</label>
                                        <input type="date" className="form-input" value={form.date}
                                            onChange={e => setForm({ ...form, date: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label form-label--required">Hora</label>
                                        <select className="form-input form-select" value={form.start_time}
                                            onChange={e => setForm({ ...form, start_time: e.target.value })} required>
                                            {timeSlots.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Service preview */}
                                {form.service_id && (() => {
                                    const svc = services.find(s => s.id === form.service_id);
                                    if (!svc) return null;
                                    const endMins = timeToMinutes(form.start_time) + svc.duration_min;
                                    return (
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            padding: '10px 14px', background: 'var(--primary-50)',
                                            borderRadius: '10px', marginBottom: '12px',
                                            border: '1px solid var(--primary-200)',
                                        }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: svc.color || '#6C5CE7' }} />
                                            <span style={{ flex: 1, fontSize: '13px', fontWeight: 600 }}>{svc.name}</span>
                                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                {form.start_time} → {minutesToTime(endMins)} ({svc.duration_min}min)
                                            </span>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary-600)' }}>{fmt(svc.price)}</span>
                                        </div>
                                    );
                                })()}

                                <div className="form-group">
                                    <label className="form-label">Notas</label>
                                    <textarea className="form-input form-textarea" rows={2} value={form.notes}
                                        onChange={e => setForm({ ...form, notes: e.target.value })}
                                        placeholder="Notas opcionales..." />
                                </div>
                            </div>
                            <div className="modal__footer">
                                <button type="button" className="btn btn--outline" onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn--primary">Crear Cita</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
