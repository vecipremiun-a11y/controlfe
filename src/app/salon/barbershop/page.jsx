import { redirect } from 'next/navigation';

// Barbershop vive dentro de Punto de Venta: comparte el carrito y las cuentas
// de los clientes con Servicios, Productos y Reservas.
export default function BarbershopPage() {
    redirect('/salon/pos?tab=barbershop');
}
