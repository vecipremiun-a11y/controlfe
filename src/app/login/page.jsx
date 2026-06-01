'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, ArrowRight, Sparkles, Calendar, Users, TrendingUp, Star } from 'lucide-react';

/* ── Floating salon icons for animated background ── */
const floatingItems = [
    { icon: '✂️', size: 32, x: 10, y: 15, dur: 18, delay: 0 },
    { icon: '💇‍♀️', size: 28, x: 75, y: 25, dur: 22, delay: 2 },
    { icon: '💅', size: 26, x: 20, y: 70, dur: 20, delay: 4 },
    { icon: '🪮', size: 30, x: 60, y: 80, dur: 24, delay: 1 },
    { icon: '💆‍♀️', size: 28, x: 85, y: 55, dur: 19, delay: 3 },
    { icon: '🪞', size: 24, x: 40, y: 40, dur: 21, delay: 5 },
    { icon: '✨', size: 22, x: 30, y: 90, dur: 17, delay: 2 },
    { icon: '💇', size: 26, x: 90, y: 10, dur: 23, delay: 4 },
    { icon: '🧴', size: 24, x: 50, y: 60, dur: 20, delay: 1 },
    { icon: '💎', size: 20, x: 15, y: 45, dur: 25, delay: 3 },
];

const stats = [
    { icon: Calendar, label: 'Reservas', value: '+2,400', color: '#A78BFA' },
    { icon: Users, label: 'Clientes', value: '+850', color: '#8B5CF6' },
    { icon: TrendingUp, label: 'Ingresos', value: '+32%', color: '#7C3AED' },
    { icon: Star, label: 'Rating', value: '4.9', color: '#6D28D9' },
];

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Error al iniciar sesión');
                return;
            }

            if (data.user.type === 'saas') {
                router.push('/admin/dashboard');
            } else {
                router.push('/salon/inicio');
            }
        } catch (err) {
            setError('Error de conexión. Intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-split">
            {/* ── LEFT: Animated Visual Panel ── */}
            <div className="login-visual">
                {/* Animated gradient mesh */}
                <div className="login-visual__mesh" />

                {/* Floating emoji icons */}
                {floatingItems.map((item, i) => (
                    <span
                        key={i}
                        className="login-visual__float"
                        style={{
                            fontSize: item.size,
                            left: `${item.x}%`,
                            top: `${item.y}%`,
                            animationDuration: `${item.dur}s`,
                            animationDelay: `${item.delay}s`,
                        }}
                    >
                        {item.icon}
                    </span>
                ))}

                {/* Glowing orbs */}
                <div className="login-visual__orb login-visual__orb--1" />
                <div className="login-visual__orb login-visual__orb--2" />
                <div className="login-visual__orb login-visual__orb--3" />

                {/* Content overlay */}
                <div className={`login-visual__content ${mounted ? 'login-visual__content--visible' : ''}`}>
                    <div className="login-visual__badge">
                        <Sparkles size={14} />
                        Plataforma #1 en gestión de salones
                    </div>
                    <h2 className="login-visual__heading">
                        Transforma tu salón en un negocio{' '}
                        <span className="login-visual__heading-accent">inteligente</span>
                    </h2>
                    <p className="login-visual__desc">
                        Agenda, clientes, inventario, reportes y más. Todo en un solo lugar para hacer crecer tu negocio de belleza.
                    </p>

                    {/* Mini stats */}
                    <div className="login-visual__stats">
                        {stats.map((stat, i) => (
                            <div key={i} className="login-visual__stat" style={{ animationDelay: `${0.8 + i * 0.15}s` }}>
                                <div className="login-visual__stat-icon" style={{ background: `${stat.color}20`, color: stat.color }}>
                                    <stat.icon size={16} />
                                </div>
                                <div>
                                    <div className="login-visual__stat-value">{stat.value}</div>
                                    <div className="login-visual__stat-label">{stat.label}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── RIGHT: Login Form ── */}
            <div className="login-form-panel">
                <div className={`login-form-wrapper ${mounted ? 'login-form-wrapper--visible' : ''}`}>
                    {/* Logo */}
                    <div className="login-brand">
                        <div className="login-brand__icon">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>
                            </svg>
                        </div>
                        <h1 className="login-brand__name">
                            Salon<span>Pro</span>
                        </h1>
                    </div>

                    <h2 className="login-form__title">Bienvenido de vuelta</h2>
                    <p className="login-form__subtitle">Ingresa tus credenciales para acceder a tu panel</p>

                    {/* Error */}
                    {error && (
                        <div className="login-form__error">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="login-form">
                        <div className="login-field">
                            <label htmlFor="email">Correo electrónico</label>
                            <div className="login-field__input-wrap">
                                <svg className="login-field__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                                </svg>
                                <input
                                    id="email"
                                    type="email"
                                    placeholder="tu@correo.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoFocus
                                    autoComplete="email"
                                />
                            </div>
                        </div>

                        <div className="login-field">
                            <label htmlFor="password">Contraseña</label>
                            <div className="login-field__input-wrap">
                                <svg className="login-field__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                </svg>
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    className="login-field__toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="login-form__options">
                            <label className="login-remember">
                                <input type="checkbox" />
                                <span>Recuérdame</span>
                            </label>
                            <a href="#" className="login-forgot">¿Olvidaste tu contraseña?</a>
                        </div>

                        <button
                            type="submit"
                            className="login-submit"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <span className="login-submit__spinner" />
                                    Ingresando...
                                </>
                            ) : (
                                <>
                                    Iniciar Sesión
                                    <ArrowRight size={18} />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="login-divider">
                        <span>o</span>
                    </div>

                    <p className="login-footer">
                        ¿No tienes cuenta?{' '}
                        <a href="/register">Solicitar demo gratuita</a>
                    </p>
                </div>
            </div>
        </div>
    );
}
