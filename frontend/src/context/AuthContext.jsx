import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { disconnectSocket } from '../api/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On boot, if we have a token, fetch the current user to validate the session.
  useEffect(() => {
    const token = localStorage.getItem('ironhold_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((data) => setUser(data.user))
      .catch(() => localStorage.removeItem('ironhold_token'))
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback((data) => {
    localStorage.setItem('ironhold_token', data.token);
    setUser(data.user);
  }, []);

  const login = useCallback(async (identifier, password) => {
    const data = await api.login(identifier, password);
    persist(data);
    return data.user;
  }, [persist]);

  const register = useCallback(async (username, email, password) => {
    const data = await api.register(username, email, password);
    persist(data);
    return data.user;
  }, [persist]);

  const logout = useCallback(() => {
    localStorage.removeItem('ironhold_token');
    disconnectSocket();
    setUser(null);
  }, []);

  // Allow other views to refresh the signed-in user (crowns, titles, etc.).
  const refresh = useCallback(async () => {
    try {
      const data = await api.me();
      setUser(data.user);
    } catch (_) {
      // ignore
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
