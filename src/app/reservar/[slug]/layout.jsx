export const metadata = {
    title: 'Reservar Cita',
};

export default function ReservarLayout({ children }) {
    return (
        <>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            {children}
        </>
    );
}
