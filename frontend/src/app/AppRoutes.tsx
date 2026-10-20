import { Spin } from 'antd';
import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from '../features/auth/AuthProvider';
import { Brand } from '../shared/components/Brand';
import styles from './AppRoutes.module.css';

const LoginPage = lazy(() =>
  import('../pages/LoginPage').then((module) => ({ default: module.LoginPage })),
);
const RegisterPage = lazy(() =>
  import('../pages/RegisterPage').then((module) => ({ default: module.RegisterPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('../pages/ForgotPasswordPage').then((module) => ({
    default: module.ForgotPasswordPage,
  })),
);
const WorkspacePage = lazy(() =>
  import('../pages/WorkspacePage').then((module) => ({ default: module.WorkspacePage })),
);

function RouteLoading() {
  return (
    <div className={styles.loadingPage} role="status" aria-label="页面加载中">
      <Brand />
      <Spin size="large" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return <RouteLoading />;
  }
  return session ? children : <Navigate to="/login" replace />;
}

function EntryRedirect() {
  const { session, loading } = useAuth();
  if (loading) {
    return <RouteLoading />;
  }
  return <Navigate to={session ? '/workspace' : '/login'} replace />;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/" element={<EntryRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route
          path="/workspace"
          element={
            <ProtectedRoute>
              <WorkspacePage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
