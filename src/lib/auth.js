import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { queryOne } from './db';

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'fallback-secret-change-me-now-32chars!');

// Hash password
export async function hashPassword(password) {
    return bcrypt.hash(password, 12);
}

// Compare password
export async function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
}

// Create JWT token
export async function createToken(payload) {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(secret);
}

// Verify JWT token
export async function verifyToken(token) {
    try {
        const { payload } = await jwtVerify(token, secret);
        return payload;
    } catch {
        return null;
    }
}

// Get current user from request cookies
export async function getCurrentUser(request) {
    const token = request.cookies.get('auth-token')?.value;
    if (!token) return null;

    const payload = await verifyToken(token);
    if (!payload) return null;

    return payload;
}

// Authenticate salon user (tenant user)
export async function authenticateUser(email, password) {
    const user = await queryOne(
        'SELECT u.*, t.name as tenant_name, t.slug as tenant_slug, t.status as tenant_status, t.currency as tenant_currency, t.timezone as tenant_timezone, t.logo_url as tenant_logo_url FROM users u JOIN tenants t ON u.tenant_id = t.id WHERE u.email = ? AND u.active = 1',
        [email]
    );

    if (!user) return null;
    if (user.tenant_status === 'suspendido') return { error: 'Salón suspendido' };

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) return null;

    return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenant_id,
        branchId: user.branch_id,
        tenantName: user.tenant_name,
        tenantSlug: user.tenant_slug,
        tenantLogoUrl: user.tenant_logo_url || null,
        currency: user.tenant_currency || 'DOP',
        timezone: user.tenant_timezone || 'America/Santo_Domingo',
        type: 'salon',
    };
}

// Authenticate SaaS admin
export async function authenticateSaasUser(email, password) {
    const user = await queryOne(
        'SELECT * FROM saas_users WHERE email = ? AND active = 1',
        [email]
    );

    if (!user) return null;

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) return null;

    return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        type: 'saas',
    };
}
