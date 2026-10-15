import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authClient } from '../services/apiClient';
import { connectSocket, disconnectSocket } from '../services/socket';
import { joinSocketRoom } from './SocketContext';

const AuthContext = createContext(null);

const SOCKET_ROOM_MAP = {
  cashier:       'cashier',
  kitchen_staff: 'kitchen',
  admin:         'manager',
};

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Restore session from localStorage ──────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('bingnondo_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.clear();
      }
    }
    setLoading(false);

    const onExpired = () => {
      localStorage.clear();
      disconnectSocket();
      setUser(null);
      window.location.replace('/login');
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  // ── Shared login — handles both staff and rider ─────────────────────────────
  //
  //  POST /api/auth/login
  //  Backend checks staff_accounts first, then riders.
  //  Response: { accessToken, refreshToken, user, message }
  //  user.type: 'staff' | 'rider'
  //
  const login = useCallback(async (credentials) => {
    const res = await authClient.login(credentials);
    const userData = res.user;

    localStorage.setItem('bingnondo_user', JSON.stringify(userData));
    setUser(userData);

    // Riders are served by the app-wide socket (SocketContext), whose handshake
    // token lands them in their private `rider:<id>` room. Staff roles keep the
    // dedicated role-room socket they have always used.
    if (userData.type === 'rider') {
      joinSocketRoom();
    } else {
      connectSocket(SOCKET_ROOM_MAP[userData.role] || userData.role);
    }

    return userData;
  }, []);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    authClient.logout().catch(() => {});
    localStorage.clear();
    disconnectSocket();
    setUser(null);
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
