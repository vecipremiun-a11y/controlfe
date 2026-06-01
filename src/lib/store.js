'use client';

import { create } from 'zustand';

export const useStore = create((set, get) => ({
    // Auth
    user: null,
    loading: true,
    tenantCurrency: 'USD',

    setUser: (user) => set({ user, loading: false }),

    fetchUser: async () => {
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                set({ user: data.user, loading: false });
                // Load tenant config for currency
                try {
                    const cfgRes = await fetch('/api/salon/config');
                    if (cfgRes.ok) {
                        const cfgData = await cfgRes.json();
                        if (cfgData.config?.currency) {
                            set({ tenantCurrency: cfgData.config.currency });
                        }
                    }
                } catch { }
            } else {
                set({ user: null, loading: false });
            }
        } catch {
            set({ user: null, loading: false });
        }
    },

    logout: async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        set({ user: null });
        window.location.href = '/login';
    },

    // Sidebar
    sidebarOpen: true,
    mobileSidebarOpen: false,
    toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    toggleMobileSidebar: () => set((s) => ({ mobileSidebarOpen: !s.mobileSidebarOpen })),
    closeMobileSidebar: () => set({ mobileSidebarOpen: false }),

    // Toast notifications
    toasts: [],
    addToast: (toast) => {
        const id = Date.now();
        set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
        setTimeout(() => {
            set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
        }, toast.duration || 4000);
    },
    removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    // Modal
    modal: null,
    openModal: (modal) => set({ modal }),
    closeModal: () => set({ modal: null }),
}));
