import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { IncidentAlertProvider } from '@/contexts/IncidentAlertContext';
import { routes } from './routes';

export default function LegacyRoutes() {
  return (
    <AuthProvider>
      <IncidentAlertProvider>
        <Routes>
          {routes.map((route, index) => (
            <Route key={index} path={route.path} element={route.element} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </IncidentAlertProvider>
    </AuthProvider>
  );
}
