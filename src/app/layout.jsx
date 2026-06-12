import './globals.css';

export const viewport = {
    width: 'device-width',
    initialScale: 1,
};

export const metadata = {
    title: 'SalonPro - Sistema de Gestión de Salones',
    description: 'Plataforma SaaS para gestión de salones de belleza y barberías. Reservas online, agenda, POS, inventario, reportes y más.',
    keywords: 'salón, barbería, gestión, reservas, agenda, POS, SaaS',
};

export default function RootLayout({ children }) {
    return (
        <html lang="es">
            <body>
                {children}
            </body>
        </html>
    );
}
