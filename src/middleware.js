import { NextResponse } from 'next/server';

export function middleware(request) {
    const { pathname } = request.nextUrl;
    const token = request.cookies.get('auth-token')?.value;

    // Public routes - no auth required
    const publicRoutes = ['/login', '/register', '/reservar', '/api/auth', '/api/setup', '/api/public'];
    const isPublic = publicRoutes.some(route => pathname.startsWith(route));

    // Static files and Next.js internals
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/favicon') ||
        pathname.includes('.')
    ) {
        return NextResponse.next();
    }

    // Root redirect
    if (pathname === '/') {
        if (token) {
            return NextResponse.redirect(new URL('/salon/inicio', request.url));
        }
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // Allow public routes
    if (isPublic) {
        return NextResponse.next();
    }

    // Protected routes require auth
    if (!token) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
