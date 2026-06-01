const { createClient } = require('@libsql/client');

const db = createClient({
    url: process.env.TURSO_DATABASE_URL || 'file:local.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
    try {
        await db.execute('ALTER TABLE services ADD COLUMN is_combo INTEGER DEFAULT 0');
        console.log('Added is_combo');
    } catch (e) {
        console.error('Error adding is_combo:', e.message);
    }

    try {
        await db.execute('ALTER TABLE services ADD COLUMN combo_items TEXT DEFAULT "[]"');
        console.log('Added combo_items');
    } catch (e) {
        console.error('Error adding combo_items:', e.message);
    }
}

run();
