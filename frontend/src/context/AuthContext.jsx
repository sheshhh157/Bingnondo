import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authClient } from '../services/apiClient';
import { connectSocket, disconnectSocket, SOCKET_ROOM_BY_ROLE } from '../services/socket';
import { joinSocketRoom, leaveManagerRoom } from './SocketContext';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('bingnondo_user');
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch { localStorage.clear(); }
    }
    setLoading(false);

    // Listen for silent token-refresh failures from apiClient
    const onExpired = () => {
      localStorage.clear();
      disconnectSocket();
      setUser(null);
      window.location.replace('/login');
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const login = useCallback(async (credentials) => {
    // authClient.staffLogin returns the raw backend response:
    // { accessToken, refreshToken, user, message }
    // (no { data: ... } wrapper — backend sends these at top level)
    const res = await authClient.staffLogin(credentials);
    const userData = res.user;

    // Persist user for page reloads
    localStorage.setItem('bingnondo_user', JSON.stringify(userData));
    setUser(userData);

    // Join the correct socket room for this role
    connectSocket(SOCKET_ROOM_BY_ROLE[userData.role]);
    // Also ensure the provider's singleton is in the same room (covers the
    // case where the provider reconnected in the meantime).
    joinSocketRoom();

    return userData;
  }, []);

  const logout = useCallback(() => {
    authClient.logout().catch(() => {});
    localStorage.clear();
    disconnectSocket();
    // The shared socket is granted the `manager` room from its handshake token,
    // and discarding the token client-side doesn't tell the server. Drop the
    // room before the redirect so the tab stops receiving operational events.
    leaveManagerRoom();
    setUser(null);
    // Replace the entire history stack so back button can't return to protected pages
    window.location.replace('/login');
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};