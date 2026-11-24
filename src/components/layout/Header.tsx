import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { Sidebar } from './Sidebar';

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

const TYPE_DOT: Record<string, string> = { danger: '🔴', warning: '🟡', success: '🟢', info: '🔵' };

export function Header({ title, subtitle }: HeaderProps) {
  const { currentStore, setCurrentStore, currentRole, notifications, stores, dismissNotification } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const navigate = useNavigate();
  const unread = notifications.filter(n => !n.read).length;

  return (
    <>
      <header className="h-14 px-4 md:px-6 flex items-center justify-between border-b border-slate-200 bg-white sticky top-0 z-30">
        {/* Mobile menu button */}
        <button
          className="md:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600"
          onClick={() => setMenuOpen(true)}
        >
          ☰
        </button>

        <div className="hidden md:block">
          {title && <h1 className="font-semibold text-slate-900 text-base">{title}</h1>}
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {(currentRole === 'comerciante' || currentRole === 'analista') && stores.length > 1 && (
            <select
              value={currentStore.id}
              onChange={e => {
                const s = stores.find(s => s.id === e.target.value);
                if (s) setCurrentStore(s);
              }}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <div className="relative">
            <button
              onClick={() => setBellOpen(o => !o)}
              aria-label="Notificaciones"
              className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-all"
            >
              🔔
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                  {unread}
                </span>
              )}
            </button>
            {bellOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setBellOpen(false)} />
                <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-xl z-40">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="font-semibold text-slate-900 text-sm">Notificaciones</span>
                    {currentRole === 'comerciante' && (
                      <button
                        className="text-xs text-blue-600 hover:text-blue-700"
                        onClick={() => {
                          setBellOpen(false);
                          navigate('/comerciante/alertas');
                        }}
                      >
                        Ver alertas y umbrales →
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 && <p className="p-4 text-sm text-slate-500">No tienes notificaciones.</p>}
                    {notifications.slice(0, 20).map(n => (
                      <div key={n.id} className={`px-4 py-3 border-b border-slate-50 text-sm ${n.read ? 'opacity-60' : ''}`}>
                        <div className="flex items-start gap-2">
                          <span>{TYPE_DOT[n.type] ?? '🔵'}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-900">{n.title}</div>
                            <div className="text-xs text-slate-600 mt-0.5">{n.message}</div>
                            {!n.read && (
                              <button onClick={() => dismissNotification(n.id)} className="text-xs text-blue-600 hover:text-blue-700 mt-1">
                                Marcar como leída
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="relative w-64 h-full">
            <Sidebar mobile onClose={() => setMenuOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
