import { createBrowserRouter } from 'react-router';
import { AppProvider } from './context/AppContext';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Registro } from './pages/Registro';
import { Setup } from './pages/Setup';
import { CommercianteDashboard } from './pages/comerciante/Dashboard';
import { Prediccion } from './pages/comerciante/Prediccion';
import { Calendario } from './pages/comerciante/Calendario';
import { Recomendaciones } from './pages/comerciante/Recomendaciones';
import { Alertas } from './pages/comerciante/Alertas';
import { Historico } from './pages/comerciante/Historico';
import { Datos } from './pages/comerciante/Datos';
import { Reportes } from './pages/comerciante/Reportes';
import { Perfil } from './pages/comerciante/Perfil';
import { Configuracion } from './pages/comerciante/Configuracion';
import { Aprendizaje } from './pages/comerciante/Aprendizaje';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminComercios } from './pages/admin/AdminComercios';
import { AdminUsuarios } from './pages/admin/AdminUsuarios';
import { AdminPlataforma } from './pages/admin/AdminPlataforma';
import { AnalistaDashboard } from './pages/analista/AnalistaDashboard';
import { Dataset } from './pages/analista/Dataset';
import { Entrenamiento } from './pages/analista/Entrenamiento';
import { EntrenamientoComercio } from './pages/analista/EntrenamientoComercio';
import { Modelos } from './pages/analista/Modelos';
import { Metricas } from './pages/analista/Metricas';
import { PrediccionVsReal } from './pages/analista/PrediccionVsReal';
import { Variables } from './pages/analista/Variables';
import { HistorialModelos } from './pages/analista/Historial';
import { Ayuda } from './pages/Ayuda';
import { Outlet } from 'react-router';

function AppRoot() {
  return (
    <AppProvider>
      <Outlet />
    </AppProvider>
  );
}

export const router = createBrowserRouter([
  {
    element: <AppRoot />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/login', element: <Login /> },
      { path: '/registro', element: <Registro /> },
      { path: '/configuracion-inicial', element: <Setup /> },
      {
        path: '/comerciante',
        element: <DashboardLayout requiredRole="comerciante" />,
        children: [
          { index: true, element: <CommercianteDashboard /> },
          { path: 'prediccion', element: <Prediccion /> },
          { path: 'calendario', element: <Calendario /> },
          { path: 'recomendaciones', element: <Recomendaciones /> },
          { path: 'alertas', element: <Alertas /> },
          { path: 'historico', element: <Historico /> },
          { path: 'aprendizaje', element: <Aprendizaje /> },
          { path: 'datos', element: <Datos /> },
          { path: 'reportes', element: <Reportes /> },
          { path: 'perfil', element: <Perfil /> },
          { path: 'configuracion', element: <Configuracion /> },
          { path: 'ayuda', element: <Ayuda /> },
        ],
      },
      {
        path: '/admin',
        element: <DashboardLayout requiredRole="admin" />,
        children: [
          { index: true, element: <AdminDashboard /> },
          { path: 'comercios', element: <AdminComercios /> },
          { path: 'usuarios', element: <AdminUsuarios /> },
          { path: 'plataforma', element: <AdminPlataforma /> },
          { path: 'configuracion', element: <Configuracion /> },
          { path: 'ayuda', element: <Ayuda /> },
        ],
      },
      {
        path: '/analista',
        element: <DashboardLayout requiredRole="analista" />,
        children: [
          { index: true, element: <AnalistaDashboard /> },
          { path: 'dataset', element: <Dataset /> },
          { path: 'entrenamiento', element: <Entrenamiento /> },
          { path: 'entrenamiento-comercio', element: <EntrenamientoComercio /> },
          { path: 'modelos', element: <Modelos /> },
          { path: 'metricas', element: <Metricas /> },
          { path: 'prediccion-vs-real', element: <PrediccionVsReal /> },
          { path: 'variables', element: <Variables /> },
          { path: 'historial', element: <HistorialModelos /> },
          { path: 'ayuda', element: <Ayuda /> },
        ],
      },
    ],
  },
]);
