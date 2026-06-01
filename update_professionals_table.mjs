import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
});

async function run() {
    try {
        await db.execute('ALTER TABLE professionals ADD COLUMN is_available INTEGER DEFAULT 1');
        console.log('Added is_available');
    } catch (e) {
        console.error('Error adding is_available (might already exist):', e.message);
    }

    try {
        await db.execute('ALTER TABLE professionals ADD COLUMN commission_percent REAL DEFAULT 50');
        console.log('Added commission_percent');
    } catch (e) {
        console.error('Error adding commission_percent (might already exist):', e.message);
    }
}

run();
