import { Spin } from 'antd';
import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { useAuth } from '../features/auth/AuthProvider';
import { Brand } from '../shared/components/Brand';
import { loginPath } from '../shared/navigation';
import { WorkspaceShell } from '../shared/components/WorkspaceShell';
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
const SurveyListPage = lazy(() =>
  import('../pages/SurveyListPage').then((module) => ({ default: module.SurveyListPage })),
);
const SurveyEditorPage = lazy(() =>
  import('../pages/SurveyEditorPage').then((module) => ({ default: module.SurveyEditorPage })),
);
const SurveyStatisticsPage = lazy(() =>
  import('../pages/SurveyStatisticsPage').then((module) => ({
    default: module.SurveyStatisticsPage,
  })),
);
const SurveyFillPage = lazy(() =>
  import('../pages/SurveyFillPage').then((module) => ({ default: module.SurveyFillPage })),
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
  const location = useLocation();
  if (loading) {
    return <RouteLoading />;
  }
  if (session) {
    return children;
  }
  const returnTo = `${location.pathname}${location.search}`;
  return <Navigate to={loginPath(returnTo)} replace />;
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
              <WorkspaceShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<WorkspacePage />} />
          <Route path="surveys" element={<SurveyListPage />} />
          <Route path="surveys/:id/edit" element={<SurveyEditorPage />} />
          <Route path="surveys/:id/statistics" element={<SurveyStatisticsPage />} />
        </Route>
        <Route
          path="/survey/:short_code"
          element={
            <ProtectedRoute>
              <SurveyFillPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
