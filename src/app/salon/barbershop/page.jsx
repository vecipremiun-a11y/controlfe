'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/lib/store';
import {
    Users,
    Clock,
    Zap,
    UserCheck,
    Scissors,
    ShoppingBag,
    Plus,
    DollarSign,
    CreditCard,
    Banknote,
    ArrowLeftRight,
    X,
    ChevronRight,
    Receipt,
    TrendingUp,
    Timer,
    Armchair,
    Trash2,
    Search,
    UserPlus,
    Sparkles,
    Phone,
    Droplets,
    Edit2,
    Power,
    Wallet,
    Check,
    AlertCircle,
    Ban,
    CalendarCheck,
    Landmark,
    Coins,
} from 'lucide-react';

export default function BarbershopDashboard() {
    const { user, addToast, tenantCurrency } = useStore();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [now, setNow] = useState(Date.now());
    const [activeTicket, setActiveTicket] = useState({ items: [], tip: 0, clientName: '', appointmentId: null, professionalId: null });
    const [showProductModal, setShowProductModal] = useState(false);
    const [productSearch, setProductSearch] = useState('');
    const [showServiceModal, setShowServiceModal] = useState(false);
    const [serviceSearch, setServiceSearch] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [checkingOut, setCheckingOut] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [mixedMode, setMixedMode] = useState(false);
    const [mixedAmounts, setMixedAmounts] = useState({ cash: '', card: '', transfer: '' });
    const intervalRef = useRef(null);

    // Check-in modal state
    const [showCheckinModal, setShowCheckinModal] = useState(false);
    const [checkinClientSearch, setCheckinClientSearch] = useState('');
    const [checkinClientName, setCheckinClientName] = useState('');
    const [checkinClientPhone, setCheckinClientPhone] = useState('');
    const [checkinSelectedServices, setCheckinSelectedServices] = useState([]);
    const [checkinSelectedBarber, setCheckinSelectedBarber] = useState('first_available');
    const [checkinSubmitting, setCheckinSubmitting] = useState(false);
    const [checkinStep, setCheckinStep] = useState(1);
    const [checkinClients, setCheckinClients] = useState([]);
    const [checkinSelectedClient, setCheckinSelectedClient] = useState(null);

    // Waitlist edit/remove
    const [editingWaitlistEntry, setEditingWaitlistEntry] = useState(null);
    const [editWaitlistService, setEditWaitlistService] = useState(null);
    const [editWaitlistBarber, setEditWaitlistBarber] = useState(null);

    // Barber Availability & Closing Modal
    const [showClosingModal, setShowClosingModal] = useState(false);
    const [closingData, setClosingData] = useState(null);
    const [loadingClosing, setLoadingClosing] = useState(false);
    const [closingProfId, setClosingProfId] = useState(null);
    const [closingAction, setClosingAction] = useState(null); // 'paid', 'pending', 'partial'
    const [closingPartialAmount, setClosingPartialAmount] = useState('');
    const [closingPayMethod, setClosingPayMethod] = useState('cash');
    const [closingNotes, setClosingNotes] = useState('');
    const [submittingClosing, setSubmittingClosing] = useState(false);

    // Receipt / Boleta state
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [receiptData, setReceiptData] = useState(null);

    // Advance (Adelanto) modal state
    const [showAdvanceModal, setShowAdvanceModal] = useState(false);
    const [advanceProfId, setAdvanceProfId] = useState(null);
    const [advanceAmount, setAdvanceAmount] = useState('');
    const [advanceMethod, setAdvanceMethod] = useState('cash');
    const [advanceNotes, setAdvanceNotes] = useState('');
    const [submittingAdvance, setSubmittingAdvance] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const res = await fetch('/api/salon/barbershop-dashboard', { cache: 'no-store' });
            if (res.ok) {
                const json = await res.json();
                setData(json);
            }
        } catch (e) {
            console.error('Error loading barbershop data:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
        // Refresh data every 30 seconds
        const dataInterval = setInterval(loadData, 30000);
        return () => clearInterval(dataInterval);
    }, [loadData]);

    // Update timer every second
    useEffect(() => {
        intervalRef.current = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(intervalRef.current);
    }, []);

    const fmt = (v) =>
        new Intl.NumberFormat('es', {
            style: 'currency',
            currency: data?.currency || tenantCurrency || 'USD',
            minimumFractionDigits: 0,
        }).format(v);

    const getWaitingTime = (createdAt) => {
        const created = new Date(createdAt + 'Z').getTime();
        const diff = Math.max(0, Math.floor((now - created) / 1000));
        const mins = Math.floor(diff / 60);
        const secs = diff % 60;
        if (mins >= 60) {
            const hrs = Math.floor(mins / 60);
            const remainMins = mins % 60;
            return `${hrs}h ${remainMins}m`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getProgressInfo = (appointment) => {
        if (!appointment) return { percent: 0, elapsedText: '', durationText: '' };
        const [h, m] = appointment.start_time.split(':').map(Number);
        const startDate = new Date();
        startDate.setHours(h, m, 0, 0);
        const startMs = startDate.getTime();
        const durationMin = appointment.duration_min || 30;
        const durationMs = durationMin * 60 * 1000;
        const elapsedMs = Math.max(0, now - startMs);
        const percent = Math.min(100, Math.max(0, Math.round((elapsedMs / durationMs) * 100)));

        const elapsedMin = Math.floor(elapsedMs / 60000);
        return {
            percent,
            elapsedText: `${elapsedMin}m`,
            durationText: `${durationMin}m`
        };
    };

    // Smart auto-assign: pick the best available professional based on assign mode
    const pickBestAvailable = () => {
        if (!data) return null;
        const available = data.professionals.filter(p => p.status === 'available');
        if (available.length === 0) return null;

        const mode = data.assignMode || 'least_busy';

        if (mode === 'round_robin') {
            // Round robin: pick the one who finished longest ago (or never worked today)
            return available.sort((a, b) => {
                const aLast = a.lastServiceAt || '1970-01-01';
                const bLast = b.lastServiceAt || '1970-01-01';
                return aLast.localeCompare(bLast); // earliest last service first
            })[0];
        }

        // Default: least_busy — pick the one with fewest services today
        return available.sort((a, b) => {
            const diff = (a.servicesToday || 0) - (b.servicesToday || 0);
            if (diff !== 0) return diff; // fewer services first
            // Tie-break: longest time since last service
            const aLast = a.lastServiceAt || '1970-01-01';
            const bLast = b.lastServiceAt || '1970-01-01';
            return aLast.localeCompare(bLast);
        })[0];
    };

    const handleAutoAssign = async () => {
        if (!data) return;
        const firstWaiting = data.waitingCustomers[0];
        const bestProfessional = pickBestAvailable();

        if (!firstWaiting) {
            addToast({ type: 'warning', message: 'No hay clientes en espera' });
            return;
        }
        if (!bestProfessional) {
            addToast({ type: 'warning', message: 'No hay barberos disponibles' });
            return;
        }

        try {
            const res = await fetch('/api/salon/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    professional_id: bestProfessional.id,
                    service_id: firstWaiting.service_id,
                    client_name: firstWaiting.client_name,
                    date: new Date().toISOString().split('T')[0],
                    start_time: new Date().toTimeString().slice(0, 5),
                    status: 'en_atencion',
                    source: 'walk_in',
                    notes: firstWaiting.notes || null,
                }),
            });
            if (res.ok) {
                const delRes = await fetch(`/api/salon/waitlist?id=${firstWaiting.id}&reason=booked`, { method: 'DELETE' });
                if (!delRes.ok) {
                    console.error('Failed to delete from waitlist:', await delRes.text());
                }
                addToast({ type: 'success', message: `${firstWaiting.client_name} asignado a ${bestProfessional.name}` });
                loadData();
            } else {
                const err = await res.json();
                addToast({ type: 'error', message: err.error || 'Error al crear cita' });
            }
        } catch (e) {
            console.error(e);
            addToast({ type: 'error', message: 'Error al asignar' });
        }
    };

    const handleAssignNext = async (professionalId) => {
        if (!data) return;
        const firstWaiting = data.waitingCustomers[0];
        const prof = data.professionals.find(p => p.id === professionalId);

        if (!firstWaiting) {
            addToast({ type: 'warning', message: 'No hay clientes en espera' });
            return;
        }

        try {
            const res = await fetch('/api/salon/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    professional_id: professionalId,
                    service_id: firstWaiting.service_id,
                    client_name: firstWaiting.client_name,
                    date: new Date().toISOString().split('T')[0],
                    start_time: new Date().toTimeString().slice(0, 5),
                    status: 'en_atencion',
                    source: 'walk_in',
                    notes: firstWaiting.notes || null,
                }),
            });
            if (res.ok) {
                // Remove from waitlist
                const delRes = await fetch(`/api/salon/waitlist?id=${firstWaiting.id}&reason=booked`, { method: 'DELETE' });
                if (!delRes.ok) {
                    console.error('Failed to delete from waitlist:', await delRes.text());
                }
                addToast({ type: 'success', message: `${firstWaiting.client_name} asignado a ${prof?.name}` });
                loadData();
            } else {
                const err = await res.json();
                addToast({ type: 'error', message: err.error || 'Error al crear cita' });
            }
        } catch (e) {
            console.error(e);
            addToast({ type: 'error', message: 'Error al asignar' });
        }
    };

    const handleToggleAvailability = async (profId, currentIsAvailable) => {
        try {
            const res = await fetch('/api/salon/professionals/availability', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: profId, is_available: !currentIsAvailable })
            });
            if (res.ok) {
                addToast({ type: 'success', message: 'Disponibilidad actualizada' });
                loadData();
            } else {
                addToast({ type: 'error', message: 'Error al cambiar disponibilidad' });
            }
        } catch (e) {
            console.error(e);
            addToast({ type: 'error', message: 'Error de conexión' });
        }
    };

    const handleShowClosing = async (profId) => {
        setLoadingClosing(true);
        setShowClosingModal(true);
        setClosingProfId(profId);
        setClosingAction(null);
        setClosingPartialAmount('');
        setClosingPayMethod('cash');
        setClosingNotes('');
        try {
            const res = await fetch(`/api/salon/reports/barber-closing?professional_id=${profId}`);
            if (res.ok) {
                const json = await res.json();
                // Get prof info for payment model
                const prof = data?.professionals?.find(p => p.id === profId);
                if (prof) {
                    json.payment_mode = prof.payment_mode || 'commission';
                    json.rent_amount = prof.rent_amount || 0;
                    json.rent_frequency = prof.rent_frequency || 'monthly';
                    json.base_salary = prof.base_salary || 0;
                    json.per_service_rate = prof.per_service_rate || 0;
                    json.dayClosed = prof.dayClosed;
                    json.dayClosingStatus = prof.dayClosingStatus;

                    // Calculate amount owed based on model
                    const rev = json.total_revenue || 0;
                    const svcCount = json.total_services || 0;
                    switch (json.payment_mode) {
                        case 'commission':
                            json.amount_owed = rev * ((json.commission_percent || 0) / 100);
                            json.owed_label = 'Comisión al Barbero';
                            break;
                        case 'rent':
                            json.amount_owed = json.rent_frequency === 'daily' ? (json.rent_amount || 0) :
                                json.rent_frequency === 'weekly' ? (json.rent_amount || 0) / 7 :
                                    (json.rent_amount || 0) / 30;
                            json.owed_label = 'Arriendo del Día';
                            break;
                        case 'salary':
                            json.amount_owed = (json.base_salary || 0) / 30;
                            json.owed_label = 'Sueldo Diario';
                            break;
                        case 'mixed':
                            json.amount_owed = ((json.base_salary || 0) / 30) + (rev * ((json.commission_percent || 0) / 100));
                            json.owed_label = 'Sueldo + Comisión';
                            break;
                        case 'per_service':
                            json.amount_owed = (json.per_service_rate || 0) * svcCount;
                            json.owed_label = 'Pago por Servicios';
                            break;
                        default:
                            json.amount_owed = rev * ((json.commission_percent || 0) / 100);
                            json.owed_label = 'Comisión al Barbero';
                    }
                    json.amount_owed = Math.round(json.amount_owed * 100) / 100;
                }
                setClosingData(json);
            } else {
                addToast({ type: 'error', message: 'Error al cargar el reporte' });
                setShowClosingModal(false);
            }
        } catch (e) {
            console.error(e);
            addToast({ type: 'error', message: 'Error de conexión' });
            setShowClosingModal(false);
        } finally {
            setLoadingClosing(false);
        }
    };

    const handleCloseDay = async () => {
        if (!closingData || !closingProfId) return;
        setSubmittingClosing(true);
        try {
            // 1. Create daily closing
            const closeRes = await fetch('/api/salon/daily-closings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    professional_id: closingProfId,
                    date: closingData.date,
                    total_services: closingData.total_services,
                    total_revenue: closingData.total_revenue,
                    revenue_by_method: closingData.revenue_by_method,
                    notes: closingNotes || null,
                }),
            });

            if (!closeRes.ok) {
                const err = await closeRes.json();
                addToast({ type: 'error', message: err.error || 'Error al cerrar día' });
                setSubmittingClosing(false);
                return;
            }

            const closeData = await closeRes.json();

            // 2. If paid or partial, register payment
            if (closingAction === 'paid' || closingAction === 'partial') {
                const payAmount = closingAction === 'paid'
                    ? closingData.amount_owed
                    : parseFloat(closingPartialAmount) || 0;

                if (payAmount > 0) {
                    await fetch('/api/salon/daily-closings/payments', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            closing_id: closeData.id,
                            amount: payAmount,
                            payment_method: closingPayMethod,
                            notes: closingAction === 'partial' ? 'Pago parcial' : 'Pago completo',
                        }),
                    });
                }
            }

            addToast({ type: 'success', message: `Día cerrado para ${closingData.professional_name}` });
            setShowClosingModal(false);
            loadData();
        } catch (e) {
            console.error(e);
            addToast({ type: 'error', message: 'Error al cerrar día' });
        } finally {
            setSubmittingClosing(false);
        }
    };

    // ---- Advance (Adelanto) ----
    const handleOpenAdvance = (profId) => {
        setAdvanceProfId(profId);
        setAdvanceAmount('');
        setAdvanceMethod('cash');
        setAdvanceNotes('');
        setShowAdvanceModal(true);
    };

    const handleSubmitAdvance = async () => {
        const amount = parseFloat(advanceAmount);
        if (!amount || amount <= 0) {
            addToast({ type: 'error', message: 'Monto inválido' });
            return;
        }
        setSubmittingAdvance(true);
        try {
            const res = await fetch('/api/salon/professional-movements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    professional_id: advanceProfId,
                    amount,
                    payment_method: advanceMethod,
                    notes: advanceNotes || null,
                }),
            });
            if (res.ok) {
                const result = await res.json();
                addToast({ type: 'success', message: `Adelanto de ${fmt(amount)} registrado para ${result.professional_name}` });
                setShowAdvanceModal(false);
                loadData();
            } else {
                const err = await res.json();
                addToast({ type: 'error', message: err.error || 'Error al registrar adelanto' });
            }
        } catch (e) {
            console.error(e);
            addToast({ type: 'error', message: 'Error de conexión' });
        } finally {
            setSubmittingAdvance(false);
        }
    };

    const addItemToTicket = (item, type) => {
        setActiveTicket(prev => {
            const existing = prev.items.find(i => i.item_id === item.id && i.type === type);
            if (existing) {
                return {
                    ...prev,
                    items: prev.items.map(i =>
                        i.item_id === item.id && i.type === type
                            ? { ...i, quantity: i.quantity + 1 }
                            : i
                    ),
                };
            }
            return {
                ...prev,
                items: [...prev.items, {
                    item_id: item.id,
                    name: item.name,
                    type,
                    quantity: 1,
                    unit_price: item.price,
                }],
            };
        });
    };

    const handleAddServiceToTicket = (svc) => {
        setActiveTicket(prev => ({
            ...prev,
            items: [...prev.items, {
                item_id: svc.id,
                name: svc.name,
                type: 'service',
                quantity: 1,
                unit_price: svc.price
            }]
        }));
        setShowServiceModal(false);
        setServiceSearch('');
    };

    const removeItemFromTicket = (itemId, type) => {
        setActiveTicket(prev => ({
            ...prev,
            items: prev.items.filter(i => !(i.item_id === itemId && i.type === type)),
        }));
    };

    const ticketSubtotal = activeTicket.items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
    const ticketTotal = ticketSubtotal + (activeTicket.tip || 0);

    const handleCloseSale = async (method = paymentMethod) => {
        if (activeTicket.items.length === 0) {
            addToast({ type: 'warning', message: 'Agrega items al ticket' });
            return;
        }
        setCheckingOut(true);

        // Save ticket info before clearing
        const ticketSnapshot = { ...activeTicket };
        const totalSnapshot = ticketTotal;
        const subtotalSnapshot = ticketSubtotal;

        try {
            const res = await fetch('/api/salon/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: ticketSnapshot.items.map(item => ({
                        ...item,
                        professional_id: item.professional_id || ticketSnapshot.professionalId || null,
                    })),
                    subtotal: subtotalSnapshot,
                    tip: ticketSnapshot.tip || 0,
                    total: totalSnapshot,
                    payment_method: method,
                    client_name: ticketSnapshot.clientName || null,
                }),
            });
            if (res.ok) {
                const saleResult = await res.json();

                // Immediately free the professional in local state (optimistic update)
                if (ticketSnapshot.professionalId) {
                    setData(prev => {
                        if (!prev) return prev;
                        return {
                            ...prev,
                            professionals: prev.professionals.map(p =>
                                p.id === ticketSnapshot.professionalId
                                    ? { ...p, status: 'available', currentAppointment: null, servicesToday: (p.servicesToday || 0) + 1, lastServiceAt: new Date().toISOString() }
                                    : p
                            ),
                        };
                    });
                }

                // Clear ticket immediately so user can start next sale
                setActiveTicket({ items: [], tip: 0, clientName: '', appointmentId: null, professionalId: null });
                setShowPaymentModal(false);
                setMixedMode(false);
                setMixedAmounts({ cash: '', card: '', transfer: '' });
                addToast({ type: 'success', message: '¡Venta cerrada exitosamente!' });

                // Show receipt
                if (saleResult.sale) {
                    setReceiptData(saleResult.sale);
                    setShowReceiptModal(true);
                }

                // Fire appointment update + data refresh in background (don't await)
                if (ticketSnapshot.appointmentId) {
                    fetch(`/api/salon/appointments?id=${ticketSnapshot.appointmentId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'terminado' }),
                    }).catch(() => {});
                }
                loadData();
            } else {
                addToast({ type: 'error', message: 'Error al cerrar venta' });
            }
        } catch (e) {
            addToast({ type: 'error', message: 'Error de conexión' });
        } finally {
            setCheckingOut(false);
        }
    };

    // Load appointment to checkout — each click replaces the current ticket (no merge)
    // The appointment is NOT marked as terminado until the sale is actually closed.
    const loadToCheckout = async (prof) => {
        if (!prof.currentAppointment) return;
        const appt = prof.currentAppointment;

        let items = [{
            item_id: appt.service_id,
            name: appt.service_name,
            type: 'service',
            quantity: 1,
            unit_price: appt.service_price || 0,
            professional_id: prof.id,
        }];

        if (appt.notes) {
            try {
                const parsed = JSON.parse(appt.notes);
                if (parsed.extra_services && Array.isArray(parsed.extra_services)) {
                    const extraItems = parsed.extra_services.map(s => ({
                        item_id: s.id,
                        name: s.name,
                        type: 'service',
                        quantity: 1,
                        unit_price: s.price || 0,
                        professional_id: prof.id,
                    }));
                    items = [...items, ...extraItems];
                }
            } catch (e) {
                // Ignore parse errors if notes is just text
            }
        }

        const clientName = appt.client_name || appt.client_full_name || '';

        // Replace entire ticket — each cobro is independent
        setActiveTicket({
            items,
            tip: 0,
            clientName,
            appointmentId: appt.id,
            professionalId: prof.id,
        });

        addToast({ type: 'info', message: `Ticket de ${clientName || 'Cliente'} listo para cobrar` });
    };

    const getInitials = (name) => {
        if (!name) return '??';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    // ---- Check-in modal logic ----
    const searchClients = useCallback(async (q) => {
        if (q.length < 2) { setCheckinClients([]); return; }
        try {
            const res = await fetch(`/api/salon/clients?search=${encodeURIComponent(q)}`);
            if (res.ok) {
                const json = await res.json();
                setCheckinClients(json.clients || []);
            }
        } catch { setCheckinClients([]); }
    }, []);

    useEffect(() => {
        const t = setTimeout(() => searchClients(checkinClientSearch), 300);
        return () => clearTimeout(t);
    }, [checkinClientSearch, searchClients]);

    const openCheckinModal = () => {
        setCheckinClientSearch('');
        setCheckinClientName('');
        setCheckinClientPhone('');
        setCheckinSelectedServices([]);
        setCheckinSelectedBarber('first_available');
        setCheckinSelectedClient(null);
        setCheckinClients([]);
        setCheckinStep(1);
        setShowCheckinModal(true);
    };

    const canAdvanceStep = (step) => {
        if (step === 1) return !!(checkinSelectedClient || checkinClientName || checkinClientSearch.trim());
        if (step === 2) return checkinSelectedServices.length > 0;
        return true;
    };

    const handleCheckinSubmit = async () => {
        const clientName = checkinSelectedClient?.name || checkinClientName || checkinClientSearch;
        if (!clientName.trim()) {
            addToast({ type: 'warning', message: 'Ingresa el nombre del cliente' });
            return;
        }
        if (checkinSelectedServices.length === 0) {
            addToast({ type: 'warning', message: 'Selecciona al menos un servicio' });
            return;
        }

        setCheckinSubmitting(true);
        try {
            const primaryService = checkinSelectedServices[0];
            const extraServices = checkinSelectedServices.slice(1);
            const notesObj = extraServices.length > 0 ? JSON.stringify({ extra_services: extraServices }) : null;

            const isFirstAvailable = checkinSelectedBarber === 'first_available';
            let assignDirectly = false;
            let profStatus = 'available';

            if (!isFirstAvailable && data?.professionals) {
                const prof = data.professionals.find(p => p.id === checkinSelectedBarber);
                if (prof) {
                    assignDirectly = true;
                    profStatus = prof.status; // 'available', 'busy', 'busy_with_queue'
                }
            }

            if (assignDirectly) {
                // Create appointment directly
                const status = profStatus === 'available' ? 'en_atencion' : 'reservado';
                const timeStr = new Date().toTimeString().slice(0, 5);
                const dateStr = new Date().toISOString().split('T')[0];

                const totalDuration = checkinSelectedServices.reduce((sum, s) => sum + (s.duration_min || 0), 0);

                const res = await fetch('/api/salon/appointments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        client_name: clientName,
                        client_phone: checkinSelectedClient?.phone || checkinClientPhone || null,
                        client_id: checkinSelectedClient?.id || null,
                        service_id: primaryService.id,
                        professional_id: checkinSelectedBarber,
                        date: dateStr,
                        start_time: timeStr,
                        end_time: null, // Let backend calculate or we can send it
                        status: status,
                        source: 'manual',
                        notes: notesObj
                    }),
                });

                if (res.ok) {
                    const statusText = status === 'en_atencion' ? 'asignado' : 'en fila';
                    addToast({ type: 'success', message: `${clientName} ${statusText} exitosamente` });
                    setShowCheckinModal(false);
                    loadData();
                } else {
                    const err = await res.json();
                    addToast({ type: 'error', message: err.error || 'Error al asignar' });
                }
            } else {
                // Add to general waitlist
                const res = await fetch('/api/salon/waitlist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        client_name: clientName,
                        client_phone: checkinSelectedClient?.phone || checkinClientPhone || null,
                        client_id: checkinSelectedClient?.id || null,
                        service_id: primaryService.id,
                        professional_id: null,
                        notes: notesObj
                    }),
                });
                if (res.ok) {
                    addToast({ type: 'success', message: `${clientName} agregado a la lista de espera` });
                    setShowCheckinModal(false);
                    loadData();
                } else {
                    addToast({ type: 'error', message: 'Error al agregar a la lista' });
                }
            }
        } catch (e) {
            console.error(e);
            addToast({ type: 'error', message: 'Error de conexión' });
        } finally {
            setCheckinSubmitting(false);
        }
    };

    const SERVICE_ICONS = {
        'Corte': Scissors,
        'Barba': Sparkles,
        'Afeit': Sparkles,
        'Perfil': Sparkles,
        'Trata': Droplets,
        'Kerat': Droplets,
        'Combo': Plus,
        'Lavado': Droplets,
    };

    const getServiceIcon = (name) => {
        for (const [key, Icon] of Object.entries(SERVICE_ICONS)) {
            if (name?.toLowerCase().includes(key.toLowerCase())) return Icon;
        }
        return Scissors;
    };

    if (loading) {
        return (
            <div className="barbershop">
                <div className="barbershop__loading">
                    <div className="spinner spinner--lg" />
                    <p>Cargando dashboard...</p>
                </div>
            </div>
        );
    }

    const filteredProducts = (data?.products || []).filter(p =>
        p.name.toLowerCase().includes(productSearch.toLowerCase())
    );

    return (
        <div className="barbershop">
            {/* Header */}
            <div className="barbershop__header">
                <div className="barbershop__header-left">
                    <Scissors className="barbershop__header-icon" size={24} />
                    <h1 className="barbershop__title">Barbershop Live</h1>
                    <span className="barbershop__live-badge">
                        <span className="barbershop__live-dot" />
                        LIVE
                    </span>
                </div>
                <div className="barbershop__header-right">
                    <button className="barbershop__checkin-trigger" onClick={openCheckinModal}>
                        <UserPlus size={18} />
                        Registro rápido
                    </button>
                    <div className="barbershop__clock">
                        {new Date(now).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            </div>

            {/* 3-Column Grid */}
            <div className="barbershop__grid">
                {/* ======== COLUMN 1: WAITING LOBBY ======== */}
                <div className="barbershop__column" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div className="barbershop__column-header">
                        <div className="barbershop__column-title">
                            <Users size={18} />
                            <span>Sala de Espera</span>
                        </div>
                        <span className="barbershop__counter">{data?.waitingCustomers?.length || 0}</span>
                    </div>

                    <button
                        className="barbershop__auto-assign-btn"
                        onClick={handleAutoAssign}
                        disabled={!data?.waitingCustomers?.length || !data?.professionals?.some(p => p.status === 'available')}
                    >
                        <Zap size={18} />
                        Auto-Asignar
                    </button>

                    <div className="barbershop__waiting-list">
                        {(!data?.waitingCustomers || data.waitingCustomers.length === 0) ? (
                            <div className="barbershop__empty">
                                <Armchair size={32} />
                                <p>Sin clientes en espera</p>
                            </div>
                        ) : (
                            data.waitingCustomers.map((customer) => (
                                <div key={customer.id} className="barbershop__waiting-card">
                                    <div className="barbershop__waiting-card-top">
                                        <div className="barbershop__waiting-avatar">
                                            {getInitials(customer.client_name)}
                                        </div>
                                        <div className="barbershop__waiting-info">
                                            <div className="barbershop__waiting-name">{customer.client_name}</div>
                                            <div className="barbershop__waiting-service">
                                                <Scissors size={12} />
                                                {customer.service_name || 'Sin servicio'}
                                            </div>
                                        </div>
                                        <div className="barbershop__waiting-actions">
                                            <button
                                                className="barbershop__waiting-action-btn"
                                                title="Editar"
                                                onClick={() => {
                                                    setEditingWaitlistEntry(customer);
                                                    setEditWaitlistService(customer.service_id);
                                                    setEditWaitlistBarber(customer.professional_id || 'first_available');
                                                }}
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                className="barbershop__waiting-action-btn barbershop__waiting-action-btn--danger"
                                                title="Remover"
                                                onClick={async () => {
                                                    if (!confirm(`¿Remover a ${customer.client_name} de la lista?`)) return;
                                                    try {
                                                        const res = await fetch(`/api/salon/waitlist?id=${customer.id}&reason=expired`, { method: 'DELETE' });
                                                        addToast({ type: 'info', message: `${customer.client_name} removido de la lista` });
                                                        loadData();
                                                    } catch {
                                                        addToast({ type: 'error', message: 'Error al remover' });
                                                    }
                                                }}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="barbershop__waiting-timer">
                                        <Timer size={14} />
                                        <span>{getWaitingTime(customer.created_at)}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* ======== COLUMN 2: WORKSTATIONS ======== */}
                <div className="barbershop__column barbershop__column--center">
                    <div className="barbershop__column-header">
                        <div className="barbershop__column-title">
                            <Armchair size={18} />
                            <span>Estaciones de Trabajo</span>
                        </div>
                        <span className="barbershop__counter">{data?.professionals?.length || 0}</span>
                    </div>

                    <div className="barbershop__stations-grid">
                        {(!data?.professionals || data.professionals.length === 0) ? (
                            <div className="barbershop__empty">
                                <UserCheck size={32} />
                                <p>Sin profesionales registrados</p>
                            </div>
                        ) : (
                            data.professionals.map((prof) => {
                                const progressInfo = getProgressInfo(prof.currentAppointment);
                                return (
                                    <div
                                        key={prof.id}
                                        className={`barbershop__station-card barbershop__station-card--${prof.status}`}
                                    >
                                        <div className="barbershop__station-header">
                                            <div
                                                className="barbershop__station-avatar"
                                                style={{ borderColor: prof.color || '#6C5CE7' }}
                                            >
                                                {prof.avatar_url ? (
                                                    <img src={prof.avatar_url} alt={prof.name} />
                                                ) : (
                                                    getInitials(prof.name)
                                                )}
                                            </div>
                                            <div className="barbershop__station-info">
                                                <div className="barbershop__station-name">{prof.name}</div>
                                                <div className={`barbershop__station-status barbershop__station-status--${prof.status}`}>
                                                    {prof.status === 'available' ? '● Disponible' :
                                                        prof.status === 'busy' ? '● Ocupado' :
                                                            prof.status === 'unavailable' ? '● No Disponible' :
                                                                '● Ocupado + Cola'}
                                                </div>
                                            </div>
                                            <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                {(prof.running_balance || 0) > 0 && (
                                                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: (prof.payment_mode === 'rent') ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)', color: (prof.payment_mode === 'rent') ? '#DC2626' : '#2563EB', whiteSpace: 'nowrap' }}>
                                                        {(prof.payment_mode === 'rent') ? 'Debe ' : ''}{fmt(prof.running_balance)}
                                                    </span>
                                                )}
                                                {prof.dayClosed && (
                                                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: prof.dayClosingStatus === 'paid' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: prof.dayClosingStatus === 'paid' ? '#059669' : '#D97706' }}>
                                                        {prof.dayClosingStatus === 'paid' ? '✓ Pagado' : prof.dayClosingStatus === 'partial' ? '◐ Parcial' : '⏳ Debe'}
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => handleOpenAdvance(prof.id)}
                                                    className="btn btn--icon btn--ghost p-1"
                                                    title="Adelanto"
                                                    style={{ color: '#D97706', padding: '6px', borderRadius: '6px', background: 'rgba(245,158,11,0.1)' }}
                                                >
                                                    <Banknote size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleShowClosing(prof.id)}
                                                    className="btn btn--icon btn--ghost p-1"
                                                    title="Corte del Día"
                                                    style={{ color: prof.dayClosed ? '#059669' : 'var(--accent-green)', padding: '6px', borderRadius: '6px', background: prof.dayClosed ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.1)' }}
                                                >
                                                    <Wallet size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleToggleAvailability(prof.id, !!prof.is_available)}
                                                    className={`btn btn--icon btn--ghost p-1`}
                                                    title={prof.is_available ? 'Desactivar' : 'Activar'}
                                                    style={{ color: prof.is_available ? 'var(--text-secondary)' : 'var(--accent-red)', padding: '6px', borderRadius: '6px', background: prof.is_available ? 'rgba(139,92,246,0.04)' : 'rgba(239,68,68,0.1)' }}
                                                >
                                                    <Power size={16} />
                                                </button>
                                            </div>
                                        </div>

                                        {prof.status === 'unavailable' ? (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '20px 14px', color: '#9CA3AF', fontSize: '14px', fontWeight: 500 }}>
                                                <Power size={16} />
                                                <span>No disponible</span>
                                            </div>
                                        ) : prof.status === 'available' ? (
                                            <button
                                                className="barbershop__assign-btn"
                                                onClick={() => handleAssignNext(prof.id)}
                                                disabled={!data?.waitingCustomers?.length}
                                            >
                                                <UserCheck size={18} />
                                                Asignar Siguiente
                                            </button>
                                        ) : (
                                            <>
                                                <div className="barbershop__station-client">
                                                    <span className="barbershop__station-client-label">Cliente:</span>
                                                    <span className="barbershop__station-client-name">
                                                        {prof.currentAppointment?.client_name || prof.currentAppointment?.client_full_name || 'N/A'}
                                                    </span>
                                                </div>
                                                <div className="barbershop__station-service-name">
                                                    {prof.currentAppointment?.service_name || 'Servicio'}
                                                </div>
                                                <div className="barbershop__progress-bar">
                                                    <div
                                                        className="barbershop__progress-fill"
                                                        style={{ width: `${progressInfo.percent}%` }}
                                                    />
                                                </div>
                                                <div className="barbershop__progress-label-container" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#9CA3AF', marginTop: '4px' }}>
                                                    <span className="barbershop__progress-time">{progressInfo.elapsedText} / {progressInfo.durationText}</span>
                                                    <span className="barbershop__progress-percent" style={{ color: '#3B82F6', fontWeight: 'bold' }}>{progressInfo.percent}%</span>
                                                </div>

                                                {prof.status === 'busy_with_queue' && prof.queue?.[0] && (
                                                    <div className="barbershop__next-in-line">
                                                        <ChevronRight size={14} />
                                                        Siguiente: {prof.queue[0].client_name}
                                                    </div>
                                                )}

                                                <button
                                                    className="barbershop__checkout-btn"
                                                    onClick={() => loadToCheckout(prof)}
                                                >
                                                    <Receipt size={14} />
                                                    Enviar a Cobro
                                                </button>
                                            </>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* ======== COLUMN 3: CHECKOUT / SALES ======== */}
                <div className="barbershop__column">
                    <div className="barbershop__column-header">
                        <div className="barbershop__column-title">
                            <Receipt size={18} />
                            <span>Cobro / Ventas</span>
                        </div>
                    </div>

                    {/* Active Ticket */}
                    <div className="barbershop__ticket" style={{ flex: 1, overflow: 'auto' }}>
                        <div className="barbershop__ticket-header">
                            <span>Ticket Activo</span>
                            {activeTicket.clientName && (
                                <span className="barbershop__ticket-client">{activeTicket.clientName}</span>
                            )}
                        </div>

                        {activeTicket.items.length === 0 ? (
                            <div className="barbershop__ticket-empty">
                                <ShoppingBag size={28} />
                                <p>Sin items en el ticket</p>
                                <p className="barbershop__ticket-hint">Envía un cliente a cobro o agrega items manualmente</p>
                            </div>
                        ) : (
                            <div className="barbershop__ticket-items">
                                {activeTicket.items.map((item, i) => (
                                    <div key={i} className="barbershop__ticket-item">
                                        <div className="barbershop__ticket-item-info">
                                            <span className={`barbershop__ticket-item-type barbershop__ticket-item-type--${item.type}`}>
                                                {item.type === 'service' ? <Scissors size={12} /> : <ShoppingBag size={12} />}
                                            </span>
                                            <div>
                                                <div className="barbershop__ticket-item-name">{item.name}</div>
                                                <div className="barbershop__ticket-item-qty">x{item.quantity}</div>
                                            </div>
                                        </div>
                                        <div className="barbershop__ticket-item-right">
                                            <span className="barbershop__ticket-item-price">{fmt(item.unit_price * item.quantity)}</span>
                                            <button
                                                className="barbershop__ticket-item-remove"
                                                onClick={() => removeItemFromTicket(item.item_id, item.type)}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Tip section */}
                        {activeTicket.items.length > 0 && (
                            <div className="barbershop__tip-section">
                                <label>Propina:</label>
                                <input
                                    type="number"
                                    className="barbershop__tip-input"
                                    value={activeTicket.tip || ''}
                                    onChange={(e) => setActiveTicket(prev => ({ ...prev, tip: parseFloat(e.target.value) || 0 }))}
                                    placeholder="0"
                                    min="0"
                                />
                            </div>
                        )}

                        {/* Add Buttons */}
                        <div className="barbershop__add-buttons">
                            <button
                                className="barbershop__add-product-btn"
                                onClick={() => setShowServiceModal(true)}
                            >
                                <Plus size={16} />
                                Agregar Servicio
                            </button>
                            <button
                                className="barbershop__add-product-btn"
                                onClick={() => setShowProductModal(true)}
                            >
                                <Plus size={16} />
                                Agregar Producto
                            </button>
                        </div>

                        {/* Totals, payment and close button moved to sticky footer below */}
                    </div>

                    {/* Sticky footer: Totals, payment and close button */}
                    {activeTicket.items.length > 0 && (
                        <div style={{ position: 'sticky', bottom: 0, background: 'white', zIndex: 30, padding: '16px', borderTop: '1px solid var(--border-color)', boxShadow: '0 -6px 24px rgba(99,102,241,0.06)' }}>
                            <div className="barbershop__ticket-totals">
                                <div className="barbershop__ticket-total-row">
                                    <span>Subtotal</span>
                                    <span>{fmt(ticketSubtotal)}</span>
                                </div>
                                {activeTicket.tip > 0 && (
                                    <div className="barbershop__ticket-total-row">
                                        <span>Propina</span>
                                        <span>{fmt(activeTicket.tip)}</span>
                                    </div>
                                )}
                                <div className="barbershop__ticket-total-row barbershop__ticket-total-row--grand">
                                    <span>TOTAL</span>
                                    <span>{fmt(ticketTotal)}</span>
                                </div>
                            </div>

                            <div style={{ marginTop: '12px' }}>
                                <button className="barbershop__close-sale-btn" onClick={() => { setMixedMode(false); setMixedAmounts({ cash: '', card: '', transfer: '' }); setShowPaymentModal(true); }} disabled={checkingOut}>
                                    <DollarSign size={20} />
                                    {checkingOut ? 'Procesando...' : `Cobrar — ${fmt(ticketTotal)}`}
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </div>

            {/* Payment Method Modal */}
            {showPaymentModal && (
                <div className="pay-modal__overlay" onClick={() => !checkingOut && setShowPaymentModal(false)}>
                    <div className="pay-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="pay-modal__header">
                            <h3>Seleccionar método de pago</h3>
                            <button onClick={() => !checkingOut && setShowPaymentModal(false)} disabled={checkingOut}>
                                <X size={20} />
                            </button>
                        </div>

                        <p className="pay-modal__subtitle">
                            Elige cómo quieres procesar el pago por <strong>{fmt(ticketTotal)}</strong>
                        </p>

                        {!mixedMode ? (
                            <div className="pay-modal__grid">
                                {[
                                    { key: 'cash', icon: Banknote, label: 'Efectivo', desc: 'Pago en efectivo', color: '#22C55E' },
                                    { key: 'card', icon: CreditCard, label: 'Tarjeta', desc: 'Débito o crédito', color: '#3B82F6' },
                                    { key: 'transfer', icon: Landmark, label: 'Transferencia', desc: 'Transferencia bancaria', color: '#A855F7' },
                                    { key: 'mixed', icon: Coins, label: 'Pago Mixto', desc: 'Combinar métodos', color: '#EC4899' },
                                ].map(pm => (
                                    <button
                                        key={pm.key}
                                        className="pay-modal__option"
                                        disabled={checkingOut}
                                        onClick={() => {
                                            if (pm.key === 'mixed') { setMixedMode(true); return; }
                                            setPaymentMethod(pm.key);
                                            handleCloseSale(pm.key);
                                        }}
                                    >
                                        <span className="pay-modal__option-icon" style={{ color: pm.color, background: `${pm.color}1A` }}>
                                            <pm.icon size={26} />
                                        </span>
                                        <span className="pay-modal__option-label">{pm.label}</span>
                                        <span className="pay-modal__option-desc">{pm.desc}</span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="pay-modal__mixed">
                                {[
                                    { key: 'cash', icon: Banknote, label: 'Efectivo', color: '#22C55E' },
                                    { key: 'card', icon: CreditCard, label: 'Tarjeta', color: '#3B82F6' },
                                    { key: 'transfer', icon: Landmark, label: 'Transferencia', color: '#A855F7' },
                                ].map(pm => (
                                    <div key={pm.key} className="pay-modal__mixed-row">
                                        <span className="pay-modal__mixed-icon" style={{ color: pm.color, background: `${pm.color}1A` }}>
                                            <pm.icon size={18} />
                                        </span>
                                        <span className="pay-modal__mixed-label">{pm.label}</span>
                                        <input
                                            type="number"
                                            min="0"
                                            placeholder="0"
                                            value={mixedAmounts[pm.key]}
                                            onChange={(e) => setMixedAmounts(prev => ({ ...prev, [pm.key]: e.target.value }))}
                                        />
                                    </div>
                                ))}

                                {(() => {
                                    const sum = ['cash', 'card', 'transfer'].reduce((a, k) => a + (parseFloat(mixedAmounts[k]) || 0), 0);
                                    const diff = ticketTotal - sum;
                                    const ok = Math.abs(diff) < 0.01;
                                    return (
                                        <>
                                            <div className={`pay-modal__mixed-balance ${ok ? 'pay-modal__mixed-balance--ok' : ''}`}>
                                                <span>{ok ? 'Cuadra con el total' : diff > 0 ? 'Falta por asignar' : 'Excede el total'}</span>
                                                <strong>{fmt(Math.abs(diff))}</strong>
                                            </div>
                                            <div className="pay-modal__mixed-actions">
                                                <button className="pay-modal__back-btn" onClick={() => setMixedMode(false)} disabled={checkingOut}>
                                                    Volver
                                                </button>
                                                <button
                                                    className="pay-modal__confirm-btn"
                                                    disabled={!ok || checkingOut}
                                                    onClick={() => { setPaymentMethod('mixed'); handleCloseSale('mixed'); }}
                                                >
                                                    {checkingOut ? 'Procesando...' : `Cobrar ${fmt(ticketTotal)}`}
                                                </button>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Product Modal */}
            {showProductModal && (
                <div className="barbershop__modal-overlay" onClick={() => setShowProductModal(false)}>
                    <div className="barbershop__modal" onClick={(e) => e.stopPropagation()}>
                        <div className="barbershop__modal-header">
                            <h3>Agregar al Ticket</h3>
                            <button onClick={() => setShowProductModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="barbershop__modal-search">
                            <Search size={16} />
                            <input
                                type="text"
                                placeholder="Buscar productos o servicios..."
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                autoFocus
                            />
                        </div>

                        {/* Services */}
                        {data?.services?.filter(s => s.name.toLowerCase().includes(productSearch.toLowerCase())).length > 0 && (
                            <div className="barbershop__modal-section">
                                <div className="barbershop__modal-section-title">Servicios</div>
                                {data.services
                                    .filter(s => s.name.toLowerCase().includes(productSearch.toLowerCase()))
                                    .map(svc => (
                                        <button
                                            key={svc.id}
                                            className="barbershop__modal-item"
                                            onClick={() => {
                                                addItemToTicket(svc, 'service');
                                                setShowProductModal(false);
                                                setProductSearch('');
                                            }}
                                        >
                                            <Scissors size={14} />
                                            <span className="barbershop__modal-item-name">{svc.name}</span>
                                            <span className="barbershop__modal-item-price">{fmt(svc.price)}</span>
                                        </button>
                                    ))}
                            </div>
                        )}

                        {/* Products */}
                        {filteredProducts.length > 0 && (
                            <div className="barbershop__modal-section">
                                <div className="barbershop__modal-section-title">Productos</div>
                                {filteredProducts.map(prod => (
                                    <button
                                        key={prod.id}
                                        className="barbershop__modal-item"
                                        onClick={() => {
                                            addItemToTicket(prod, 'product');
                                            setShowProductModal(false);
                                            setProductSearch('');
                                        }}
                                    >
                                        <ShoppingBag size={14} />
                                        <span className="barbershop__modal-item-name">{prod.name}</span>
                                        <span className="barbershop__modal-item-stock">({prod.stock})</span>
                                        <span className="barbershop__modal-item-price">{fmt(prod.price)}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {filteredProducts.length === 0 && (!data?.services || data.services.filter(s => s.name.toLowerCase().includes(productSearch.toLowerCase())).length === 0) && (
                            <div className="barbershop__modal-empty">
                                <p>No se encontraron resultados</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ======== QUICK CHECK-IN MODAL (Wizard) ======== */}
            {showCheckinModal && (
                <div className="barbershop__modal-overlay" onClick={() => setShowCheckinModal(false)}>
                    <div className="checkin-modal" onClick={(e) => e.stopPropagation()}>
                        {/* Header with progress */}
                        <div className="checkin-modal__header">
                            <div>
                                <h2 className="checkin-modal__title">Registro rápido</h2>
                                <p className="checkin-modal__subtitle">
                                    {checkinStep === 1 && 'Paso 1 de 3 — ¿Quién es el cliente?'}
                                    {checkinStep === 2 && 'Paso 2 de 3 — ¿Qué servicio necesita?'}
                                    {checkinStep === 3 && 'Paso 3 de 3 — ¿Quién lo atiende?'}
                                </p>
                            </div>
                            <button className="checkin-modal__close" onClick={() => setShowCheckinModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Step progress dots */}
                        <div className="checkin-wizard__progress">
                            {[1, 2, 3].map(s => (
                                <div key={s} className={`checkin-wizard__dot ${checkinStep === s ? 'checkin-wizard__dot--active' : ''} ${checkinStep > s ? 'checkin-wizard__dot--done' : ''}`}>
                                    {checkinStep > s ? '✓' : s}
                                </div>
                            ))}
                            <div className="checkin-wizard__line">
                                <div className="checkin-wizard__line-fill" style={{ width: `${((checkinStep - 1) / 2) * 100}%` }} />
                            </div>
                        </div>

                        <div className="checkin-modal__body">

                            {/* ═══════ STEP 1: CLIENTE ═══════ */}
                            {checkinStep === 1 && (
                                <div className="checkin-wizard__step">
                                    <div className="checkin-wizard__step-icon">
                                        <Users size={28} />
                                    </div>
                                    <h3 className="checkin-wizard__step-title">¿Quién es el cliente?</h3>
                                    <p className="checkin-wizard__step-desc">Busca un cliente existente o escribe un nombre nuevo</p>

                                    <div className="checkin-modal__search">
                                        <Search size={16} />
                                        <input
                                            type="text"
                                            placeholder="Nombre o teléfono..."
                                            value={checkinClientSearch}
                                            onChange={(e) => {
                                                setCheckinClientSearch(e.target.value);
                                                setCheckinSelectedClient(null);
                                            }}
                                            autoFocus
                                        />
                                    </div>

                                    {/* Search Results */}
                                    {checkinClients.length > 0 && !checkinSelectedClient && (
                                        <div className="checkin-modal__client-results">
                                            {checkinClients.slice(0, 5).map(c => (
                                                <button
                                                    key={c.id}
                                                    className="checkin-modal__client-result"
                                                    onClick={() => {
                                                        setCheckinSelectedClient(c);
                                                        setCheckinClientSearch(c.name);
                                                        setCheckinClients([]);
                                                    }}
                                                >
                                                    <div className="checkin-modal__client-avatar">{getInitials(c.name)}</div>
                                                    <div>
                                                        <div className="checkin-modal__client-name">{c.name}</div>
                                                        {c.phone && <div className="checkin-modal__client-phone">{c.phone}</div>}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Selected client */}
                                    {checkinSelectedClient && (
                                        <div className="checkin-modal__selected-client">
                                            <UserCheck size={14} />
                                            <span>{checkinSelectedClient.name}</span>
                                            {checkinSelectedClient.phone && <span className="checkin-modal__client-phone-tag">{checkinSelectedClient.phone}</span>}
                                            <button onClick={() => { setCheckinSelectedClient(null); setCheckinClientSearch(''); }}>
                                                <X size={12} />
                                            </button>
                                        </div>
                                    )}

                                    {/* New Client fields */}
                                    {!checkinSelectedClient && checkinClientSearch.length >= 2 && checkinClients.length === 0 && (
                                        <div className="checkin-modal__new-client">
                                            <div className="checkin-modal__new-client-badge">
                                                <UserPlus size={14} />
                                                Nuevo Cliente
                                            </div>
                                            <div className="checkin-modal__new-client-fields">
                                                <input
                                                    type="text"
                                                    placeholder="Nombre completo"
                                                    className="checkin-modal__input"
                                                    value={checkinClientName || checkinClientSearch}
                                                    onChange={(e) => setCheckinClientName(e.target.value)}
                                                />
                                                <div className="checkin-modal__input-with-icon">
                                                    <Phone size={14} />
                                                    <input
                                                        type="tel"
                                                        placeholder="Celular (opcional)"
                                                        className="checkin-modal__input"
                                                        value={checkinClientPhone}
                                                        onChange={(e) => setCheckinClientPhone(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ═══════ STEP 2: SERVICIO ═══════ */}
                            {checkinStep === 2 && (
                                <div className="checkin-wizard__step">
                                    <div className="checkin-wizard__step-icon">
                                        <Scissors size={28} />
                                    </div>
                                    <h3 className="checkin-wizard__step-title">¿Qué servicio necesita?</h3>
                                    <p className="checkin-wizard__step-desc">Selecciona el servicio que se le realizará a {checkinSelectedClient?.name || checkinClientName || checkinClientSearch}</p>

                                    <div className="checkin-modal__services-grid">
                                        {(data?.services || []).map(svc => {
                                            const SvcIcon = getServiceIcon(svc.name);
                                            const isSelected = checkinSelectedServices.some(s => s.id === svc.id);
                                            return (
                                                <button
                                                    key={svc.id}
                                                    className={`checkin-modal__service-btn ${isSelected ? 'checkin-modal__service-btn--active' : ''}`}
                                                    onClick={() => setCheckinSelectedServices(prev =>
                                                        prev.some(s => s.id === svc.id) ? prev.filter(s => s.id !== svc.id) : [...prev, svc]
                                                    )}
                                                >
                                                    <SvcIcon size={22} />
                                                    <span className="checkin-modal__service-name">
                                                        {svc.name}
                                                        {svc.is_combo === 1 && <span style={{ fontSize: '9px', background: 'var(--accent-green)', color: '#000', padding: '2px 4px', borderRadius: '4px', marginLeft: '6px', fontWeight: 'bold', verticalAlign: 'middle' }}>COMBO</span>}
                                                    </span>
                                                    <span className="checkin-modal__service-price">{fmt(svc.price)}</span>
                                                    <span className="checkin-modal__service-duration">{svc.duration_min} min</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ═══════ STEP 3: PROFESIONAL ═══════ */}
                            {checkinStep === 3 && (
                                <div className="checkin-wizard__step">
                                    <div className="checkin-wizard__step-icon">
                                        <UserCheck size={28} />
                                    </div>
                                    <h3 className="checkin-wizard__step-title">¿Quién lo atiende?</h3>
                                    <p className="checkin-wizard__step-desc">
                                        {checkinSelectedServices.map(s => s.name).join(' + ')} para {checkinSelectedClient?.name || checkinClientName || checkinClientSearch}
                                    </p>

                                    <div className="checkin-modal__barber-row">
                                        <button
                                            className={`checkin-modal__barber-btn ${checkinSelectedBarber === 'first_available' ? 'checkin-modal__barber-btn--active' : ''}`}
                                            onClick={() => setCheckinSelectedBarber('first_available')}
                                        >
                                            <div className="checkin-modal__barber-avatar checkin-modal__barber-avatar--auto">
                                                <Zap size={18} />
                                            </div>
                                            <span className="checkin-modal__barber-name">Primero Disponible</span>
                                            <span className="checkin-modal__barber-status checkin-modal__barber-status--auto">Automático</span>
                                        </button>
                                        {(data?.professionals || []).filter(p => p.is_available !== 0).map(prof => (
                                            <button
                                                key={prof.id}
                                                className={`checkin-modal__barber-btn ${checkinSelectedBarber === prof.id ? 'checkin-modal__barber-btn--active' : ''}`}
                                                onClick={() => setCheckinSelectedBarber(prof.id)}
                                            >
                                                <div
                                                    className="checkin-modal__barber-avatar"
                                                    style={{ borderColor: prof.color || '#6C5CE7' }}
                                                >
                                                    {getInitials(prof.name)}
                                                </div>
                                                <span className="checkin-modal__barber-name">{prof.name}</span>
                                                <span className={`checkin-modal__barber-status checkin-modal__barber-status--${prof.status}`}>
                                                    {prof.status === 'available' ? '● Libre' : prof.status === 'busy' ? '● Ocupado' : '● En cola'}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                        </div>

                        {/* Footer navigation */}
                        <div className="checkin-modal__footer">
                            <div className="checkin-wizard__nav">
                                {checkinStep > 1 && (
                                    <button
                                        className="checkin-wizard__nav-back"
                                        onClick={() => setCheckinStep(s => s - 1)}
                                    >
                                        ← Atrás
                                    </button>
                                )}
                                <div className="checkin-wizard__nav-spacer" />
                                {checkinStep < 3 ? (
                                    <button
                                        className="checkin-wizard__nav-next"
                                        onClick={() => setCheckinStep(s => s + 1)}
                                        disabled={!canAdvanceStep(checkinStep)}
                                    >
                                        Siguiente →
                                    </button>
                                ) : (
                                    <button
                                        className="checkin-modal__submit"
                                        onClick={handleCheckinSubmit}
                                        disabled={checkinSubmitting}
                                    >
                                        <UserPlus size={20} />
                                        {checkinSubmitting ? 'Agregando...' : 'Agregar a Lista de Espera'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ======== EDIT WAITLIST MODAL ======== */}
            {editingWaitlistEntry && (
                <div className="barbershop__modal-overlay" onClick={() => setEditingWaitlistEntry(null)}>
                    <div className="checkin-modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="checkin-modal__header">
                            <div>
                                <h2 className="checkin-modal__title">Editar Espera</h2>
                                <p className="checkin-modal__subtitle">{editingWaitlistEntry.client_name}</p>
                            </div>
                            <button className="checkin-modal__close" onClick={() => setEditingWaitlistEntry(null)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="checkin-modal__body">
                            {/* Service selection */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#6B7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Servicio</label>
                                <div className="checkin-modal__services-grid">
                                    {(data?.services || []).map(svc => {
                                        const SvcIcon = getServiceIcon(svc.name);
                                        const isSelected = editWaitlistService === svc.id;
                                        return (
                                            <button
                                                key={svc.id}
                                                className={`checkin-modal__service-btn ${isSelected ? 'checkin-modal__service-btn--active' : ''}`}
                                                onClick={() => setEditWaitlistService(svc.id)}
                                            >
                                                <SvcIcon size={22} />
                                                <span className="checkin-modal__service-name">
                                                    {svc.name}
                                                    {svc.is_combo === 1 && <span style={{ fontSize: '9px', background: 'var(--accent-green)', color: '#000', padding: '2px 4px', borderRadius: '4px', marginLeft: '6px', fontWeight: 'bold', verticalAlign: 'middle' }}>COMBO</span>}
                                                </span>
                                                <span className="checkin-modal__service-price">{fmt(svc.price)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Barber selection */}
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#6B7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Barbero</label>
                                <div className="checkin-modal__barber-row">
                                    <button
                                        className={`checkin-modal__barber-btn ${editWaitlistBarber === 'first_available' ? 'checkin-modal__barber-btn--active' : ''}`}
                                        onClick={() => setEditWaitlistBarber('first_available')}
                                    >
                                        <div className="checkin-modal__barber-avatar checkin-modal__barber-avatar--auto">
                                            <Zap size={18} />
                                        </div>
                                        <span className="checkin-modal__barber-name">Auto</span>
                                    </button>
                                    {(data?.professionals || []).filter(p => p.is_available !== 0).map(prof => (
                                        <button
                                            key={prof.id}
                                            className={`checkin-modal__barber-btn ${editWaitlistBarber === prof.id ? 'checkin-modal__barber-btn--active' : ''}`}
                                            onClick={() => setEditWaitlistBarber(prof.id)}
                                        >
                                            <div className="checkin-modal__barber-avatar" style={{ borderColor: prof.color || '#6C5CE7' }}>
                                                {getInitials(prof.name)}
                                            </div>
                                            <span className="checkin-modal__barber-name">{prof.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="checkin-modal__footer">
                            <div className="checkin-wizard__nav">
                                <button
                                    className="checkin-wizard__nav-back"
                                    onClick={() => setEditingWaitlistEntry(null)}
                                >
                                    Cancelar
                                </button>
                                <div className="checkin-wizard__nav-spacer" />
                                <button
                                    className="checkin-wizard__nav-next"
                                    onClick={async () => {
                                        try {
                                            await fetch(`/api/salon/waitlist?id=${editingWaitlistEntry.id}`, {
                                                method: 'PUT',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    service_id: editWaitlistService,
                                                    professional_id: editWaitlistBarber === 'first_available' ? null : editWaitlistBarber,
                                                }),
                                            });
                                            addToast({ type: 'success', message: `${editingWaitlistEntry.client_name} actualizado` });
                                            setEditingWaitlistEntry(null);
                                            loadData();
                                        } catch {
                                            addToast({ type: 'error', message: 'Error al actualizar' });
                                        }
                                    }}
                                >
                                    Guardar Cambios
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ======== ADD SERVICE MODAL ======== */}
            {showServiceModal && (
                <div className="barbershop__modal-overlay" onClick={() => setShowServiceModal(false)}>
                    <div className="checkin-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="checkin-modal__header">
                            <div>
                                <h2 className="checkin-modal__title">Agregar Servicio Adicional</h2>
                                <p className="checkin-modal__subtitle">Selecciona un servicio para sumarlo al cobro</p>
                            </div>
                            <button className="checkin-modal__close" onClick={() => setShowServiceModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="checkin-modal__body">
                            <div className="checkin-modal__search" style={{ marginBottom: '16px' }}>
                                <Search size={16} />
                                <input
                                    type="text"
                                    placeholder="Buscar servicio..."
                                    value={serviceSearch}
                                    onChange={(e) => setServiceSearch(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            <div className="checkin-modal__services-grid">
                                {(data?.services || [])
                                    .filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase()))
                                    .map(svc => {
                                        const SvcIcon = getServiceIcon(svc.name);
                                        return (
                                            <button
                                                key={svc.id}
                                                className="checkin-modal__service-btn"
                                                onClick={() => handleAddServiceToTicket(svc)}
                                            >
                                                <SvcIcon size={22} />
                                                <span className="checkin-modal__service-name">
                                                    {svc.name}
                                                    {svc.is_combo === 1 && <span style={{ fontSize: '9px', background: 'var(--accent-green)', color: '#000', padding: '2px 4px', borderRadius: '4px', marginLeft: '6px', fontWeight: 'bold', verticalAlign: 'middle' }}>COMBO</span>}
                                                </span>
                                                <span className="checkin-modal__service-price">{fmt(svc.price)}</span>
                                            </button>
                                        );
                                    })}
                            </div>
                        </div>

                        <div className="checkin-modal__footer" style={{ borderTop: '1px solid #E5E7EB', paddingTop: '16px', textAlign: 'right' }}>
                            <button
                                className="checkin-modal__submit"
                                onClick={() => setShowServiceModal(false)}
                                style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', width: 'auto', padding: '0.75rem 1.5rem' }}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ======== DAILY CLOSING REPORT MODAL ======== */}
            {showClosingModal && (
                <div className="barbershop__modal-overlay" onClick={() => !loadingClosing && !submittingClosing && setShowClosingModal(false)}>
                    <div className="checkin-modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="checkin-modal__header">
                            <div>
                                <h2 className="checkin-modal__title">Corte del Día</h2>
                                <p className="checkin-modal__subtitle">
                                    {loadingClosing ? 'Cargando...' : closingData ? `${closingData.professional_name} - ${closingData.date}` : 'Reporte'}
                                </p>
                            </div>
                            <button className="checkin-modal__close" onClick={() => !loadingClosing && !submittingClosing && setShowClosingModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="checkin-modal__body" style={{ maxHeight: '65vh', overflowY: 'auto', paddingRight: '8px' }}>
                            {loadingClosing && (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                                    <div className="spinner spinner--md" />
                                </div>
                            )}

                            {!loadingClosing && closingData && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                                    {closingData.dayClosed && (
                                        <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', padding: '12px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', fontSize: '14px', fontWeight: 600 }}>
                                            <CalendarCheck size={18} />
                                            Día ya cerrado — Estado: {closingData.dayClosingStatus === 'paid' ? 'Pagado' : closingData.dayClosingStatus === 'partial' ? 'Pago Parcial' : 'Pendiente'}
                                        </div>
                                    )}

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div style={{ background: '#F9FAFB', padding: '16px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Servicios Atendidos</div>
                                            <div style={{ fontSize: '24px', fontWeight: 700 }}>{closingData.total_services}</div>
                                        </div>
                                        <div style={{ background: '#F9FAFB', padding: '16px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Ingreso Generado</div>
                                            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-green)' }}>{fmt(closingData.total_revenue)}</div>
                                        </div>
                                    </div>

                                    <div style={{ background: '#F9FAFB', padding: '16px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
                                        <h4 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6B7280', marginBottom: '12px', fontWeight: 700 }}>Ingresos por Método de Pago</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {[['Efectivo', 'cash'], ['Tarjeta', 'card'], ['Transferencia', 'transfer'], ['Mixto', 'mixed']].map(([label, key]) => (
                                                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                                                    <span>{label}</span>
                                                    <span style={{ fontWeight: 600 }}>{fmt(closingData.revenue_by_method?.[key] || 0)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Payment Model Calculation — hide for rent (shown in debt section) */}
                                    {closingData.payment_mode !== 'rent' && (
                                    <div style={{ background: 'rgba(59,130,246,0.08)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.2)' }}>
                                        <h4 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#3B82F6', marginBottom: '12px', fontWeight: 700 }}>
                                            {closingData.payment_mode === 'salary' ? 'Sueldo Fijo' :
                                                    closingData.payment_mode === 'mixed' ? 'Sueldo + Comisión' :
                                                        closingData.payment_mode === 'per_service' ? 'Pago por Servicio' :
                                                            'Cálculo de Comisión'}
                                        </h4>

                                        {closingData.payment_mode === 'commission' && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                                                <span>Porcentaje Acordado</span>
                                                <span style={{ fontWeight: 600 }}>{closingData.commission_percent || 0}%</span>
                                            </div>
                                        )}
                                        {closingData.payment_mode === 'salary' && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                                                <span>Sueldo Mensual</span>
                                                <span style={{ fontWeight: 600 }}>{fmt(closingData.base_salary || 0)}</span>
                                            </div>
                                        )}
                                        {closingData.payment_mode === 'mixed' && (
                                            <>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                                                    <span>Sueldo Base / Día</span>
                                                    <span style={{ fontWeight: 600 }}>{fmt((closingData.base_salary || 0) / 30)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                                                    <span>Comisión ({closingData.commission_percent}%)</span>
                                                    <span style={{ fontWeight: 600 }}>{fmt((closingData.total_revenue || 0) * ((closingData.commission_percent || 0) / 100))}</span>
                                                </div>
                                            </>
                                        )}
                                        {closingData.payment_mode === 'per_service' && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
                                                <span>{closingData.total_services} servicios × {fmt(closingData.per_service_rate || 0)}</span>
                                                <span style={{ fontWeight: 600 }}>{fmt(closingData.amount_owed)}</span>
                                            </div>
                                        )}

                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(59,130,246,0.2)' }}>
                                            <span style={{ fontWeight: 600, color: '#3B82F6' }}>{closingData.owed_label || 'Pago al Barbero'}</span>
                                            <span style={{ fontWeight: 800, color: '#1F2937' }}>{fmt(closingData.amount_owed)}</span>
                                        </div>
                                    </div>
                                    )}

                                    {/* Balance Acumulado — for all models */}
                                    {(() => {
                                        const prof = data?.professionals?.find(p => p.id === closingProfId);
                                        const balance = prof?.running_balance || 0;
                                        const isRent = closingData.payment_mode === 'rent';
                                        const projected = balance + (closingData.dayClosed ? 0 : closingData.amount_owed);
                                        const earningLabel = isRent ? '+ Arriendo de hoy'
                                            : closingData.payment_mode === 'per_service' ? '+ Pago de hoy'
                                            : closingData.payment_mode === 'salary' ? '+ Sueldo del día'
                                            : closingData.payment_mode === 'mixed' ? '+ Sueldo + Comisión de hoy'
                                            : '+ Comisión de hoy';
                                        const sectionTitle = isRent ? 'Deuda Acumulada de Arriendo' : 'Balance Acumulado';
                                        const sectionColor = isRent ? '#EF4444' : '#059669';
                                        const sectionBg = isRent ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)';
                                        const sectionBorder = isRent ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)';
                                        return (
                                            <div style={{ background: sectionBg, padding: '14px 16px', borderRadius: '12px', border: `1px solid ${sectionBorder}` }}>
                                                <h4 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: sectionColor, marginBottom: '8px', fontWeight: 700 }}>{sectionTitle}</h4>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                                                    <span>{isRent ? 'Deuda anterior' : 'Balance actual'}</span>
                                                    <span style={{ fontWeight: 700 }}>{fmt(balance)}</span>
                                                </div>
                                                {!closingData.dayClosed && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                                                        <span>{earningLabel}</span>
                                                        <span style={{ fontWeight: 600 }}>{fmt(closingData.amount_owed)}</span>
                                                    </div>
                                                )}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 800, paddingTop: '6px', borderTop: `1px dashed ${sectionBorder}` }}>
                                                    <span style={{ color: sectionColor }}>{isRent ? 'Deuda total' : `Balance ${!closingData.dayClosed ? 'después del cierre' : 'actual'}`}</span>
                                                    <span>{fmt(projected)}</span>
                                                </div>
                                                {isRent && projected > 0 && (
                                                    <div style={{ fontSize: '11px', color: '#EF4444', marginTop: '4px', fontWeight: 600 }}>
                                                        ⚠ {isRent ? 'Si paga hoy, la deuda se reducirá' : ''}
                                                    </div>
                                                )}
                                                {!isRent && (
                                                    <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '4px' }}>
                                                        Frecuencia de pago: {prof?.pay_frequency === 'weekly' ? 'Semanal' : prof?.pay_frequency === 'biweekly' ? 'Quincenal' : prof?.pay_frequency === 'monthly' ? 'Mensual' : 'Diario'}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* Close Day Actions (only if not already closed) */}
                                    {!closingData.dayClosed && (
                                        <div style={{ background: '#FFFBEB', padding: '16px', borderRadius: '12px', border: '1px solid #FDE68A' }}>
                                            <h4 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#92400E', marginBottom: '12px', fontWeight: 700 }}>Cerrar Día</h4>

                                            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                                {[
                                                    { key: 'paid', label: 'Pagado', icon: Check, color: '#059669', bg: 'rgba(16,185,129,0.1)' },
                                                    { key: 'pending', label: 'Paga Después', icon: Clock, color: '#D97706', bg: 'rgba(245,158,11,0.1)' },
                                                    { key: 'partial', label: 'Pago Parcial', icon: ArrowLeftRight, color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
                                                ].map(opt => (
                                                    <button
                                                        key={opt.key}
                                                        onClick={() => setClosingAction(opt.key)}
                                                        style={{
                                                            flex: '1', padding: '10px 8px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer',
                                                            border: closingAction === opt.key ? `2px solid ${opt.color}` : '2px solid #E5E7EB',
                                                            background: closingAction === opt.key ? opt.bg : '#fff',
                                                            color: closingAction === opt.key ? opt.color : '#6B7280',
                                                        }}
                                                    >
                                                        <opt.icon size={14} />
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>

                                            {closingAction === 'partial' && (
                                                <div style={{ marginBottom: '12px' }}>
                                                    <label style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Monto a Pagar</label>
                                                    <input
                                                        type="number"
                                                        value={closingPartialAmount}
                                                        onChange={(e) => setClosingPartialAmount(e.target.value)}
                                                        placeholder="0"
                                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '16px', fontWeight: 600 }}
                                                    />
                                                </div>
                                            )}

                                            {(closingAction === 'paid' || closingAction === 'partial') && (
                                                <div style={{ marginBottom: '12px' }}>
                                                    <label style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Método de Pago</label>
                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                        {[['cash', 'Efectivo'], ['card', 'Tarjeta'], ['transfer', 'Transfer.']].map(([val, label]) => (
                                                            <button
                                                                key={val}
                                                                onClick={() => setClosingPayMethod(val)}
                                                                style={{
                                                                    flex: '1', padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                                                                    border: closingPayMethod === val ? '2px solid #6C5CE7' : '1px solid #D1D5DB',
                                                                    background: closingPayMethod === val ? 'rgba(108,92,231,0.08)' : '#fff',
                                                                    color: closingPayMethod === val ? '#6C5CE7' : '#6B7280',
                                                                }}
                                                            >
                                                                {label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div>
                                                <label style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Notas (opcional)</label>
                                                <input
                                                    type="text"
                                                    value={closingNotes}
                                                    onChange={(e) => setClosingNotes(e.target.value)}
                                                    placeholder="Ej: paga mañana..."
                                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '13px' }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="checkin-modal__footer" style={{ borderTop: '1px solid #E5E7EB', paddingTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                className="btn btn--ghost"
                                onClick={() => setShowClosingModal(false)}
                                disabled={submittingClosing}
                            >
                                Cerrar
                            </button>
                            {!closingData?.dayClosed && closingAction && (
                                <button
                                    className="btn btn--primary"
                                    onClick={handleCloseDay}
                                    disabled={submittingClosing || (closingAction === 'partial' && (!closingPartialAmount || parseFloat(closingPartialAmount) <= 0))}
                                    style={{ background: '#059669' }}
                                >
                                    {submittingClosing ? (
                                        <div className="spinner spinner--sm" />
                                    ) : (
                                        <>
                                            <CalendarCheck size={16} />
                                            Cerrar Día
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ======== ADVANCE (ADELANTO) MODAL ======== */}
            {showAdvanceModal && (
                <div className="barbershop__modal-overlay" onClick={() => !submittingAdvance && setShowAdvanceModal(false)}>
                    <div className="checkin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '380px' }}>
                        <div className="checkin-modal__header">
                            <h2 className="checkin-modal__title">Registrar Adelanto</h2>
                            <button className="checkin-modal__close" onClick={() => !submittingAdvance && setShowAdvanceModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="checkin-modal__body" style={{ padding: '20px' }}>
                            {(() => {
                                const prof = data?.professionals?.find(p => p.id === advanceProfId);
                                return (
                                    <>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', padding: '10px', borderRadius: '10px', background: 'rgba(108,92,231,0.06)' }}>
                                            <div className="barbershop__station-avatar" style={{ borderColor: prof?.color || '#6C5CE7', width: '36px', height: '36px', fontSize: '13px' }}>
                                                {prof?.avatar_url ? <img src={prof.avatar_url} alt={prof?.name} /> : prof?.name?.charAt(0)}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '14px' }}>{prof?.name}</div>
                                                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                                                    Balance actual: <span style={{ fontWeight: 700, color: (prof?.running_balance || 0) > 0 ? '#059669' : '#6B7280' }}>{fmt(prof?.running_balance || 0)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ marginBottom: '14px' }}>
                                            <label style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Monto del Adelanto</label>
                                            <input
                                                type="number"
                                                value={advanceAmount}
                                                onChange={(e) => setAdvanceAmount(e.target.value)}
                                                placeholder="0"
                                                min="0"
                                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '18px', fontWeight: 700, textAlign: 'center' }}
                                                autoFocus
                                            />
                                        </div>

                                        <div style={{ marginBottom: '14px' }}>
                                            <label style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Método de Pago</label>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                {[['cash', 'Efectivo'], ['card', 'Tarjeta'], ['transfer', 'Transfer.']].map(([val, label]) => (
                                                    <button
                                                        key={val}
                                                        onClick={() => setAdvanceMethod(val)}
                                                        style={{
                                                            flex: '1', padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                                                            border: advanceMethod === val ? '2px solid #D97706' : '1px solid #D1D5DB',
                                                            background: advanceMethod === val ? 'rgba(245,158,11,0.08)' : '#fff',
                                                            color: advanceMethod === val ? '#D97706' : '#6B7280',
                                                        }}
                                                    >
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div style={{ marginBottom: '14px' }}>
                                            <label style={{ fontSize: '12px', color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Nota (opcional)</label>
                                            <input
                                                type="text"
                                                value={advanceNotes}
                                                onChange={(e) => setAdvanceNotes(e.target.value)}
                                                placeholder="Ej: almuerzo, transporte..."
                                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '13px' }}
                                            />
                                        </div>

                                        {parseFloat(advanceAmount) > 0 && (
                                            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', marginBottom: '6px', fontSize: '12px', color: '#92400E' }}>
                                                Nuevo balance después del adelanto: <strong>{fmt((prof?.running_balance || 0) - parseFloat(advanceAmount))}</strong>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                        <div style={{ borderTop: '1px solid #E5E7EB', padding: '12px 20px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button className="btn btn--ghost" onClick={() => setShowAdvanceModal(false)} disabled={submittingAdvance}>Cancelar</button>
                            <button
                                className="btn btn--primary"
                                onClick={handleSubmitAdvance}
                                disabled={submittingAdvance || !advanceAmount || parseFloat(advanceAmount) <= 0}
                                style={{ background: '#D97706' }}
                            >
                                {submittingAdvance ? <div className="spinner spinner--sm" /> : <><Banknote size={16} /> Registrar Adelanto</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ======== RECEIPT / BOLETA MODAL ======== */}
            {showReceiptModal && receiptData && (
                <div className="barbershop__modal-overlay" onClick={() => setShowReceiptModal(false)}>
                    <div className="receipt-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="receipt-modal__actions">
                            <button className="receipt-modal__action-btn" onClick={() => {
                                const r = receiptData;
                                const cur = data?.currency || tenantCurrency || 'CLP';
                                const fmtP = (v) => new Intl.NumberFormat('es', { style: 'currency', currency: cur, minimumFractionDigits: 0 }).format(v);
                                const payLabel = r.payment_method === 'cash' ? 'Efectivo' : r.payment_method === 'card' ? 'Tarjeta' : r.payment_method === 'mixed' ? 'Mixto' : 'Transfer.';
                                const dateStr = new Date(r.created_at).toLocaleDateString('es');
                                const timeStr = new Date(r.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
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
                                const r = receiptData;
                                const itemLines = (r.items || []).map(i => `  ${i.item_name} x${i.quantity} — ${fmt(i.total)}`).join('\n');
                                const payLabel = r.payment_method === 'cash' ? 'Efectivo' : r.payment_method === 'card' ? 'Tarjeta' : r.payment_method === 'mixed' ? 'Mixto' : 'Transferencia';
                                const text = encodeURIComponent(
                                    `*${r.tenant_name || 'Boleta de Venta'}*\n` +
                                    (r.tenant_address ? `📍 ${r.tenant_address}${r.tenant_city ? ', ' + r.tenant_city : ''}\n` : '') +
                                    (r.tenant_phone ? `📞 ${r.tenant_phone}\n` : '') +
                                    `\n📅 ${new Date(r.created_at).toLocaleDateString('es')} ${new Date(r.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}\n` +
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
                            <button className="receipt-modal__close-btn" onClick={() => setShowReceiptModal(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div id="receipt-print-area" className="receipt-modal__body">
                            {receiptData.tenant_logo && (
                                <img src={receiptData.tenant_logo} alt="" className="receipt-modal__logo" />
                            )}
                            <div className="receipt-modal__header">
                                <h2>{receiptData.tenant_name || 'Boleta de Venta'}</h2>
                                {receiptData.tenant_address && <p>{receiptData.tenant_address}{receiptData.tenant_city ? `, ${receiptData.tenant_city}` : ''}</p>}
                                {receiptData.tenant_phone && <p>Tel: {receiptData.tenant_phone}</p>}
                                {receiptData.tenant_email && <p>{receiptData.tenant_email}</p>}
                            </div>
                            <div className="receipt-modal__divider" />
                            <div className="receipt-modal__meta">
                                <div className="receipt-modal__meta-row">
                                    <span>Fecha:</span>
                                    <span>{new Date(receiptData.created_at).toLocaleDateString('es')} {new Date(receiptData.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                {receiptData.client_name && (
                                    <div className="receipt-modal__meta-row">
                                        <span>Cliente:</span>
                                        <span>{receiptData.client_name}</span>
                                    </div>
                                )}
                                <div className="receipt-modal__meta-row">
                                    <span>Atendido por:</span>
                                    <span>{receiptData.items?.[0]?.professional_name || receiptData.user_name || '-'}</span>
                                </div>
                            </div>
                            <div className="receipt-modal__divider" />
                            <div className="receipt-modal__items">
                                {(receiptData.items || []).map((item, idx) => (
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
                                    <span>{fmt(receiptData.subtotal)}</span>
                                </div>
                                {receiptData.tip > 0 && (
                                    <div className="receipt-modal__total-row">
                                        <span>Propina</span>
                                        <span>{fmt(receiptData.tip)}</span>
                                    </div>
                                )}
                                <div className="receipt-modal__total-row receipt-modal__total-row--grand">
                                    <span>TOTAL</span>
                                    <span>{fmt(receiptData.total)}</span>
                                </div>
                                <div className="receipt-modal__total-row">
                                    <span>Método de pago</span>
                                    <span>{receiptData.payment_method === 'cash' ? 'Efectivo' : receiptData.payment_method === 'card' ? 'Tarjeta' : receiptData.payment_method === 'mixed' ? 'Mixto' : 'Transferencia'}</span>
                                </div>
                            </div>
                            <div className="receipt-modal__divider" />
                            <div className="receipt-modal__footer-msg">
                                <p>¡Gracias por su visita!</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
