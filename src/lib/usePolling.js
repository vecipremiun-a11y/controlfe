'use client';

import { useEffect, useRef } from 'react';

// Llama a `fn` cada `ms` mientras la pestaña del navegador está visible y,
// además, apenas se vuelve a ella. Con la pestaña oculta no consulta.
export function usePolling(fn, ms, enabled = true) {
    const fnRef = useRef(fn);
    useEffect(() => {
        fnRef.current = fn;
    }, [fn]);

    useEffect(() => {
        if (!enabled) return;
        const tick = () => {
            if (!document.hidden) fnRef.current();
        };
        const timer = setInterval(tick, ms);
        document.addEventListener('visibilitychange', tick);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', tick);
        };
    }, [ms, enabled]);
}
