'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Scissors, TriangleAlert, CircleCheck, CircleAlert, Info, X } from 'lucide-react';
import { useDialogStore } from '@/lib/dialog';
import { useStore } from '@/lib/store';

const DIALOG_ICONS = {
    primary: Scissors,
    danger: TriangleAlert,
    warning: TriangleAlert,
    success: CircleCheck,
};

const TOAST_ICONS = {
    success: CircleCheck,
    error: CircleAlert,
    warning: TriangleAlert,
    info: Info,
};

function Dialog({ dialog, onClose }) {
    const confirmRef = useRef(null);
    const inputRef = useRef(null);
    const isPrompt = dialog.kind === 'prompt';
    const isConfirm = dialog.kind === 'confirm' || isPrompt;
    const [text, setText] = useState(dialog.defaultValue || '');
    const required = isPrompt && dialog.required !== false;
    const canConfirm = !required || text.trim().length > 0;
    const tone = dialog.tone || 'primary';
    const Icon = dialog.icon || DIALOG_ICONS[tone] || Scissors;

    // Foco en el botón principal (Enter confirma), Escape cancela y al cerrar
    // el foco vuelve a donde estaba.
    useEffect(() => {
        const previous = document.activeElement;
        (inputRef.current || confirmRef.current)?.focus();
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose(false);
            }
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            previous?.focus?.();
        };
    }, [onClose]);

    return (
        <div className="app-dialog__overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(false); }}>
            <div
                className={`app-dialog app-dialog--${tone}`}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="app-dialog-title"
                aria-describedby="app-dialog-message"
            >
                <div className="app-dialog__stripe" aria-hidden="true" />
                <div className="app-dialog__body">
                    <div className="app-dialog__icon" aria-hidden="true">
                        <Icon size={26} strokeWidth={2.2} />
                    </div>
                    <h2 id="app-dialog-title" className="app-dialog__title">
                        {dialog.title || (isConfirm ? '¿Confirmas esta acción?' : 'Aviso')}
                    </h2>
                    {dialog.message && (
                        <p id="app-dialog-message" className="app-dialog__message">{dialog.message}</p>
                    )}
                    {isPrompt && (
                        <textarea
                            ref={inputRef}
                            className="app-dialog__input"
                            rows={3}
                            value={text}
                            placeholder={dialog.placeholder || ''}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => {
                                // Ctrl/Cmd + Enter confirma; Enter solo hace salto de línea.
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canConfirm) onClose(text.trim());
                            }}
                        />
                    )}
                </div>
                <div className="app-dialog__actions">
                    {isConfirm && (
                        <button type="button" className="app-dialog__btn app-dialog__btn--cancel" onClick={() => onClose(false)}>
                            {dialog.cancelText || 'Cancelar'}
                        </button>
                    )}
                    <button
                        type="button"
                        ref={confirmRef}
                        className="app-dialog__btn app-dialog__btn--confirm"
                        disabled={!canConfirm}
                        onClick={() => onClose(isPrompt ? text.trim() : true)}
                    >
                        {dialog.confirmText || (isConfirm ? 'Confirmar' : 'Entendido')}
                    </button>
                </div>
            </div>
        </div>
    );
}

function DialogHost() {
    const current = useDialogStore((s) => s.queue[0]);
    const close = useCallback((value) => {
        const { queue, shift } = useDialogStore.getState();
        const dialog = queue[0];
        if (!dialog) return;
        shift();
        if (dialog.kind === 'prompt') dialog.resolve(typeof value === 'string' ? value : null);
        else dialog.resolve(dialog.kind === 'confirm' ? value : undefined);
    }, []);
    if (!current) return null;
    return <Dialog key={current.id} dialog={current} onClose={close} />;
}

// Avisos breves (addToast del store): se cierran solos.
function ToastHost() {
    const toasts = useStore((s) => s.toasts);
    const removeToast = useStore((s) => s.removeToast);
    if (!toasts.length) return null;
    return (
        <div className="toast-container" role="status" aria-live="polite">
            {toasts.map((t) => {
                const type = TOAST_ICONS[t.type] ? t.type : 'info';
                const Icon = TOAST_ICONS[type];
                return (
                    <div key={t.id} className={`toast toast--${type}`}>
                        <Icon size={18} className="toast__icon" aria-hidden="true" />
                        <span className="toast__message">{t.message}</span>
                        <button type="button" className="toast__close" onClick={() => removeToast(t.id)} aria-label="Cerrar aviso">
                            <X size={14} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

export default function AppFeedback() {
    return (
        <>
            <DialogHost />
            <ToastHost />
        </>
    );
}
