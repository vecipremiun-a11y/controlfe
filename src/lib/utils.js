import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

// Generate a UUID v4
export function generateId() {
    return crypto.randomUUID();
}

// Generate a URL-friendly slug
export function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
}

// Format currency
export function formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('es-DO', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
    }).format(amount || 0);
}

// Format date
export function formatDate(date, fmt = 'dd/MM/yyyy') {
    if (!date) return '';
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, fmt, { locale: es });
}

// Format datetime
export function formatDateTime(date) {
    return formatDate(date, 'dd/MM/yyyy HH:mm');
}

// Relative time (e.g., "hace 5 minutos")
export function timeAgo(date) {
    if (!date) return '';
    const d = typeof date === 'string' ? parseISO(date) : date;
    return formatDistanceToNow(d, { addSuffix: true, locale: es });
}

// Format phone number
export function formatPhone(phone) {
    if (!phone) return '';
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 10) {
        return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
    }
    return phone;
}

// Truncate text
export function truncate(text, length = 50) {
    if (!text || text.length <= length) return text;
    return text.slice(0, length) + '...';
}

// Get initials from name
export function getInitials(name) {
    if (!name) return '??';
    return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

// Calculate percentage change
export function percentChange(current, previous) {
    if (!previous || previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
}

// Status colors mapping
export const STATUS_COLORS = {
    reservado: { bg: '#EDE9FE', text: '#7C3AED', label: 'Reservado' },
    confirmado: { bg: '#DBEAFE', text: '#2563EB', label: 'Confirmado' },
    en_atencion: { bg: '#FEF3C7', text: '#D97706', label: 'En Atención' },
    terminado: { bg: '#D1FAE5', text: '#059669', label: 'Terminado' },
    no_show: { bg: '#FEE2E2', text: '#DC2626', label: 'No-Show' },
    cancelado: { bg: '#F3F4F6', text: '#6B7280', label: 'Cancelado' },
    activo: { bg: '#D1FAE5', text: '#059669', label: 'Activo' },
    suspendido: { bg: '#FEE2E2', text: '#DC2626', label: 'Suspendido' },
    pendiente: { bg: '#FEF3C7', text: '#D97706', label: 'Pendiente' },
};

// Appointment status flow
export const APPOINTMENT_STATUSES = [
    'reservado',
    'confirmado',
    'en_atencion',
    'terminado',
    'no_show',
    'cancelado',
];

// Days of week in Spanish
export const DAYS_OF_WEEK = [
    { value: 0, label: 'Domingo', short: 'Dom' },
    { value: 1, label: 'Lunes', short: 'Lun' },
    { value: 2, label: 'Martes', short: 'Mar' },
    { value: 3, label: 'Miércoles', short: 'Mié' },
    { value: 4, label: 'Jueves', short: 'Jue' },
    { value: 5, label: 'Viernes', short: 'Vie' },
    { value: 6, label: 'Sábado', short: 'Sáb' },
];
