import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import { Toaster } from '@/components/ui/sonner';
import XamppOperationsPage from '@/pages/xampp/XamppOperationsPage';

const LegacyRoutes = lazy(() => import('./LegacyRoutes'));

function AppRoutes() {
  const { pathname } = useLocation();

  if (pathname === '/operations' || pathname === '/xampp') {
    return (
      <>
        <IntersectObserver />
        <XamppOperationsPage />
      </>
    );
  }

  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</main>}>
      <IntersectObserver />
      <LegacyRoutes />
    </Suspense>
  );
}

const App: React.FC = () => {
  return (
    <Router>
      <AppRoutes />
      <Toaster richColors position="top-right" />
    </Router>
  );
};

export default App;
