import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { ApiError, subscribeToUnauthorized } from '../../shared/api/client';
import { getSession, logout as logoutRequest } from './api';
import type { AuthSession } from './types';

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
  acceptSession: (session: AuthSession) => void;
  clearSession: () => void;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSession(await getSession());
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        setSession(null);
      } else if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) {
        setSession(null);
        setError('暂时无法连接服务器，请稍后刷新页面');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    getSession(controller.signal)
      .then((nextSession) => {
        if (active) {
          setSession(nextSession);
        }
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }
        if (requestError instanceof DOMException && requestError.name === 'AbortError') {
          return;
        }
        if (requestError instanceof ApiError && requestError.status === 401) {
          setSession(null);
        } else {
          setSession(null);
          setError('暂时无法连接服务器，请稍后刷新页面');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => subscribeToUnauthorized(() => setSession(null)), []);

  const acceptSession = useCallback((nextSession: AuthSession) => {
    setSession(nextSession);
    setError(null);
  }, []);

  const clearSession = useCallback(() => {
    setSession(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setSession(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      error,
      acceptSession,
      clearSession,
      refreshSession,
      logout,
    }),
    [session, loading, error, acceptSession, clearSession, refreshSession, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
