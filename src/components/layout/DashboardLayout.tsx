import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useApp } from '../../context/AppContext';
import { Navigate } from 'react-router';
import { ForcePasswordChange } from './ForcePasswordChange';

interface DashboardLayoutProps {
  requiredRole: 'comerciante' | 'admin' | 'analista';
}

export function DashboardLayout({ requiredRole }: DashboardLayoutProps) {
  const { currentRole, authLoading, mustChangePassword } = useApp();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        Cargando sesión…
      </div>
    );
  }

  if (!currentRole) return <Navigate to="/login" replace />;
  if (currentRole !== requiredRole) {
    const redirects = { comerciante: '/comerciante', admin: '/admin', analista: '/analista' };
    return <Navigate to={redirects[currentRole]} replace />;
  }
  if (mustChangePassword) return <ForcePasswordChange />;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar - hidden on mobile */}
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
          {/* Solo en la copia de exposición (exposicion/iniciar-exposicion.cmd fija VITE_DEMO=1) */}
          {import.meta.env.VITE_DEMO === '1' && (
            <p className="mt-8 text-center text-xs text-slate-400">
              Modo demostración: algunos datos son de ejemplo y no son resultados de la investigación.
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
