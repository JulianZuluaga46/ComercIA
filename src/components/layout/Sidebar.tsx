import { NavLink, useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const MERCHANT_NAV: NavItem[] = [
  { to: '/comerciante', icon: '⊞', label: 'Inicio' },
  { to: '/comerciante/prediccion', icon: '◎', label: 'Predicción' },
  { to: '/comerciante/calendario', icon: '◷', label: 'Calendario' },
  { to: '/comerciante/recomendaciones', icon: '💡', label: 'Recomendaciones' },
  { to: '/comerciante/alertas', icon: '🔔', label: 'Alertas' },
  { to: '/comerciante/historico', icon: '📈', label: 'Historial' },
  { to: '/comerciante/aprendizaje', icon: '🧠', label: 'Aprendizaje' },
  { to: '/comerciante/datos', icon: '📝', label: 'Registrar datos' },
  { to: '/comerciante/reportes', icon: '📄', label: 'Reportes' },
  { to: '/comerciante/perfil', icon: '👤', label: 'Mi comercio' },
  { to: '/comerciante/configuracion', icon: '⚙', label: 'Configuración' },
  { to: '/comerciante/ayuda', icon: '❓', label: 'Ayuda' },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', icon: '⊞', label: 'Dashboard' },
  { to: '/admin/comercios', icon: '🏪', label: 'Comercios' },
  { to: '/admin/usuarios', icon: '👥', label: 'Usuarios' },
  { to: '/admin/plataforma', icon: '🖥', label: 'Plataforma' },
  { to: '/admin/configuracion', icon: '⚙', label: 'Configuración' },
  { to: '/admin/ayuda', icon: '❓', label: 'Ayuda' },
];

const ANALYST_NAV: NavItem[] = [
  { to: '/analista', icon: '⊞', label: 'Resumen' },
  { to: '/analista/dataset', icon: '🗄', label: 'Dataset' },
  { to: '/analista/entrenamiento', icon: '⚡', label: 'Entrenamiento' },
  { to: '/analista/entrenamiento-comercio', icon: '🏪', label: 'Entrenamiento por comercio' },
  { to: '/analista/modelos', icon: '🤖', label: 'Modelos' },
  { to: '/analista/metricas', icon: '📊', label: 'Métricas' },
  { to: '/analista/prediccion-vs-real', icon: '📉', label: 'Predicción vs real' },
  { to: '/analista/variables', icon: '📋', label: 'Variables' },
  { to: '/analista/historial', icon: '🕓', label: 'Historial' },
  { to: '/analista/ayuda', icon: '❓', label: 'Ayuda' },
];

const ROLE_NAV = {
  comerciante: MERCHANT_NAV,
  admin: ADMIN_NAV,
  analista: ANALYST_NAV,
};

const ROLE_LABELS = {
  comerciante: 'Comerciante',
  admin: 'Administrador',
  analista: 'Analista de Datos',
};

interface SidebarProps {
  mobile?: boolean;
  onClose?: () => void;
}

export function Sidebar({ mobile = false, onClose }: SidebarProps) {
  const { currentRole, currentUser, logout, notifications } = useApp();
  const navigate = useNavigate();
  const unread = notifications.filter(n => !n.read).length;

  if (!currentRole) return null;
  const nav = ROLE_NAV[currentRole];

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <aside className={`
      flex flex-col h-full bg-white border-r border-slate-200
      ${mobile ? 'w-full' : 'w-56'}
    `}>
      {/* Logo */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">C</span>
          </div>
          <div>
            <span className="font-bold text-slate-900 text-sm">ComercIA</span>
            <div className="text-xs text-slate-400">{ROLE_LABELS[currentRole]}</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-3 overflow-y-auto">
        <div className="space-y-0.5">
          {nav.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/comerciante' || item.to === '/admin' || item.to === '/analista'}
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all
                ${isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}
              `}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              <span>{item.label}</span>
              {item.label === 'Alertas' && unread > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {unread}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-slate-100">
        <div className="px-3 py-2 mb-1">
          <div className="text-sm font-medium text-slate-900 truncate">{currentUser?.name}</div>
          <div className="text-xs text-slate-400 truncate">{currentUser?.email}</div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all"
        >
          <span>⎋</span> Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
