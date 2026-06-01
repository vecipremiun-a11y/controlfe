import { NextResponse } from 'next/server';
import { authenticateUser, authenticateSaasUser, createToken } from '@/lib/auth';

export async function POST(request) {
    try {
        const { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json(
                { error: 'Email y contraseña son requeridos' },
                { status: 400 }
            );
        }

        // Try salon user first, then saas admin
        let user = await authenticateUser(email, password);

        if (!user) {
            user = await authenticateSaasUser(email, password);
        }

        if (!user) {
            return NextResponse.json(
                { error: 'Credenciales incorrectas' },
                { status: 401 }
            );
        }

        if (user.error) {
            return NextResponse.json(
                { error: user.error },
                { status: 403 }
            );
        }

        // Create JWT
        const token = await createToken(user);

        // Set cookie
        const response = NextResponse.json({ user, message: 'Login exitoso' });
        response.cookies.set('auth-token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60, // 7 days
            path: '/',
        });

        return response;
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json(
            { error: 'Error interno del servidor' },
            { status: 500 }
        );
    }
}
