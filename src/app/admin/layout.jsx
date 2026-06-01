'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
    LayoutDashboard,
    Building2,
    CreditCard,
    Users,
    MessageSquare,
    Headphones,
    Shield,
    Settings,
    Scissors,
    LogOut,
} from 'lucide-react';

const adminMenuItems = [
    { section: 'DASHBOARD' },
    { label: 'Dashboard', icon: LayoutDashboard, href: '/admin/dashboard' },
    { section: 'GESTIÓN' },
    { label: 'Salones', icon: Building2, href: '/admin/salones' },
    { label: 'Planes y Cobros', icon: CreditCard, href: '/admin/planes' },
    { label: 'Usuarios SaaS', icon: Users, href: '/admin/usuarios' },
    { section: 'SISTEMA' },
    { label: 'WhatsApp', icon: MessageSquare, href: '/admin/whatsapp' },
    { label: 'Soporte', icon: Headphones, href: '/admin/soporte' },
    { label: 'Auditoría', icon: Shield, href: '/admin/auditoria' },
    { label: 'Configuración', icon: Settings, href: '/admin/configuracion' },
];

export default function AdminLayout({ children }) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, loading, fetchUser, logout } = useStore();

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    useEffect(() => {
        if (!loading && (!user || user.type !== 'saas')) {
            router.push('/login');
        }
    }, [loading, user, router]);

    if (loading || !user || user.type !== 'saas') {
        return (
            <div className="loading-page">
                <div className="spinner spinner--lg" />
                <p>Cargando...</p>
            </div>
        );
    }

    const getInitials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';

    return (
        <div className="layout">
            <aside className="layout__sidebar">
                <div className="sidebar__logo">
                    <div className="sidebar__logo-icon" style={{ background: 'linear-gradient(135deg, #1F2937, #374151)' }}>
                        <Scissors size={18} />
                    </div>
                    <div className="sidebar__logo-text">
                        Salon<span>Pro</span>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500, marginTop: '-4px' }}>ADMIN</div>
                    </div>
                </div>

                {adminMenuItems.map((item, i) => {
                    if (item.section) {
                        return (
                            <div className="sidebar__section" key={i}>
                                <div className="sidebar__section-title">{item.section}</div>
                            </div>
                        );
                    }

                    const Icon = item.icon;
                    const isActive = pathname === item.href;

                    return (
                        <nav className="sidebar__nav" key={item.href}>
                            <a
                                href={item.href}
                                className={`sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
                                onClick={(e) => {
                                    e.preventDefault();
                                    router.push(item.href);
                                }}
                            >
                                <Icon className="sidebar__link-icon" size={20} />
                                {item.label}
                            </a>
                        </nav>
                    );
                })}

                <div style={{ marginTop: 'auto', padding: '16px', borderTop: '1px solid var(--border-color)' }}>
                    <button className="sidebar__link" onClick={logout} style={{ color: 'var(--accent-red)' }}>
                        <LogOut size={20} />
                        Cerrar sesión
                    </button>
                </div>
            </aside>

            <div className="layout__main">
                <header className="layout__header">
                    <div className="header__left">
                        <h2 className="header__title" style={{ fontSize: '16px' }}>Panel de Administración</h2>
                    </div>
                    <div className="header__right">
                        <div className="header__user">
                            <div className="header__user-info">
                                <div className="header__user-name">{user.name}</div>
                                <div className="header__user-role">Super Admin</div>
                            </div>
                            <div className="header__avatar" style={{ background: 'linear-gradient(135deg, #1F2937, #374151)' }}>
                                {getInitials(user.name)}
                            </div>
                        </div>
                    </div>
                </header>

                <main className="layout__content">
                    {children}
                </main>
            </div>
        </div>
    );
}
