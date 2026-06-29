import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  preferredVoice: string;
  onboardingDone: boolean;
}

interface AuthCtx {
  user: AuthUser | null;
  token: string | null;
  login(token: string, user: AuthUser): void;
  logout(): void;
  updateUser(partial: Partial<AuthUser>): void;
}

const Ctx = createContext<AuthCtx | null>(null);

const TOKEN_KEY = 'nicole_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error('session expired');
        return r.json() as Promise<AuthUser>;
      })
      .then((u) => setUser(u))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  function login(t: string, u: AuthUser) {
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setUser(u);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  function updateUser(partial: Partial<AuthUser>) {
    setUser((prev) => (prev ? { ...prev, ...partial } : prev));
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return <Ctx.Provider value={{ user, token, login, logout, updateUser }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
