// Transacciones de escritura compartidas (fila de turnos, integraciones…).

function isBusyError(e) {
    return e?.code === 'SQLITE_BUSY' || /database is locked|SQLITE_BUSY/i.test(e?.message || '');
}

// Escrituras de este proceso en cola, una a la vez por cliente de base: no se
// abren transacciones simultáneas (ni reintentos entre ellas). Entre procesos
// distintos, BEGIN IMMEDIATE sigue garantizando el orden.
const writeQueues = new WeakMap();
function enqueueWrite(db, task) {
    const previous = writeQueues.get(db) || Promise.resolve();
    const run = previous.then(task, task);
    writeQueues.set(db, run.catch(() => {}));
    return run;
}

// Ejecuta `fn` dentro de una transacción de escritura (BEGIN IMMEDIATE): las
// operaciones concurrentes se serializan. Si la base está ocupada por otra
// escritura, reintenta con espera creciente.
export function withWriteTx(db, fn, options) {
    return enqueueWrite(db, () => runWriteTx(db, fn, options));
}

async function runWriteTx(db, fn, { retries = 8 } = {}) {
    for (let attempt = 0; ; attempt++) {
        let tx = null;
        try {
            tx = await db.transaction('write');
            const result = await fn(tx);
            await tx.commit();
            return result;
        } catch (e) {
            if (tx && !tx.closed) {
                try { await tx.rollback(); } catch { /* ya cerrada */ }
            }
            if (isBusyError(e) && attempt < retries) {
                await new Promise((r) => setTimeout(r, 25 * 2 ** attempt + Math.random() * 25));
                continue;
            }
            throw e;
        } finally {
            if (tx && !tx.closed) tx.close();
        }
    }
}
