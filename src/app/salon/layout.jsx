'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
    LayoutDashboard,
    Calendar,
    Globe,
    Users,
    ShoppingCart,
    Wallet,
    Package,
    Scissors,
    UserCog,
    BarChart3,
    Megaphone,
    Settings,
    ChevronLeft,
    Bell,
    LogOut,
    Menu,
    X,
    Armchair,
    Clock,
    User,
    Phone,
    HandCoins,
    ShieldCheck,
    History,
    TrendingUp,
} from 'lucide-react';
import { canAccess, firstAllowedRoute } from '@/lib/permissions';
import CashGate from '@/components/CashGate';

// Rutas del menú OPERACIONES que requieren una caja abierta para usarse.
// (Se excluye /salon/caja, que es justamente donde se abre/cierra la caja.)
const CASH_GATED = [
    '/salon/pos', '/salon/historial', '/salon/barbershop',
    '/salon/arriendo', '/salon/pagos-personal', '/salon/productos',
];

const salonMenuItems = [
    { section: 'MENÚ' },
    { label: 'Inicio', icon: LayoutDashboard, href: '/salon/inicio' },
    { label: 'Agenda', icon: Calendar, href: '/salon/agenda' },
    { label: 'Reservas Online', icon: Globe, href: '/salon/reservas' },
    { label: 'Clientes', icon: Users, href: '/salon/clientes' },
    { section: 'OPERACIONES' },
    { label: 'Punto de Venta', icon: ShoppingCart, href: '/salon/pos' },
    { label: 'Historial', icon: History, href: '/salon/historial' },
    { label: 'Barbershop', icon: Armchair, href: '/salon/barbershop' },
    { label: 'Caja', icon: Wallet, href: '/salon/caja' },
    { label: 'Arriendo Sillón', icon: Armchair, href: '/salon/arriendo' },
    { label: 'Pagos Personal', icon: HandCoins, href: '/salon/pagos-personal' },
    { label: 'Productos', icon: Package, href: '/salon/productos' },
    { section: 'CONFIGURACIÓN' },
    { label: 'Servicios', icon: Scissors, href: '/salon/servicios' },
    { label: 'Personal', icon: UserCog, href: '/salon/personal' },
    { label: 'Usuarios', icon: ShieldCheck, href: '/salon/usuarios' },
    { label: 'Reportes', icon: BarChart3, href: '/salon/reportes' },
    { label: 'Utilidad', icon: TrendingUp, href: '/salon/utilidad' },
    { label: 'Marketing', icon: Megaphone, href: '/salon/marketing' },
    { label: 'Configuración', icon: Settings, href: '/salon/configuracion' },
];

export default function SalonLayout({ children }) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, loading, fetchUser, logout, sidebarOpen, toggleSidebar, mobileSidebarOpen, toggleMobileSidebar, closeMobileSidebar } = useStore();

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    // Restaurar estado contraído del menú desde la sesión anterior
    useEffect(() => {
        try {
            const stored = localStorage.getItem('sidebar_collapsed');
            if (stored !== null) {
                useStore.setState({ sidebarOpen: stored !== 'true' });
            }
        } catch (e) { }
    }, []);

    const handleToggleSidebar = () => {
        // Tras alternar, "contraído" será el valor actual de sidebarOpen
        try { localStorage.setItem('sidebar_collapsed', String(sidebarOpen)); } catch (e) { }
        toggleSidebar();
    };

    useEffect(() => {
        closeMobileSidebar();
    }, [pathname, closeMobileSidebar]);

    useEffect(() => {
        if (!loading && (!user || user.type === 'saas')) {
            router.push('/login');
        }
    }, [loading, user, router]);

    // Guard por rol: si el usuario no tiene acceso a la ruta actual, lo enviamos
    // a la primera sección permitida para su rol.
    useEffect(() => {
        if (!loading && user && user.type !== 'saas' && !canAccess(user.role, pathname)) {
            router.replace(firstAllowedRoute(user.role));
        }
    }, [loading, user, pathname, router]);

    // ===== NOTIFICATION SYSTEM =====
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [showNotifications, setShowNotifications] = useState(false);
    const [lastSeen, setLastSeen] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('notif_last_seen') || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        }
        return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    });
    const notifRef = useRef(null);
    const prevCountRef = useRef(0);

    const playNotifSound = useCallback(() => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 830;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);
            // Second beep
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.frequency.value = 1050;
            osc2.type = 'sine';
            gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
            gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.65);
            osc2.start(ctx.currentTime + 0.15);
            osc2.stop(ctx.currentTime + 0.65);
        } catch (e) { }
    }, []);

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await fetch(`/api/salon/notifications?last_seen=${encodeURIComponent(lastSeen)}`);
            if (!res.ok) return;
            const data = await res.json();
            setNotifications(data.notifications || []);
            const newCount = data.unread_count || 0;
            // Play sound if new notifications arrived
            if (newCount > prevCountRef.current && prevCountRef.current >= 0) {
                playNotifSound();
            }
            prevCountRef.current = newCount;
            setUnreadCount(newCount);
        } catch (e) { }
    }, [lastSeen, playNotifSound]);

    useEffect(() => {
        if (!user) return;
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000); // Poll every 30 seconds
        return () => clearInterval(interval);
    }, [user, fetchNotifications]);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e) {
            if (notifRef.current && !notifRef.current.contains(e.target)) {
                setShowNotifications(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    function markAllRead() {
        const now = new Date().toISOString();
        setLastSeen(now);
        localStorage.setItem('notif_last_seen', now);
        setUnreadCount(0);
        prevCountRef.current = 0;
    }

    function toggleNotifications() {
        setShowNotifications(prev => !prev);
    }

    function formatTimeAgo(dateStr) {
        if (!dateStr) return '';
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Ahora';
        if (mins < 60) return `Hace ${mins} min`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `Hace ${hours}h`;
        return `Hace ${Math.floor(hours / 24)}d`;
    }

    function formatDate(d) {
        if (!d) return '';
        return new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
    }
    // ===== END NOTIFICATION SYSTEM =====

    if (loading || !user || user.type === 'saas') {
        return (
            <div className="loading-page">
                <div className="spinner spinner--lg" />
                <p>Cargando...</p>
            </div>
        );
    }

    const getInitials = (name) => {
        if (!name) return '??';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    // Menú filtrado por rol: una sección solo se muestra si tiene al menos
    // un ítem visible debajo (hasta la siguiente sección).
    const visibleMenu = salonMenuItems.filter((item, i) => {
        if (!item.section) return canAccess(user.role, item.href);
        for (let j = i + 1; j < salonMenuItems.length && !salonMenuItems[j].section; j++) {
            if (canAccess(user.role, salonMenuItems[j].href)) return true;
        }
        return false;
    });

    return (
        <div className={`layout ${!sidebarOpen ? 'layout--collapsed' : ''}`}>
            {/* Mobile overlay */}
            {mobileSidebarOpen && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.4)',
                        zIndex: 39,
                    }}
                    onClick={closeMobileSidebar}
                />
            )}

            {/* Sidebar */}
            <aside className={`layout__sidebar ${mobileSidebarOpen ? 'layout__sidebar--open' : ''}`}>
                <div className="sidebar__logo">
                    {user.tenantLogoUrl ? (
                        <img
                            src={user.tenantLogoUrl}
                            alt={user.tenantName || 'Logo'}
                            style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', objectFit: 'cover' }}
                        />
                    ) : (
                        <div className="sidebar__logo-icon">
                            <Scissors size={18} />
                        </div>
                    )}
                    <div className="sidebar__logo-text">
                        {user.tenantName || 'Mi Salón'}
                    </div>
                </div>

                {visibleMenu.map((item, i) => {
                    if (item.section) {
                        return (
                            <div className="sidebar__section" key={i}>
                                <div className="sidebar__section-title">{item.section}</div>
                            </div>
                        );
                    }

                    const Icon = item.icon;
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

                    return (
                        <nav className="sidebar__nav" key={item.href}>
                            <a
                                href={item.href}
                                title={item.label}
                                className={`sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                                onClick={(e) => {
                                    e.preventDefault();
                                    router.push(item.href);
                                }}
                            >
                                <Icon className="sidebar__link-icon" size={20} />
                                <span className="sidebar__link-text">{item.label}</span>
                                {item.badge && <span className="sidebar__badge">{item.badge}</span>}
                            </a>
                        </nav>
                    );
                })}

                {/* Tenant info at bottom */}
                <div className="sidebar__footer" style={{ marginTop: 'auto', padding: '16px 24px', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Salón</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {user.tenantName || 'Mi Salón'}
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <div className="layout__main">
                <header className="layout__header">
                    <div className="header__left">
                        <button
                            className="header__icon-btn"
                            onClick={toggleMobileSidebar}
                            style={{ display: 'none' }}
                            id="mobile-menu-btn"
                        >
                            <Menu size={20} />
                        </button>
                        <button
                            className="header__icon-btn"
                            onClick={handleToggleSidebar}
                            id="desktop-collapse-btn"
                            title={sidebarOpen ? 'Contraer menú' : 'Expandir menú'}
                            aria-label={sidebarOpen ? 'Contraer menú' : 'Expandir menú'}
                        >
                            <Menu size={20} />
                        </button>
                    </div>
                    <div className="header__right">
                        {/* Notifications bell */}
                        <div ref={notifRef} style={{ position: 'relative' }}>
                            <button className="header__icon-btn" onClick={toggleNotifications}
                                style={{ position: 'relative' }}>
                                <Bell size={20} className={unreadCount > 0 ? 'notif-bell-ring' : ''} />
                                {unreadCount > 0 && (
                                    <span style={{
                                        position: 'absolute', top: '2px', right: '2px',
                                        width: unreadCount > 9 ? '20px' : '17px', height: '17px',
                                        borderRadius: '10px', background: '#EF4444', color: 'white',
                                        fontSize: '10px', fontWeight: 800, display: 'flex',
                                        alignItems: 'center', justifyContent: 'center',
                                        border: '2px solid white', lineHeight: 1,
                                    }}>
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                )}
                            </button>

                            {/* Notifications dropdown */}
                            {showNotifications && (
                                <div className="notif-dropdown" style={{
                                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                                    width: '380px', maxHeight: '480px',
                                    background: 'white', borderRadius: '16px',
                                    border: '1px solid var(--border-color)',
                                    boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                                    zIndex: 1000, overflow: 'hidden',
                                    display: 'flex', flexDirection: 'column',
                                }}>
                                    {/* Header */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 800, fontSize: '15px' }}>Notificaciones</div>
                                            {unreadCount > 0 && (
                                                <div style={{ fontSize: '12px', color: 'var(--primary-600)', fontWeight: 600 }}>
                                                    {unreadCount} nueva{unreadCount !== 1 ? 's' : ''}
                                                </div>
                                            )}
                                        </div>
                                        {unreadCount > 0 && (
                                            <button onClick={markAllRead}
                                                style={{
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    color: 'var(--primary-600)', fontSize: '12px', fontWeight: 600,
                                                }}>
                                                Marcar leídas
                                            </button>
                                        )}
                                    </div>

                                    {/* List */}
                                    <div style={{ overflowY: 'auto', flex: 1 }}>
                                        {notifications.length === 0 ? (
                                            <div style={{
                                                padding: '40px 20px', textAlign: 'center',
                                                color: 'var(--text-muted)',
                                            }}>
                                                <Bell size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
                                                <p style={{ fontWeight: 600, fontSize: '14px' }}>Sin notificaciones</p>
                                                <p style={{ fontSize: '12px', marginTop: '4px' }}>
                                                    Las nuevas reservas online aparecerán aquí
                                                </p>
                                            </div>
                                        ) : (
                                            notifications.map(n => {
                                                const isUnread = new Date(n.created_at) > new Date(lastSeen);
                                                return (
                                                    <div key={n.id}
                                                        onClick={() => { setShowNotifications(false); router.push('/salon/agenda'); }}
                                                        style={{
                                                            display: 'flex', gap: '12px', padding: '14px 20px',
                                                            cursor: 'pointer', borderBottom: '1px solid var(--gray-100)',
                                                            background: isUnread ? 'var(--primary-50)' : 'white',
                                                            transition: 'background 100ms',
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.background = isUnread ? 'var(--primary-100)' : 'var(--gray-50)'}
                                                        onMouseLeave={e => e.currentTarget.style.background = isUnread ? 'var(--primary-50)' : 'white'}>
                                                        {/* Icon */}
                                                        <div style={{
                                                            width: '38px', height: '38px', borderRadius: '50%',
                                                            background: isUnread ? 'var(--primary-500)' : 'var(--gray-200)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            flexShrink: 0,
                                                        }}>
                                                            <Calendar size={16} style={{ color: isUnread ? 'white' : 'var(--text-muted)' }} />
                                                        </div>
                                                        {/* Content */}
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2px' }}>
                                                                <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                                                                    Nueva reserva online
                                                                </span>
                                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                                                                    {formatTimeAgo(n.created_at)}
                                                                </span>
                                                            </div>
                                                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                                                <strong>{n.client_name}</strong> reservó <strong>{n.service_name}</strong>
                                                            </div>
                                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', display: 'flex', gap: '10px' }}>
                                                                <span>📅 {formatDate(n.date)}</span>
                                                                <span>🕐 {n.start_time}</span>
                                                                <span>👤 {n.professional_name}</span>
                                                            </div>
                                                        </div>
                                                        {/* Unread dot */}
                                                        {isUnread && (
                                                            <div style={{
                                                                width: '8px', height: '8px', borderRadius: '50%',
                                                                background: 'var(--primary-500)', flexShrink: 0,
                                                                marginTop: '6px',
                                                            }} />
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>

                                    {/* Footer */}
                                    {notifications.length > 0 && (
                                        <div style={{
                                            padding: '12px 20px', borderTop: '1px solid var(--border-color)',
                                            textAlign: 'center',
                                        }}>
                                            <button onClick={() => { setShowNotifications(false); router.push('/salon/agenda'); }}
                                                style={{
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    color: 'var(--primary-600)', fontSize: '13px', fontWeight: 700,
                                                }}>
                                                Ver agenda completa →
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="header__user" onClick={() => { }}>
                            <div className="header__user-info">
                                <div className="header__user-name">{user.name}</div>
                                <div className="header__user-role">{user.role}</div>
                            </div>
                            <div className="header__avatar">
                                {getInitials(user.name)}
                            </div>
                        </div>
                        <button className="header__icon-btn" onClick={logout} title="Cerrar sesión">
                            <LogOut size={18} />
                        </button>
                    </div>
                </header>

                <main className="layout__content">
                    {CASH_GATED.some(r => pathname.startsWith(r))
                        ? <CashGate>{children}</CashGate>
                        : children}
                </main>
            </div>

            <style jsx global>{`
        @media (max-width: 1024px) {
          #mobile-menu-btn {
            display: flex !important;
          }
        }
        @keyframes bellRing {
          0% { transform: rotate(0deg); }
          10% { transform: rotate(14deg); }
          20% { transform: rotate(-14deg); }
          30% { transform: rotate(10deg); }
          40% { transform: rotate(-10deg); }
          50% { transform: rotate(6deg); }
          60% { transform: rotate(-4deg); }
          70% { transform: rotate(2deg); }
          80% { transform: rotate(-1deg); }
          100% { transform: rotate(0deg); }
        }
        .notif-bell-ring {
          animation: bellRing 0.8s ease-in-out;
          animation-iteration-count: 1;
          transform-origin: top center;
        }
      `}</style>
        </div>
    );
}
