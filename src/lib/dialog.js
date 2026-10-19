'use client';

import { create } from 'zustand';

// Ventanas de confirmación y aviso del sistema. Reemplazan a confirm()/alert()
// del navegador; se dibujan en <AppFeedback /> (montado en el layout raíz).
//
//   if (!(await confirmDialog({ title: 'Eliminar cliente', message: '…', confirmText: 'Eliminar', tone: 'danger' }))) return;
//   await alertDialog({ title: 'No se pudo guardar', message: err.error, tone: 'danger' });
//
// tone: 'primary' | 'danger' | 'warning' | 'success'. `icon` acepta un ícono de lucide-react.
export const useDialogStore = create((set) => ({
    queue: [],
    push: (dialog) => set((s) => ({ queue: [...s.queue, dialog] })),
    shift: () => set((s) => ({ queue: s.queue.slice(1) })),
}));

let nextId = 1;

function open(kind, options) {
    const opts = typeof options === 'string' ? { message: options } : options;
    return new Promise((resolve) => {
        useDialogStore.getState().push({ id: nextId++, kind, ...opts, resolve });
    });
}

// Resuelve true si el usuario confirma y false si cancela o cierra.
export const confirmDialog = (options) => open('confirm', options);

// Resuelve cuando el usuario cierra el aviso.
export const alertDialog = (options) => open('alert', options);

// Pide un texto (ej. motivo de cancelación). Resuelve el texto o null si cancela.
// Opciones extra: placeholder, defaultValue, required (true por defecto).
export const promptDialog = (options) => open('prompt', options);
