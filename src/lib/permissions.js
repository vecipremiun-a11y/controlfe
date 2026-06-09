// ============================================================
//  Roles de usuario y control de acceso por sección
// ============================================================

// Roles disponibles para las cuentas de usuario del salón.
// El orden define cómo aparecen en los selectores.
export const ROLES = [
    { value: 'owner', label: 'Dueño', desc: 'Acceso total. Cuenta principal del negocio.', color: '#7C3AED' },
    { value: 'admin', label: 'Administrador', desc: 'Acceso total, incluye gestión de usuarios.', color: '#2563EB' },
    { value: 'supervisor', label: 'Supervisor', desc: 'Operación completa, sin usuarios ni configuración.', color: '#0891B2' },
    { value: 'recepcionista', label: 'Recepcionista', desc: 'Agenda, reservas, clientes, ventas y caja.', color: '#059669' },
    { value: 'bodeguero', label: 'Bodeguero', desc: 'Inventario y productos.', color: '#D97706' },
    { value: 'vendedor', label: 'Vendedor', desc: 'Punto de venta, caja y clientes.', color: '#DB2777' },
];

// Roles que pueden gestionar (crear/editar) otras cuentas de usuario.
export const USER_MANAGEMENT_ROLES = ['owner', 'admin'];

// Mapa rol → rutas permitidas. '*' significa acceso total.
// Se incluyen los roles antiguos (receptionist, professional) por compatibilidad.
const ROLE_ACCESS = {
    owner: '*',
    admin: '*',
    supervisor: [
        '/salon/inicio', '/salon/agenda', '/salon/reservas', '/salon/clientes',
        '/salon/pos', '/salon/historial', '/salon/barbershop', '/salon/caja',
        '/salon/arriendo', '/salon/pagos-personal',
        '/salon/productos', '/salon/servicios', '/salon/personal', '/salon/reportes',
        '/salon/marketing',
    ],
    recepcionista: [
        '/salon/inicio', '/salon/agenda', '/salon/reservas', '/salon/clientes',
        '/salon/pos', '/salon/historial', '/salon/caja',
    ],
    bodeguero: [
        '/salon/inicio', '/salon/productos',
    ],
    vendedor: [
        '/salon/inicio', '/salon/pos', '/salon/historial', '/salon/caja', '/salon/clientes',
    ],
    // Compatibilidad con roles antiguos:
    receptionist: [
        '/salon/inicio', '/salon/agenda', '/salon/reservas', '/salon/clientes',
        '/salon/pos', '/salon/historial', '/salon/caja',
    ],
    professional: [
        '/salon/inicio', '/salon/agenda',
    ],
};

// ¿Puede este rol acceder a esta ruta?
export function canAccess(role, href) {
    const access = ROLE_ACCESS[role];
    if (!access) return false;
    if (access === '*') return true;
    return access.some(allowed => href === allowed || href.startsWith(allowed + '/'));
}

// Primera ruta a la que se debe enviar a un usuario de este rol.
export function firstAllowedRoute(role) {
    const access = ROLE_ACCESS[role];
    if (access === '*') return '/salon/inicio';
    if (Array.isArray(access) && access.length > 0) return access[0];
    return '/salon/inicio';
}

// Etiqueta legible de un rol.
export function roleLabel(value) {
    const found = ROLES.find(r => r.value === value);
    if (found) return found.label;
    if (value === 'receptionist') return 'Recepcionista';
    if (value === 'professional') return 'Profesional';
    return value || '—';
}
