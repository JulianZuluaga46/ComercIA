import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api, setAuthToken, type ApiStore, type AuthUser } from '../lib/api';
import type { Store } from '../data/stores';

export type { Store };

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'danger' | 'success';
  title: string;
  message: string;
  read: boolean;
}

interface AppContextType {
  authLoading: boolean;
  currentRole: 'comerciante' | 'admin' | 'analista' | null;
  currentUser: { name: string; email: string; id: string; phone?: string } | null;
  updateProfile: (payload: { name?: string; phone?: string }) => Promise<void>;
  currentStore: Store;
  stores: Store[];
  setCurrentStore: (store: Store) => void;
  refreshStores: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthUser>;
  /** Inicia sesión con un token ya emitido (configuración inicial, registro). */
  startSession: (token: string, user: AuthUser) => Promise<void>;
  mustChangePassword: boolean;
  passwordChanged: () => void;
  /** Sesión iniciada con código por correo hace menos de 15 min: puede crear contraseña sin la actual */
  canResetPassword: boolean;
  loginWithCode: (email: string, code: string) => Promise<AuthUser>;
  logout: () => void;
  selectedDate: Date;
  setSelectedDate: (d: Date) => void;
  notifications: Notification[];
  dismissNotification: (id: string) => void;
  loadNotifications: () => Promise<void>;
}

function mapApiStore(s: ApiStore): Store {
  return {
    id: s.id,
    name: s.name,
    category: s.category as Store['category'],
    address: s.address,
    location: s.location,
    employees: s.employees,
    yearsInBusiness: s.yearsInBusiness,
    avgDailyClients: s.avgDailyClients,
    sensitivityFactors: s.sensitivityFactors,
    description: s.description,
    dataRecords: s.dataRecords,
    status: s.status,
    isTest: s.isTest,
  };
}

const PLACEHOLDER_STORE: Store = {
  id: '',
  name: 'Cargando…',
  category: 'Variedades',
  address: '',
  location: { lat: 0, lng: 0, x: 0, y: 0 },
  employees: 0,
  yearsInBusiness: 0,
  avgDailyClients: 0,
  sensitivityFactors: [],
  description: '',
  dataRecords: 0,
  status: 'Activo',
  isTest: false,
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [authLoading, setAuthLoading] = useState(true);
  const [currentRole, setCurrentRole] = useState<'comerciante' | 'admin' | 'analista' | null>(null);
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string; id: string; phone?: string } | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [currentStore, setCurrentStore] = useState<Store>(PLACEHOLDER_STORE);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [canResetPassword, setCanResetPassword] = useState(false);

  const applySession = useCallback((user: AuthUser, storeList: Store[]) => {
    setMustChangePassword(!!user.mustChangePassword);
    setCanResetPassword(!!user.canResetPasswordWithoutCurrent);
    setCurrentRole(user.role);
    setCurrentUser({ name: user.name, email: user.email, id: user.id, phone: user.phone });
    setStores(storeList);
    if (user.store) {
      setCurrentStore(mapApiStore(user.store));
    } else if (storeList.length > 0) {
      // Analista/administrador: empezar por el comercio real con más datos, no por uno de prueba.
      const real = storeList.filter(s => !s.isTest).sort((a, b) => b.dataRecords - a.dataRecords);
      setCurrentStore(real[0] ?? storeList[0]);
    }
  }, []);

  const refreshStores = useCallback(async () => {
    const list = await api.stores();
    const mapped = list.map(mapApiStore);
    setStores(mapped);
    setCurrentStore(prev => mapped.find(s => s.id === prev.id) ?? prev);
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const list = await api.notifications();
      setNotifications(
        list.map(n => ({
          id: n.id,
          type: n.type as Notification['type'],
          title: n.title,
          message: n.message,
          read: n.read,
        })),
      );
    } catch {
      setNotifications([]);
    }
  }, []);

  useEffect(() => {
    async function restore() {
      const token = localStorage.getItem('comercia_token');
      if (!token) {
        setAuthLoading(false);
        return;
      }
      try {
        const user = await api.me();
        const storeList = (await api.stores()).map(mapApiStore);
        applySession(user, storeList);
        await loadNotifications();
      } catch {
        setAuthToken(null);
      } finally {
        setAuthLoading(false);
      }
    }
    restore();
  }, [applySession, loadNotifications]);

  // Nuevas alertas y avisos sin recargar la página
  useEffect(() => {
    if (!currentRole) return;
    const id = setInterval(() => void loadNotifications(), 60000);
    return () => clearInterval(id);
  }, [currentRole, loadNotifications]);

  async function startSession(token: string, user: AuthUser) {
    setAuthToken(token);
    const storeList = (await api.stores()).map(mapApiStore);
    applySession(user, storeList);
    await loadNotifications();
  }

  async function login(email: string, password: string) {
    const { token, user } = await api.login(email, password);
    await startSession(token, user);
    return user;
  }

  async function loginWithCode(email: string, code: string) {
    const { token, user } = await api.verifyLoginCode(email, code);
    await startSession(token, { ...user, canResetPasswordWithoutCurrent: true });
    return user;
  }

  async function updateProfile(payload: { name?: string; phone?: string }) {
    const user = await api.updateMe(payload);
    setCurrentUser({ name: user.name, email: user.email, id: user.id, phone: user.phone });
    if (user.store) setCurrentStore(mapApiStore(user.store));
  }

  function logout() {
    setAuthToken(null);
    setCurrentRole(null);
    setCurrentUser(null);
    setStores([]);
    setCurrentStore(PLACEHOLDER_STORE);
    setNotifications([]);
    setMustChangePassword(false);
  }

  async function dismissNotification(id: string) {
    await api.markNotificationRead(id);
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  }

  return (
    <AppContext.Provider
      value={{
        authLoading,
        currentRole,
        currentUser,
        currentStore,
        stores,
        setCurrentStore,
        refreshStores,
        login,
        startSession,
        mustChangePassword,
        passwordChanged: () => {
          setMustChangePassword(false);
          setCanResetPassword(false);
        },
        canResetPassword,
        loginWithCode,
        updateProfile,
        logout,
        selectedDate,
        setSelectedDate,
        notifications,
        dismissNotification,
        loadNotifications,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
