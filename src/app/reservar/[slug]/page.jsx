'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

const STEPS = ['service', 'professional', 'datetime', 'confirm'];
const STEP_LABELS = ['Servicio', 'Profesional', 'Día y Hora', 'Confirmar'];

export default function BookingPage() {
    const params = useParams();
    const slug = params.slug;

    const [loading, setLoading] = useState(true);
    const [salon, setSalon] = useState(null);
    const [services, setServices] = useState([]);
    const [professionals, setProfessionals] = useState([]);
    const [slots, setSlots] = useState([]);
    const [slotsLoading, setSlotsLoading] = useState(false);
    const [step, setStep] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [booked, setBooked] = useState(null);
    const [error, setError] = useState('');

    const [selectedService, setSelectedService] = useState(null);
    const [selectedProfessional, setSelectedProfessional] = useState(null);
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedTime, setSelectedTime] = useState('');
    const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
    const [customFields, setCustomFields] = useState({});
    const [bookingFields, setBookingFields] = useState(null);

    useEffect(() => {
        fetch(`/api/public/booking?slug=${slug}`)
            .then(r => r.json())
            .then(data => {
                if (data.error) { setError(data.error); return; }
                setSalon(data.salon);
                setServices(data.services || []);
                setProfessionals(data.professionals || []);
                if (data.config?.booking_fields) setBookingFields(data.config.booking_fields);
            })
            .catch(() => setError('Error de conexión'))
            .finally(() => setLoading(false));
    }, [slug]);

    const loadSlots = useCallback(async (date, serviceId, profId) => {
        setSlotsLoading(true);
        setSlots([]);
        setSelectedTime('');
        try {
            const url = `/api/public/booking?slug=${slug}&date=${date}&service_id=${serviceId}${profId ? `&professional_id=${profId}` : ''}`;
            const res = await fetch(url);
            const data = await res.json();
            setSlots(data.slots || []);
        } catch {}
        finally { setSlotsLoading(false); }
    }, [slug]);

    function selectService(svc) {
        setSelectedService(svc);
        setSelectedProfessional(null);
        setSelectedDate('');
        setSelectedTime('');
        setStep(1);
    }

    function selectProfessional(prof) {
        setSelectedProfessional(prof);
        setSelectedDate('');
        setSelectedTime('');
        setStep(2);
    }

    function selectDate(date) {
        setSelectedDate(date);
        setSelectedTime('');
        loadSlots(date, selectedService.id, selectedProfessional?.id === 'any' ? null : selectedProfessional?.id);
    }

    function selectTime(time, profId) {
        setSelectedTime(time);
        if (selectedProfessional?.id === 'any') {
            const realProf = professionals.find(p => p.id === profId);
            setSelectedProfessional({ ...realProf, wasAny: true });
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!form.name || !form.phone) return;
        setSubmitting(true);
        try {
            const res = await fetch('/api/public/booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    slug,
                    service_id: selectedService.id,
                    professional_id: selectedProfessional.id,
                    date: selectedDate,
                    start_time: selectedTime,
                    client_name: form.name,
                    client_phone: form.phone,
                    client_email: form.email || null,
                    notes: form.notes || null,
                    custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setBooked(data);
            } else {
                alert(data.error || 'Error al reservar');
            }
        } catch { alert('Error de conexión'); }
        finally { setSubmitting(false); }
    }

    // Get available professionals for selected service
    const filteredProfessionals = selectedService
        ? professionals.filter(p => p.service_ids.length === 0 || p.service_ids.includes(selectedService.id))
        : [];

    // Generate dates for next 30 days
    const availableDates = [];
    const today = new Date();
    for (let i = 0; i < 30; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        availableDates.push(d.toISOString().split('T')[0]);
    }

    // Group slots by time (aggregate professionals)
    const groupedSlots = {};
    slots.forEach(s => {
        if (!groupedSlots[s.time]) groupedSlots[s.time] = [];
        groupedSlots[s.time].push(s.professional_id);
    });

    const fmt = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(v || 0);
    const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
    const getDayName = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short' }).slice(0, 3);
    const getDayNum = (d) => new Date(d + 'T12:00:00').getDate();
    const getMonthName = (d) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { month: 'short' });

    if (loading) return (
        <div style={styles.page}>
            <div style={styles.container}>
                <div style={{ textAlign: 'center', padding: '80px 0' }}>
                    <div style={styles.spinner} />
                    <p style={{ color: '#9CA3AF', marginTop: '16px' }}>Cargando...</p>
                </div>
            </div>
        </div>
    );

    if (error) return (
        <div style={styles.page}>
            <div style={styles.container}>
                <div style={{ textAlign: 'center', padding: '80px 20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>😕</div>
                    <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1F2937', marginBottom: '8px' }}>Salón no encontrado</h2>
                    <p style={{ color: '#6B7280' }}>{error}</p>
                </div>
            </div>
        </div>
    );

    // Success screen
    if (booked) return (
        <div style={styles.page}>
            <div style={styles.container}>
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <div style={{
                        width: '80px', height: '80px', borderRadius: '50%',
                        background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 24px', fontSize: '36px',
                    }}>✓</div>
                    <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#1F2937', marginBottom: '8px' }}>¡Reserva Confirmada!</h2>
                    <p style={{ color: '#6B7280', marginBottom: '32px' }}>Tu cita ha sido agendada exitosamente</p>
                    <div style={{
                        background: 'white', borderRadius: '16px', padding: '24px',
                        border: '1px solid #E5E7EB', maxWidth: '360px', margin: '0 auto', textAlign: 'left',
                    }}>
                        <div style={styles.summaryRow}>
                            <span style={styles.summaryLabel}>📍 Salón</span>
                            <span style={styles.summaryValue}>{salon.name}</span>
                        </div>
                        <div style={styles.summaryRow}>
                            <span style={styles.summaryLabel}>✂️ Servicio</span>
                            <span style={styles.summaryValue}>{selectedService.name}</span>
                        </div>
                        <div style={styles.summaryRow}>
                            <span style={styles.summaryLabel}>👤 Con</span>
                            <span style={styles.summaryValue}>{selectedProfessional.name}</span>
                        </div>
                        <div style={styles.summaryRow}>
                            <span style={styles.summaryLabel}>📅 Fecha</span>
                            <span style={styles.summaryValue}>{fmtDate(selectedDate)}</span>
                        </div>
                        <div style={{ ...styles.summaryRow, borderBottom: 'none' }}>
                            <span style={styles.summaryLabel}>🕐 Hora</span>
                            <span style={styles.summaryValue}>{selectedTime} hrs</span>
                        </div>
                    </div>

                    <p style={{ color: '#9CA3AF', fontSize: '13px', marginTop: '24px' }}>
                        Te esperamos. Si necesitas cancelar, contacta al salón.
                    </p>
                    <p style={{ color: '#6B7280', fontSize: '13px', marginTop: '8px' }}>
                        Recibirás una confirmación por WhatsApp en breve 📱
                    </p>
                </div>
            </div>
        </div>
    );

    return (
        <div style={styles.page}>
            <div style={styles.container}>
                {/* Header */}
                <div style={{ textAlign: 'center', padding: '24px 20px 16px' }}>
                    {salon.logo_url && (
                        <img src={salon.logo_url} alt={salon.name} style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 12px', display: 'block', border: '2px solid #E5E7EB' }} />
                    )}
                    <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#1F2937', marginBottom: '4px' }}>{salon.name}</h1>
                    {salon.address && <p style={{ color: '#9CA3AF', fontSize: '14px' }}>📍 {salon.address}{salon.city ? `, ${salon.city}` : ''}</p>}
                </div>

                {/* Steps Indicator */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '0 20px 20px' }}>
                    {STEP_LABELS.map((label, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                                background: step === i ? '#7C3AED' : step > i ? '#D1FAE5' : '#F3F4F6',
                                color: step === i ? 'white' : step > i ? '#059669' : '#9CA3AF',
                                cursor: step > i ? 'pointer' : 'default',
                                transition: 'all 200ms',
                            }} onClick={() => { if (step > i) setStep(i); }}>
                                {step > i ? '✓' : i + 1} {label}
                            </div>
                            {i < STEP_LABELS.length - 1 && (
                                <div style={{ width: '16px', height: '2px', background: step > i ? '#10B981' : '#E5E7EB', borderRadius: '1px' }} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Step 1: Select Service */}
                {step === 0 && (
                    <div style={styles.stepContent}>
                        <h2 style={styles.stepTitle}>¿Qué servicio necesitas?</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {services.map(svc => (
                                <button key={svc.id} onClick={() => selectService(svc)} style={{
                                    ...styles.optionCard,
                                    borderColor: selectedService?.id === svc.id ? '#7C3AED' : '#E5E7EB',
                                    background: selectedService?.id === svc.id ? '#F5F3FF' : 'white',
                                }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: svc.color || '#6C5CE7', flexShrink: 0 }} />
                                    <div style={{ flex: 1, textAlign: 'left' }}>
                                        <div style={{ fontWeight: 700, fontSize: '15px', color: '#1F2937' }}>{svc.name}</div>
                                        {svc.description && <div style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '2px' }}>{svc.description}</div>}
                                        <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '4px' }}>
                                            🕐 {svc.duration_min} min
                                        </div>
                                    </div>
                                    <div style={{ fontWeight: 800, fontSize: '16px', color: '#7C3AED', flexShrink: 0 }}>{fmt(svc.price)}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 2: Select Professional */}
                {step === 1 && (
                    <div style={styles.stepContent}>
                        <h2 style={styles.stepTitle}>¿Con quién te quieres atender?</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {/* "Any" option */}
                            <button onClick={() => selectProfessional({ id: 'any', name: 'Cualquiera disponible' })} style={{
                                ...styles.optionCard,
                                borderColor: selectedProfessional?.id === 'any' ? '#7C3AED' : '#E5E7EB',
                                background: selectedProfessional?.id === 'any' ? '#F5F3FF' : 'white',
                            }}>
                                <div style={{
                                    width: '44px', height: '44px', borderRadius: '50%', background: '#F3F4F6',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0,
                                }}>🎲</div>
                                <div style={{ flex: 1, textAlign: 'left' }}>
                                    <div style={{ fontWeight: 700, fontSize: '15px', color: '#1F2937' }}>Cualquiera disponible</div>
                                    <div style={{ fontSize: '13px', color: '#9CA3AF' }}>Te asignaremos el primer profesional libre</div>
                                </div>
                            </button>

                            {filteredProfessionals.map(p => (
                                <button key={p.id} onClick={() => selectProfessional(p)} style={{
                                    ...styles.optionCard,
                                    borderColor: selectedProfessional?.id === p.id ? '#7C3AED' : '#E5E7EB',
                                    background: selectedProfessional?.id === p.id ? '#F5F3FF' : 'white',
                                }}>
                                    <div style={{
                                        width: '44px', height: '44px', borderRadius: '50%',
                                        background: p.avatar_url ? 'none' : (p.color || '#6C5CE7'),
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'white', fontWeight: 700, fontSize: '16px',
                                        overflow: 'hidden', flexShrink: 0,
                                        border: `2px solid ${p.color || '#6C5CE7'}`,
                                    }}>
                                        {p.avatar_url ? (
                                            <img src={p.avatar_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : p.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                    </div>
                                    <div style={{ flex: 1, textAlign: 'left' }}>
                                        <div style={{ fontWeight: 700, fontSize: '15px', color: '#1F2937' }}>{p.name}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setStep(0)} style={styles.backBtn}>← Volver</button>
                    </div>
                )}

                {/* Step 3: Select Date & Time */}
                {step === 2 && (
                    <div style={styles.stepContent}>
                        <h2 style={styles.stepTitle}>Elige día y hora</h2>

                        {/* Date scroller */}
                        <div style={{
                            display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 0 16px',
                            WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
                        }}>
                            {availableDates.map(d => (
                                <button key={d} onClick={() => selectDate(d)} style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                                    padding: '10px 14px', borderRadius: '12px', border: `2px solid ${selectedDate === d ? '#7C3AED' : '#E5E7EB'}`,
                                    background: selectedDate === d ? '#7C3AED' : 'white', cursor: 'pointer',
                                    minWidth: '60px', transition: 'all 150ms', fontFamily: 'inherit',
                                }}>
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: selectedDate === d ? '#DDD6FE' : '#9CA3AF', textTransform: 'uppercase' }}>
                                        {getDayName(d)}
                                    </span>
                                    <span style={{ fontSize: '20px', fontWeight: 800, color: selectedDate === d ? 'white' : '#1F2937' }}>
                                        {getDayNum(d)}
                                    </span>
                                    <span style={{ fontSize: '11px', color: selectedDate === d ? '#DDD6FE' : '#9CA3AF' }}>
                                        {getMonthName(d)}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Time slots */}
                        {selectedDate && (
                            <>
                                {slotsLoading ? (
                                    <div style={{ textAlign: 'center', padding: '40px' }}>
                                        <div style={styles.spinner} />
                                        <p style={{ color: '#9CA3AF', marginTop: '12px', fontSize: '14px' }}>Buscando horarios...</p>
                                    </div>
                                ) : Object.keys(groupedSlots).length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>
                                        <div style={{ fontSize: '36px', marginBottom: '12px' }}>📅</div>
                                        <p style={{ fontWeight: 600, color: '#6B7280' }}>Sin horarios disponibles</p>
                                        <p style={{ fontSize: '13px', marginTop: '4px' }}>Prueba otro día o profesional</p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
                                        {Object.entries(groupedSlots).map(([time, profIds]) => (
                                            <button key={time} onClick={() => selectTime(time, profIds[0])} style={{
                                                padding: '12px 8px', borderRadius: '10px', fontFamily: 'inherit',
                                                border: `2px solid ${selectedTime === time ? '#7C3AED' : '#E5E7EB'}`,
                                                background: selectedTime === time ? '#7C3AED' : 'white',
                                                color: selectedTime === time ? 'white' : '#1F2937',
                                                fontSize: '15px', fontWeight: 700, cursor: 'pointer',
                                                transition: 'all 150ms',
                                            }}>
                                                {time}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}

                        {selectedTime && (
                            <button onClick={() => setStep(3)} style={{ ...styles.primaryBtn, marginTop: '20px' }}>
                                Continuar →
                            </button>
                        )}

                        <button onClick={() => setStep(1)} style={styles.backBtn}>← Volver</button>
                    </div>
                )}

                {/* Step 4: Confirm & Client Info */}
                {step === 3 && (
                    <div style={styles.stepContent}>
                        <h2 style={styles.stepTitle}>Confirma tu reserva</h2>

                        {/* Summary */}
                        <div style={{
                            background: '#F9FAFB', borderRadius: '14px', padding: '16px 20px',
                            marginBottom: '20px', border: '1px solid #E5E7EB',
                        }}>
                            <div style={styles.summaryRow}>
                                <span style={styles.summaryLabel}>Servicio</span>
                                <span style={styles.summaryValue}>{selectedService.name}</span>
                            </div>
                            <div style={styles.summaryRow}>
                                <span style={styles.summaryLabel}>Profesional</span>
                                <span style={styles.summaryValue}>{selectedProfessional.name}</span>
                            </div>
                            <div style={styles.summaryRow}>
                                <span style={styles.summaryLabel}>Fecha</span>
                                <span style={styles.summaryValue}>{fmtDate(selectedDate)}</span>
                            </div>
                            <div style={styles.summaryRow}>
                                <span style={styles.summaryLabel}>Hora</span>
                                <span style={styles.summaryValue}>{selectedTime} hrs</span>
                            </div>
                            <div style={{ ...styles.summaryRow, borderBottom: 'none' }}>
                                <span style={styles.summaryLabel}>Precio</span>
                                <span style={{ ...styles.summaryValue, color: '#7C3AED', fontWeight: 800 }}>{fmt(selectedService.price)}</span>
                            </div>
                        </div>

                        {/* Client form */}
                        <form onSubmit={handleSubmit}>
                            {/* Render fields dynamically from config, or fallback to defaults */}
                            {(() => {
                                const fieldsToRender = bookingFields
                                    ? bookingFields.filter(f => f.enabled)
                                    : [
                                        { id: 'name', label: 'Nombre completo', type: 'text', required: true },
                                        { id: 'phone', label: 'Teléfono', type: 'tel', required: true },
                                        { id: 'email', label: 'Email', type: 'email', required: false },
                                        { id: 'notes', label: 'Notas', type: 'textarea', required: false },
                                    ];
                                return fieldsToRender.map(field => {
                                    // Built-in fields map to form state
                                    const isBuiltIn = ['name', 'phone', 'email', 'notes'].includes(field.id);
                                    const value = isBuiltIn ? form[field.id] : (customFields[field.label] || '');
                                    const onChange = (val) => {
                                        if (isBuiltIn) setForm(prev => ({ ...prev, [field.id]: val }));
                                        else setCustomFields(prev => ({ ...prev, [field.label]: val }));
                                    };
                                    const placeholder = field.id === 'name' ? 'Tu nombre'
                                        : field.id === 'phone' ? '+56 9 1234 5678'
                                        : field.id === 'email' ? 'tu@email.com'
                                        : field.id === 'notes' ? 'Alguna indicación especial...'
                                        : field.label;

                                    return (
                                        <div key={field.id} style={{ marginBottom: '14px' }}>
                                            <label style={styles.label}>
                                                {field.label} {field.required ? '*' : '(opcional)'}
                                            </label>
                                            {field.type === 'textarea' ? (
                                                <textarea style={{ ...styles.input, height: '70px', resize: 'none' }}
                                                    value={value} required={field.required} placeholder={placeholder}
                                                    onChange={e => onChange(e.target.value)} />
                                            ) : field.type === 'select' && field.options?.length > 0 ? (
                                                <select style={styles.input} value={value} required={field.required}
                                                    onChange={e => onChange(e.target.value)}>
                                                    <option value="">Seleccionar...</option>
                                                    {field.options.map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input style={styles.input} value={value} required={field.required}
                                                    placeholder={placeholder} type={field.type || 'text'}
                                                    onChange={e => onChange(e.target.value)} />
                                            )}
                                        </div>
                                    );
                                });
                            })()}

                            <button type="submit" disabled={submitting} style={{
                                ...styles.primaryBtn,
                                opacity: submitting ? 0.7 : 1,
                            }}>
                                {submitting ? 'Reservando...' : '✓ Confirmar Reserva'}
                            </button>
                        </form>

                        <button onClick={() => setStep(2)} style={styles.backBtn}>← Volver</button>
                    </div>
                )}
            </div>
        </div>
    );
}

const styles = {
    page: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 50%, #F0FDFA 100%)',
        padding: '20px 16px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    container: {
        maxWidth: '520px', margin: '0 auto',
        background: 'white', borderRadius: '20px',
        boxShadow: '0 4px 24px rgba(124,58,237,0.08), 0 1px 4px rgba(0,0,0,0.04)',
        overflow: 'hidden',
    },
    stepContent: {
        padding: '0 24px 28px',
    },
    stepTitle: {
        fontSize: '18px', fontWeight: 800, color: '#1F2937',
        marginBottom: '16px',
    },
    optionCard: {
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '14px 16px', borderRadius: '14px',
        border: '2px solid #E5E7EB', cursor: 'pointer',
        transition: 'all 150ms', fontFamily: 'inherit',
        width: '100%', textAlign: 'left',
        background: 'white',
    },
    primaryBtn: {
        width: '100%', padding: '14px',
        background: '#7C3AED', color: 'white',
        border: 'none', borderRadius: '12px',
        fontSize: '16px', fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit',
        transition: 'background 200ms',
    },
    backBtn: {
        display: 'block', width: '100%', textAlign: 'center',
        padding: '12px', background: 'none', border: 'none',
        color: '#9CA3AF', fontSize: '14px', fontWeight: 600,
        cursor: 'pointer', marginTop: '8px', fontFamily: 'inherit',
    },
    label: {
        display: 'block', fontSize: '13px', fontWeight: 600,
        color: '#374151', marginBottom: '6px',
    },
    input: {
        width: '100%', padding: '12px 14px',
        border: '2px solid #E5E7EB', borderRadius: '10px',
        fontSize: '15px', fontFamily: 'inherit',
        outline: 'none', transition: 'border 150ms',
        boxSizing: 'border-box',
    },
    summaryRow: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 0', borderBottom: '1px solid #F3F4F6',
    },
    summaryLabel: {
        fontSize: '14px', color: '#6B7280',
    },
    summaryValue: {
        fontSize: '14px', fontWeight: 700, color: '#1F2937',
    },
    spinner: {
        width: '32px', height: '32px', border: '3px solid #E5E7EB',
        borderTopColor: '#7C3AED', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        margin: '0 auto',
    },
};
