import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as authApi from './authApi';
import type { AuthUser, LoginInput, RegisterInput } from './types';
import { configureWorkshopProjectStore } from '../../workshop/model/projectStore';

type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  isAuthenticated: boolean;
  refreshMe: () => Promise<AuthUser | null>;
  login: (input: LoginInput) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '请求失败，请稍后再试';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshMe = useCallback(async () => {
    try {
      const response = await authApi.fetchCurrentUser();
      setUser(response.user);
      setStatus(response.user ? 'authenticated' : 'anonymous');
      configureWorkshopProjectStore({ enabled: Boolean(response.user), userId: response.user?.id ?? null });
      setError(null);
      return response.user;
    } catch (err) {
      setUser(null);
      setStatus('anonymous');
      configureWorkshopProjectStore({ enabled: false });
      setError(getErrorMessage(err));
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const handleLogin = useCallback(async (input: LoginInput) => {
    const response = await authApi.login(input);
    if (!response.user) throw new Error('登录失败，请稍后再试');
    setUser(response.user);
    setStatus('authenticated');
    configureWorkshopProjectStore({ enabled: true, userId: response.user.id });
    setError(null);
    return response.user;
  }, []);

  const handleRegister = useCallback(async (input: RegisterInput) => {
    const response = await authApi.register(input);
    if (!response.user) throw new Error('注册失败，请稍后再试');
    setUser(response.user);
    setStatus('authenticated');
    configureWorkshopProjectStore({ enabled: true, userId: response.user.id });
    setError(null);
    return response.user;
  }, []);

  const handleLogout = useCallback(async () => {
    setUser(null);
    setStatus('anonymous');
    configureWorkshopProjectStore({ enabled: false });
    setError(null);
    void authApi.logout().catch(() => undefined);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    user,
    error,
    isAuthenticated: status === 'authenticated',
    refreshMe,
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
  }), [error, handleLogin, handleLogout, handleRegister, refreshMe, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
